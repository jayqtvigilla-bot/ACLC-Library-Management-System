const test = require('node:test');
const assert = require('node:assert/strict');

const base = process.env.TEST_API || 'http://127.0.0.1:3000/api';

async function request(path, options = {}) {
  const response = await fetch(base + path, options);
  const body = await response.json();
  return { response, body };
}

function jsonOptions(method, body, token) {
  return {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  };
}

test('reservation, circulation, and gate nonce workflows', async () => {
  const adminLogin = await request('/auth/login', {
    ...jsonOptions('POST', { email: 'admin@aclc.local', password: 'ACLCAdmin123!' }),
  });
  assert.equal(adminLogin.response.status, 200);
  const adminToken = adminLogin.body.token;

  const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const email = `circulation${stamp}@example.com`;
  const password = 'CirculationTest123!';
  const registration = await request('/auth/register', {
    ...jsonOptions('POST', {
      email,
      password,
      name: 'Circulation Test Student',
      role: 'student',
      school_number: `QA-${stamp}`,
      program: 'BSIT',
    }),
  });
  assert.equal(registration.response.status, 201);
  assert.match(registration.body.verification_otp, /^\d{6}$/);

  const verification = await request('/auth/verify-otp', {
    ...jsonOptions('POST', { email, otp: registration.body.verification_otp }),
  });
  assert.equal(verification.response.status, 200);

  const pending = await request('/admin/users/pending', {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const applicant = pending.body.find((user) => user.email === email);
  assert.ok(applicant);

  const approval = await request(`/admin/users/${applicant.id}/approval`, {
    ...jsonOptions('POST', { approve: true }, adminToken),
  });
  assert.equal(approval.response.status, 200);

  const studentLogin = await request('/auth/login', {
    ...jsonOptions('POST', { email, password }),
  });
  assert.equal(studentLogin.response.status, 200);
  const studentToken = studentLogin.body.token;

  const stampBook = `QA-${stamp}`;
  const createdBook = await request('/books', {
    ...jsonOptions('POST', {
      title: `Circulation Test ${stamp}`,
      author: 'Test Author',
      isbn: stampBook,
      category: 'Test',
      copies: 1,
    }, adminToken),
  });
  assert.equal(createdBook.response.status, 201);

  const reservation = await request('/reservations', {
    ...jsonOptions('POST', { book_id: createdBook.body.id }, studentToken),
  });
  assert.equal(reservation.response.status, 201);

  const duplicate = await request('/reservations', {
    ...jsonOptions('POST', { book_id: createdBook.body.id }, studentToken),
  });
  assert.equal(duplicate.response.status, 409);

  const ready = await request(`/reservations/${reservation.body.id}/status`, {
    ...jsonOptions('POST', { status: 'ready' }, adminToken),
  });
  assert.equal(ready.response.status, 200);

  const copies = await request('/copies/available', {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const copy = copies.body.find((item) => item.book_id === createdBook.body.id);
  assert.ok(copy);

  const checkout = await request('/loans/checkout', {
    ...jsonOptions('POST', { user_id: applicant.id, copy_ids: [copy.id] }, adminToken),
  });
  assert.equal(checkout.response.status, 201);

  const activeLoans = await request('/loans/active', {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const loanItem = activeLoans.body.find((item) => item.loan_id === checkout.body.loan_id);
  assert.ok(loanItem);

  const returned = await request('/loans/return', {
    ...jsonOptions('POST', { loan_item_id: loanItem.loan_item_id, condition: 'good' }, adminToken),
  });
  assert.equal(returned.response.status, 200);

  const qr = await request('/credentials/qr', {
    headers: { Authorization: `Bearer ${studentToken}` },
  });
  assert.equal(qr.response.status, 200);
  assert.ok(qr.body.credential);

  const gateOnline = await request('/gates/GATE-ENTRY/status', {
    ...jsonOptions('POST', { status: 'online', maintenance: false }, adminToken),
  });
  assert.equal(gateOnline.response.status, 200);

  const authorization = await request('/gates/authorize', {
    ...jsonOptions('POST', { credential: qr.body.credential, gate_id: 'GATE-ENTRY' }, adminToken),
  });
  assert.equal(authorization.response.status, 200);
  assert.equal(authorization.body.authorized, true);

  const unauthenticatedPassage = await request('/gates/passage', {
    ...jsonOptions('POST', { nonce: authorization.body.nonce, gate_id: 'GATE-ENTRY', sensor_confirmed: true, movement_complete: true }),
  });
  assert.equal(unauthenticatedPassage.response.status, 401, 'gate passage requires device authentication');

  const passage = await request('/gates/passage', {
    ...jsonOptions('POST', { nonce: authorization.body.nonce, gate_id: 'GATE-ENTRY', sensor_confirmed: true, movement_complete: true }),
    headers: {
      ...jsonOptions('POST', { nonce: authorization.body.nonce, gate_id: 'GATE-ENTRY' }).headers,
      'X-Gate-Token': 'test-only-gate-device-token',
    },
  });
  assert.equal(passage.response.status, 200);
  assert.equal(passage.body.accepted, true);

  const replay = await request('/gates/passage', {
    ...jsonOptions('POST', { nonce: authorization.body.nonce, gate_id: 'GATE-ENTRY', sensor_confirmed: true, movement_complete: true }),
    headers: {
      ...jsonOptions('POST', { nonce: authorization.body.nonce, gate_id: 'GATE-ENTRY' }).headers,
      'X-Gate-Token': 'test-only-gate-device-token',
    },
  });
  assert.equal(replay.response.status, 401);
});
