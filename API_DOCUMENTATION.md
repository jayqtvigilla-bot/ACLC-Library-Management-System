# API Documentation

Local base URL: `http://HOST:3001/api` (default server port). In production, use the HTTPS Render API URL followed by `/api`.

Authentication is Bearer JWT.

Main routes:

- `POST /auth/register`
- `POST /auth/verify-otp` — verifies a six-digit code for local/development registration; verified applications enter the administrator review queue
- `POST /auth/resend-otp` — sends a replacement code for OTP-based registrations (one request per minute)
- `POST /auth/complete-registration` — completes Firebase-link registration after the applicant verifies their email
- `POST /auth/resend-verification` — sends a replacement Firebase email-verification link (one request per minute)
- `POST /auth/forgot-password` — sends a Firebase Authentication password-reset link when Firebase and Gmail are configured
- `GET /lira/faqs` — student-only published FAQ list
- `GET /lira/status` — signed-in user's LIRA mode (`ai` when a server-side OpenAI key is configured, otherwise `library`)
- `GET /lira/history`, `DELETE /lira/history`, and `POST /lira/chat` — signed-in user's private LIRA conversation and assistant
- `GET /admin/lira/faqs`, `POST /admin/lira/faqs`, `PUT /admin/lira/faqs/:id`, `DELETE /admin/lira/faqs/:id` — administrator-only student FAQ management
- `POST /auth/verify-email/:token` — legacy local email-verification flow
- `POST /auth/login`
- `GET /me`
- `PUT /me` — update the signed-in user's editable profile fields (name and role-specific profile details)
- `POST /me/password` — change password after validating the current password (new password must be at least 10 characters)
- `POST /admin/users/:id/approval`
- `GET /admin/users/pending`
- `GET /admin/users?archived=true&role=student` — administrator account directory filters (default view excludes archived accounts)
- `POST /admin/users/:id/archive` — administrator only; disables sign-in and QR access while retaining library history
- `POST /admin/users/:id/restore` — administrator only; restores the prior account status and issues a fresh QR credential for approved users
- `DELETE /admin/users/:id` — administrator only; requires the account to be archived first and anonymizes personal data while retaining library/audit history
- `GET /credentials/qr`
- `POST /credentials/disable-replace`
- `POST /admin/credentials/:id/exception-replace`
- `GET /books`
- `POST /books`
- `POST /reservations`
- `POST /loans/checkout`
- `POST /loans/return`
- `POST /gates/authorize`
- `POST /gates/passage`
- `GET /dashboard/admin`
- `GET /dashboard/librarian`
- `GET /users/:id/history`
- `GET /my/history`
- `GET /notifications`
- `POST /notifications/devices`

Gmail email delivery uses `GMAIL_USER` and `GMAIL_APP_PASSWORD` in the server environment. Use a Google App Password, not the account's regular password. The API checks the SMTP connection on startup and `/api/health` reports `emailConfigured` and `emailTransportReady`. With Firebase Admin/Auth and Gmail configured, registration sends a verification link; after verification and confirmation in the app, the applicant enters the administrator review queue. Approval and decline decisions are emailed. In local development without Firebase, OTP registration remains available. Never commit real credentials.

Applicant flow with Firebase configured: submit role-specific details → follow the verification link in email → confirm verification in the app → enter the pending-approval queue → administrator approves or declines → applicant receives the decision email. Approval enables sign-in and issues the digital ID and QR credential. Declined applicants cannot sign in and may submit a new registration.

Registration requires a full name and school email. Student applicants must provide a student ID and program; teacher and librarian applicants must provide an employee ID and department. Public role availability is controlled by administrator registration settings, and administrator registration is never public.

LIRA chat history is scoped to the authenticated account. Only students can read the student FAQ endpoint; teachers, librarians, and administrators receive role-specific LIRA prompts without the student FAQ list. Account questions are answered from the signed-in user's own records. `POST /lira/chat` accepts `{ "message": "..." }` (maximum 500 characters), returns `answer`, `source`, and `created_at`, and is limited to 20 messages per user per minute. Source values are `ai`, `account`, `catalog`, `faq`, or `library`. Optional OpenAI Responses API answers require `OPENAI_API_KEY` configured in the backend `.env`; `LIRA_AI_MODEL` can override the default model. Keep the key on the server and never put it in Flutter code or a mobile build define. Without a key or when the provider is unavailable, LIRA uses the local FAQ, catalog, and account-data fallback. The AI request receives the question and published FAQ guidance, not the user's retrieved account records. The app shows whether AI is configured and labels the source of each new answer.
