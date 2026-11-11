PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS lira_faqs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER REFERENCES users(id),
  updated_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_lira_faqs_active_order ON lira_faqs(active,sort_order,category);

CREATE TABLE IF NOT EXISTS lira_chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  sender TEXT NOT NULL CHECK(sender IN ('user','assistant')),
  message TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_lira_chat_user_created ON lira_chat_messages(user_id,created_at);

INSERT INTO lira_faqs(category,question,answer,sort_order) VALUES
('Books','How do I search for books?','Open Books from the bottom navigation. Search by title, author, or category, then open a result to check its details and availability.',10),
('Books','How many books can I borrow?','Your borrowing limit is set by ACLC Library policy. Ask LIRA this question while signed in to see your configured limit and remaining slots.',20),
('Books','How do I borrow a book?','Find the title in Books and submit a reservation if needed. A librarian checks eligibility and confirms checkout at the library desk. Check My Activity for your active loan and due date.',30),
('Books','How long can I keep a book?','Check My Activity for the due date recorded on each active loan. If no due date is shown, ask a librarian to confirm the current loan period.',40),
('Books','How do I return a book?','Bring the book to the ACLC Library desk. A librarian records the return and the returned condition in the system.',50),
('Reservations','How do I reserve a book?','Open Books, choose an available title, and tap Reserve. Track its status in My Activity. A reservation is not a completed checkout.',60),
('Reservations','How do I cancel a reservation?','Open My Activity and cancel a reservation while its status is pending or ready. Contact the library desk if the cancel action is unavailable.',70),
('Reservations','How do I check my reservation?','Open My Activity and review the Reservations list for the latest status.',80),
('Reservations','Can I renew my borrowed book?','Renewal availability depends on ACLC Library policy. Contact a librarian before the due date; LIRA will not assume a renewal is approved.',90),
('QR Access','How do I register for a library account?','Choose Student registration, complete the required details, and verify the six-digit email code. Your account then waits for administrator approval. We will email the decision.',100),
('QR Access','How do I get my digital student ID?','After your account is approved, sign in and open My QR. Your digital ID and personal QR credential appear there.',110),
('QR Access','How do I use my QR code at the turnstile?','Open My QR while signed in and present the active code to the library scanner. Do not share a screenshot of your personal credential.',120),
('QR Access','What happens if I lose my QR code?','Open My QR and use the lost-credential action. The old credential is disabled. Self-service replacement is limited; contact the administrator if the app says you have no replacement remaining.',130),
('QR Access','How do I renew my QR code every semester?','Semester credentials are managed by the administrator. The new credential appears in My QR after renewal is scheduled and processed.',140),
('QR Access','What happens if my QR code expires?','An expired credential cannot authorize library access. Contact the administrator or library desk to confirm semester renewal.',150),
('Penalties','What happens if I return a book late?','Your account and loan status reflect overdue items. Check My Activity and contact a librarian about the current policy and any assessment.',160),
('Penalties','What happens if I damage a book?','Report the damage to library staff when returning the book. A librarian records its condition; an administrator reviews any proposed penalty.',170),
('Penalties','How do I check my penalties?','Open My Activity and review Penalties for their amount and status. Only an administrator can update a penalty decision.',180),
('Penalties','How can I settle an approved penalty?','Ask the ACLC Library administrator or cashier for the authorized payment process. Check the penalty status in My Activity after payment is recorded.',190),
('Account','How do I check my registration approval?','After email verification, your application is placed in the administrator review queue. The administrator emails the decision; sign-in becomes available after approval.',200),
('Account','How do I update my account?','Open Profile to review your account details. If a school ID or other protected information needs correction, contact the library administrator.',210),
('Account','How do I check my borrowing history?','Open My Activity to review loans, reservations, account standing, and any penalties associated with your own account.',220),
('Account','Why is my account suspended?','LIRA cannot infer a suspension reason. Contact the ACLC Library administrator to review your account status.',230);
