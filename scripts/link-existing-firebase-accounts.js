'use strict';

const fs = require('node:fs');
const path = require('node:path');
require('dotenv').config({ quiet: true });
const Database = require('better-sqlite3');
const { initializeApp, cert } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { FieldValue, getFirestore } = require('firebase-admin/firestore');
const { reconcileExistingAccounts } = require('../lib/firebase-account-reconcile');

const projectRoot = path.resolve(__dirname, '..');
const apply = process.argv.includes('--apply');

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

async function main() {
  const credentialPath = process.env.FIREBASE_LINK_CREDENTIALS_FILE;
  if (!credentialPath) {
    fail('Set FIREBASE_LINK_CREDENTIALS_FILE to a freshly rotated Firebase Admin JSON file stored outside this repository. No existing GOOGLE_APPLICATION_CREDENTIALS file is used by this tool.');
    return;
  }

  const resolvedCredentialPath = fs.realpathSync(path.resolve(credentialPath));
  const relativeCredentialPath = path.relative(projectRoot, resolvedCredentialPath);
  if (relativeCredentialPath === '' || (!relativeCredentialPath.startsWith(`..${path.sep}`) && relativeCredentialPath !== '..' && !path.isAbsolute(relativeCredentialPath))) {
    fail('Store the Firebase Admin credential outside the project directory. No account changes were made.');
    return;
  }

  const serviceAccount = JSON.parse(fs.readFileSync(resolvedCredentialPath, 'utf8'));
  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (!projectId || serviceAccount.project_id !== projectId) {
    fail('The fresh Firebase Admin credential project does not match FIREBASE_PROJECT_ID. No account changes were made.');
    return;
  }

  const app = initializeApp({ credential: cert(serviceAccount), projectId }, `account-reconcile-${Date.now()}`);
  const auth = getAuth(app);
  const firestore = getFirestore(app);
  const databasePath = path.resolve(projectRoot, process.env.DB_FILE || 'aclc_library.sqlite');
  const db = new Database(databasePath, { readonly: !apply, fileMustExist: true });
  db.pragma('foreign_keys = ON');

  try {
    const accounts = db.prepare(`
      SELECT u.id, u.email, u.role, u.status, u.name, u.school_number, u.email_verified,
        u.firebase_uid, sp.program, sp.year_level, st.employee_number, st.department
      FROM users u
      LEFT JOIN student_profiles sp ON sp.user_id=u.id
      LEFT JOIN staff_profiles st ON st.user_id=u.id
      WHERE u.firebase_uid IS NULL OR u.firebase_uid=''
      ORDER BY u.id
    `).all();
    const persistLink = db.prepare('UPDATE users SET firebase_uid=? WHERE id=? AND (firebase_uid IS NULL OR firebase_uid=\'\')');

    const report = await reconcileExistingAccounts({
      accounts,
      auth,
      firestore,
      serverTimestamp: FieldValue.serverTimestamp,
      isUidInUse: async (uid, currentUserId) => Boolean(db.prepare('SELECT id FROM users WHERE firebase_uid=? AND id<>?').get(uid, currentUserId)),
      persistLink: async (uid, userId) => {
        const result = persistLink.run(uid, userId);
        if (result.changes !== 1) throw new Error('SQLite account changed while synchronization was in progress');
      },
      adminEmail: process.env.ADMIN_EMAIL,
      apply,
    });

    console.log(apply ? 'Firebase account reconciliation applied.' : 'Firebase account reconciliation preview only; no records were changed.');
    console.log(`Candidates: ${report.candidates}; linked: ${report.linked}; skipped: ${report.skipped}; conflicts: ${report.conflicts}.`);
    for (const item of report.errors) console.log(`REVIEW ${item.email || '(missing email)'}: ${item.reason}`);
    if (report.conflicts > 0 || report.errors.some(item => item.reason.includes('Firebase Auth lookup failed'))) process.exitCode = 2;
  } finally {
    db.close();
    await app.delete();
  }
}

main().catch((error) => fail(`Firebase account reconciliation stopped safely: ${error.code || error.message}`));
