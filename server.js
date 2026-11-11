// Tests must never inherit a developer's local Firebase, mail, or admin secrets.
if (process.env.NODE_ENV !== 'test') require('dotenv').config({ quiet: true });
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Database = require('better-sqlite3');
const QRCode = require('qrcode');
const rateLimit = require('express-rate-limit');
const nodemailer = require('nodemailer');
const { initializeApp: initializeFirebaseApp, cert: firebaseCert, applicationDefault } = require('firebase-admin/app');
const { getAuth: getFirebaseAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');
const { isPersonalLiraQuestion, requestLiraAiAnswer } = require('./lira-ai');

const app = express();
const PORT = Number(process.env.PORT || 3001);
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');

let firebaseAuth = null;
let firestore = null;
const firebaseAccountSyncRequired = String(process.env.FIREBASE_ACCOUNT_SYNC_REQUIRED || 'false').toLowerCase() === 'true';
try {
  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
    ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)
    : null;
  if (serviceAccount && serviceAccount.project_id !== process.env.FIREBASE_PROJECT_ID) {
    throw new Error('Firebase Admin service account project_id does not match FIREBASE_PROJECT_ID.');
  }
  const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const hasApplicationCredentials = Boolean(
    serviceAccount ||
    (credentialsPath && fs.existsSync(path.resolve(credentialsPath))) ||
    process.env.K_SERVICE || process.env.GAE_ENV || process.env.FUNCTION_TARGET
  );
  if (process.env.FIREBASE_PROJECT_ID && hasApplicationCredentials) {
    const firebaseApp = initializeFirebaseApp({
      credential: serviceAccount ? firebaseCert(serviceAccount) : applicationDefault(),
      projectId: process.env.FIREBASE_PROJECT_ID,
    });
    firebaseAuth = getFirebaseAuth(firebaseApp);
    firestore = getFirestore(firebaseApp, process.env.FIRESTORE_DATABASE_ID || 'default');
  } else if (process.env.FIREBASE_PROJECT_ID) {
    console.warn('Firebase Admin is not enabled: configure FIREBASE_SERVICE_ACCOUNT_JSON or GOOGLE_APPLICATION_CREDENTIALS on the API server.');
  }
} catch (error) {
  console.error('Firebase Admin initialization failed:', error.message);
}

function requireFirebaseAccountSync(res, user = null) {
  if (!firebaseAccountSyncRequired) return true;
  if (user && !user.firebase_uid) {
    res.status(409).json({ error: 'This library account is not linked to Firebase Authentication yet. Ask the administrator to run the secure legacy account-linking check; do not add or guess a UID manually.' });
    return false;
  }
  if (!firebaseAuth || !firestore) {
    res.status(503).json({ error: 'Firebase Auth and Firestore server credentials are required before account changes can be made. Configure GOOGLE_APPLICATION_CREDENTIALS and restart the API.' });
    return false;
  }
  return true;
}

const db = new Database(process.env.DB_FILE || path.join(__dirname, 'aclc_library.sqlite'));
db.pragma('foreign_keys = ON');
db.exec(fs.readFileSync(path.join(__dirname, 'migrations', '001_initial.sql'), 'utf8'));
db.exec(fs.readFileSync(path.join(__dirname, 'migrations', '002_registration_otp_and_indexes.sql'), 'utf8'));
db.exec(fs.readFileSync(path.join(__dirname, 'migrations', '003_academic_terms.sql'), 'utf8'));
db.exec(fs.readFileSync(path.join(__dirname, 'migrations', '004_account_archives.sql'), 'utf8'));
db.exec(fs.readFileSync(path.join(__dirname, 'migrations', '005_lira_assistant.sql'), 'utf8'));
if (!db.prepare('PRAGMA table_info(users)').all().some(column => column.name === 'firebase_uid')) {
  db.exec(fs.readFileSync(path.join(__dirname, 'migrations', '006_firebase_account_link.sql'), 'utf8'));
}
if (!db.prepare('PRAGMA table_info(books)').all().some(column => column.name === 'cover_url')) {
  db.exec(fs.readFileSync(path.join(__dirname, 'migrations', '007_book_cover_url.sql'), 'utf8'));
}
db.exec(`
  CREATE TABLE IF NOT EXISTS pending_registrations (
    email TEXT PRIMARY KEY, password_hash TEXT NOT NULL, role TEXT NOT NULL, name TEXT NOT NULL,
    school_number TEXT, program TEXT, year_level TEXT, employee_number TEXT, department TEXT,
    otp_hash TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
  CREATE TABLE IF NOT EXISTS email_verification_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id),
    token TEXT UNIQUE NOT NULL, expires_at TEXT NOT NULL, used INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS gate_authorizations (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id),
    gate_id TEXT NOT NULL, nonce TEXT UNIQUE NOT NULL, expires_at TEXT NOT NULL,
    used INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
  CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id),
    token TEXT UNIQUE NOT NULL, expires_at TEXT NOT NULL, used INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS loan_verification_tokens (
    loan_item_id INTEGER PRIMARY KEY REFERENCES loan_items(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
`);
const pendingColumns = new Set(db.prepare('PRAGMA table_info(pending_registrations)').all().map(column => column.name));
if (!pendingColumns.has('firebase_uid')) db.exec('ALTER TABLE pending_registrations ADD COLUMN firebase_uid TEXT');

app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(cors({ origin: process.env.CORS_ORIGINS?.split(',') || true }));
app.use(express.json({ limit: '1mb' }));
app.use(rateLimit({ windowMs: 60 * 1000, max: 240 }));

function audit(actorId, action, type = null, entityId = null, details = null, req = null) {
  db.prepare(`INSERT INTO audit_logs(actor_id,action,entity_type,entity_id,details,ip_address) VALUES(?,?,?,?,?,?)`)
    .run(actorId, action, type, entityId ? String(entityId) : null, details ? JSON.stringify(details) : null, req?.ip || null);
}

function sign(user) {
  return jwt.sign({ sub: user.id, role: user.role }, JWT_SECRET, { expiresIn: '30d' });
}

function auth(required = true) {
  return (req, res, next) => {
    const token = req.headers.authorization?.startsWith('Bearer ')
      ? req.headers.authorization.slice(7) : null;
    if (!token) return required ? res.status(401).json({ error: 'Authentication required' }) : next();
    try {
      req.user = jwt.verify(token, JWT_SECRET);
      const user = db.prepare('SELECT * FROM users WHERE id=?').get(req.user.sub);
      if (!user) return res.status(401).json({ error: 'User not found' });
      if (required && firebaseAccountSyncRequired && (!firebaseAuth || !firestore)) {
        return res.status(503).json({ error: 'Firebase Auth and Firestore are required for this library account. Configure the Firebase Admin service account and restart the API.' });
      }
      if (required && firebaseAccountSyncRequired && !user.firebase_uid) {
        return res.status(403).json({ error: 'This account is not linked to Firebase Authentication yet. Contact the administrator to migrate it.' });
      }
      req.userRecord = user;
      req.user.role = user.role;
      if (required && user.status !== 'approved') return res.status(403).json({ error: 'Account is not approved' });
      next();
    } catch {
      res.status(401).json({ error: 'Invalid or expired token' });
    }
  };
}

function authorize(...roles) {
  return (req, res, next) => roles.includes(req.user.role) ? next() : res.status(403).json({ error: 'Forbidden' });
}

function setting(key) {
  return db.prepare('SELECT value FROM system_settings WHERE key=?').get(key)?.value;
}

const mailer = process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD
  ? nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD.replace(/\s/g, ''),
      },
    })
  : null;
let emailTransportReady = false;
const REGISTRATION_PENDING_TTL_MS = 24 * 60 * 60 * 1000;

async function verifyEmailTransport() {
  if (!mailer) return false;
  try {
    await mailer.verify();
    emailTransportReady = true;
    console.log('Gmail SMTP connection verified.');
  } catch (error) {
    emailTransportReady = false;
    console.error('Gmail SMTP verification failed:', error.message);
  }
  return emailTransportReady;
}

async function sendEmail(to, subject, text) {
  if (!mailer) return false;
  await mailer.sendMail({
    from: `ACLC Smart Library <${process.env.GMAIL_USER}>`,
    to,
    subject,
    text,
  });
  return true;
}

function anonymizeRejectedAccount(userId) {
  db.prepare(`UPDATE users SET email=?,password_hash=?,name='Declined ACLC application',school_number=NULL,
    digital_id=NULL,email_verified=0,status='rejected' WHERE id=?`)
    .run(`declined-application-${userId}@rejected.invalid`, bcrypt.hashSync(crypto.randomBytes(32).toString('hex'), 12), userId);
  db.prepare('UPDATE student_profiles SET program=NULL,year_level=NULL WHERE user_id=?').run(userId);
  db.prepare('UPDATE staff_profiles SET employee_number=NULL,department=NULL WHERE user_id=?').run(userId);
  db.prepare("UPDATE user_credentials SET active=0,revoked_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE user_id=? AND active=1").run(userId);
}

function notification(userId, type, title, body, eventKey = null) {
  try {
    db.prepare(`INSERT INTO notifications(user_id,type,title,body,event_key) VALUES(?,?,?,?,?)`)
      .run(userId, type, title, body, eventKey);
  } catch (error) {
    if (!String(error.message).includes('UNIQUE')) throw error;
  }
}

app.get('/api/health', (_req, res) => {
  let sqliteReady = false;
  try {
    db.prepare('SELECT 1').get();
    sqliteReady = true;
  } catch (_) {
    // Do not expose internal database errors through the public health endpoint.
  }
  const firebaseReady = Boolean(firebaseAuth && firestore);
  const emailReady = Boolean(mailer);
  // Email is an optional workflow capability, not a prerequisite for serving
  // the library API. Treating missing SMTP credentials as a failed health check
  // makes deployment platforms mark an otherwise healthy API as unavailable.
  const ready = sqliteReady && (!firebaseAccountSyncRequired || firebaseReady);
  res.status(ready ? 200 : 503).json({
    ok: ready,
    service: 'ACLC Library API',
    checks: {
      sqlite: sqliteReady,
      firebaseAdminConfigured: firebaseReady,
      emailConfigured: emailReady,
      emailTransportReady,
      gateDeviceAuthenticationConfigured: Boolean(process.env.GATE_DEVICE_TOKEN),
    },
  });
});

const liraStopWords = new Set(['the','a','an','is','are','do','does','how','can','i','my','me','what','where','when','to','for','of','in','on','with','and','your','you','it','book','books']);
function liraWords(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(word => word.length > 2 && !liraStopWords.has(word));
}
function liraPersonalAnswer(question, user) {
  const q = question.toLowerCase();
  if (/(borrow|loan|slot|limit)/.test(q) && /(how many|limit|slot|remaining|available slots)/.test(q)) {
    const key = user.role === 'student' ? 'student_borrow_limit' : user.role === 'teacher' ? 'teacher_borrow_limit' : null;
    if (key) {
      const configured = setting(key);
      if (configured == null || !Number.isFinite(Number(configured))) return 'ACLC Library has not configured a borrowing limit for your role. Please ask the administrator.';
      const active = db.prepare("SELECT COUNT(*) n FROM loan_items li JOIN loans l ON l.id=li.loan_id WHERE l.user_id=? AND li.status='borrowed'").get(user.id).n;
      return `Your current configured limit is ${Number(configured)} book(s). You have ${active} active and ${Math.max(0, Number(configured)-active)} available slot(s).`;
    }
  }
  if (/\b(due|overdue|when.*return|return.*when|my borrowed book|my loan)\b/.test(q)) {
    const loans = db.prepare(`SELECT b.title,l.due_at FROM loan_items li JOIN loans l ON l.id=li.loan_id JOIN book_copies c ON c.id=li.copy_id JOIN books b ON b.id=c.book_id WHERE l.user_id=? AND li.status='borrowed' ORDER BY l.due_at`).all(user.id);
    return loans.length ? `Your active loans: ${loans.map(row => `${row.title} — due ${row.due_at}`).join('; ')}.` : 'I found no currently borrowed books on your account.';
  }
  if (/(reservation|reserved)/.test(q) && /(my|status|check|approved|pending)/.test(q)) {
    const rows = db.prepare('SELECT b.title,r.status,r.created_at FROM reservations r JOIN books b ON b.id=r.book_id WHERE r.user_id=? ORDER BY r.created_at DESC LIMIT 8').all(user.id);
    return rows.length ? `Your recent reservations: ${rows.map(row => `${row.title} — ${row.status}`).join('; ')}.` : 'There are no reservations on your account yet.';
  }
  if (/(qr|credential|digital id|digital student)/.test(q) && /(my|status|active|code|id|lost|expire)/.test(q)) {
    const credential = db.prepare('SELECT active,expires_at FROM user_credentials WHERE user_id=? ORDER BY id DESC LIMIT 1').get(user.id);
    if (!credential) return 'I do not see an issued QR credential for your account yet. Check that your account is approved, then open My QR.';
    return `Your QR credential is ${credential.active ? 'active' : 'inactive'}${credential.expires_at ? ` and expires ${credential.expires_at}` : ''}. Your digital ID is ${user.digital_id || 'not assigned'}.`;
  }
  if (/(penalt|fine|fee|outstanding)/.test(q) && /(my|check|owe|status|unpaid|outstanding)/.test(q)) {
    const rows = db.prepare('SELECT amount,status,reason FROM penalties WHERE user_id=? ORDER BY created_at DESC LIMIT 10').all(user.id);
    const unpaid = rows.filter(row => ['unpaid','approved'].includes(row.status));
    const total = unpaid.reduce((sum, row) => sum + Number(row.amount || 0), 0);
    return rows.length ? `You have ${unpaid.length} outstanding penalty record(s), totaling ${total.toFixed(2)}. Review the Penalties section for each status and ask the library administrator about payment.` : 'I found no penalty records on your account.';
  }
  if (/(registration|approval|approved|account status|suspended)/.test(q) && /(my|status|check|why|registration|approval)/.test(q)) {
    return `Your account status is ${user.status}${user.email_verified ? ' and your email is verified' : ''}.${user.status === 'pending_approval' ? ' Your application is waiting for administrator review.' : ''}${user.status === 'suspended' ? ' Contact the ACLC administrator for the reason and next steps.' : ''}`;
  }
  return null;
}
async function liraAiReply(question, user) {
  if (!process.env.OPENAI_API_KEY?.trim() || isPersonalLiraQuestion(question)) return null;
  try {
    const publicFaqs = user.role === 'student'
      ? db.prepare('SELECT question,answer FROM lira_faqs WHERE active=1 ORDER BY sort_order,id').all()
      : [];
    return await requestLiraAiAnswer({
      question,
      role: user.role,
      publicFaqs,
    });
  } catch (error) {
    console.warn('LIRA AI unavailable; using local answer:', error.message);
    return null;
  }
}

