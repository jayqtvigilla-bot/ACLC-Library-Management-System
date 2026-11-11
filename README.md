# ACLC Smart Library Access and Management System

## Quick start

Requirements: Node.js 24+, Flutter stable, Android SDK, and an Android phone.

1. Copy `.env.example` to `.env` and change `JWT_SECRET` and `ADMIN_PASSWORD`.
2. Start the API:
   `npm install && npm start`
3. Start the dashboard:
   `cd web-dashboard && npm install && npm run dev`
4. For local phone testing over Wi-Fi, build and install a **debug** APK:
   `cd mobile_app`
   `flutter pub get`
   `flutter build apk --debug --dart-define=API_BASE_URL=http://<COMPUTER-LAN-IP>:3001/api`
   `adb install -r build/app/outputs/flutter-apk/app-debug.apk`

For a physical phone on local Wi-Fi, replace `<COMPUTER-LAN-IP>` with the computer's LAN IP and keep both devices on the same Wi-Fi network. `127.0.0.1` is the phone itself, not the computer.

For USB testing, start the API on the computer and run `adb reverse tcp:3001 tcp:3001`. Then build the debug APK with `--dart-define=API_BASE_URL=http://127.0.0.1:3001/api`. Debug builds allow HTTP for local testing; release builds require HTTPS.

Release APKs must be signed with a private upload key. Create a keystore and save it under `mobile_app/android/app/upload-keystore.jks` (keep it private and backed up). Create `mobile_app/android/key.properties` with:

```properties
storePassword=YOUR_KEYSTORE_PASSWORD
keyPassword=YOUR_KEY_PASSWORD
keyAlias=upload
storeFile=upload-keystore.jks
```

`key.properties` and keystore files are excluded from Git. Configure them before running the release build below; never distribute or commit the passwords or key.

Backend health: `http://localhost:3001/api/health`

Dashboard: `http://localhost:5173`

### Firebase and administrator setup

The Android `google-services.json` connects the app to Firebase as a client. It does not grant permission to create administrators or manage other users. The server uses a private Firebase Admin service account for those operations.

1. In Firebase Console, select the **ACLC LIBRARY CAPSTONE** project. Under **Authentication > Sign-in method**, enable **Email/Password**. Create the Firestore database if it is not enabled.
2. Open **Project settings > Service accounts > Firebase Admin SDK > Generate new private key**. Save the downloaded JSON outside this repository. Never put that file in the Flutter app, dashboard, or Git.
3. In the project root `.env`, set `FIREBASE_PROJECT_ID=aclc-library-capstone`, `FIREBASE_WEB_API_KEY` to the Firebase web app API key, `GOOGLE_APPLICATION_CREDENTIALS` to the full path of that private JSON file, and `FIREBASE_ACCOUNT_SYNC_REQUIRED=true`. For Render, put the JSON contents in the secret `FIREBASE_SERVICE_ACCOUNT_JSON` and set the project ID, web API key, and sync-required flag there.
4. Set `ADMIN_EMAIL` and a new strong `ADMIN_PASSWORD` in the same server environment. Restart the API. At startup it creates the approved administrator in SQLite and synchronizes that exact account to Firebase Authentication and the `users/{uid}` Firestore document. If the Auth user already exists, its Firebase password is preserved; dashboard sign-in uses `ADMIN_PASSWORD`. Sign into the library dashboard with these values. Do not manually create an Auth user in the console as a substitute: that user will not have the library administrator role or database profile.
5. Configure `GMAIL_USER` and `GMAIL_APP_PASSWORD` in the server environment with a Google App Password if applicants should receive Firebase email-verification links and users should receive password-reset links. Never put the App Password in this repository, Flutter, or a chat message. On startup, the API verifies the Gmail SMTP connection and logs whether the check succeeded. `/api/health` reports both `emailConfigured` and `emailTransportReady`; email setup is required for email workflows, but does not stop the API health check from passing.

