'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { reconcileExistingAccounts } = require('../lib/firebase-account-reconcile');

function fakeServices(firebaseUsers = {}) {
  const calls = { updates: [], documents: [], links: [] };
  const auth = {
    async getUserByEmail(email) {
      const user = firebaseUsers[email.toLowerCase()];
      if (!user) {
        const error = new Error('missing');
        error.code = 'auth/user-not-found';
        throw error;
      }
      return user;
    },
    async updateUser(uid, values) { calls.updates.push({ uid, values }); },
  };
  const firestore = {
    collection(name) {
      return { doc(uid) { return { async set(value, options) { calls.documents.push({ name, uid, value, options }); } }; } };
    },
  };
  return { auth, firestore, calls };
}

test('reconciliation preview matches verified identities without writing', async () => {
  const { auth, firestore, calls } = fakeServices({
    'teacher@example.edu': { uid: 'firebase-teacher', email: 'teacher@example.edu', emailVerified: true, disabled: false },
  });
  const report = await reconcileExistingAccounts({
    accounts: [{ id: 7, email: 'Teacher@Example.edu', role: 'teacher', status: 'approved', name: 'Teacher', email_verified: 1 }],
    auth, firestore, serverTimestamp: () => 'timestamp', isUidInUse: async () => false, persistLink: async () => calls.links.push(true),
    adminEmail: 'admin@example.edu', apply: false,
  });
  assert.equal(report.candidates, 1);
  assert.equal(report.linked, 0);
  assert.equal(calls.updates.length, 0);
  assert.equal(calls.documents.length, 0);
  assert.equal(calls.links.length, 0);
});

test('apply mirrors the SQLite role/status and links a Firebase verified user', async () => {
  const { auth, firestore, calls } = fakeServices({
    'student@example.edu': { uid: 'firebase-student', email: 'student@example.edu', emailVerified: true, disabled: true },
  });
  const report = await reconcileExistingAccounts({
    accounts: [{ id: 9, email: 'student@example.edu', role: 'student', status: 'approved', name: 'Student', school_number: 'S-1', program: 'BSIT', year_level: '2', email_verified: 1 }],
    auth, firestore, serverTimestamp: () => 'timestamp', isUidInUse: async () => false, persistLink: async (uid, id) => calls.links.push({ uid, id }),
    adminEmail: 'admin@example.edu', apply: true,
  });
  assert.equal(report.linked, 1);
  assert.deepEqual(calls.updates, [{ uid: 'firebase-student', values: { disabled: false } }]);
  assert.equal(calls.documents[0].name, 'users');
  assert.equal(calls.documents[0].value.role, 'student');
  assert.equal(calls.documents[0].value.program, 'BSIT');
  assert.deepEqual(calls.links, [{ uid: 'firebase-student', id: 9 }]);
});

test('reconciliation refuses to assign a configured administrator email from a non-admin SQLite role', async () => {
  const { auth, firestore, calls } = fakeServices({
    'admin@example.edu': { uid: 'firebase-admin', email: 'admin@example.edu', emailVerified: true, disabled: false },
  });
  const report = await reconcileExistingAccounts({
    accounts: [{ id: 3, email: 'admin@example.edu', role: 'student', status: 'approved', name: 'Student', email_verified: 1 }],
    auth, firestore, serverTimestamp: () => 'timestamp', isUidInUse: async () => false, persistLink: async () => {},
    adminEmail: 'ADMIN@example.edu', apply: true,
  });
  assert.equal(report.conflicts, 1);
  assert.equal(report.linked, 0);
  assert.equal(calls.updates.length, 0);
  assert.equal(calls.documents.length, 0);
});

test('reconciliation refuses unverified Firebase accounts and duplicate UID links', async () => {
  const { auth, firestore, calls } = fakeServices({
    'unverified@example.edu': { uid: 'firebase-unverified', email: 'unverified@example.edu', emailVerified: false, disabled: false },
    'duplicate@example.edu': { uid: 'firebase-in-use', email: 'duplicate@example.edu', emailVerified: true, disabled: false },
  });
  const report = await reconcileExistingAccounts({
    accounts: [
      { id: 4, email: 'unverified@example.edu', role: 'teacher', status: 'approved', name: 'Teacher', email_verified: 1 },
      { id: 5, email: 'duplicate@example.edu', role: 'librarian', status: 'approved', name: 'Librarian', email_verified: 1 },
    ],
    auth, firestore, serverTimestamp: () => 'timestamp', isUidInUse: async uid => uid === 'firebase-in-use', persistLink: async () => {},
    adminEmail: 'admin@example.edu', apply: true,
  });
  assert.equal(report.linked, 0);
  assert.equal(report.conflicts, 1);
  assert.equal(calls.updates.length, 0);
  assert.equal(calls.documents.length, 0);
});
