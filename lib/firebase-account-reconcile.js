'use strict';

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

async function reconcileExistingAccounts({
  accounts,
  auth,
  firestore,
  serverTimestamp,
  isUidInUse,
  persistLink,
  adminEmail,
  apply = false,
}) {
  const report = { candidates: 0, linked: 0, skipped: 0, conflicts: 0, errors: [] };

  for (const account of accounts) {
    const email = normalizeEmail(account.email);
    if (account.firebase_uid) {
      report.skipped += 1;
      continue;
    }
    if (!email || Number(account.email_verified) !== 1) {
      report.skipped += 1;
      report.errors.push({ email, reason: 'SQLite account email is not verified.' });
      continue;
    }
    if (email === normalizeEmail(adminEmail) && account.role !== 'administrator') {
      report.conflicts += 1;
      report.errors.push({ email, reason: 'Configured administrator email belongs to a non-administrator SQLite account; manual role review is required.' });
      continue;
    }

    let firebaseUser;
    try {
      firebaseUser = await auth.getUserByEmail(email);
    } catch (error) {
      report.skipped += 1;
      report.errors.push({ email, reason: error.code === 'auth/user-not-found' ? 'No Firebase Auth account has this email.' : `Firebase Auth lookup failed (${error.code || 'unknown error'}).` });
      continue;
    }

    if (normalizeEmail(firebaseUser.email) !== email) {
      report.conflicts += 1;
      report.errors.push({ email, reason: 'Firebase returned an account with a different email.' });
      continue;
    }
    if (!firebaseUser.emailVerified || Number(account.email_verified) !== 1) {
      report.skipped += 1;
      report.errors.push({ email, reason: 'Both SQLite and Firebase must already confirm email verification.' });
      continue;
    }
    if (await isUidInUse(firebaseUser.uid, account.id)) {
      report.conflicts += 1;
      report.errors.push({ email, reason: 'Firebase UID is already linked to a different SQLite account.' });
      continue;
    }

    report.candidates += 1;
    if (!apply) continue;

    try {
      await auth.updateUser(firebaseUser.uid, { disabled: account.status !== 'approved' });
      const profile = {
        uid: firebaseUser.uid,
        libraryUserId: account.id,
        email,
        name: account.name,
        role: account.role,
        status: account.status,
        emailVerified: true,
        updatedAt: serverTimestamp(),
      };
      if (account.role === 'student') {
        profile.schoolNumber = account.school_number || null;
        profile.program = account.program || null;
        profile.yearLevel = account.year_level || null;
      } else if (account.role === 'teacher' || account.role === 'librarian') {
        profile.employeeNumber = account.employee_number || null;
        profile.department = account.department || null;
      }
      await firestore.collection('users').doc(firebaseUser.uid).set(profile, { merge: true });
      await persistLink(firebaseUser.uid, account.id);
      report.linked += 1;
    } catch (error) {
      report.errors.push({ email, reason: `Account sync failed (${error.code || 'unknown error'}); rerunning after fixing the cause is safe.` });
    }
  }

  return report;
}

module.exports = { normalizeEmail, reconcileExistingAccounts };