#### Link existing Firebase Auth users to legacy SQLite accounts

Firebase Console can show a user UID while the same email's SQLite library record still has no `firebase_uid`. Those are separate records. Do not paste a UID into the password field, create Firestore data manually as a substitute, or allow a mobile client to assign a role. After revoking any exposed service-account key, place a fresh Firebase Admin JSON file outside this repository. Set `FIREBASE_LINK_CREDENTIALS_FILE` to that fresh file path for this one-time utility; it intentionally ignores `GOOGLE_APPLICATION_CREDENTIALS` so an old configured key is not picked up.

Run a preview first:

```powershell
$env:FIREBASE_LINK_CREDENTIALS_FILE = 'C:\secure\fresh-firebase-admin.json'
npm run firebase:link-users
```

Review the candidate roles and any conflicts. The utility only matches exact verified email addresses, does not create Firebase users, preserves passwords, and refuses to link an account when the configured `ADMIN_EMAIL` belongs to a non-administrator SQLite role. It mirrors the SQLite role/status to Firestore and aligns Firebase disabled state only when explicitly applied. Apply only after the preview is correct:

```powershell
npm run firebase:link-users -- --apply
```

It skips unverified or missing Firebase accounts, checks for duplicate UID links, and is safe to rerun after a partial external failure. Never use a service-account key that was pasted into chat; revoke it first and use a newly generated key stored outside the project. Confirm the administrator email and role before applying if the preview reports a mismatch.

With `FIREBASE_ACCOUNT_SYNC_REQUIRED=true`, account registration, approval/status changes, profile/password changes, account creation, archive, restore, and removal fail closed if Firebase Auth and Firestore are not both reachable or the account has no Firebase UID. This prevents an account operation from silently changing SQLite alone. After signing into the dashboard, open **Users & approvals** to review pending applications, manage accounts by role, or create an approved account. Account identity records are kept in Firebase Authentication, Firestore, and SQLite; library circulation and catalog records remain in SQLite.

To find the Firestore document ID, open **Authentication > Users**, select the user, and copy **User UID**. The account profile belongs at **Firestore Database > `users` > document ID equal to that UID**. The server bootstrap above creates/updates this document with `role: "administrator"` and `status: "approved"`; creating the document manually alone does not grant administrator access to the API, which also requires the matching approved SQLite account.

The Firebase client project and mobile package must match the Android registration in Firebase Console. This app is configured for project `aclc-library-capstone` and Android package `ACLC.COM`.

### Administrator accounts and user actions

The API base is `http://localhost:3001/api`; check `http://localhost:3001/api/health` if the dashboard cannot connect. For local phone testing over USB, use `adb reverse tcp:3001 tcp:3001`, then build with `--dart-define=API_BASE_URL=http://127.0.0.1:3001/api` as shown above. This loopback address works on the phone only with the USB reverse tunnel active.

For hosted production, set the same administrator credentials in Render's environment settings. Do not commit `.env` or a Firebase service-account key. The API origin is the Render service URL, not the Firebase Hosting URL.

In development, the dashboard uses `http://localhost:3001` by default. Production dashboard builds must set `VITE_API_URL` to the API origin (for example, `https://your-api.onrender.com`) before building. The Android app requires an explicit `API_BASE_URL`; builds without it show a configuration error instead of trying to reach the phone's own loopback address.

## Deploy for access from anywhere

Firebase Hosting serves the web dashboard; it does not run this Node.js API. The mobile app needs a separate, publicly reachable API. The Firebase Hosting domains currently do not serve `/api/health`.

This repository includes a Render Blueprint in `render.yaml`. Push the project to a Git repository, then create a Render Blueprint from it. The Blueprint uses a paid Starter web service and a persistent disk for the SQLite database. SQLite is intended for this single service instance; do not scale it to multiple instances. Render hosts the API independently of your computer; the computer is not the production server.

Before creating the Render service:

1. Revoke any Gmail App Password that has been shared or exposed, create a replacement in Google Account security, and enter it only into Render's `GMAIL_APP_PASSWORD` secret field. Set `GMAIL_USER` to the matching Gmail account. Never commit either value or add them to the Flutter app.
2. Push this existing project to a Git repository you control, then create the Render service from its Blueprint. Keep the included persistent disk mounted at `/var/data`; the database path is `/var/data/aclc_library.sqlite`. Do not deploy the SQLite database by committing it to Git.
3. Before directing users to the new service, make and verify a private backup of the existing local database and plan its one-time transfer to the Render disk. A new Render disk does not copy `aclc_library.sqlite` from your computer automatically. Do not start production use until you have confirmed the intended records are present on the Render disk.
4. In Render, set `ADMIN_EMAIL` and a strong `ADMIN_PASSWORD`. The server creates the initial administrator when both are configured.
5. Set `GMAIL_USER` and `GMAIL_APP_PASSWORD` to enable registration and account emails. The server checks its SMTP connection on startup and `/api/health` reports the result separately from API readiness.
6. Set `FIREBASE_ACCOUNT_SYNC_REQUIRED=true`, `FIREBASE_PROJECT_ID=aclc-library-capstone`, `FIREBASE_WEB_API_KEY`, and the Firebase Admin service-account secret (`FIREBASE_SERVICE_ACCOUNT_JSON`) in Render. The Blueprint requires Firebase synchronization; do not turn this off for production.
7. If connecting the ESP32 gate, configure a long random `GATE_DEVICE_TOKEN` in Render and the device's protected configuration. Do not put this token in the mobile app.
8. To enable LIRA's optional AI answers, set `OPENAI_API_KEY` in Render. Keep it server-side; without it, LIRA uses the existing local fallback.
9. Wait until Render reports the service healthy, then check `https://<RENDER-SERVICE>.onrender.com/api/health`. Replace the placeholder with the actual Render service URL. `"ok": true` confirms API readiness; inspect `checks.emailTransportReady` separately to confirm Gmail SMTP, and `checks.firebaseAdminConfigured` for Firebase Admin initialization.
10. Only after the API is deployed, the Render URL is confirmed, and database records are verified, configure and build the Android app:

   `cd mobile_app`
   `flutter pub get`
   `flutter build apk --release --dart-define=API_BASE_URL=https://<RENDER-SERVICE>.onrender.com/api`

The release requires the private Android signing setup described in Quick start. Keep the upload key backed up securely. This build-time API URL makes the app connect directly to Render; no USB forwarding or laptop server is required. Do not build the production app with a guessed URL or with the Firebase Hosting URL.

11. To point the Firebase-hosted dashboard at the same API, build it with `VITE_API_URL` set to the Render origin (without `/api`), then deploy the resulting `web-dashboard/dist` directory to Firebase Hosting:

   PowerShell:
   `$env:VITE_API_URL = 'https://<RENDER-SERVICE>.onrender.com'`
   `npm run build`

The Render API URL is not the Firebase website URL. Rebuild the Android APK whenever its API URL changes. A public API URL and an always-on server are required for use away from the local Wi-Fi network. `aclc.library.com` must be a domain you control and must be verified/configured in Firebase Hosting with the DNS records Firebase provides; it cannot be created by renaming the default Firebase URL.

## Implemented in this increment

- SQLite database with migrations and foreign keys
- JWT authentication, role authorization, email verification state, and administrator approval
- Digital IDs and cryptographically random personal QR credentials
- One-time self-service QR replacement and administrator exception replacement
- Book catalog and copy inventory
- Reservations and borrowing limits
- Checkout, return, and return-condition inspection
- User records and statistics APIs
- Gate status and short-lived gate authorization/replay protection
- Mobile Student dashboard and React Admin/Librarian dashboard
- Android release APK
- Notification history and device-token registration APIs

Hardware firmware and physical gate validation remain until the real components and emergency procedures are available.
