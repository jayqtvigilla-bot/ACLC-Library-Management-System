# System Architecture

- Flutter Android application: student and teacher mobile workflows.
- React/Vite dashboard: administrator and librarian workflows.
- Node.js/Express API: authentication, authorization, business rules, QR issuance, gates, reports, and audit.
- SQLite: development database with foreign keys and migrations.
- Firebase Authentication and Firestore: when configured on the API server, registrations create an unverified Firebase Auth account, email a Firebase verification action link, then sync the verified profile to Firestore and SQLite in `pending_approval` state. Firebase password reset links update Firebase credentials; API sign-in verifies against Firebase before issuing a library session.
- The initial administrator is bootstrapped from `ADMIN_EMAIL` and `ADMIN_PASSWORD`; with Firebase Admin credentials configured, startup also creates or synchronizes that administrator in Firebase Authentication and Firestore. Administrators can create approved student, teacher, and librarian accounts from **Users & approvals**.
- ESP32: must call gate APIs through an allowlisted device credential and never unlock independently of the backend.

Critical state changes belong in the backend. Browser and mobile code only present workflows.

## Firebase account setup

Set `FIREBASE_PROJECT_ID` and `FIREBASE_WEB_API_KEY` on the API server. Provide a Firebase Admin service account through `GOOGLE_APPLICATION_CREDENTIALS` or the secret `FIREBASE_SERVICE_ACCOUNT_JSON`; grant the service account Firebase Authentication and Cloud Firestore access. Configure `GMAIL_USER` and `GMAIL_APP_PASSWORD` so the API can deliver generated Firebase verification and password reset links. Keep all service-account credentials on the server. Configure the Firebase email action templates and authorized domains in the same ACLC Firebase project. Without these settings, local development keeps the legacy OTP registration path; Firebase account sync and Firebase password reset are unavailable.

## Security boundaries

JWT tokens expire after 30 days and mobile tokens are stored using encrypted platform storage. Signing out deletes the saved mobile session. Passwords are bcrypt hashed. QR credentials are random base64url strings generated with Node cryptographic randomness. Approvals cannot assign administrator/librarian roles through public registration. Gate authorization is short-lived and single-use.