async function liraReply(question, user) {
  const personal = liraPersonalAnswer(question, user);
  if (personal) return { answer: personal, source: 'account' };
  const words = new Set(liraWords(question));
  if (user.role === 'student') {
    const faqs = db.prepare('SELECT question,answer FROM lira_faqs WHERE active=1 ORDER BY sort_order,id').all();
    let best = null; let bestScore = 0;
    for (const faq of faqs) {
      const faqWords = new Set(liraWords(faq.question));
      let score = 0;
      for (const word of words) if (faqWords.has(word)) score++;
      if (score > bestScore) { best = faq; bestScore = score; }
    }
    if (best && bestScore >= Math.min(2, words.size)) return { answer: best.answer, source: 'faq' };
  }
  if (/(search|find|catalog|available|title|author)/.test(question.toLowerCase())) {
    const terms = [...words].slice(0,5);
    if (terms.length) {
      const where = terms.map(() => '(title LIKE ? OR author LIKE ? OR category LIKE ?)').join(' OR ');
      const params = terms.flatMap(term => [`%${term}%`,`%${term}%`,`%${term}%`]);
      const books = db.prepare(`SELECT title,author,available_copies FROM books WHERE ${where} ORDER BY title LIMIT 5`).all(...params);
      if (books.length) return { answer: `I found these catalog matches: ${books.map(book => `${book.title} by ${book.author} (${book.available_copies} available)`).join('; ')}. Open Books to view full details.`, source: 'catalog' };
      return { answer: 'I could not find a matching title in the current catalog. Try a shorter title, author, or category search in Books.', source: 'catalog' };
    }
    return { answer: 'Open the Books section and search by title, author, or category. I can look up a specific title if you include its name.', source: 'catalog' };
  }
  const generated = await liraAiReply(question,user);
  if (generated) return { answer: generated, source: 'ai' };
  const roleHelp = {
    student: 'I can help with books, reservations, your QR, borrowing status, penalties, and registration. Try a suggested student FAQ, or ask about your own account.',
    teacher: 'I can help with the catalog, reservations, your own loans, borrowing limit, and QR status. Ask the ACLC Library desk for a policy decision that is not shown in your account.',
    librarian: 'I can help you find catalog titles and explain circulation workflows. Use the Books and Circulation sections to manage inventory, checkouts, and returns.',
    administrator: 'I can help you find catalog titles and explain administration workflows. Use Members, Registration Roles, semester, and gate tools in the administrator dashboard for system actions.',
  };
  const providerFallback = process.env.OPENAI_API_KEY?.trim()
    ? 'AI is temporarily unavailable, so I am using library help. '
    : '';
  return {
    answer: `${providerFallback}I do not have a verified answer for that yet. ${roleHelp[user.role] || 'Please contact the ACLC Library desk.'}`,
    source: 'library',
  };
}

app.get('/api/lira/status', auth(), authorize('student'), (_req, res) => {
  const aiEnabled = Boolean(process.env.OPENAI_API_KEY?.trim());
  res.json({ mode: aiEnabled ? 'ai' : 'library', ai_configured: aiEnabled });
});
app.get('/api/lira/faqs', auth(), authorize('student'), (_req,res) => {
  res.json(db.prepare('SELECT id,category,question,answer,sort_order FROM lira_faqs WHERE active=1 ORDER BY sort_order,id').all());
});
app.get('/api/lira/history', auth(), authorize('student'), (req,res) => {
  res.json(db.prepare('SELECT id,sender,message,created_at FROM lira_chat_messages WHERE user_id=? ORDER BY id DESC LIMIT 100').all(req.user.sub).reverse());
});
app.delete('/api/lira/history', auth(), authorize('student'), (req,res) => {
  const result = db.prepare('DELETE FROM lira_chat_messages WHERE user_id=?').run(req.user.sub);
  audit(req.user.sub,'LIRA_CHAT_HISTORY_CLEARED','lira_chat',req.user.sub,{messages:result.changes},req);
  res.json({message:'Your LIRA conversation history was cleared.'});
});
app.post('/api/lira/chat', auth(), authorize('student'), rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  keyGenerator: req => String(req.user.sub),
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'LIRA is receiving questions quickly. Please wait a minute and try again.' },
}), async (req,res) => {
  const question = String(req.body.message || '').trim();
  if (!question || question.length > 500) return res.status(400).json({error:'Enter a message up to 500 characters.'});
  db.prepare("INSERT INTO lira_chat_messages(user_id,sender,message) VALUES(?,'user',?)").run(req.user.sub,question);
  const reply = await liraReply(question, req.userRecord);
  db.prepare("INSERT INTO lira_chat_messages(user_id,sender,message) VALUES(?,'assistant',?)").run(req.user.sub,reply.answer);
  res.json({answer:reply.answer,source:reply.source,created_at:new Date().toISOString()});
});
const publicRegistrationRoles = () => ({
  student: setting('registration_role_student') !== 'false',
  teacher: setting('registration_role_teacher') !== 'false',
  librarian: false,
});
app.get('/api/auth/registration-roles', (_req, res) => res.json(publicRegistrationRoles()));
app.put('/api/admin/settings/registration-roles', auth(), authorize('administrator'), (req, res) => {
  const roles = req.body || {};
  if (!['student','teacher','librarian'].every(role => typeof roles[role] === 'boolean')) {
    return res.status(400).json({ error: 'Provide enabled/disabled values for student, teacher, and librarian.' });
  }
  if (roles.librarian) return res.status(400).json({ error: 'Librarian accounts must be created by an administrator.' });
  const update = db.prepare(`INSERT INTO system_settings(key,value,updated_at) VALUES(?,?,strftime('%Y-%m-%dT%H:%M:%fZ','now')) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at`);
  db.transaction(() => {
    for (const role of ['student','teacher']) update.run(`registration_role_${role}`, String(roles[role]));
    audit(req.user.sub, 'PUBLIC_REGISTRATION_ROLES_UPDATED', 'system_settings', null, roles, req);
  })();
  res.json({ message: 'Registration role availability updated.', roles: publicRegistrationRoles() });
});

app.post('/api/auth/register', async (req, res) => {
  const { email, password, name, role = 'student', school_number, program, year_level, employee_number, department } = req.body;
  if (!email || !password || !name) return res.status(400).json({ error: 'email, password, and name are required' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email))) return res.status(400).json({ error: 'Enter a valid email address' });
  if (!['student','teacher','librarian'].includes(role) || !publicRegistrationRoles()[role]) return res.status(403).json({ error: 'This account role is currently unavailable for public registration. Contact the library administrator.' });
  if (String(password).length < 10) return res.status(400).json({ error: 'Password must be at least 10 characters' });
  if (String(name).trim().length < 2) return res.status(400).json({ error: 'Enter your full name.' });
  if (role === 'student' && (!String(school_number || '').trim() || !String(program || '').trim())) {
    return res.status(400).json({ error: 'Student ID and course/program are required.' });
  }
  if ((role === 'teacher' || role === 'librarian') && (!String(employee_number || '').trim() || !String(department || '').trim())) {
    return res.status(400).json({ error: 'Employee ID and department are required.' });
  }
  const normalizedEmail = String(email).trim().toLowerCase();
  if (process.env.ADMIN_EMAIL && normalizedEmail === String(process.env.ADMIN_EMAIL).trim().toLowerCase()) {
    return res.status(409).json({ error: 'This email is reserved for the configured library administrator.' });
  }
  if (!requireFirebaseAccountSync(res)) return;
  if (firebaseAccountSyncRequired && !mailer) return res.status(503).json({ error: 'Email delivery must be configured before Firebase verified registration can be enabled.' });
  const existingUser = db.prepare('SELECT id,status FROM users WHERE email=?').get(normalizedEmail);
  if (existingUser && existingUser.status !== 'rejected') return res.status(409).json({ error: 'Email already registered' });
  const rejectedUserId = existingUser?.status === 'rejected' ? existingUser.id : 0;
  const existingPending = db.prepare('SELECT created_at FROM pending_registrations WHERE email=?').get(normalizedEmail);
  if (existingPending && Date.now() - Date.parse(existingPending.created_at) < 60000) {
    return res.status(429).json({ error: 'Please wait one minute before requesting another verification code.' });
  }
  if (role === 'student' && db.prepare('SELECT id FROM users WHERE school_number=? AND id<>?').get(String(school_number).trim(), rejectedUserId)) return res.status(409).json({ error: 'Student ID is already registered.' });
  if ((role === 'teacher' || role === 'librarian') && db.prepare('SELECT user_id FROM staff_profiles WHERE employee_number=? AND user_id<>?').get(String(employee_number).trim(), rejectedUserId)) return res.status(409).json({ error: 'Employee ID is already registered.' });

  if (process.env.NODE_ENV === 'production' && (!firebaseAuth || !firestore)) {
    return res.status(503).json({ error: 'Firebase Authentication and Firestore are not configured for registration. Please contact the library administrator.' });
  }

  if (firebaseAuth && firestore) {
    if (!mailer) return res.status(503).json({ error: 'Account verification email is not configured. Please contact the library administrator.' });
    let firebaseUser;
    try {
      try {
        firebaseUser = await firebaseAuth.getUserByEmail(normalizedEmail);
        if (firebaseUser.emailVerified && existingUser?.status !== 'rejected' && !firebaseUser.disabled) return res.status(409).json({ error: 'This email is already verified. Sign in or contact the administrator.' });
        firebaseUser = await firebaseAuth.updateUser(firebaseUser.uid, { password, displayName: name.trim(), emailVerified: false, disabled: true });
      } catch (error) {
        if (error.code !== 'auth/user-not-found') throw error;
        firebaseUser = await firebaseAuth.createUser({ email: normalizedEmail, password, displayName: name.trim(), emailVerified: false, disabled: true });
      }
      const verificationLink = await firebaseAuth.generateEmailVerificationLink(normalizedEmail);
      const sent = await sendEmail(normalizedEmail, 'Verify your ACLC Smart Library email address',
        `Hello ${name.trim()},\n\nVerify your email address using this secure link:\n\n${verificationLink}\n\nAfter verifying, return to the ACLC Smart Library app and select “I verified my email” to submit your ${role} application for administrator review. If the link has expired, request a new one from the app.\n\nIf you did not submit this registration, you can ignore this email.`);
      if (!sent) return res.status(503).json({ error: 'We could not send the verification link. Please try again later.' });
      db.transaction(() => {
        if (rejectedUserId) anonymizeRejectedAccount(rejectedUserId);
        db.prepare(`INSERT INTO pending_registrations(email,password_hash,role,name,school_number,program,year_level,employee_number,department,otp_hash,expires_at,firebase_uid)
          VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(email) DO UPDATE SET password_hash=excluded.password_hash,role=excluded.role,name=excluded.name,
          school_number=excluded.school_number,program=excluded.program,year_level=excluded.year_level,employee_number=excluded.employee_number,
          department=excluded.department,otp_hash=excluded.otp_hash,attempts=0,expires_at=excluded.expires_at,
          created_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),firebase_uid=excluded.firebase_uid`)
          .run(normalizedEmail, bcrypt.hashSync(password, 12), role, name.trim(), school_number || null, program || null, year_level || null,
            employee_number || null, department || null, bcrypt.hashSync(crypto.randomBytes(32).toString('hex'), 10),
            new Date(Date.now() + REGISTRATION_PENDING_TTL_MS).toISOString(), firebaseUser.uid);
      })();
      await firestore.collection('users').doc(firebaseUser.uid).set({
        uid: firebaseUser.uid, email: normalizedEmail, name: name.trim(), role,
        status: 'pending_email', emailVerified: false,
        schoolNumber: school_number || null, program: program || null, yearLevel: year_level || null,
        employeeNumber: employee_number || null, department: department || null,
        createdAt: require('firebase-admin/firestore').FieldValue.serverTimestamp(),
      }, { merge: true });
      return res.status(201).json({ message: 'A verification link was sent to your email. Open it, then return to the app and confirm your email to submit your application for administrator review.', email_sent: true, verification_method: 'firebase_link' });
    } catch (error) {
      console.error('Firebase registration failed:', error.message);
      if (error.code === 'auth/email-already-exists') return res.status(409).json({ error: 'Email already registered in Firebase Authentication.' });
      return res.status(503).json({ error: 'We could not create or verify your Firebase account. Please try again later.' });
    }
  }
  const otp = String(crypto.randomInt(0,1000000)).padStart(6,'0');
  const passwordHash = bcrypt.hashSync(password, 12);
  let emailSent = false;
  if (mailer) {
    try {
      emailSent = await sendEmail(normalizedEmail, 'Verify your ACLC Smart Library registration',
        `Hello ${name.trim()},\n\nYour ACLC Smart Library verification code is ${otp}. It expires in five minutes and can be used once.\n\nAfter verifying your email, your ${role} application will be sent to the ACLC library administrator for review. You will receive another email when it is approved or declined.\n\nIf you did not submit this application, you can ignore this email.`);
    } catch (error) {
      console.error('Registration OTP email failed:', error.message);
    }
  }
  if (process.env.NODE_ENV === 'production' && !emailSent) {
    return res.status(503).json({ error: 'We could not send your verification code. No account was created; please try again later.' });
  }
  db.transaction(() => {
    if (rejectedUserId) anonymizeRejectedAccount(rejectedUserId);
    db.prepare(`INSERT INTO pending_registrations(email,password_hash,role,name,school_number,program,year_level,employee_number,department,otp_hash,expires_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(email) DO UPDATE SET password_hash=excluded.password_hash,role=excluded.role,name=excluded.name,
      school_number=excluded.school_number,program=excluded.program,year_level=excluded.year_level,employee_number=excluded.employee_number,
      department=excluded.department,otp_hash=excluded.otp_hash,attempts=0,expires_at=excluded.expires_at,created_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')`)
      .run(normalizedEmail, passwordHash, role, name.trim(), school_number || null, program || null, year_level || null, employee_number || null, department || null, bcrypt.hashSync(otp,10), new Date(Date.now()+5*60*1000).toISOString());
  })();
  res.status(201).json({
    message: emailSent
      ? 'A verification code was sent to your email. After verification, your application will be reviewed by an administrator.'
      : process.env.NODE_ENV === 'production'
        ? 'Your application is saved, but the verification email could not be sent. Contact the administrator to configure email delivery, then request a new code.'
        : 'Registration created. Use the development code to verify your email before administrator approval.',
    email_sent: emailSent,
    verification_otp: process.env.NODE_ENV === 'production' || emailSent ? undefined : otp
  });
});

