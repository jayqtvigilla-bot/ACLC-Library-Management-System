import { useCallback, useEffect, useState } from 'react';
import './App.css';

const API_ORIGIN = (import.meta.env.VITE_API_URL || (import.meta.env.DEV ? `${window.location.protocol}//${window.location.hostname}:3001` : '')).replace(/\/+$/, '');
const API = API_ORIGIN ? `${API_ORIGIN}/api` : '';

const navigation = {
  administrator: [
    ['overview', 'Overview'],
    ['users', 'Users & approvals'],
    ['catalog', 'Book catalog'],
    ['loans', 'Loans'],
    ['access', 'Gate access'],
    ['audit', 'Audit log'],
  ],
  librarian: [
    ['overview', 'Overview'],
    ['catalog', 'Book inventory'],
    ['loans', 'Loans & returns'],
    ['access', 'Gate access'],
  ],
};

function App() {
  const [token, setToken] = useState(localStorage.getItem('dashboard_token') || '');
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('dashboard_user') || 'null'); }
    catch { return null; }
  });
  const [authMode, setAuthMode] = useState('login');
  const [loginForm, setLoginForm] = useState({ email: '', password: '' });
  const [registerForm, setRegisterForm] = useState({
    name: '', email: '', password: '', confirmPassword: '', role: 'student',
    school_number: '', employee_number: '', program: '', department: '', year_level: '',
  });
  const [accountForm, setAccountForm] = useState({
    name: '', email: '', password: '', role: 'student', school_number: '',
    program: '', year_level: '', employee_number: '', department: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const [dashboard, setDashboard] = useState(null);
  const [pending, setPending] = useState([]);
  const [clients, setClients] = useState([]);
  const [clientRole, setClientRole] = useState('student');
  const [books, setBooks] = useState([]);
  const [gates, setGates] = useState([]);
  const [activeSection, setActiveSection] = useState('overview');
  const [search, setSearch] = useState('');
  const [bookForm, setBookForm] = useState({ title: '', author: '', isbn: '', category: '', copies: 1 });
  const [personal, setPersonal] = useState(null);
  const [qr, setQr] = useState(null);
  const [history, setHistory] = useState(null);
  const [authPage, setAuthPage] = useState('');
  const [pendingVerificationEmail, setPendingVerificationEmail] = useState('');

  const request = useCallback(async (path, options = {}) => {
    if (!API) throw new Error('The library server is not configured for this dashboard. Set VITE_API_URL to the API server address and rebuild.');
    let response;
    try {
      response = await fetch(API + path, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...options.headers,
        },
      });
    } catch (cause) {
      if (cause.name === 'AbortError') throw cause;
      throw new Error(`Cannot reach the library API at ${API}. Start the API server or set VITE_API_URL to its address.`);
    }
    const data = await response.json().catch(() => ({}));
    if (response.status === 401 && token) {
      localStorage.removeItem('dashboard_token');
      localStorage.removeItem('dashboard_user');
      setToken('');
      setUser(null);
      setDashboard(null);
      setPending([]);
      setClients([]);
      throw new Error('Your admin session expired. Sign in again with the configured administrator email and password.');
    }
    if (!response.ok) throw new Error(data.error || 'Request failed');
    return data;
  }, [token]);

  const load = useCallback(async (signal) => {
    if (!token || !user) return;
    try {
      if (['student','teacher'].includes(user.role)) {
        const data = await request('/dashboard/personal', { signal });
        setDashboard(data);
        setPersonal(await request('/me', { signal }));
      } else if (user.role === 'administrator') {
        setDashboard(await request('/dashboard/admin', { signal }));
        setPending(await request('/admin/users/pending', { signal }));
        setClients(await request('/admin/users', { signal }));
      } else if (user.role === 'librarian') {
        setDashboard(await request('/dashboard/librarian', { signal }));
      } else {
        throw new Error('This portal is for administrators and librarians.');
      }
      setBooks(await request(`/books${search ? `?search=${encodeURIComponent(search)}` : ''}`, { signal }));
      if (['administrator','librarian'].includes(user.role)) {
        setGates(await request('/gates/status', { signal }));
      }
      if (['student','teacher'].includes(user.role) && activeSection === 'qr') setQr(await request('/credentials/qr', { signal }));
      if (['student','teacher'].includes(user.role) && activeSection === 'history') setHistory(await request('/my/history', { signal }));
      setError('');
    } catch (e) {
      if (e.name !== 'AbortError') setError(e.message);
    }
  }, [activeSection, request, search, token, user]);

  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => {
      if (!controller.signal.aborted) void load(controller.signal);
    });
    return () => controller.abort();
  }, [load]);

  const login = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const data = await request('/auth/login', { method: 'POST', body: JSON.stringify(loginForm) });
      localStorage.setItem('dashboard_token', data.token);
      localStorage.setItem('dashboard_user', JSON.stringify(data.user));
      setToken(data.token);
      setUser(data.user);
      setNotice('Signed in successfully');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const register = async (event) => {
    event.preventDefault();
    setError('');
    setNotice('');
    if (registerForm.password !== registerForm.confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      const form = { ...registerForm };
      delete form.confirmPassword;
      if (form.role === 'teacher') form.employee_number = form.employee_number || form.school_number;
      const data = await request('/auth/register', { method: 'POST', body: JSON.stringify(form) });
      if (data.verification_method === 'firebase_link') {
        setPendingVerificationEmail(form.email.trim().toLowerCase());
        setLoginForm((current) => ({ ...current, email: form.email }));
      }
      setNotice(data.verification_token ? `${data.message} Verification link: ${window.location.origin}/verify?token=${encodeURIComponent(data.verification_token)}` : data.message);
      setAuthMode('login'); setAuthPage('');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const completeRegistration = async () => {
    if (!pendingVerificationEmail) return;
    setLoading(true); setError('');
    try {
      const data = await request('/auth/complete-registration', { method: 'POST', body: JSON.stringify({ email: pendingVerificationEmail }) });
      setPendingVerificationEmail(''); setNotice(data.message); setError('');
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  const resendVerification = async () => {
    if (!pendingVerificationEmail) return;
    setLoading(true); setError('');
    try {
      const data = await request('/auth/resend-verification', { method: 'POST', body: JSON.stringify({ email: pendingVerificationEmail }) });
      setNotice(data.message);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  const forgotPassword = async (event) => {
    event.preventDefault(); setLoading(true); setError(''); setNotice('');
    try { const data = await request('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email: loginForm.email }) }); setNotice(data.message); }
    catch (e) { setError(e.message); } finally { setLoading(false); }
  };

  const approve = async (id, approved) => {
    try {
      const data = await request(`/admin/users/${id}/approval`, {
        method: 'POST',
        body: JSON.stringify({ approve: approved, reason: approved ? null : 'Rejected by administrator' }),
      });
      setNotice(data.message || (approved ? 'Registration approved.' : 'Registration rejected.'));
      load();
    } catch (e) { setError(e.message); }
  };

  const removeClient = async (client) => {
    const label = `${client.name} (${client.email})`;
    if (!window.confirm(`Remove ${label}? They will lose sign-in access and must register again. Their library transaction history will be retained without their personal account details.`)) return;
    setLoading(true); setError(''); setNotice('');
    try {
      await request(`/admin/users/${client.id}/archive`, {
        method: 'POST', body: JSON.stringify({ reason: 'Removed by administrator; re-registration requested' }),
      });
      await request(`/admin/users/${client.id}`, {
        method: 'DELETE', body: JSON.stringify({ reason: 'Removed by administrator; re-registration requested' }),
      });
      setClients((items) => items.filter((item) => item.id !== client.id));
      setNotice(`${client.name} was removed. They can register again using their email.`);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  const createAccount = async (event) => {
    event.preventDefault();
    setLoading(true); setError(''); setNotice('');
    try {
      const data = await request('/admin/users', {
        method: 'POST',
        body: JSON.stringify(accountForm),
      });
      setNotice(data.message);
      setAccountForm({ name: '', email: '', password: '', role: 'student', school_number: '', program: '', year_level: '', employee_number: '', department: '' });
      await load();
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  const addBook = async (event) => {
    event.preventDefault();
    setLoading(true);
    try {
      await request('/books', { method: 'POST', body: JSON.stringify({ ...bookForm, copies: Number(bookForm.copies) }) });
      setBookForm({ title: '', author: '', isbn: '', category: '', copies: 1 });
      setNotice('Book title and inventory copies added.');
      load();
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  const logout = () => {
    localStorage.removeItem('dashboard_token');
    localStorage.removeItem('dashboard_user');
    setToken('');
    setUser(null);
    setDashboard(null);
  };

  if (!token || !user) {
    if (window.location.pathname === '/verify') {
      const verificationToken = new URLSearchParams(window.location.search).get('token');
      return <main className="login-page"><section className="login-panel"><div className="login-card"><img className="brand-logo" src="/aclc-logo.png"/><p className="eyebrow">Email verification</p><h1>{verificationToken ? 'Confirm your email' : 'Verification link needed'}</h1><p className="login-subtitle">{notice || 'Use the verification link provided after registration to activate your application.'}</p>{error && <div className="alert error-alert">{error}</div>}<button className="primary-button" onClick={async()=>{try{const d=await request(`/auth/verify-email/${encodeURIComponent(verificationToken)}`,{method:'POST'});setNotice(d.message);setError('');}catch(e){setError(e.message)}}} disabled={!verificationToken}>Verify email</button><button className="text-button" onClick={()=>{window.history.replaceState({},'', '/');setAuthPage('')}}>Return to sign in</button></div></section></main>;
    }
    return (
      <main className="login-page">
        <section className="login-visual" aria-hidden="true">
          <div className="visual-brand">
            <img className="brand-logo large" src="/aclc-logo.png" alt="ACLC Mandaue City" />
            <div><strong>ACLC Smart Library</strong><span>University Library Management</span></div>
          </div>
        </section>
        <section className="login-panel">
          <form className="login-card" onSubmit={authPage === 'forgot' ? forgotPassword : authMode === 'login' ? login : register}>
            <div className="mobile-brand"><img className="brand-logo" src="/aclc-logo.png" alt="ACLC Mandaue City" /><strong>ACLC Smart Library</strong></div>
            <p className="eyebrow">{authPage === 'forgot' ? 'Account recovery' : authMode === 'login' ? 'Library portal' : `${registerForm.role === 'teacher' ? 'Teacher' : 'Student'} registration`}</p>
            <h1>{authPage === 'forgot' ? 'Reset your password' : authMode === 'login' ? 'Welcome back' : 'Create an account'}</h1>
            <p className="login-subtitle">{authPage ? 'Enter your account details to continue securely.' : authMode === 'login' ? 'Sign in to your ACLC library account.' : 'Submit your details for email verification and approval.'}</p>
            {authMode === 'login' && !authPage && <details className="setup-help"><summary>Admin sign-in and API help</summary><p><strong>API address:</strong> <code>{API || 'Not configured; set VITE_API_URL'}</code></p><p>For local setup, the first admin is provisioned from <code>ADMIN_EMAIL</code> and <code>ADMIN_PASSWORD</code> in the project root <code>.env</code>. Sign in here with those values. The dashboard adds the session token to protected admin requests automatically.</p><p>API health check: <code>{API_ORIGIN ? `${API_ORIGIN}/api/health` : 'Set VITE_API_URL first'}</code></p></details>}
            {error && <div className="alert error-alert">{error}</div>}
            {notice && <div className="alert success-alert">{notice}</div>}
            {pendingVerificationEmail && <div className="verification-actions"><p>After you click the Firebase link sent to <strong>{pendingVerificationEmail}</strong>, return here to finish your application.</p><button type="button" className="primary-button" onClick={completeRegistration} disabled={loading}>I verified my email</button><button type="button" className="text-button" onClick={resendVerification} disabled={loading}>Resend verification link</button></div>}

            {(authMode === 'register' && !authPage) && (
              <>
                <label>Account type
                  <select value={registerForm.role} onChange={(e) => setRegisterForm({ ...registerForm, role: e.target.value })}>
                    <option value="student">Student</option><option value="teacher">Teacher</option>
                  </select>
                </label>
                <label>Full name<input value={registerForm.name} onChange={(e) => setRegisterForm({ ...registerForm, name: e.target.value })} required /></label>
                <div className="form-grid">
                  <label>{registerForm.role === 'student' ? 'Student ID' : 'Employee ID'}
                    <input value={registerForm.role === 'student' ? registerForm.school_number : registerForm.employee_number} onChange={(e) => setRegisterForm(registerForm.role === 'student' ? { ...registerForm, school_number: e.target.value } : { ...registerForm, employee_number: e.target.value })} required />
                  </label>
                  {registerForm.role === 'student' && <label>Year level<select value={registerForm.year_level} onChange={(e) => setRegisterForm({ ...registerForm, year_level: e.target.value })}><option value="">Select</option>{['1st','2nd','3rd','4th','Graduate'].map((level) => <option key={level}>{level}</option>)}</select></label>}
                </div>
                {registerForm.role === 'student' && <label>Course / program<input value={registerForm.program} onChange={(e) => setRegisterForm({ ...registerForm, program: e.target.value })} required /></label>}
                {registerForm.role === 'teacher' && <label>Department<input value={registerForm.department} onChange={(e) => setRegisterForm({ ...registerForm, department: e.target.value })} required /></label>}
              </>
            )}
            <label>School email<input type="email" value={authMode === 'login' || authPage === 'forgot' ? loginForm.email : registerForm.email} onChange={(e) => authMode === 'login' || authPage === 'forgot' ? setLoginForm({ ...loginForm, email: e.target.value }) : setRegisterForm({ ...registerForm, email: e.target.value })} required /></label>
            {(authMode === 'login' && !authPage || authMode === 'register' && !authPage) && <label>Password<div className="password-field"><input type={showPassword ? 'text' : 'password'} value={authMode === 'login' ? loginForm.password : registerForm.password} onChange={(e) => authMode === 'login' ? setLoginForm({ ...loginForm, password: e.target.value }) : setRegisterForm({ ...registerForm, password: e.target.value })} required minLength={authMode === 'register' ? 10 : undefined} /><button type="button" onClick={() => setShowPassword(!showPassword)}>{showPassword ? 'Hide' : 'Show'}</button></div></label>}
            {authMode === 'register' && !authPage && <label>Confirm password<input type={showPassword ? 'text' : 'password'} value={registerForm.confirmPassword} onChange={(e) => setRegisterForm({ ...registerForm, confirmPassword: e.target.value })} required minLength={10} /></label>}
            <button className="primary-button" disabled={loading}>{loading ? 'Please wait...' : authPage === 'forgot' ? 'Send reset instructions' : authMode === 'login' ? 'Sign in' : 'Submit registration'}</button>
            {authMode === 'login' && !authPage && <button type="button" className="text-button" onClick={() => { setAuthPage('forgot'); setError(''); setNotice(''); }}>Forgot password?</button>}
            <button type="button" className="text-button" onClick={() => { setError(''); setNotice(''); if (authPage) setAuthPage(''); else setAuthMode(authMode === 'login' ? 'register' : 'login'); }}>
              {authMode === 'login' ? 'New student or teacher? Register' : 'Already have an account? Sign in'}
            </button>
          </form>
        </section>
      </main>
    );
  }

  const stats = dashboard ? Object.entries(dashboard).filter(([, value]) => typeof value === 'number').slice(0, 8) : [];
  const sectionLinks = navigation[user.role] || (['student','teacher'].includes(user.role) ? [['overview','Home'],['books','Books'],['qr','My QR'],['history','History'],['profile','Profile']] : []);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="side-brand"><img className="brand-logo" src="/aclc-logo.png" alt="ACLC" /><div><strong>Smart Library</strong><small>{user.role}</small></div></div>
        <nav>{sectionLinks.map(([id, label]) => <button key={id} className={activeSection === id ? 'active' : ''} onClick={() => setActiveSection(id)}><span>{label}</span></button>)}</nav>
        <button className="logout" onClick={logout}>Sign out</button>
      </aside>
      <main className="dashboard">
        <header className="topbar">
          <div><p>Library management</p><h1>{activeSection === 'overview' ? `${user.role === 'administrator' ? 'Administrator' : 'Librarian'} overview` : navigation[user.role]?.find(([id]) => id === activeSection)?.[1]}</h1></div>
          <div className="user-avatar">{user.name?.[0]?.toUpperCase?.() || 'U'}<span>{user.name}</span></div>
        </header>
        {error && <div className="alert error-alert dashboard-alert">{error}</div>}
        {notice && <div className="alert success-alert dashboard-alert">{notice}</div>}

        {activeSection === 'overview' && <>
          {loading || (!dashboard && !error) ? <div className="loading-panel">Loading dashboard...</div> : <section className="stats-grid">{stats.map(([key, value]) => <article className="stat-card" key={key}><span>{key.replace(/([A-Z])/g, ' $1')}</span><strong>{value}</strong></article>)}</section>}
          {user.role === 'administrator' && <section className="panel">
            <div className="panel-heading"><div><p>Registration approval</p><h2>Pending applications</h2></div><span className="count-badge">{pending.length}</span></div>
            {pending.length === 0 ? <p className="empty-state">No registrations are waiting for review.</p> : pending.map((item) => <div className="table-row" key={item.id}><div><strong>{item.name}</strong><small>{item.email}</small></div><div className="role-chip">{item.role}</div><div><button className="approve-button" onClick={() => approve(item.id, true)}>Approve</button><button className="reject-button" onClick={() => approve(item.id, false)}>Reject</button></div></div>)}
          </section>}
          <section className="panel"><div className="panel-heading"><div><p>Infrastructure</p><h2>Gate status</h2></div></div><div className="gate-grid">{gates.map((gate) => <article key={gate.gate_id}><div><strong>{gate.gate_id}</strong><span className={gate.status === 'online' ? 'online-badge' : 'offline-badge'}>{gate.status}</span></div><small>{gate.direction} · {gate.last_event_at || 'No recent event'}</small></article>)}</div></section>
        </>}

        {activeSection === 'users' && user.role === 'administrator' && <>
          <section className="panel">
            <div className="panel-heading"><div><p>Registration approval</p><h2>Pending applications</h2></div><span className="count-badge">{pending.length}</span></div>
            {pending.length === 0 ? <p className="empty-state">No registrations are waiting for review.</p> : pending.map((item) => <div className="table-row" key={item.id}><div><strong>{item.name}</strong><small>{item.email}</small></div><div className="role-chip">{item.role}</div><div><button className="approve-button" onClick={() => approve(item.id, true)}>Approve</button><button className="reject-button" onClick={() => approve(item.id, false)}>Reject</button></div></div>)}
          </section>
          <section className="panel">
            <div className="panel-heading"><div><p>Administrator tools</p><h2>Create a user account</h2></div></div>
            <p className="form-note">Creates an approved student, teacher, or librarian account. Give the initial password to the user privately and ask them to change it after signing in.</p>
            <form className="admin-account-form" onSubmit={createAccount}>
              <label>Role<select value={accountForm.role} onChange={(e) => setAccountForm({ ...accountForm, role: e.target.value })}><option value="student">Student</option><option value="teacher">Teacher</option><option value="librarian">Librarian</option></select></label>
              <label>Full name<input value={accountForm.name} onChange={(e) => setAccountForm({ ...accountForm, name: e.target.value })} required minLength={2} maxLength={100} /></label>
              <label>Email<input type="email" value={accountForm.email} onChange={(e) => setAccountForm({ ...accountForm, email: e.target.value })} required /></label>
              <label>Initial password<input type="password" value={accountForm.password} onChange={(e) => setAccountForm({ ...accountForm, password: e.target.value })} required minLength={10} autoComplete="new-password" /></label>
              {accountForm.role === 'student' ? <>
                <label>Student ID<input value={accountForm.school_number} onChange={(e) => setAccountForm({ ...accountForm, school_number: e.target.value })} required /></label>
                <label>Course<select value={accountForm.program} onChange={(e) => setAccountForm({ ...accountForm, program: e.target.value })} required><option value="">Select course</option>{['BSA','BSBA','BSCS','BSHM','BSIT'].map((course) => <option key={course}>{course}</option>)}</select></label>
                <label>Year level<select value={accountForm.year_level} onChange={(e) => setAccountForm({ ...accountForm, year_level: e.target.value })}><option value="">Select year</option>{['1st','2nd','3rd','4th','Graduate'].map((level) => <option key={level}>{level}</option>)}</select></label>
              </> : <>
                <label>Employee ID<input value={accountForm.employee_number} onChange={(e) => setAccountForm({ ...accountForm, employee_number: e.target.value })} required /></label>
                <label>Department<input value={accountForm.department} onChange={(e) => setAccountForm({ ...accountForm, department: e.target.value })} required /></label>
              </>}
              <button className="primary-button" disabled={loading}>{loading ? 'Creating account...' : 'Create account'}</button>
            </form>
          </section>
          <section className="panel">
            <div className="panel-heading"><div><p>Client accounts</p><h2>Manage by role</h2></div></div>
            <div className="role-tabs" role="tablist" aria-label="Filter client accounts by role">
              {[['student', 'Students'], ['teacher', 'Teachers'], ['librarian', 'Librarians']].map(([role, label]) => <button key={role} type="button" role="tab" aria-selected={clientRole === role} className={clientRole === role ? 'active' : ''} onClick={() => setClientRole(role)}>{label} <span>{clients.filter((item) => item.role === role).length}</span></button>)}
            </div>
            {clients.filter((item) => item.role === clientRole).length === 0 ? <p className="empty-state">No {clientRole} accounts found.</p> : clients.filter((item) => item.role === clientRole).map((item) => <div className="table-row" key={item.id}><div><strong>{item.name}</strong><small>{item.email}{item.school_number ? ` · ID ${item.school_number}` : ''}</small></div><div className="role-chip">{item.status}</div><button className="reject-button" disabled={loading} onClick={() => removeClient(item)}>Remove account</button></div>)}
          </section>
        </>}

        {activeSection === 'catalog' && <>
          {(user.role === 'librarian' || user.role === 'administrator') && <section className="panel"><div className="panel-heading"><div><p>Inventory</p><h2>Add a book</h2></div></div><form className="book-form" onSubmit={addBook}><input placeholder="Title" value={bookForm.title} onChange={(e) => setBookForm({ ...bookForm, title: e.target.value })} required /><input placeholder="Author" value={bookForm.author} onChange={(e) => setBookForm({ ...bookForm, author: e.target.value })} required /><input placeholder="ISBN" value={bookForm.isbn} onChange={(e) => setBookForm({ ...bookForm, isbn: e.target.value })} /><input placeholder="Category" value={bookForm.category} onChange={(e) => setBookForm({ ...bookForm, category: e.target.value })} /><input aria-label="Copies" type="number" min="1" value={bookForm.copies} onChange={(e) => setBookForm({ ...bookForm, copies: e.target.value })} /><button>Add copies</button></form></section>}
          <section className="panel"><div className="panel-heading"><div><p>Collection</p><h2>Book catalog</h2></div><input className="search-input" aria-label="Search catalog" placeholder="Search title or author" value={search} onChange={(e) => setSearch(e.target.value)} /></div><div className="book-list">{books.map((book) => <article key={book.id}><div><strong>{book.title}</strong><small>{book.author}</small></div><span>{book.available_copies}/{book.total_copies} available</span></article>)}</div></section>
        </>}

        {(activeSection === 'loans' || activeSection === 'audit') && <section className="panel"><div className="panel-heading"><div><p>Records</p><h2>{activeSection === 'loans' ? 'Loan activity' : 'Recent audit activity'}</h2></div></div>{dashboard?.recentLoans?.length ? dashboard.recentLoans.map((loan) => <div className="table-row" key={loan.id}><div><strong>{loan.name}</strong><small>Digital ID: {loan.digital_id || 'Pending'}</small></div><div className="role-chip">{loan.status}</div><small>{loan.created_at}</small></div>) : dashboard?.recentActivity?.length ? dashboard.recentActivity.map((item) => <div className="table-row" key={item.id}><div><strong>{item.action}</strong><small>{item.entity_type || 'System'} · {item.created_at}</small></div></div>) : <p className="empty-state">No recent activity.</p>}</section>}

        {activeSection === 'access' && <section className="panel"><div className="panel-heading"><div><p>Security</p><h2>Library access</h2></div></div><div className="gate-grid">{gates.map((gate) => <article key={gate.gate_id}><div><strong>{gate.gate_id}</strong><span className={gate.status === 'online' ? 'online-badge' : 'offline-badge'}>{gate.status}</span></div><small>{gate.direction} · {gate.last_event_at || 'No recent event'}</small></article>)}</div></section>}
      </main>
      {['student','teacher'].includes(user.role) && <section className="personal-content">
        {activeSection === 'overview' && <><section className="panel profile-hero"><div className="user-avatar">{user.name?.[0]?.toUpperCase?.()}</div><div><p className="eyebrow">{user.role} account</p><h2>{user.name}</h2><span>{personal?.user?.digital_id || 'Digital ID pending'} · {personal?.user?.standing?.replaceAll('_',' ') || 'GOOD STANDING'}</span></div></section><section className="stats-grid">{Object.entries(dashboard || {}).filter(([,v])=>typeof v==='number').map(([k,v])=><article className="stat-card" key={k}><span>{k.replace(/([A-Z])/g,' $1')}</span><strong>{v}</strong></article>)}</section><section className="panel"><div className="panel-heading"><div><p>Explore</p><h2>Library collection</h2></div><button onClick={()=>setActiveSection('books')}>Browse books</button></div><div className="book-list">{books.slice(0,6).map(b=><article key={b.id}><div><strong>{b.title}</strong><small>{b.author}</small></div><span>{b.available_copies}/{b.total_copies} available</span></article>)}</div></section></>}
        {activeSection === 'books' && <section className="panel"><div className="panel-heading"><div><p>Collection</p><h2>Find a book</h2></div><input className="search-input" placeholder="Search title or author" value={search} onChange={e=>setSearch(e.target.value)}/></div><div className="book-list">{books.map(b=><article key={b.id}><div><strong>{b.title}</strong><small>{b.author} · {b.category || 'General collection'}</small></div><span>{b.available_copies} available</span><button disabled={!b.available_copies} onClick={async()=>{try{await request('/reservations',{method:'POST',body:JSON.stringify({book_id:b.id})});setNotice('Reservation request submitted.');}catch(e){setError(e.message)}}}>Reserve</button></article>)}</div></section>}
        {activeSection === 'qr' && <section className="panel qr-panel"><p className="eyebrow">Digital library ID</p><h2>{personal?.user?.digital_id || 'Credential'}</h2>{qr?.qrDataUrl ? <img className="qr-image" src={qr.qrDataUrl} alt="Personal library QR credential"/> : <p>Loading your active credential…</p>}<p>Personal QR credential · Keep this code private.</p><button disabled={personal?.replacement_count >= 1} onClick={async()=>{if(!confirm('Report your QR lost? The current credential will be revoked and your one replacement used.'))return;try{await request('/credentials/disable-replace',{method:'POST',body:JSON.stringify({})});setQr(await request('/credentials/qr'));setPersonal(await request('/me'));setNotice('Your lost QR was revoked and replaced.');}catch(e){setError(e.message)}}}>Report lost & replace ({personal?.replacement_count ? 'used' : '1 remaining'})</button></section>}
        {activeSection === 'history' && <section className="panel"><div className="panel-heading"><div><p>Personal records</p><h2>My library history</h2></div></div><p>Account standing: {history?.standing?.replaceAll('_',' ') || 'Loading…'}</p>{history?.records?.length ? history.records.map(r=><div className="table-row" key={r.id}><div><strong>{r.record_type}</strong><small>{r.description}</small></div><span>{r.status}</span></div>):<p className="empty-state">No account records.</p>}</section>}
        {activeSection === 'profile' && <section className="panel"><div className="panel-heading"><div><p>Account</p><h2>My profile</h2></div></div><div className="table-row"><strong>Name</strong><span>{personal?.user?.name}</span></div><div className="table-row"><strong>Email</strong><span>{personal?.user?.email}</span></div><div className="table-row"><strong>Role</strong><span>{personal?.user?.role}</span></div><div className="table-row"><strong>Digital ID</strong><span>{personal?.user?.digital_id || 'Pending'}</span></div><div className="table-row"><strong>Account standing</strong><span>{personal?.user?.standing}</span></div></section>}
      </section>}
      <nav className="mobile-nav">{sectionLinks.slice(0, 5).map(([id, label]) => <button key={id} className={activeSection === id ? 'active' : ''} onClick={() => setActiveSection(id)}>{label.split(' ')[0]}</button>)}</nav>
    </div>
  );
}

export default App;
