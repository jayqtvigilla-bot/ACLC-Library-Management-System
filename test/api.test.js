const test = require('node:test');
const assert = require('node:assert/strict');

const base = process.env.TEST_API || 'http://127.0.0.1:3000/api';

async function request(path, options = {}) {
  const response = await fetch(base + path, options);
  const body = await response.json();
  return { response, body };
}

test('health endpoint responds', async () => {
  const { response, body } = await request('/health');
  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.checks.firebaseAdminConfigured, false, 'test server must not load Firebase credentials from the developer .env');
  assert.equal(body.checks.emailConfigured, false, 'test server must not load email credentials from the developer .env');
  assert.equal(body.checks.emailTransportReady, false, 'test server must not inherit Gmail credentials from the developer .env');
});

test('configured administrator email cannot be claimed through public registration', async () => {
  const { response } = await request('/auth/register', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'admin@aclc.local', password: 'TestPassword123!', name: 'Attempted Admin',
      role: 'student', school_number: `ADMIN-${Date.now()}`, program: 'BSIT',
    })
  });
  assert.equal(response.status, 409);
});

test('registration, verification, approval, login, and digital QR workflow', async () => {
  const stamp = `${Date.now()}${Math.floor(Math.random() * 100000)}`;
  const email = `student${stamp}@aclc.edu`;
  const registration = await request('/auth/register', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'TestPassword123!', name: 'Test Student', role: 'student', school_number: `2026-${stamp}`, program: 'BSIT' })
  });
  assert.equal(registration.response.status, 201);
  if (registration.body.verification_otp) assert.match(registration.body.verification_otp, /^\d{6}$/);
  else assert.equal(registration.body.email_sent, true, 'OTP must be delivered through configured email in production');
  const immediateResend = await request('/auth/resend-otp', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  assert.equal(immediateResend.response.status, 429, 'registration resend must enforce a cooldown');
  assert.equal((await request('/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'TestPassword123!' }) })).response.status, 401, 'unverified registration must not create an account');
  assert.equal((await request('/admin/users/pending', { headers: { Authorization: 'Bearer invalid' } })).response.status, 401);

  const incorrectOtp = await request('/auth/verify-otp', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, otp: registration.body.verification_otp ? ('000000' === registration.body.verification_otp ? '000001' : '000000') : '000000' })
  });
  assert.equal(incorrectOtp.response.status, 400);
  const verification = await request('/auth/verify-otp', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, otp: registration.body.verification_otp || '000000' })
  });
  assert.equal(verification.response.status, 200);
  assert.match(verification.body.message, /waiting for administrator approval/i);
  const reusedOtp = await request('/auth/verify-otp', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, otp: registration.body.verification_otp || '000000' })
  });
  assert.equal(reusedOtp.response.status, 400);

  const adminLogin = await request('/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@aclc.local', password: 'ACLCAdmin123!' })
  });
  assert.equal(adminLogin.response.status, 200);
  const adminToken = adminLogin.body.token;

  const pending = await request('/admin/users/pending', { headers: { Authorization: `Bearer ${adminToken}` } });
  const student = pending.body.find((user) => user.email === email);
  assert.ok(student);

  const approval = await request(`/admin/users/${student.id}/approval`, {
    method: 'POST', headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ approve: true })
  });
  assert.equal(approval.response.status, 200);

  const studentLogin = await request('/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'TestPassword123!' })
  });
  assert.equal(studentLogin.response.status, 200);
  assert.ok(studentLogin.body.user.digital_id);

  const declinedEmail = `declined${stamp}@aclc.edu`;
  const declinedRegistration = await request('/auth/register', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: declinedEmail, password: 'TestPassword123!', name: 'Declined Student',
      role: 'student', school_number: `DECLINED-${stamp}`, program: 'BSIT',
    }),
  });
  assert.equal(declinedRegistration.response.status, 201);
  const declinedVerification = await request('/auth/verify-otp', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: declinedEmail, otp: declinedRegistration.body.verification_otp }),
  });
  assert.equal(declinedVerification.response.status, 200);
  const declinedUser = (await request('/admin/users/pending', {
    headers: { Authorization: `Bearer ${adminToken}` },
  })).body.find((user) => user.email === declinedEmail);
  assert.ok(declinedUser, 'verified registration should appear in the admin approval queue');
  const decline = await request(`/admin/users/${declinedUser.id}/approval`, {
    method: 'POST', headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ approve: false, reason: 'Please correct your student ID.' }),
  });
  assert.equal(decline.response.status, 200);
  assert.equal(decline.body.email_sent, false, 'test environment has no Gmail credentials');
  const declinedLogin = await request('/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: declinedEmail, password: 'TestPassword123!' }),
  });
  assert.equal(declinedLogin.response.status, 403);
  assert.match(declinedLogin.body.error, /register again/i);
  const resubmission = await request('/auth/register', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: declinedEmail, password: 'TestPassword123!', name: 'Declined Student',
      role: 'student', school_number: `DECLINED-${stamp}`, program: 'BSIT',
    }),
  });
  assert.equal(resubmission.response.status, 201, 'declined applicants may submit a new registration');
  assert.match(resubmission.body.verification_otp, /^\d{6}$/);

  const qr = await request('/credentials/qr', { headers: { Authorization: `Bearer ${studentLogin.body.token}` } });
  assert.equal(qr.response.status, 200);
  assert.ok(qr.body.credential);

  const liraStatus = await request('/lira/status', { headers: { Authorization: `Bearer ${studentLogin.body.token}` } });
  assert.equal(liraStatus.response.status, 200);
  assert.ok(['ai', 'library'].includes(liraStatus.body.mode));
  const studentFaqs = await request('/lira/faqs', { headers: { Authorization: `Bearer ${studentLogin.body.token}` } });
  assert.equal(studentFaqs.response.status, 200);
  assert.ok(studentFaqs.body.length > 0);
  const studentChat = await request('/lira/chat', {
    method: 'POST', headers: { Authorization: `Bearer ${studentLogin.body.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'How do I reserve a book?' })
  });
  assert.equal(studentChat.response.status, 200);
  assert.ok(studentChat.body.answer);
  assert.equal(studentChat.body.source, 'faq');
  const studentChatHistory = await request('/lira/history', { headers: { Authorization: `Bearer ${studentLogin.body.token}` } });
  assert.equal(studentChatHistory.response.status, 200);
  assert.equal(studentChatHistory.body.length, 2);

  const roleSettings = await request('/admin/settings/registration-roles', {
    method: 'PUT', headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ student: true, teacher: true, librarian: true })
  });
  assert.equal(roleSettings.response.status, 400, 'public librarian registration must not be enabled');
  const memberRoleSettings = await request('/admin/settings/registration-roles', {
    method: 'PUT', headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ student: true, teacher: true, librarian: false })
  });
  assert.equal(memberRoleSettings.response.status, 200);
  assert.equal(memberRoleSettings.body.roles.librarian, false);
  const publicLibrarianRegistration = await request('/auth/register', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: `publiclibrarian${Date.now()}@aclc.edu`, password: 'TestPassword123!', name: 'Public Librarian', role: 'librarian', employee_number: 'PUB-L-1', department: 'Library' })
  });
  assert.equal(publicLibrarianRegistration.response.status, 403);

  const librarianEmail = `admincreatedlibrarian${Date.now()}@aclc.edu`;
  const librarianCreated = await request('/admin/users', {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: librarianEmail, password: 'TestPassword123!', name: 'Admin Created Librarian',
      role: 'librarian', employee_number: 'QA-L-1001', department: 'Library',
    }),
  });
  assert.equal(librarianCreated.response.status, 201);
  assert.equal(librarianCreated.body.user.role, 'librarian');

  for (const [role, details] of [
    ['student', { school_number: 'QA-S-1001', program: 'BSIT', year_level: '1st' }],
    ['teacher', { employee_number: 'QA-T-1002', department: 'IT' }],
    ['librarian', { employee_number: 'QA-L-1002', department: 'Library' }],
  ]) {
    const email = `admin-created-${role}-${Date.now()}@aclc.edu`;
    const created = await request('/admin/users', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password: 'TestPassword123!',
        name: `Admin Created ${role}`,
        role,
        ...details,
      }),
    });
    assert.equal(created.response.status, 201, `administrator can create ${role} accounts`);
    assert.equal(created.body.user.status, 'approved');
    const login = await request('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'TestPassword123!' }),
    });
    assert.equal(login.response.status, 200, `new ${role} account can sign in`);
    assert.equal(login.body.user.role, role);
  }

  for (const [role, employee_number, department] of [
    ['teacher', 'QA-T-1001', 'IT']
  ]) {
    const staffEmail = `${role}${Date.now()}@aclc.edu`;
    const staffRegistration = await request('/auth/register', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: staffEmail, password: 'TestPassword123!', name: `Test ${role}`, role, employee_number, department })
    });
    assert.equal(staffRegistration.response.status, 201);
    const staffVerification = await request('/auth/verify-otp', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: staffEmail, otp: staffRegistration.body.verification_otp })
    });
    assert.equal(staffVerification.response.status, 200);
    const queue = await request('/admin/users/pending', { headers: { Authorization: `Bearer ${adminToken}` } });
    const applicant = queue.body.find((user) => user.email === staffEmail);
    assert.ok(applicant);
    const staffApproval = await request(`/admin/users/${applicant.id}/approval`, {
      method: 'POST', headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ approve: true })
    });
    assert.equal(staffApproval.response.status, 200);
    const staffLogin = await request('/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: staffEmail, password: 'TestPassword123!' })
    });
    assert.equal(staffLogin.response.status, 200);
    const roleLiraStatus = await request('/lira/status', { headers: { Authorization: `Bearer ${staffLogin.body.token}` } });
    assert.equal(roleLiraStatus.response.status, 403, 'LIRA status is student-only');
    const roleFaqs = await request('/lira/faqs', { headers: { Authorization: `Bearer ${staffLogin.body.token}` } });
    assert.equal(roleFaqs.response.status, 403, 'student FAQ is not exposed to staff roles');
    const roleChat = await request('/lira/chat', {
      method: 'POST', headers: { Authorization: `Bearer ${staffLogin.body.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'How do I find a book?' })
    });
    assert.equal(roleChat.response.status, 403, 'staff roles cannot use LIRA chat');
    const roleHistory = await request('/lira/history', { headers: { Authorization: `Bearer ${staffLogin.body.token}` } });
    assert.equal(roleHistory.response.status, 403, 'staff roles cannot read LIRA history');
    const clearRoleHistory = await request('/lira/history', { method: 'DELETE', headers: { Authorization: `Bearer ${staffLogin.body.token}` } });
    assert.equal(clearRoleHistory.response.status, 403, 'staff roles cannot clear LIRA history');
  }

  const isolatedStudentHistory = await request('/lira/history', { headers: { Authorization: `Bearer ${studentLogin.body.token}` } });
  assert.equal(isolatedStudentHistory.body.length, 2, 'other roles cannot add messages to the student chat history');
  for (let i = 1; i < 20; i++) {
    const allowedChat = await request('/lira/chat', {
      method: 'POST', headers: { Authorization: `Bearer ${studentLogin.body.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'How do I reserve a book?' })
    });
    assert.equal(allowedChat.response.status, 200, 'LIRA allows up to 20 messages per user per minute');
  }
  const limitedChat = await request('/lira/chat', {
    method: 'POST', headers: { Authorization: `Bearer ${studentLogin.body.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'How do I reserve a book?' })
  });
  assert.equal(limitedChat.response.status, 429, 'LIRA rate limit blocks excess requests');

  const clearedHistory = await request('/lira/history', {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${studentLogin.body.token}` },
  });
  assert.equal(clearedHistory.response.status, 200, 'students can clear their own LIRA history from settings');
  const emptyHistory = await request('/lira/history', {
    headers: { Authorization: `Bearer ${studentLogin.body.token}` },
  });
  assert.equal(emptyHistory.response.status, 200);
  assert.equal(emptyHistory.body.length, 0);

  const adminLiraStatus = await request('/lira/status', { headers: { Authorization: `Bearer ${adminToken}` } });
  assert.equal(adminLiraStatus.response.status, 403, 'LIRA is unavailable to administrators');
  const adminChat = await request('/lira/chat', {
    method: 'POST', headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'How do I review applications?' })
  });
  assert.equal(adminChat.response.status, 403, 'administrators cannot use LIRA chat');
  const adminFaqManagement = await request('/admin/lira/faqs', { headers: { Authorization: `Bearer ${adminToken}` } });
  assert.equal(adminFaqManagement.response.status, 404, 'administrator LIRA management is removed');

  const me = await request('/me', { headers: { Authorization: `Bearer ${studentLogin.body.token}` } });
  assert.equal(me.response.status, 200);
  assert.equal(Object.hasOwn(me.body.user, 'password_hash'), false);

  const studentHistory = await request(`/users/${student.id}/history`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert.equal(studentHistory.response.status, 200, 'administrator can view student borrowing history');
  assert.equal(studentHistory.body.statistics.physicalBooksBorrowed, 0);
  assert.deepEqual(studentHistory.body.loans, [], 'history includes a book-by-book loan list');
  assert.equal((await request(`/users/${student.id}/history`, {
    headers: { Authorization: `Bearer ${studentLogin.body.token}` },
  })).response.status, 403, 'student history details are restricted to staff');

  const archiveEmail = `archive-flow-${stamp}@aclc.edu`;
  const archiveAccount = await request('/admin/users', {
    method: 'POST', headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: archiveEmail, password: 'TestPassword123!', name: 'Archive Flow Student', role: 'student', school_number: `ARCH-${stamp}`, program: 'BSIT' }),
  });
  assert.equal(archiveAccount.response.status, 201);
  const archiveId = archiveAccount.body.user.id;
  assert.equal((await request(`/admin/users/${archiveId}/archive`, {
    method: 'POST', headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: 'Archive workflow test' }),
  })).response.status, 200);
  assert.ok((await request('/admin/users?archived=true&role=student', { headers: { Authorization: `Bearer ${adminToken}` } })).body.some(user => user.id === archiveId));
  assert.equal((await request(`/admin/users/${archiveId}/restore`, {
    method: 'POST', headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: 'Restore workflow test' }),
  })).response.status, 200);
  assert.ok((await request('/admin/users?role=student', { headers: { Authorization: `Bearer ${adminToken}` } })).body.some(user => user.id === archiveId));
  await request(`/admin/users/${archiveId}/archive`, {
    method: 'POST', headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: 'Permanent delete workflow test' }),
  });
  assert.equal((await request(`/admin/users/${archiveId}`, {
    method: 'DELETE', headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: 'Permanent delete workflow test' }),
  })).response.status, 200);
  const deletedArchive = (await request('/admin/users?archived=true&role=student', { headers: { Authorization: `Bearer ${adminToken}` } })).body.find(user => user.id === archiveId);
  assert.equal(deletedArchive.is_deleted, 1, 'permanently deleted account remains as an archived history tombstone');
  assert.equal((await request(`/admin/users/${archiveId}/restore`, {
    method: 'POST', headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({}),
  })).response.status, 409);
});