app.post('/api/auth/verify-otp', async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const otp = String(req.body.otp || '');
  if (!/^[0-9]{6}$/.test(otp)) return res.status(400).json({ error: 'Enter the six-digit verification code.' });
  const pending = db.prepare('SELECT * FROM pending_registrations WHERE email=? AND expires_at>?').get(email, new Date().toISOString());
  if (!pending) return res.status(400).json({ error: 'Invalid or expired verification code. Submit your registration again.' });
  if (pending.firebase_uid) return res.status(400).json({ error: 'This registration uses an email verification link. Open the link we sent, then finish registration in the app.' });
  if (pending.attempts >= 5) return res.status(429).json({ error: 'Too many incorrect codes. Request a new code after the resend cooldown.' });
  if (!bcrypt.compareSync(otp, pending.otp_hash)) {
    db.prepare('UPDATE pending_registrations SET attempts=attempts+1 WHERE email=?').run(email);
    return res.status(400).json({ error: 'Incorrect verification code.' });
  }

  let firebaseUser = null;
  const userDoc = pending.firebase_uid ? firestore?.collection('users').doc(pending.firebase_uid) : null;
  try {
    if (firebaseAccountSyncRequired && (!firebaseAuth || !firestore || !mailer)) {
      return res.status(503).json({ error: 'Firebase account sync and email delivery are not configured.' });
    }
    if (pending.firebase_uid) {
      if (!firebaseAuth || !firestore) return res.status(503).json({ error: 'Firebase account linking is not configured.' });
      firebaseUser = await firebaseAuth.getUser(pending.firebase_uid);
      firebaseUser = await firebaseAuth.updateUser(firebaseUser.uid, { emailVerified: true, disabled: true });
      await userDoc.set({
        uid: firebaseUser.uid, email, name: pending.name, role: pending.role,
        status: 'pending_approval', emailVerified: true,
        schoolNumber: pending.school_number || null, program: pending.program || null,
        yearLevel: pending.year_level || null, employeeNumber: pending.employee_number || null,
        department: pending.department || null,
        updatedAt: require('firebase-admin/firestore').FieldValue.serverTimestamp(),
      }, { merge: true });
    }

    let userId;
    db.transaction(() => {
      const current = db.prepare('SELECT * FROM pending_registrations WHERE email=? AND expires_at>?').get(email, new Date().toISOString());
      if (!current || !bcrypt.compareSync(otp, current.otp_hash)) {
        const error = new Error('Verification code was already used or expired.');
        error.code = 'OTP_ALREADY_USED';
        throw error;
      }
      const result = db.prepare(`INSERT INTO users(email,password_hash,role,status,name,school_number,email_verified,firebase_uid)
        VALUES(?,?,?,?,?,?,1,?)`).run(email, current.password_hash, current.role, 'pending_approval', current.name,
        current.school_number, firebaseUser?.uid || null);
      userId = Number(result.lastInsertRowid);
      if (current.role === 'student') {
        db.prepare('INSERT INTO student_profiles(user_id,program,year_level) VALUES(?,?,?)').run(userId, current.program, current.year_level);
      } else {
        db.prepare('INSERT INTO staff_profiles(user_id,employee_number,department) VALUES(?,?,?)').run(userId, current.employee_number, current.department);
      }
      db.prepare('DELETE FROM pending_registrations WHERE email=?').run(email);
      audit(null, 'USER_REGISTERED_AND_EMAIL_VERIFIED', 'user', userId, { role: current.role, firebase_uid: firebaseUser?.uid || null }, req);
    })();

    const admins = db.prepare("SELECT email FROM users WHERE role='administrator' AND status='approved'").all();
    if (mailer) await Promise.all(admins.map((admin) => sendEmail(admin.email, 'ACLC Smart Library application awaiting review', `${pending.name} (${pending.role}) has verified ${email} and is waiting for administrator review.`).catch((error) => console.error('Administrator application notice failed:', error.message))));
    return res.json({ message: 'Email verified. Your application is now waiting for administrator approval.', status: 'pending_approval' });
  } catch (error) {
    if (firebaseUser && userDoc && error.code !== 'OTP_ALREADY_USED') {
      await Promise.all([
        firebaseAuth.updateUser(firebaseUser.uid, { emailVerified: false, disabled: true }).catch((rollbackError) => console.error('Firebase OTP rollback failed:', rollbackError.message)),
        userDoc.set({ status: 'pending_email', emailVerified: false }).catch((rollbackError) => console.error('Firestore OTP rollback failed:', rollbackError.message)),
      ]);
    }
    if (error.code === 'OTP_ALREADY_USED') return res.status(400).json({ error: error.message });
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(409).json({ error: 'That email or student/staff ID is already registered.' });
    console.error('Registration OTP completion failed:', error.message);
    return res.status(503).json({ error: 'We could not finish creating your account. The code is still valid; please retry.' });
  }
});app.post('/api/auth/complete-registration', async (req, res) => {
  if (!firebaseAuth || !firestore) return res.status(503).json({ error: 'Firebase account linking is not configured.' });
  const email = String(req.body.email || '').trim().toLowerCase();
  const pending = db.prepare('SELECT * FROM pending_registrations WHERE email=? AND firebase_uid IS NOT NULL').get(email);
  if (!pending || Date.parse(pending.expires_at) <= Date.now()) return res.status(400).json({ error: 'Registration expired. Please submit your application again.' });
  try {
    const firebaseUser = await firebaseAuth.getUser(pending.firebase_uid);
    if (!firebaseUser.emailVerified) return res.status(400).json({ error: 'Verify your email using the link we sent, then try again.' });
    const userDoc = firestore.collection('users').doc(firebaseUser.uid);
    await userDoc.set({
      uid: firebaseUser.uid,
      email,
      name: pending.name,
      role: pending.role,
      status: 'pending_approval',
      emailVerified: true,
      schoolNumber: pending.school_number || null,
      program: pending.program || null,
      yearLevel: pending.year_level || null,
      employeeNumber: pending.employee_number || null,
      department: pending.department || null,
      createdAt: require('firebase-admin/firestore').FieldValue.serverTimestamp(),
    });
    let userId;
    try {
      const createAccount = db.transaction(() => {
        const result = db.prepare('INSERT INTO users(email,password_hash,role,status,name,school_number,email_verified,firebase_uid) VALUES(?,?,?,?,?,?,1,?)')
          .run(email, pending.password_hash, pending.role, 'pending_approval', pending.name, pending.school_number, firebaseUser.uid);
        userId = result.lastInsertRowid;
        if (pending.role === 'student') db.prepare('INSERT INTO student_profiles(user_id,program,year_level) VALUES(?,?,?)').run(userId, pending.program, pending.year_level);
        else db.prepare('INSERT INTO staff_profiles(user_id,employee_number,department) VALUES(?,?,?)').run(userId, pending.employee_number, pending.department);
        db.prepare('DELETE FROM pending_registrations WHERE email=?').run(email);
      });
      createAccount();
    } catch (error) {
      await userDoc.delete().catch(() => {});
      throw error;
    }
    audit(null, 'USER_REGISTERED_AND_EMAIL_VERIFIED', 'user', userId, { role: pending.role, firebase_uid: firebaseUser.uid }, req);
    const admins = db.prepare("SELECT email FROM users WHERE role='administrator' AND status='approved'").all();
    if (mailer) await Promise.all(admins.map(admin => sendEmail(admin.email, 'ACLC Smart Library application awaiting review', `${pending.name} (${pending.role}) has verified ${email} and is waiting for administrator review.`).catch(error => console.error('Administrator application notice failed:', error.message))));
    return res.json({ message: 'Email verified. Your account is now recorded in Firebase Authentication, Firestore, and the ACLC approval queue.', status: 'pending_approval' });
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(409).json({ error: 'That email or ID is already registered.' });
    console.error('Firebase registration sync failed:', error.message);
    return res.status(503).json({ error: 'We could not finish syncing your account. Please try again or contact the administrator.' });
  }
});
app.post('/api/auth/resend-verification', async (req, res) => {
  if (!firebaseAuth || !mailer) return res.status(503).json({ error: 'Firebase verification email is not configured.' });
  const email = String(req.body.email || '').trim().toLowerCase();
  const pending = db.prepare('SELECT firebase_uid,created_at FROM pending_registrations WHERE email=? AND firebase_uid IS NOT NULL').get(email);
  if (!pending) return res.json({ message: 'If the application is awaiting verification, a fresh link will be sent.' });
  if (Date.now() - Date.parse(pending.created_at) < 60000) return res.status(429).json({ error: 'Please wait one minute before requesting another link.' });
  try {
    const link = await firebaseAuth.generateEmailVerificationLink(email);
    await sendEmail(email, 'Your ACLC Smart Library verification link', `Use this secure link to verify your email address:\n\n${link}\n\nThen return to the ACLC Smart Library app and tap “I verified my email”. If the link has expired, request another one from the app.`);
    db.prepare(`UPDATE pending_registrations SET expires_at=?,created_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE email=?`)
      .run(new Date(Date.now() + REGISTRATION_PENDING_TTL_MS).toISOString(), email);
    res.json({ message: 'A fresh verification link was sent. Check your inbox and Spam folder.' });
  } catch (error) {
    console.error('Firebase verification resend failed:', error.message);
    res.status(503).json({ error: 'Could not send a verification link. Try again later.' });
  }
});
app.post('/api/auth/resend-otp', async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const pending = db.prepare('SELECT * FROM pending_registrations WHERE email=? AND expires_at>?').get(email, new Date().toISOString());
  if (!pending) return res.json({ message: 'If a registration is awaiting verification, a new code can be requested.' });
  if (pending.firebase_uid) return res.status(400).json({ error: 'This registration uses an email verification link. Use the resend-link action in the app.' });
  if (Date.now() - Date.parse(pending.created_at) < 60000) {
    return res.status(429).json({ error: 'Please wait one minute before requesting another code.' });
  }
  const otp = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  let emailSent = false;
  if (mailer) {
    try {
      emailSent = await sendEmail(email, 'Your ACLC Smart Library verification code',
        `Your new six-digit ACLC Smart Library verification code is ${otp}. It expires in five minutes and can be used once.`);
    } catch (error) {
      console.error('Registration OTP resend failed:', error.message);
    }
  }
  if ((process.env.NODE_ENV === 'production' || pending.firebase_uid) && !emailSent) {
    return res.status(503).json({ error: 'The verification code could not be emailed. Please try again later.' });
  }
  db.prepare(`UPDATE pending_registrations SET otp_hash=?,attempts=0,expires_at=?,created_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE email=?`)
    .run(bcrypt.hashSync(otp, 10), new Date(Date.now() + 5 * 60 * 1000).toISOString(), email);
  return res.json({
    message: emailSent ? 'A new verification code was sent to your email.' : 'A new development verification code was generated.',
    email_sent: emailSent,
    verification_otp: process.env.NODE_ENV === 'production' || emailSent ? undefined : otp,
  });
});
app.post('/api/auth/verify-email/:token', (req, res) => {
  const record = db.prepare(`SELECT t.*,u.status FROM email_verification_tokens t JOIN users u ON u.id=t.user_id WHERE t.token=? AND t.used=0 AND t.expires_at>?`)
    .get(req.params.token, new Date().toISOString());
  if (!record) return res.status(400).json({ error: 'Invalid or expired verification token' });
  db.transaction(() => {
    db.prepare('UPDATE email_verification_tokens SET used=1 WHERE id=?').run(record.id);
    db.prepare('UPDATE users SET email_verified=1,status=? WHERE id=?').run('pending_approval', record.user_id);
    audit(record.user_id, 'EMAIL_VERIFIED', 'user', record.user_id, null, req);
  })();
  res.json({ message: 'Email verified. Your registration now awaits administrator approval.' });
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE email=?').get(String(email || '').toLowerCase());
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });
  if (!requireFirebaseAccountSync(res, user)) return;
  if (user.firebase_uid && firebaseAuth) {
    const apiKey = process.env.FIREBASE_WEB_API_KEY;
    if (!apiKey) return res.status(503).json({ error: 'Firebase sign-in is not fully configured. Contact the library administrator.' });
    try {
      const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(apiKey)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user.email, password: String(password || ''), returnSecureToken: true }),
      });
      const firebaseResult = await response.json();
      if (!response.ok || firebaseResult.localId !== user.firebase_uid) return res.status(401).json({ error: 'Invalid credentials' });
      const firebaseRecord = await firebaseAuth.getUser(user.firebase_uid);
      if (!firebaseRecord.emailVerified) return res.status(403).json({ error: 'Email verification required' });
      db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(bcrypt.hashSync(String(password), 12), user.id);
    } catch (error) {
      console.error('Firebase sign-in failed:', error.message);
      return res.status(503).json({ error: 'Firebase sign-in is temporarily unavailable. Please try again.' });
    }
  } else if (!bcrypt.compareSync(password || '', user.password_hash)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  if (!user.email_verified) return res.status(403).json({ error: 'Email verification required' });
  if (user.status === 'rejected') return res.status(403).json({ error: 'Your application was declined. Please register again with the correct information.' });
  if (user.status !== 'approved') return res.status(403).json({ error: `Account status: ${user.status}` });
  audit(user.id, 'LOGIN', 'user', user.id, null, req);
  res.json({ token: sign(user), user: { id: user.id, name: user.name, role: user.role, digital_id: user.digital_id, standing: user.standing } });
});

app.post('/api/auth/forgot-password', async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const safeMessage = 'If a Firebase account exists for that email, a password reset link has been sent. Check your inbox and Spam folder.';
  if (!firebaseAuth || !firestore || !mailer || !email) return res.status(503).json({ error: 'Password reset email is not configured. Please contact the library administrator.' });
  try {
    const account = db.prepare('SELECT * FROM users WHERE email=?').get(email);
    if (account) {
      let firebaseUser;
      if (account.firebase_uid) firebaseUser = await firebaseAuth.getUser(account.firebase_uid);
      else {
        try { firebaseUser = await firebaseAuth.getUserByEmail(email); }
        catch (lookupError) {
          if (lookupError.code !== 'auth/user-not-found') throw lookupError;
          firebaseUser = await firebaseAuth.createUser({
            email,
            password: crypto.randomBytes(40).toString('base64url'),
            displayName: account.name,
            emailVerified: account.email_verified === 1,
            disabled: account.status !== 'approved',
          });
        }
        if (firebaseUser.emailVerified !== Boolean(account.email_verified) || firebaseUser.disabled !== (account.status !== 'approved')) {
          firebaseUser = await firebaseAuth.updateUser(firebaseUser.uid, {
            emailVerified: account.email_verified === 1,
            disabled: account.status !== 'approved',
          });
        }
        db.prepare('UPDATE users SET firebase_uid=? WHERE id=?').run(firebaseUser.uid, account.id);
        await firestore.collection('users').doc(firebaseUser.uid).set({
          uid: firebaseUser.uid, email, name: account.name, role: account.role,
          status: account.status, emailVerified: account.email_verified === 1,
          digitalId: account.digital_id || null,
          createdAt: require('firebase-admin/firestore').FieldValue.serverTimestamp(),
        }, { merge: true });
      }
      const link = await firebaseAuth.generatePasswordResetLink(email);
      await sendEmail(email, 'Reset your ACLC Smart Library password', `Use this secure Firebase link to choose a new password:\n\n${link}\n\nIf you did not request a password reset, ignore this email.`);
    }
  } catch (error) {
    if (error.code !== 'auth/user-not-found') console.error('Firebase password reset failed:', error.message);
  }
  res.json({ message: safeMessage });
});

app.get('/api/me', auth(), (req, res) => {
  const credential = db.prepare('SELECT credential,active FROM user_credentials WHERE user_id=? ORDER BY id DESC LIMIT 1').get(req.user.sub);
  const user = db.prepare(`SELECT u.id,u.email,u.role,u.status,u.name,u.school_number,u.digital_id,u.standing,u.replacement_count,u.email_verified,u.created_at,
    sp.program,sp.year_level,st.employee_number,st.department
    FROM users u LEFT JOIN student_profiles sp ON sp.user_id=u.id LEFT JOIN staff_profiles st ON st.user_id=u.id WHERE u.id=?`).get(req.user.sub);
  res.json({ user, credential_active: credential?.active === 1, replacement_count: req.userRecord.replacement_count });
});

app.put('/api/me', auth(), async (req, res) => {
  const name = String(req.body.name || '').trim();
  if (name.length < 2 || name.length > 100) return res.status(400).json({ error: 'Name must be between 2 and 100 characters' });
  const role = req.userRecord.role;
  const userId = req.user.sub;
  const before = db.prepare('SELECT name FROM users WHERE id=?').get(userId);
  const firebaseProfile = db.prepare('SELECT firebase_uid,role FROM users WHERE id=?').get(userId);
  if (!requireFirebaseAccountSync(res, firebaseProfile)) return;
  if (firebaseAccountSyncRequired) {
    const updates = { name, role: firebaseProfile.role, updatedAt: require('firebase-admin/firestore').FieldValue.serverTimestamp() };
    if (firebaseProfile.role === 'student') Object.assign(updates, { program: String(req.body.program || '').trim() || null, yearLevel: String(req.body.year_level || '').trim() || null });
    else if (['teacher','librarian'].includes(firebaseProfile.role)) updates.department = String(req.body.department || '').trim() || null;
    try {
      await firebaseAuth.updateUser(firebaseProfile.firebase_uid, { displayName: name });
      await firestore.collection('users').doc(firebaseProfile.firebase_uid).set(updates, { merge: true });
    } catch (error) {
      console.error('Firebase profile sync failed:', error.message);
      return res.status(503).json({ error: 'The profile could not be synchronized to Firebase. No SQLite changes were made.' });
    }
  }
  db.transaction(() => {
    db.prepare('UPDATE users SET name=? WHERE id=?').run(name, userId);
    if (role === 'student') {
      const program = String(req.body.program || '').trim().slice(0, 120);
      const yearLevel = String(req.body.year_level || '').trim().slice(0, 40);
      db.prepare('UPDATE student_profiles SET program=?,year_level=? WHERE user_id=?').run(program || null, yearLevel || null, userId);
    } else if (role === 'teacher' || role === 'librarian') {
      const department = String(req.body.department || '').trim().slice(0, 120);
      db.prepare('UPDATE staff_profiles SET department=? WHERE user_id=?').run(department || null, userId);
    }
    audit(userId, 'PROFILE_UPDATED', 'user', userId, { nameChanged: before.name !== name }, req);
  })();
  if (!firebaseAccountSyncRequired && firebaseProfile?.firebase_uid && firestore) {
    const updates = { name, role: firebaseProfile.role, updatedAt: require('firebase-admin/firestore').FieldValue.serverTimestamp() };
    if (firebaseProfile.role === 'student') Object.assign(updates, { program: String(req.body.program || '').trim() || null, yearLevel: String(req.body.year_level || '').trim() || null });
    else if (['teacher','librarian'].includes(firebaseProfile.role)) updates.department = String(req.body.department || '').trim() || null;
    void firestore.collection('users').doc(firebaseProfile.firebase_uid).set(updates, { merge: true }).catch(error => console.error('Firestore profile sync failed:', error.message));
  }
  const user = db.prepare(`SELECT u.id,u.email,u.role,u.status,u.name,u.school_number,u.digital_id,u.standing,u.replacement_count,u.email_verified,u.created_at,
    sp.program,sp.year_level,st.employee_number,st.department
    FROM users u LEFT JOIN student_profiles sp ON sp.user_id=u.id LEFT JOIN staff_profiles st ON st.user_id=u.id WHERE u.id=?`).get(userId);
  res.json({ user });
});

app.post('/api/me/password', auth(), async (req, res) => {
  const currentPassword = String(req.body.current_password || '');
  const newPassword = String(req.body.new_password || '');
  if (newPassword.length < 10) return res.status(400).json({ error: 'New password must be at least 10 characters' });
  const record = db.prepare('SELECT password_hash FROM users WHERE id=?').get(req.user.sub);
  if (!record || !bcrypt.compareSync(currentPassword, record.password_hash)) return res.status(400).json({ error: 'Current password is incorrect' });
  const firebaseRecord = db.prepare('SELECT firebase_uid FROM users WHERE id=?').get(req.user.sub);
  if (!requireFirebaseAccountSync(res, firebaseRecord)) return;
  if (firebaseRecord?.firebase_uid && firebaseAuth) {
    try { await firebaseAuth.updateUser(firebaseRecord.firebase_uid, { password: newPassword }); }
    catch (error) { console.error('Firebase password update failed:', error.message); return res.status(503).json({ error: 'Could not update your Firebase password. Please try again later.' }); }
  }
  db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(bcrypt.hashSync(newPassword, 12), req.user.sub);
  audit(req.user.sub, 'PASSWORD_CHANGED', 'user', req.user.sub, null, req);
  res.json({ message: 'Password updated successfully' });
});

app.post('/api/admin/users/:id/approval', auth(), authorize('administrator'), async (req, res) => {
  const { approve, reason } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id);
  if (!user || user.status !== 'pending_approval') return res.status(404).json({ error: 'Pending application not found' });
  if (typeof approve !== 'boolean') return res.status(400).json({ error: 'Choose whether to approve or decline this application.' });
  if (!requireFirebaseAccountSync(res, user)) return;
  if (!approve) {
    if (user.firebase_uid && firebaseAuth) {
      try {
        await firebaseAuth.updateUser(user.firebase_uid, { disabled: true });
        if (firestore) {
          await firestore.collection('users').doc(user.firebase_uid).set({ status: 'rejected', updatedAt: require('firebase-admin/firestore').FieldValue.serverTimestamp() }, { merge: true });
        }
      } catch (error) {
        console.error('Firebase rejection sync failed:', error.message);
        return res.status(503).json({ error: 'The application could not be synchronized to Firebase. No SQLite decision was recorded.' });
      }
    }
    db.transaction(() => {
      db.prepare('UPDATE users SET status=? WHERE id=?').run('rejected', user.id);
      audit(req.user.sub, 'REGISTRATION_REJECTED', 'user', user.id, { reason }, req);
      notification(user.id, 'REGISTRATION_REJECTED', 'Registration declined', reason
        ? `Your ${user.role} account application was declined. Reason: ${String(reason).slice(0, 500)} Submit a new registration with the correct information.`
        : `Your ${user.role} account application was declined. Submit a new registration with the correct information.`);
    })();
    let emailSent = false;
    try {
      emailSent = await sendEmail(user.email, 'ACLC Smart Library registration update',
        `Hello ${user.name},\n\nYour ${user.role} account application was declined.${reason ? `\n\nReason: ${String(reason).slice(0, 500)}` : ''}\n\nYou may register again with the correct information. If you have questions, contact the ACLC library administrator.`);
    } catch (error) {
      console.error('Registration rejection email failed:', error.message);
    }
    return res.json({
      message: emailSent
        ? 'Application declined. The applicant was emailed and may register again with corrected information.'
        : 'Application declined, but the email could not be sent. Check Gmail delivery settings; the applicant may register again.',
      email_sent: emailSent,
    });
  }
  const prefixSetting = setting('id_prefix') || 'ACLC-{{year}}-';
  const digitalId = `${prefixSetting.replace('{{year}}', String(new Date().getFullYear()))}${String(user.id).padStart(6, '0')}`;
  const credential = crypto.randomBytes(32).toString('base64url');
  if (user.firebase_uid && firebaseAuth) {
    try {
      await firebaseAuth.updateUser(user.firebase_uid, { disabled: false });
      if (firestore) {
        await firestore.collection('users').doc(user.firebase_uid).set({ status: 'approved', digitalId, updatedAt: require('firebase-admin/firestore').FieldValue.serverTimestamp() }, { merge: true });
      }
    } catch (error) {
      await firebaseAuth.updateUser(user.firebase_uid, { disabled: true })
        .catch(rollbackError => console.error('Firebase approval rollback failed:', rollbackError.message));
      if (firestore) {
        await firestore.collection('users').doc(user.firebase_uid).set({ status: 'pending_approval', updatedAt: require('firebase-admin/firestore').FieldValue.serverTimestamp() }, { merge: true })
          .catch(rollbackError => console.error('Firestore approval rollback failed:', rollbackError.message));
      }
      console.error('Firebase approval sync failed:', error.message);
      return res.status(503).json({ error: 'The approval could not be synchronized to Firebase. No SQLite approval was recorded.' });
    }
  }
  try {
    db.transaction(() => {
      db.prepare('UPDATE users SET status=?,digital_id=? WHERE id=?').run('approved', digitalId, user.id);
      const credentialResult = db.prepare('INSERT INTO user_credentials(user_id,credential) VALUES(?,?)').run(user.id, credential);
      db.prepare(`INSERT INTO credential_events(user_id,credential_id,event_type,performed_by,reason) VALUES(?,?,?,?,?)`)
        .run(user.id, Number(credentialResult.lastInsertRowid), 'issued', req.user.sub, 'registration approved');
      audit(req.user.sub, 'REGISTRATION_APPROVED', 'user', user.id, { digitalId }, req);
      notification(user.id, 'REGISTRATION_APPROVED', 'Registration approved', 'Your ACLC Library account is active.');
    })();
  } catch (error) {
    if (user.firebase_uid && firebaseAuth) {
      await firebaseAuth.updateUser(user.firebase_uid, { disabled: true })
        .catch(rollbackError => console.error('Firebase approval rollback failed:', rollbackError.message));
      if (firestore) {
        await firestore.collection('users').doc(user.firebase_uid).set({ status: 'pending_approval', digitalId: null }, { merge: true })
          .catch(rollbackError => console.error('Firestore approval rollback failed:', rollbackError.message));
      }
    }
    console.error('SQLite approval transaction failed:', error.message);
    return res.status(503).json({ error: 'The approval could not be saved to SQLite. Firebase was returned to pending approval.' });
  }
  let emailSent = false;
  try {
    emailSent = await sendEmail(user.email, 'Your ACLC Smart Library account is approved',
      `Hello ${user.name},\n\nYour ${user.role} account has been approved. You can now sign in to ACLC Smart Library using your registered email and password.\n\nYour digital ID: ${digitalId}\n\nKeep your sign-in details and QR credential private.`);
  } catch (error) {
    console.error('Registration approval email failed:', error.message);
  }
  res.json({
    message: emailSent
      ? 'User approved and email sent. They can now sign in to ACLC Smart Library.'
      : 'User approved, but the email could not be sent. Check Gmail delivery settings; the account is ready to sign in.',
    email_sent: emailSent,
    digital_id: digitalId,
  });
});

app.get('/api/admin/users/pending', auth(), authorize('administrator'), (_req, res) => {
  res.json(db.prepare(`SELECT u.id,u.email,u.name,u.role,u.school_number,u.created_at,u.email_verified,
      sp.program,sp.year_level,fp.employee_number,fp.department
    FROM users u
    LEFT JOIN student_profiles sp ON sp.user_id=u.id
    LEFT JOIN staff_profiles fp ON fp.user_id=u.id
    WHERE u.status='pending_approval' AND u.email_verified=1
    ORDER BY u.created_at DESC`).all());
});

app.post('/api/admin/users', auth(), authorize('administrator'), async (req, res) => {
  const name = String(req.body.name || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const role = String(req.body.role || '');
  const schoolNumber = String(req.body.school_number || '').trim();
  const program = String(req.body.program || '').trim();
  const yearLevel = String(req.body.year_level || '').trim();
  const employeeNumber = String(req.body.employee_number || '').trim();
  const department = String(req.body.department || '').trim();

  if (name.length < 2 || name.length > 100) return res.status(400).json({ error: 'Enter a name between 2 and 100 characters.' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
  if (password.length < 10) return res.status(400).json({ error: 'Initial password must be at least 10 characters.' });
  if (!['student','teacher','librarian'].includes(role)) return res.status(400).json({ error: 'Choose student, teacher, or librarian.' });
  if (role === 'student' && (!schoolNumber || !program)) return res.status(400).json({ error: 'Student ID and course/program are required for a student account.' });
  if (role !== 'student' && (!employeeNumber || !department)) return res.status(400).json({ error: 'Employee ID and department are required for staff accounts.' });
  if (db.prepare('SELECT id FROM users WHERE email=?').get(email)) return res.status(409).json({ error: 'An account already uses this email. Review it in Users & approvals.' });
  if (db.prepare('SELECT email FROM pending_registrations WHERE email=?').get(email)) return res.status(409).json({ error: 'A registration with this email is waiting for verification. Complete or restart that registration first.' });
  if (role === 'student' && db.prepare('SELECT id FROM users WHERE school_number=?').get(schoolNumber)) return res.status(409).json({ error: 'This student ID is already registered.' });
  if (role !== 'student' && db.prepare('SELECT user_id FROM staff_profiles WHERE employee_number=?').get(employeeNumber)) return res.status(409).json({ error: 'This employee ID is already registered.' });
  if (!requireFirebaseAccountSync(res)) return;
  if (process.env.NODE_ENV === 'production' && (!firebaseAuth || !firestore)) {
    return res.status(503).json({ error: 'Account creation is disabled until Firebase Admin credentials are configured on the API server.' });
  }

  let firebaseUser = null;
  const digitalId = `ACLC-${new Date().getFullYear()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
  try {
    if (firebaseAuth && firestore) {
      firebaseUser = await firebaseAuth.createUser({ email, password, displayName: name, emailVerified: true, disabled: false });
      await firestore.collection('users').doc(firebaseUser.uid).set({
        uid: firebaseUser.uid, email, name, role, status: 'approved', emailVerified: true,
        schoolNumber: role === 'student' ? schoolNumber : null,
        program: role === 'student' ? program : null,
        yearLevel: role === 'student' ? yearLevel || null : null,
        employeeNumber: role !== 'student' ? employeeNumber : null,
        department: role !== 'student' ? department : null,
        digitalId,
        createdAt: require('firebase-admin/firestore').FieldValue.serverTimestamp(),
      });
    }

    const credential = crypto.randomBytes(32).toString('base64url');
    const userId = db.transaction(() => {
      const result = db.prepare(`INSERT INTO users(email,password_hash,role,status,name,school_number,digital_id,email_verified,firebase_uid)
        VALUES(?,?,?,'approved',?,?,?,1,?)`).run(email, bcrypt.hashSync(password, 12), role, name,
          role === 'student' ? schoolNumber : null, digitalId, firebaseUser?.uid || null);
      const id = Number(result.lastInsertRowid);
      if (role === 'student') {
        db.prepare('INSERT INTO student_profiles(user_id,program,year_level) VALUES(?,?,?)').run(id, program, yearLevel || null);
      } else {
        db.prepare('INSERT INTO staff_profiles(user_id,employee_number,department) VALUES(?,?,?)').run(id, employeeNumber, department);
      }
      const credentialResult = db.prepare('INSERT INTO user_credentials(user_id,credential) VALUES(?,?)').run(id, credential);
      db.prepare(`INSERT INTO credential_events(user_id,credential_id,event_type,performed_by,reason) VALUES(?,?,?,?,?)`)
        .run(id, Number(credentialResult.lastInsertRowid), 'issued', req.user.sub, 'account created by administrator');
      audit(req.user.sub, 'ADMIN_ACCOUNT_CREATED', 'user', id, { role, firebaseLinked: Boolean(firebaseUser) }, req);
      return id;
    })();
    return res.status(201).json({
      message: firebaseUser
        ? 'Account created and linked to Firebase Authentication, Firestore, and the library database.'
        : 'Account created in the library database. Add Firebase Admin credentials to link Firebase Authentication and Firestore.',
      user: { id: userId, email, name, role, status: 'approved', digital_id: digitalId },
      firebase_linked: Boolean(firebaseUser),
    });
  } catch (error) {
    if (firebaseUser && firebaseAuth) {
      await firestore?.collection('users').doc(firebaseUser.uid).delete().catch(() => {});
      await firebaseAuth.deleteUser(firebaseUser.uid).catch(() => {});
    }
    if (error.code === 'auth/email-already-exists') return res.status(409).json({ error: 'This email already has a Firebase Authentication account.' });
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(409).json({ error: 'This email or school/staff ID is already in use.' });
    console.error('Administrator account creation failed:', error.message);
    return res.status(503).json({ error: 'The account could not be created. Check Firebase server credentials and try again.' });
  }
});

app.post('/api/admin/users/:id/status', auth(), authorize('administrator'), async (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (Number(user.id) === Number(req.user.sub) && req.body.status !== 'approved') {
    return res.status(400).json({ error: 'You cannot suspend or reject your own administrator account.' });
  }
  if (db.prepare('SELECT 1 FROM account_archives WHERE user_id=?').get(user.id)) {
    return res.status(409).json({ error: 'Restore this archived account before changing its status.' });
  }
  if (!['approved', 'suspended', 'rejected'].includes(req.body.status)) {
    return res.status(400).json({ error: 'Invalid account status' });
  }
  if (user.role === 'administrator' && user.status === 'approved' && req.body.status !== 'approved') {
    const otherAdmins = db.prepare(`SELECT COUNT(*) n FROM users u
      LEFT JOIN account_archives aa ON aa.user_id=u.id
      WHERE u.role='administrator' AND u.status='approved' AND u.id<>? AND aa.user_id IS NULL`).get(user.id).n;
    if (otherAdmins === 0) return res.status(409).json({ error: 'The last active administrator cannot be suspended.' });
  }
  if (!requireFirebaseAccountSync(res, user)) return;
  if (firebaseAccountSyncRequired) {
    try {
      await firebaseAuth.updateUser(user.firebase_uid, { disabled: req.body.status !== 'approved' });
      await firestore.collection('users').doc(user.firebase_uid).set({
        status: req.body.status,
        updatedAt: require('firebase-admin/firestore').FieldValue.serverTimestamp(),
      }, { merge: true });
    } catch (error) {
      console.error('Firebase account status sync failed:', error.message);
      return res.status(503).json({ error: 'The account status could not be synchronized to Firebase. No SQLite status change was made.' });
    }
  }
  db.transaction(() => {
    db.prepare('UPDATE users SET status=? WHERE id=?').run(req.body.status, user.id);
    db.prepare(`INSERT INTO standing_history(user_id,old_standing,new_standing,reason,changed_by) VALUES(?,?,?,?,?)`)
      .run(user.id, user.standing, user.standing, req.body.reason || `Account status changed to ${req.body.status}`, req.user.sub);
    audit(req.user.sub, 'USER_STATUS_CHANGED', 'user', user.id, { status: req.body.status }, req);
  })();
  res.json({ message: `Account status changed to ${req.body.status}` });
});

app.get('/api/admin/users', auth(), authorize('administrator','librarian'), (req, res) => {
  const showArchived = req.user.role === 'administrator' && req.query.archived === 'true';
  const conditions = [showArchived ? 'aa.user_id IS NOT NULL' : 'aa.user_id IS NULL'];
  const params = [];
  if (req.query.role) { conditions.push('u.role=?'); params.push(req.query.role); }
  res.json(db.prepare(`SELECT u.id,u.email,u.name,u.role,u.status,u.digital_id,u.standing,u.school_number,u.created_at,
    CASE WHEN aa.user_id IS NULL THEN 0 ELSE 1 END AS is_archived,
    CASE WHEN aa.deleted_at IS NULL THEN 0 ELSE 1 END AS is_deleted,
    aa.archived_at
    FROM users u LEFT JOIN account_archives aa ON aa.user_id=u.id
    WHERE ${conditions.join(' AND ')} ORDER BY u.created_at DESC`).all(...params));
});

app.post('/api/admin/users/:id/archive', auth(), authorize('administrator'), async (req, res) => {
  const id = Number(req.params.id);
  const user = db.prepare('SELECT * FROM users WHERE id=?').get(id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (id === Number(req.user.sub)) return res.status(400).json({ error: 'You cannot archive your own administrator account.' });
  if (db.prepare('SELECT 1 FROM account_archives WHERE user_id=?').get(id)) return res.status(409).json({ error: 'This account is already archived.' });
  if (user.role === 'administrator' && user.status === 'approved') {
    const otherAdmins = db.prepare(`SELECT COUNT(*) n FROM users u
      LEFT JOIN account_archives aa ON aa.user_id=u.id
      WHERE u.role='administrator' AND u.status='approved' AND u.id<>? AND aa.user_id IS NULL`).get(id).n;
    if (otherAdmins === 0) return res.status(409).json({ error: 'The last active administrator cannot be archived.' });
  }
  if (!requireFirebaseAccountSync(res, user)) return;
  if (firebaseAccountSyncRequired) {
    try {
      await firebaseAuth.updateUser(user.firebase_uid, { disabled: true });
      await firestore.collection('users').doc(user.firebase_uid).set({ status: 'suspended', updatedAt: require('firebase-admin/firestore').FieldValue.serverTimestamp() }, { merge: true });
    } catch (error) {
      console.error('Firebase archive sync failed:', error.message);
      return res.status(503).json({ error: 'The account could not be synchronized to Firebase. No SQLite archive was created.' });
    }
  }
  const reason = String(req.body.reason || 'Archived by administrator').trim().slice(0, 500);
  db.transaction(() => {
    db.prepare('INSERT INTO account_archives(user_id,previous_status,archived_by,reason) VALUES(?,?,?,?)')
      .run(id, user.status, req.user.sub, reason);
    db.prepare('INSERT INTO account_archive_events(user_id,action,previous_status,performed_by,reason) VALUES(?,?,?,?,?)')
      .run(id, 'archived', user.status, req.user.sub, reason);
    db.prepare("UPDATE users SET status='suspended' WHERE id=?").run(id);
    const credentials = db.prepare('SELECT id FROM user_credentials WHERE user_id=? AND active=1').all(id);
    db.prepare("UPDATE user_credentials SET active=0,revoked_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE user_id=? AND active=1").run(id);
    const event = db.prepare(`INSERT INTO credential_events(user_id,credential_id,event_type,performed_by,reason) VALUES(?,?,?,?,?)`);
    for (const credential of credentials) event.run(id, credential.id, 'revoked', req.user.sub, 'account archived');
    audit(req.user.sub, 'ACCOUNT_ARCHIVED', 'user', id, { reason }, req);
  })();
  if (!firebaseAccountSyncRequired && user.firebase_uid && firebaseAuth) void firebaseAuth.updateUser(user.firebase_uid, { disabled: true }).catch(error => console.error('Firebase archive sync failed:', error.message));
  if (!firebaseAccountSyncRequired && user.firebase_uid && firestore) void firestore.collection('users').doc(user.firebase_uid).set({ status: 'suspended', updatedAt: require('firebase-admin/firestore').FieldValue.serverTimestamp() }, { merge: true }).catch(error => console.error('Firestore archive sync failed:', error.message));
  res.json({ message: 'Account archived. Sign-in and QR access are disabled; library history is preserved.' });
});

app.post('/api/admin/users/:id/restore', auth(), authorize('administrator'), async (req, res) => {
  const id = Number(req.params.id);
  const archived = db.prepare('SELECT * FROM account_archives WHERE user_id=?').get(id);
  if (!archived) return res.status(404).json({ error: 'Archived account not found.' });
  if (archived.deleted_at) return res.status(409).json({ error: 'This account was deleted and cannot be restored.' });
  const user = db.prepare('SELECT * FROM users WHERE id=?').get(id);
  if (!user) return res.status(404).json({ error: 'Account not found.' });
  const reason = String(req.body.reason || 'Restored by administrator').trim().slice(0, 500);
  if (!requireFirebaseAccountSync(res, user)) return;
  if (firebaseAccountSyncRequired) {
    try {
      await firebaseAuth.updateUser(user.firebase_uid, { disabled: archived.previous_status !== 'approved' });
      await firestore.collection('users').doc(user.firebase_uid).set({ status: archived.previous_status, updatedAt: require('firebase-admin/firestore').FieldValue.serverTimestamp() }, { merge: true });
    } catch (error) {
      console.error('Firebase restore sync failed:', error.message);
      return res.status(503).json({ error: 'The account could not be restored in Firebase. No SQLite restore was applied.' });
    }
  }
  db.transaction(() => {
    db.prepare('DELETE FROM account_archives WHERE user_id=?').run(id);
    db.prepare('UPDATE users SET status=? WHERE id=?').run(archived.previous_status, id);
    db.prepare('INSERT INTO account_archive_events(user_id,action,previous_status,performed_by,reason) VALUES(?,?,?,?,?)')
      .run(id, 'restored', archived.previous_status, req.user.sub, reason);
    if (archived.previous_status === 'approved') {
      const credential = crypto.randomBytes(32).toString('base64url');
      const result = db.prepare("INSERT INTO user_credentials(user_id,credential,type) VALUES(?,?,'personal')").run(id, credential);
      db.prepare("INSERT INTO credential_events(user_id,credential_id,event_type,performed_by,reason) VALUES(?,?,?,?,?)")
        .run(id, result.lastInsertRowid, 'issued', req.user.sub, 'fresh credential issued when account restored');
    }
    audit(req.user.sub, 'ACCOUNT_RESTORED', 'user', id, { reason }, req);
  })();
  if (!firebaseAccountSyncRequired && user.firebase_uid && firebaseAuth) void firebaseAuth.updateUser(user.firebase_uid, { disabled: archived.previous_status !== 'approved' }).catch(error => console.error('Firebase restore sync failed:', error.message));
  if (!firebaseAccountSyncRequired && user.firebase_uid && firestore) void firestore.collection('users').doc(user.firebase_uid).set({ status: archived.previous_status, updatedAt: require('firebase-admin/firestore').FieldValue.serverTimestamp() }, { merge: true }).catch(error => console.error('Firestore restore sync failed:', error.message));
  res.json({ message: 'Account restored. A fresh QR credential was issued where applicable.' });
});

app.delete('/api/admin/users/:id', auth(), authorize('administrator'), async (req, res) => {
  const id = Number(req.params.id);
  if (id === Number(req.user.sub)) return res.status(400).json({ error: 'You cannot delete your own administrator account.' });
  const user = db.prepare('SELECT * FROM users WHERE id=?').get(id);
  const archived = db.prepare('SELECT * FROM account_archives WHERE user_id=?').get(id);
  if (!user || !archived) return res.status(409).json({ error: 'Archive the account before deleting it.' });
  if (!requireFirebaseAccountSync(res, user)) return;
  if (archived.deleted_at) return res.status(409).json({ error: 'This account has already been deleted.' });
  const reason = String(req.body?.reason || 'Deleted by administrator').trim().slice(0, 500);
  const tombstoneEmail = `deleted-account-${id}@deleted.invalid`;
  if (user.firebase_uid && firebaseAuth) {
    try {
      await Promise.all([
        firestore?.collection('users').doc(user.firebase_uid).delete(),
        firebaseAuth.deleteUser(user.firebase_uid).catch(error => {
          if (error.code !== 'auth/user-not-found') throw error;
        }),
      ]);
    } catch (error) {
      console.error('Firebase account deletion failed:', error.message);
      return res.status(503).json({ error: 'Firebase account cleanup failed, so the library record was not deleted. Check Firebase Admin credentials and retry.' });
    }
  }
  db.transaction(() => {
    const oldCredentials = db.prepare('SELECT id,credential FROM user_credentials WHERE user_id=?').all(id);
    const clearLogCredential = db.prepare('UPDATE access_logs SET credential=NULL WHERE credential=?');
    for (const item of oldCredentials) clearLogCredential.run(item.credential);
    db.prepare(`UPDATE users SET email=?,password_hash=?,name='Deleted ACLC account',school_number=NULL,digital_id=NULL,
      email_verified=0,status='suspended',firebase_uid=NULL WHERE id=?`)
      .run(tombstoneEmail, bcrypt.hashSync(crypto.randomBytes(32).toString('hex'), 12), id);
    db.prepare('UPDATE student_profiles SET program=NULL,year_level=NULL WHERE user_id=?').run(id);
    db.prepare('UPDATE staff_profiles SET employee_number=NULL,department=NULL WHERE user_id=?').run(id);
    const anonymizeCredential = db.prepare("UPDATE user_credentials SET credential=?,active=0,revoked_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?");
    for (const item of oldCredentials) anonymizeCredential.run(`revoked-${crypto.randomBytes(24).toString('hex')}`, item.id);
    db.prepare("UPDATE account_archives SET deleted_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),deleted_by=? WHERE user_id=?")
      .run(req.user.sub, id);
    db.prepare('INSERT INTO account_archive_events(user_id,action,previous_status,performed_by,reason) VALUES(?,?,?,?,?)')
      .run(id, 'deleted', archived.previous_status, req.user.sub, reason);
    audit(req.user.sub, 'ACCOUNT_PERSONAL_DATA_DELETED', 'user', id, { reason, historyPreserved: true }, req);
  })();
  res.json({ message: 'Account personal data deleted. Library and audit history remains preserved.' });
});

app.get('/api/users/:id/history', auth(), authorize('administrator','librarian'), (req, res) => {
  const id = Number(req.params.id);
  const user = db.prepare('SELECT id,name,email,role,digital_id,standing,status FROM users WHERE id=?').get(id);
  if (!user) return res.status(404).json({ error: 'Account not found.' });
  res.json({
    user,
    statistics: {
      physicalBooksBorrowed: db.prepare(`SELECT COUNT(*) n FROM loan_items li JOIN loans l ON l.id=li.loan_id WHERE l.user_id=?`).get(id).n,
      transactions: db.prepare('SELECT COUNT(*) n FROM loans WHERE user_id=?').get(id).n,
      currentlyBorrowed: db.prepare(`SELECT COUNT(*) n FROM loan_items li JOIN loans l ON l.id=li.loan_id WHERE l.user_id=? AND li.status='borrowed'`).get(id).n,
      returned: db.prepare(`SELECT COUNT(*) n FROM loan_items li JOIN loans l ON l.id=li.loan_id WHERE l.user_id=? AND li.status='returned'`).get(id).n,
      overdue: db.prepare(`SELECT COUNT(*) n FROM loans WHERE user_id=? AND status='overdue'`).get(id).n,
      reservations: db.prepare('SELECT COUNT(*) n FROM reservations WHERE user_id=?').get(id).n,
      renewals: db.prepare('SELECT COALESCE(SUM(renewals),0) n FROM loans WHERE user_id=?').get(id).n,
      penalties: db.prepare('SELECT COUNT(*) n FROM penalties WHERE user_id=?').get(id).n
    },
    records: db.prepare('SELECT * FROM user_records WHERE user_id=? ORDER BY created_at DESC').all(id),
    loans: db.prepare(`SELECT l.id AS loan_id,li.id AS loan_item_id,b.title,b.author,c.copy_code,
      li.status AS item_status,l.status AS loan_status,l.created_at AS borrowed_at,l.due_at,
      li.returned_at
      FROM loans l JOIN loan_items li ON li.loan_id=l.id
      JOIN book_copies c ON c.id=li.copy_id JOIN books b ON b.id=c.book_id
      WHERE l.user_id=? ORDER BY l.created_at DESC,li.id DESC`).all(id)
  });
});

app.get('/api/my/history', auth(), (req, res) => {
  res.json({ standing: req.userRecord.standing, records: db.prepare('SELECT * FROM user_records WHERE user_id=? ORDER BY created_at DESC').all(req.user.sub) });
});

app.get('/api/credentials/qr', auth(), async (req, res) => {
  const credential = db.prepare('SELECT credential,active,expires_at FROM user_credentials WHERE user_id=? ORDER BY id DESC LIMIT 1').get(req.user.sub);
  if (!credential?.active || (credential.expires_at && credential.expires_at <= new Date().toISOString())) return res.status(404).json({ error: 'No active credential' });
  const qr = await QRCode.toDataURL(JSON.stringify({ credential: credential.credential, type: 'personal' }));
  res.json({ qrDataUrl: qr, credential: credential.credential, digitalId: req.userRecord.digital_id });
});

app.post('/api/credentials/disable-replace', auth(), (req, res) => {
  if (req.userRecord.replacement_count >= 1) return res.status(409).json({ error: 'Self-service replacement already used. Administrator exception required.' });
  db.transaction(() => {
    db.prepare('UPDATE user_credentials SET active=0,revoked_at=? WHERE user_id=? AND active=1').run(new Date().toISOString(), req.user.sub);
    db.prepare(`INSERT INTO credential_events(user_id,event_type,performed_by,reason) VALUES(?,?,?,?)`).run(req.user.sub, 'disabled', req.user.sub, 'lost credential replacement');
    const credential = crypto.randomBytes(32).toString('base64url');
    const result = db.prepare(`INSERT INTO user_credentials(user_id,credential) VALUES(?,?)`).run(req.user.sub, credential);
    db.prepare(`INSERT INTO credential_events(user_id,credential_id,event_type,performed_by,reason) VALUES(?,?,?,?,?)`)
      .run(req.user.sub, result.lastInsertRowid, 'replaced', req.user.sub, 'one-time self-service replacement');
    db.prepare('UPDATE users SET replacement_count=1 WHERE id=?').run(req.user.sub);
    audit(req.user.sub, 'QR_REPLACED', 'credential', result.lastInsertRowid, null, req);
    notification(req.user.sub, 'QR_REPLACEMENT', 'QR credential replaced', 'Your previous QR credential was revoked and replacement activated.');
  })();
  res.json({ message: 'Lost credential revoked; one replacement issued' });
});

app.post('/api/admin/credentials/:id/exception-replace', auth(), authorize('administrator'), (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id);
  if (!user || !req.body.reason) return res.status(400).json({ error: 'User and identity verification reason are required' });
  db.transaction(() => {
    db.prepare('UPDATE user_credentials SET active=0,revoked_at=? WHERE user_id=? AND active=1').run(new Date().toISOString(), user.id);
    const credential = crypto.randomBytes(32).toString('base64url');
    const result = db.prepare('INSERT INTO user_credentials(user_id,credential) VALUES(?,?)').run(user.id, credential);
    db.prepare(`INSERT INTO credential_events(user_id,credential_id,event_type,performed_by,reason) VALUES(?,?,?,?,?)`)
      .run(user.id, result.lastInsertRowid, 'administrator_exception', req.user.sub, req.body.reason);
    audit(req.user.sub, 'ADMIN_QR_EXCEPTION', 'user', user.id, { reason: req.body.reason }, req);
    notification(user.id, 'QR_REPLACEMENT', 'Administrator issued QR recovery', 'Your QR credential was recovered by an administrator.');
  })();
  res.json({ message: 'Administrator credential replacement issued' });
});

app.get('/api/books', auth(false), (req, res) => {
  const search = `%${req.query.search || ''}%`;
  res.json(db.prepare('SELECT * FROM books WHERE title LIKE ? OR author LIKE ? OR isbn LIKE ? ORDER BY title').all(search, search, search));
});

app.post('/api/books', auth(), authorize('librarian','administrator'), (req, res) => {
  const { title, author, isbn, category, cover_url, copies = 1 } = req.body;
  if (!title || !author) return res.status(400).json({ error: 'title and author are required' });
  let coverUrl = null;
  if (cover_url) {
    try {
      const parsedCoverUrl = new URL(String(cover_url).trim());
      if (parsedCoverUrl.protocol !== 'https:' || !parsedCoverUrl.hostname.includes('.')) throw new Error('invalid cover URL');
      coverUrl = parsedCoverUrl.toString();
    } catch (_) {
      return res.status(400).json({ error: 'Cover image must use a valid HTTPS URL.' });
    }
  }
  const count = Math.max(1, Number(copies));
  const result = db.transaction(() => {
    const inserted = db.prepare(`INSERT INTO books(title,author,isbn,category,total_copies,available_copies,cover_url) VALUES(?,?,?,?,?,?,?)`)
      .run(title, author, isbn || null, category || null, count, count, coverUrl);
    const copy = db.prepare('INSERT INTO book_copies(book_id,copy_code,condition,status) VALUES(?,?,?,?)');
    for (let i = 1; i <= count; i++) copy.run(inserted.lastInsertRowid, `${String(inserted.lastInsertRowid).padStart(4,'0')}-${String(i).padStart(3,'0')}`, 'good', 'available');
    return inserted.lastInsertRowid;
  })();
  audit(req.user.sub, 'BOOK_CREATED', 'book', result, { copies: count }, req);
  res.status(201).json({ id: result });
});

app.post('/api/reservations', auth(), authorize('student','teacher'), (req, res) => {
  const book = db.prepare('SELECT id,available_copies FROM books WHERE id=?').get(req.body.book_id);
  if (!book) return res.status(404).json({ error: 'Book not found' });
  const active = db.prepare(`SELECT COUNT(*) n FROM reservations WHERE user_id=? AND book_id=? AND status IN('pending','ready','approved')`).get(req.user.sub, book.id).n;
  if (active) return res.status(409).json({ error: 'You already have an active reservation for this book' });
  const result = db.prepare(`INSERT INTO reservations(user_id,book_id,status) VALUES(?,?,'pending')`).run(req.user.sub, book.id);
  res.status(201).json({ id: result.lastInsertRowid });
});
app.get('/api/copies/available', auth(), authorize('librarian','administrator'), (_req,res)=>res.json(db.prepare("SELECT c.id,c.copy_code,c.condition,b.id AS book_id,b.title,b.author FROM book_copies c JOIN books b ON b.id=c.book_id WHERE c.status='available' ORDER BY b.title,c.copy_code").all()));

// Operational queues and history are queried from SQLite and exposed by role.
app.get('/api/reservations', auth(), authorize('student','teacher','librarian','administrator'), (req, res) => {
  const mine = ['student','teacher'].includes(req.user.role);
  res.json(db.prepare(`SELECT r.*,b.title,b.author,u.name AS borrower_name,u.role AS borrower_role
    FROM reservations r JOIN books b ON b.id=r.book_id JOIN users u ON u.id=r.user_id
    ${mine ? 'WHERE r.user_id=?' : ''} ORDER BY r.created_at DESC LIMIT 300`).all(...(mine ? [req.user.sub] : [])));
});
app.post('/api/reservations/:id/status', auth(), authorize('librarian','administrator'), (req,res)=>{
  if(!['ready','approved','cancelled','expired'].includes(req.body.status)) return res.status(400).json({error:'Invalid reservation status'});
  const row=db.prepare('SELECT * FROM reservations WHERE id=?').get(req.params.id);
  if(!row) return res.status(404).json({error:'Reservation not found'});
  db.prepare('UPDATE reservations SET status=? WHERE id=?').run(req.body.status,row.id);
  audit(req.user.sub,'RESERVATION_STATUS_CHANGED','reservation',row.id,{status:req.body.status},req);
  notification(row.user_id,'RESERVATION_UPDATE','Reservation updated',`Your reservation status is ${req.body.status}.`,`reservation-${row.id}-${req.body.status}`);
  res.json({message:'Reservation updated'});
});
app.post('/api/reservations/:id/cancel', auth(), authorize('student','teacher'), (req,res)=>{
  const row=db.prepare("SELECT * FROM reservations WHERE id=? AND user_id=? AND status IN('pending','ready')").get(req.params.id,req.user.sub);
  if(!row) return res.status(404).json({error:'Cancelable reservation not found'});
  db.prepare("UPDATE reservations SET status='cancelled' WHERE id=?").run(row.id);
  audit(req.user.sub,'RESERVATION_CANCELLED','reservation',row.id,null,req);res.json({message:'Reservation cancelled'});
});
app.get('/api/loans', auth(), authorize('student','teacher','librarian','administrator'), (req,res)=>{
  const mine=['student','teacher'].includes(req.user.role);
  if (mine) {
    const missing = db.prepare(`SELECT li.id FROM loan_items li JOIN loans l ON l.id=li.loan_id
      LEFT JOIN loan_verification_tokens t ON t.loan_item_id=li.id
      WHERE l.user_id=? AND li.status='borrowed' AND t.loan_item_id IS NULL`).all(req.user.sub);
    const insertToken = db.prepare('INSERT OR IGNORE INTO loan_verification_tokens(loan_item_id,token) VALUES(?,?)');
    for (const item of missing) insertToken.run(item.id, crypto.randomBytes(32).toString('base64url'));
  }
  res.json(db.prepare(`SELECT l.*,u.name AS borrower_name,u.digital_id,li.id AS loan_item_id,li.status AS item_status,c.copy_code,c.condition AS copy_condition,b.title,b.author,
      ${mine ? 't.token AS loan_verification_token' : 'NULL AS loan_verification_token'}
    FROM loans l JOIN users u ON u.id=l.user_id JOIN loan_items li ON li.loan_id=l.id JOIN book_copies c ON c.id=li.copy_id JOIN books b ON b.id=c.book_id
    ${mine ? 'LEFT JOIN loan_verification_tokens t ON t.loan_item_id=li.id' : ''}
    ${mine?'WHERE l.user_id=?':''} ORDER BY l.created_at DESC LIMIT 500`).all(...(mine?[req.user.sub]:[])));
});
app.get('/api/loans/active', auth(), authorize('librarian','administrator'), (_req,res)=>res.json(db.prepare("SELECT li.id AS loan_item_id,l.id AS loan_id,l.user_id,u.name,u.role,u.digital_id,l.due_at,c.id AS copy_id,c.copy_code,b.title FROM loan_items li JOIN loans l ON l.id=li.loan_id JOIN users u ON u.id=l.user_id JOIN book_copies c ON c.id=li.copy_id JOIN books b ON b.id=c.book_id WHERE li.status='borrowed' ORDER BY l.due_at").all()));
app.get('/api/damage-reports', auth(), authorize('administrator','librarian'), (_req,res)=>res.json(db.prepare('SELECT d.*,u.name AS borrower_name,b.title,c.copy_code FROM damage_reports d JOIN users u ON u.id=d.user_id JOIN book_copies c ON c.id=d.copy_id JOIN books b ON b.id=c.book_id ORDER BY d.created_at DESC').all()));
app.post('/api/damage-reports', auth(), authorize('administrator','librarian'), (req,res)=>{
  const {user_id,copy_id,description,evidence}=req.body;
  if(!user_id||!copy_id||!String(description||'').trim())return res.status(400).json({error:'Borrower, copy, and description are required'});
  const result=db.prepare('INSERT INTO damage_reports(user_id,copy_id,reported_by,description,evidence) VALUES(?,?,?,?,?)').run(user_id,copy_id,req.user.sub,String(description).trim(),evidence||null);
  audit(req.user.sub,'DAMAGE_REPORTED','damage_report',result.lastInsertRowid,null,req);res.status(201).json({id:result.lastInsertRowid});
});
app.post('/api/damage-reports/:id/review', auth(), authorize('administrator'), (req,res)=>{
  if(!['confirmed','disputed','resolved'].includes(req.body.status))return res.status(400).json({error:'Invalid damage status'});
  const report=db.prepare('SELECT * FROM damage_reports WHERE id=?').get(req.params.id);if(!report)return res.status(404).json({error:'Damage report not found'});
  db.prepare('UPDATE damage_reports SET status=? WHERE id=?').run(req.body.status,report.id);
  if(req.body.penalty_amount>0&&req.body.penalty_reason){const p=db.prepare('INSERT INTO penalties(user_id,amount,reason,source_type,source_id) VALUES(?,?,?,?,?)').run(report.user_id,Number(req.body.penalty_amount),String(req.body.penalty_reason),'damage_report',report.id);audit(req.user.sub,'PENALTY_RECOMMENDED','penalty',p.lastInsertRowid,{amount:Number(req.body.penalty_amount)},req);}
  audit(req.user.sub,'DAMAGE_REVIEWED','damage_report',report.id,{status:req.body.status},req);res.json({message:'Damage assessment reviewed'});
});
app.get('/api/penalties', auth(), authorize('student','teacher','administrator'), (req,res)=>{const mine=['student','teacher'].includes(req.user.role);res.json(db.prepare(`SELECT * FROM penalties ${mine?'WHERE user_id=?':''} ORDER BY created_at DESC`).all(...(mine?[req.user.sub]:[])));});
app.post('/api/penalties/:id/status', auth(), authorize('administrator'), (req,res)=>{if(!['approved','waived','paid','disputed'].includes(req.body.status))return res.status(400).json({error:'Invalid penalty status'});const p=db.prepare('SELECT * FROM penalties WHERE id=?').get(req.params.id);if(!p)return res.status(404).json({error:'Penalty not found'});db.prepare('UPDATE penalties SET status=? WHERE id=?').run(req.body.status,p.id);audit(req.user.sub,'PENALTY_STATUS_CHANGED','penalty',p.id,{status:req.body.status},req);res.json({message:'Penalty updated'});});
app.get('/api/access/logs', auth(), authorize('administrator'), (_req,res)=>res.json(db.prepare('SELECT a.*,u.name,u.role,u.school_number FROM access_logs a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.created_at DESC LIMIT 1000').all()));
app.get('/api/audit', auth(), authorize('administrator'), (_req,res)=>res.json(db.prepare('SELECT a.*,u.name AS actor_name FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_id ORDER BY a.created_at DESC LIMIT 1000').all()));
app.get('/api/admin/reports/summary', auth(), authorize('administrator'), (_req,res)=>res.json({users:db.prepare('SELECT role,status,COUNT(*) AS count FROM users GROUP BY role,status').all(),inventory:db.prepare('SELECT COUNT(*) AS titles,COALESCE(SUM(total_copies),0) AS copies,COALESCE(SUM(available_copies),0) AS available FROM books').get(),loansByMonth:db.prepare("SELECT strftime('%Y-%m',created_at) AS month,COUNT(*) AS count FROM loans GROUP BY month ORDER BY month DESC LIMIT 12").all(),popularBooks:db.prepare('SELECT b.title,COUNT(*) AS borrow_count FROM loan_items li JOIN book_copies c ON c.id=li.copy_id JOIN books b ON b.id=c.book_id GROUP BY b.id ORDER BY borrow_count DESC LIMIT 10').all()}));
app.get('/api/admin/semesters', auth(), authorize('administrator'), (_req,res)=>res.json(db.prepare('SELECT * FROM academic_terms ORDER BY starts_at DESC').all()));
app.post('/api/admin/semesters', auth(), authorize('administrator'), (req,res)=>{
  const {academic_year,term,starts_at,ends_at}=req.body;
  if(!academic_year||!['first','second','summer'].includes(term)||!starts_at||!ends_at||Date.parse(ends_at)<=Date.parse(starts_at))return res.status(400).json({error:'Valid academic year, term, start date, and end date are required'});
  try{const result=db.prepare('INSERT INTO academic_terms(academic_year,term,starts_at,ends_at,created_by) VALUES(?,?,?,?,?)').run(String(academic_year),term,new Date(starts_at).toISOString(),new Date(ends_at).toISOString(),req.user.sub);audit(req.user.sub,'ACADEMIC_TERM_CREATED','academic_term',result.lastInsertRowid,null,req);res.status(201).json({id:result.lastInsertRowid});}catch(e){if(String(e.message).includes('UNIQUE'))return res.status(409).json({error:'That academic term already exists'});throw e;}
});
app.post('/api/admin/semesters/:id/activate', auth(), authorize('administrator'), (req,res)=>{
  const term=db.prepare('SELECT * FROM academic_terms WHERE id=?').get(req.params.id);if(!term)return res.status(404).json({error:'Academic term not found'});
  db.transaction(()=>{db.prepare('UPDATE academic_terms SET active=0').run();db.prepare('UPDATE academic_terms SET active=1 WHERE id=?').run(term.id);db.prepare("INSERT INTO system_settings(key,value,updated_at) VALUES('active_academic_term',?,strftime('%Y-%m-%dT%H:%M:%fZ','now')) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at").run(String(term.id));audit(req.user.sub,'ACADEMIC_TERM_ACTIVATED','academic_term',term.id,null,req);})();res.json({message:'Academic term activated'});
});
app.post('/api/admin/semesters/:id/renew-credentials', auth(), authorize('administrator'), (req,res)=>{
  const term=db.prepare('SELECT * FROM academic_terms WHERE id=? AND active=1').get(req.params.id);if(!term)return res.status(404).json({error:'Active academic term not found'});
  const members=db.prepare("SELECT id FROM users WHERE status='approved' AND role IN('student','teacher')").all();
  const renew=db.transaction(()=>{for(const member of members){db.prepare('UPDATE user_credentials SET active=0,revoked_at=? WHERE user_id=? AND active=1').run(new Date().toISOString(),member.id);const credential=crypto.randomBytes(32).toString('base64url');const result=db.prepare('INSERT INTO user_credentials(user_id,credential,type,expires_at) VALUES(?,?,?,?)').run(member.id,credential,'semester',term.ends_at);db.prepare('INSERT INTO credential_events(user_id,credential_id,event_type,performed_by,reason) VALUES(?,?,?,?,?)').run(member.id,result.lastInsertRowid,'semester_renewal',req.user.sub,`renewed for ${term.academic_year} ${term.term}`);notification(member.id,'QR_RENEWAL','Library QR renewed',`Your QR credential is renewed for ${term.academic_year} ${term.term}.`,`term-${term.id}-user-${member.id}`);}audit(req.user.sub,'SEMESTER_CREDENTIALS_RENEWED','academic_term',term.id,{users:members.length},req);});renew();res.json({message:'Semester credentials renewed',renewed:members.length});
});

app.post('/api/loans/checkout', auth(), authorize('librarian','administrator'), (req, res) => {
  const { user_id, copy_ids: requestedCopyIds } = req.body;
  const rawCopyIds = Array.isArray(requestedCopyIds) ? requestedCopyIds : [];
  const copy_ids = [...new Set(rawCopyIds.map(Number))];
  const user = db.prepare('SELECT * FROM users WHERE id=? AND status=?').get(user_id, 'approved');
  if (!user || !copy_ids.length || copy_ids.some(id => !Number.isInteger(id) || id < 1)) return res.status(400).json({ error: 'Approved user and book copies are required' });
  if (copy_ids.length !== rawCopyIds.length) return res.status(400).json({ error: 'Select each book copy only once.' });
  const configuredLimit = Number(user.role === 'student' ? setting('student_borrow_limit') : setting('teacher_borrow_limit'));
  const limit = user.role === 'student' ? 3 : configuredLimit;
  if (!Number.isFinite(limit) || limit < 1) return res.status(503).json({ error: 'The borrowing limit is not configured. Contact the administrator.' });
  const active = db.prepare(`SELECT COUNT(*) n FROM loan_items li JOIN loans l ON l.id=li.loan_id WHERE l.user_id=? AND li.status='borrowed'`).get(user_id).n;
  if (active + copy_ids.length > limit) return res.status(409).json({ error: `${user.role} borrowing limit is ${limit}` });

  const id = db.transaction(() => {
    for (const copyId of copy_ids) {
      const copy = db.prepare('SELECT * FROM book_copies WHERE id=? AND status=?').get(copyId, 'available');
      if (!copy) throw new Error(`Copy ${copyId} is not available`);
    }
    const due = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
    const loan = db.prepare(`INSERT INTO loans(user_id,status,checkout_staff_id,due_at) VALUES(?, 'active', ?, ?)`)
      .run(user_id, req.user.sub, due);
    const insertVerificationToken = db.prepare('INSERT INTO loan_verification_tokens(loan_item_id,token) VALUES(?,?)');
    for (const copyId of copy_ids) {
      const item = db.prepare(`INSERT INTO loan_items(loan_id,copy_id,status) VALUES(?,?,'borrowed')`).run(loan.lastInsertRowid, copyId);
      insertVerificationToken.run(item.lastInsertRowid, crypto.randomBytes(32).toString('base64url'));
      db.prepare(`UPDATE book_copies SET status='borrowed' WHERE id=?`).run(copyId);
      db.prepare(`UPDATE books SET available_copies=MAX(0,available_copies-1) WHERE id=(SELECT book_id FROM book_copies WHERE id=? )`).run(copyId);
    }
    return loan.lastInsertRowid;
  })();
  notification(user_id, 'BORROWING_APPROVED', 'Borrowing approved', 'Your checked-out books are now active.', `loan-${id}`);
  audit(req.user.sub, 'LOAN_CHECKOUT', 'loan', id, { user_id, copy_ids }, req);
  res.status(201).json({ loan_id: id });
});

app.post('/api/loans/verify-qr', auth(), authorize('librarian','administrator'), (req, res) => {
  const token = String(req.body.token || '').trim();
  if (!token) return res.status(400).json({ error: 'A borrowing QR code is required.' });
  const item = db.prepare(`SELECT li.id AS loan_item_id,li.status AS item_status,l.id AS loan_id,l.status AS loan_status,l.due_at,
      u.id AS user_id,u.name AS borrower_name,u.email,u.role,u.school_number,u.digital_id,
      b.title,b.author,c.copy_code
    FROM loan_verification_tokens t
    JOIN loan_items li ON li.id=t.loan_item_id
    JOIN loans l ON l.id=li.loan_id
    JOIN users u ON u.id=l.user_id
    JOIN book_copies c ON c.id=li.copy_id
    JOIN books b ON b.id=c.book_id
    WHERE t.token=? AND li.status='borrowed' AND u.status='approved'`).get(token);
  if (!item) return res.status(404).json({ error: 'This borrowing QR is invalid, returned, or no longer active.' });
  res.json({ valid: true, loan: item });
});

app.post('/api/loans/return', auth(), authorize('librarian','administrator'), (req, res) => {
  const { loan_item_id, condition = 'good' } = req.body;
  const item = db.prepare('SELECT li.*,l.user_id,c.book_id,c.copy_code FROM loan_items li JOIN loans l ON l.id=li.loan_id JOIN book_copies c ON c.id=li.copy_id WHERE li.id=? AND li.status=?')
    .get(loan_item_id, 'borrowed');
  if (!item) return res.status(404).json({ error: 'Active loan item not found' });
  db.transaction(() => {
    db.prepare(`UPDATE loan_items SET status='returned',returned_at=? WHERE id=?`).run(new Date().toISOString(), item.id);
    db.prepare(`UPDATE book_copies SET status='available',condition=? WHERE id=(SELECT copy_id FROM loan_items WHERE id=? )`).run(condition, item.id);
    db.prepare(`UPDATE books SET available_copies=available_copies+1 WHERE id=?`).run(item.book_id);
    db.prepare(`INSERT INTO condition_inspections(loan_item_id,copy_id,staff_id,condition,notes) VALUES(?,?,?,?,?)`)
      .run(item.id, item.copy_id, req.user.sub, condition, req.body.notes || null);
    if(condition!=='good'){
      const description=String(req.body.notes||`Return inspection: ${condition}`).slice(0,1000);
      db.prepare('INSERT INTO damage_reports(user_id,copy_id,reported_by,description) VALUES(?,?,?,?)').run(item.user_id,item.copy_id,req.user.sub,description);
      audit(req.user.sub,'RETURN_DAMAGE_REPORTED','loan_item',item.id,{condition},req);
    }
    const remaining = db.prepare(`SELECT COUNT(*) n FROM loan_items WHERE loan_id=? AND status='borrowed'`).get(item.loan_id).n;
    if (remaining === 0) db.prepare(`UPDATE loans SET status='returned',returned_at=? WHERE id=?`).run(new Date().toISOString(), item.loan_id);
    notification(item.user_id, 'BOOK_RETURNED', 'Book return confirmed', 'A library return was recorded.');
  })();
  audit(req.user.sub, 'LOAN_RETURNED', 'loan_item', item.id, { condition }, req);
  res.json({ message: 'Return recorded' });
});

app.post('/api/gates/authorize', auth(), authorize('administrator','librarian'), (req, res) => {
  const { credential, gate_id } = req.body;
  if (!['GATE-ENTRY','GATE-EXIT'].includes(gate_id)) return res.status(400).json({ error: 'Unknown gate' });
  const gate = db.prepare('SELECT * FROM gates WHERE gate_id=?').get(gate_id);
  if (gate.maintenance || gate.status === 'offline') {
    db.prepare(`INSERT INTO access_logs(gate_id,event_type,credential,authorized,reason) VALUES(?,?,?,?,?)`).run(gate_id,'authorization_denied',credential,0,'gate unavailable');
    return res.status(503).json({ authorized: false, reason: 'Gate unavailable' });
  }
  const credentialRecord = db.prepare('SELECT * FROM user_credentials WHERE credential=? AND active=1 AND (expires_at IS NULL OR expires_at>?)').get(credential,new Date().toISOString());
  const user = credentialRecord ? db.prepare('SELECT * FROM users WHERE id=? AND status=?').get(credentialRecord.user_id,'approved') : null;
  if (!user) {
    db.prepare(`INSERT INTO access_logs(gate_id,event_type,credential,authorized,reason) VALUES(?,?,?,?,?)`).run(gate_id,'authorization_denied',credential,0,'invalid or revoked credential');
    return res.status(401).json({ authorized: false, reason: 'Invalid or revoked credential' });
  }
  const nonce = crypto.randomBytes(24).toString('base64url');
  db.prepare(`INSERT INTO gate_authorizations(user_id,gate_id,nonce,expires_at) VALUES(?,?,?,?)`)
    .run(user.id, gate_id, nonce, new Date(Date.now() + 15 * 1000).toISOString());
  db.prepare(`INSERT INTO access_logs(user_id,gate_id,event_type,credential,authorized,reason) VALUES(?,?,?,?,?,?)`)
    .run(user.id, gate_id,'authorization_granted',credential,1,'valid credential');
  res.json({ authorized: true, nonce, expiresInSeconds: 15, gateId: gate_id });
});

function requireGateDevice(req, res, next) {
  const configuredToken = process.env.GATE_DEVICE_TOKEN;
  if (!configuredToken) return res.status(503).json({ accepted: false, error: 'Gate device authentication is not configured.' });
  const suppliedToken = req.get('X-Gate-Token') || '';
  const configured = Buffer.from(configuredToken);
  const supplied = Buffer.from(suppliedToken);
  if (configured.length !== supplied.length || !crypto.timingSafeEqual(configured, supplied)) {
    return res.status(401).json({ accepted: false, error: 'Gate device authentication failed.' });
  }
  return next();
}

app.post('/api/gates/passage', requireGateDevice, (req, res) => {
  const { nonce, gate_id } = req.body;
  if (req.body.sensor_confirmed !== true || req.body.movement_complete !== true) {
    return res.status(400).json({ accepted: false, error: 'Confirm sensor passage and completed movement before recording a gate event.' });
  }
  const authorization = db.prepare(`SELECT * FROM gate_authorizations WHERE nonce=? AND gate_id=? AND used=0 AND expires_at>?`)
    .get(nonce, gate_id, new Date().toISOString());
  if (!authorization) return res.status(401).json({ accepted: false, error: 'Invalid, expired, or reused authorization' });
  db.transaction(() => {
    db.prepare('UPDATE gate_authorizations SET used=1 WHERE id=?').run(authorization.id);
    db.prepare(`INSERT INTO passage_events(user_id,gate_id,event_type,sensor_confirmed) VALUES(?,?,?,1)`)
      .run(authorization.user_id, gate_id, gate_id === 'GATE-ENTRY' ? 'entry' : 'exit');
    db.prepare(`UPDATE gates SET status='online',last_event_at=?,updated_at=? WHERE gate_id=?`)
      .run(new Date().toISOString(), new Date().toISOString(), gate_id);
    notification(authorization.user_id,
      gate_id === 'GATE-ENTRY' ? 'ENTRY' : 'EXIT',
      gate_id === 'GATE-ENTRY' ? 'Library entry recorded' : 'Library exit recorded',
      gate_id === 'GATE-ENTRY' ? 'ACLC Library: Your library entry was recorded.' : 'ACLC Library: Your library exit was recorded.',
      `${nonce}-passage`);
  })();
  res.json({ accepted: true });
});

app.post('/api/gates/:id/status', auth(), authorize('administrator','librarian'), (req, res) => {
  const gate = db.prepare('SELECT * FROM gates WHERE gate_id=?').get(req.params.id);
  if (!gate) return res.status(404).json({ error: 'Gate not found' });
  db.prepare(`UPDATE gates SET status=?,maintenance=?,last_event_at=?,updated_at=? WHERE gate_id=?`)
    .run(req.body.status || gate.status, req.body.maintenance ? 1 : 0, new Date().toISOString(), new Date().toISOString(), gate.gate_id);
  res.json({ message: 'Gate status updated' });
});

app.get('/api/gates/status', auth(), authorize('administrator','librarian'), (_req, res) => {
  res.json(db.prepare('SELECT * FROM gates ORDER BY gate_id').all());
});

app.get('/api/dashboard/admin', auth(), authorize('administrator'), (_req, res) => {
  const count = (sql) => db.prepare(sql).get().n;
  res.json({
    totalUsers: count('SELECT COUNT(*) n FROM users'),
    pendingRegistrations: count("SELECT COUNT(*) n FROM users WHERE status='pending_approval'"),
    activeStudents: count("SELECT COUNT(*) n FROM users WHERE role='student' AND status='approved'"),
    activeTeachers: count("SELECT COUNT(*) n FROM users WHERE role='teacher' AND status='approved'"),
    librarians: count("SELECT COUNT(*) n FROM users WHERE role='librarian' AND status='approved'"),
    activeLoans: count("SELECT COUNT(*) n FROM loans WHERE status='active' OR status='overdue'"),
    overdueBooks: count("SELECT COUNT(*) n FROM loans WHERE status='overdue'"),
    reservations: count("SELECT COUNT(*) n FROM reservations WHERE status IN('pending','ready','approved')"),
    damageCases: count("SELECT COUNT(*) n FROM damage_reports WHERE status!='resolved'"),
    unpaidPenalties: count("SELECT COUNT(*) n FROM penalties WHERE status='unpaid' OR status='approved'"),
    gates: db.prepare('SELECT * FROM gates ORDER BY gate_id').all(),
    recentActivity: db.prepare('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 20').all()
  });
});

app.get('/api/dashboard/personal', auth(), authorize('student','teacher'), (req, res) => {
  const activeLoans = db.prepare(`SELECT COUNT(*) n FROM loan_items li JOIN loans l ON l.id=li.loan_id WHERE l.user_id=? AND li.status='borrowed'`).get(req.user.sub).n;
  const pendingReservations = db.prepare(`SELECT COUNT(*) n FROM reservations WHERE user_id=? AND status IN('pending','ready','approved')`).get(req.user.sub).n;
  const overdueLoans = db.prepare(`SELECT COUNT(*) n FROM loans WHERE user_id=? AND status='overdue'`).get(req.user.sub).n;
  const unpaidPenalties = db.prepare(`SELECT COALESCE(SUM(amount),0) n FROM penalties WHERE user_id=? AND status IN('unpaid','approved')`).get(req.user.sub).n;
  res.json({
    activeLoans,
    pendingReservations,
    overdueLoans,
    unpaidPenalties,
    borrowingLimit: Number(setting(req.user.role === 'student' ? 'student_borrow_limit' : 'teacher_borrow_limit')),
    availableSlots: Math.max(0, Number(setting(req.user.role === 'student' ? 'student_borrow_limit' : 'teacher_borrow_limit')) - activeLoans),
  });
});

app.get('/api/dashboard/librarian', auth(), authorize('librarian','administrator'), (_req, res) => {
  res.json({
    catalog: db.prepare('SELECT COUNT(*) n FROM books').get().n,
    availableCopies: db.prepare("SELECT COUNT(*) n FROM book_copies WHERE status='available'").get().n,
    activeLoans: db.prepare("SELECT COUNT(*) n FROM loan_items WHERE status='borrowed'").get().n,
    reservations: db.prepare("SELECT COUNT(*) n FROM reservations WHERE status='pending'").get().n,
    damages: db.prepare("SELECT COUNT(*) n FROM damage_reports WHERE status='under_review' OR status='confirmed'").get().n,
    recentLoans: db.prepare(`SELECT l.*,u.name,u.digital_id FROM loans l JOIN users u ON u.id=l.user_id ORDER BY l.created_at DESC LIMIT 20`).all()
  });
});

app.get('/api/notifications', auth(), (req, res) => {
  res.json(db.prepare('SELECT * FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 100').all(req.user.sub));
});

app.post('/api/notifications/devices', auth(), (req, res) => {
  const { token, platform } = req.body;
  if (!token || !['android','ios','web'].includes(platform)) return res.status(400).json({ error: 'Token and supported platform are required' });
  db.prepare(`INSERT INTO notification_devices(user_id,token,platform,active) VALUES(?,?,?,1)
    ON CONFLICT(token) DO UPDATE SET user_id=excluded.user_id,platform=excluded.platform,active=1,updated_at=excluded.updated_at`)
    .run(req.user.sub, token, platform);
  res.status(201).json({ message: 'Device registered' });
});

app.use('/api', (_req, res) => res.status(404).json({ error: 'API route not found' }));

const adminEmail = process.env.ADMIN_EMAIL;
const adminPassword = process.env.ADMIN_PASSWORD;
if (adminEmail && adminPassword) {
  const existingAdmin = db.prepare('SELECT id,password_hash,role,status FROM users WHERE lower(email)=lower(?)').get(adminEmail);
  if (!existingAdmin) {
    const adminDigitalId = `ACLC-ADMIN-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
    db.prepare(`INSERT INTO users(email,password_hash,role,status,name,email_verified,digital_id) VALUES(?,?,?,?,?,1,?)`)
      .run(adminEmail, bcrypt.hashSync(adminPassword, 12), 'administrator', 'approved', 'System Administrator', adminDigitalId);
    console.log(`Seeded configured administrator ${adminEmail}`);
  } else if (existingAdmin.role === 'administrator' && existingAdmin.status === 'approved' && !bcrypt.compareSync(adminPassword, existingAdmin.password_hash)) {
    db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(bcrypt.hashSync(adminPassword, 12), existingAdmin.id);
    console.log(`Synchronized configured administrator password for ${adminEmail}`);
  }
} else {
  console.log('Administrator bootstrap skipped: set ADMIN_EMAIL and ADMIN_PASSWORD before initial deployment.');
}

async function syncConfiguredAdministratorToFirebase() {
  if (!adminEmail || !adminPassword || !firebaseAuth || !firestore) return;
  const admin = db.prepare('SELECT id,name FROM users WHERE lower(email)=lower(?) AND role=\'administrator\' AND status=\'approved\'').get(adminEmail);
  if (!admin) return;
  try {
    let firebaseUser;
    try {
      firebaseUser = await firebaseAuth.getUserByEmail(adminEmail);
      firebaseUser = await firebaseAuth.updateUser(firebaseUser.uid, {
        displayName: admin.name, emailVerified: true, disabled: false,
      });
    } catch (error) {
      if (error.code !== 'auth/user-not-found') throw error;
      firebaseUser = await firebaseAuth.createUser({
        email: adminEmail, password: adminPassword, displayName: admin.name,
        emailVerified: true, disabled: false,
      });
    }
    await firestore.collection('users').doc(firebaseUser.uid).set({
      uid: firebaseUser.uid, libraryUserId: admin.id, email: adminEmail,
      name: admin.name, role: 'administrator', status: 'approved',
      emailVerified: true,
      updatedAt: require('firebase-admin/firestore').FieldValue.serverTimestamp(),
    }, { merge: true });
    db.prepare('UPDATE users SET firebase_uid=? WHERE id=?').run(firebaseUser.uid, admin.id);
    console.log(`Linked bootstrap administrator ${adminEmail} to Firebase Authentication and Firestore.`);
  } catch (error) {
    console.error('Bootstrap administrator Firebase sync failed:', error.message);
  }
}

function startServer() {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`ACLC Library API listening on http://0.0.0.0:${PORT}`);
    console.log(`Admin dashboard API: http://localhost:${PORT}/api`);
    if (adminEmail && adminPassword) console.log(`Bootstrap admin configured for ${adminEmail}.`);
    if (!mailer) console.warn('Gmail delivery is not configured. Email verification and approval emails will not be delivered.');
    else void verifyEmailTransport();
  });
  // Opening the HTTP listener must not depend on Firebase network latency.
  // Account reconciliation can finish in the background while health checks and
  // non-Firebase library routes remain available.
  void syncConfiguredAdministratorToFirebase();
}

void startServer();
