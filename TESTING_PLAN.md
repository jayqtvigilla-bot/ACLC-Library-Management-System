# Testing Plan

Automated:

- API health
- Registration, verification, approval, login, and QR issuance
- Flutter static analysis
- React production build

Run:

`npm test`

`cd mobile_app && flutter analyze`

`cd web-dashboard && npm run build`

Manual acceptance must cover:

- Login and registration by Android device
- Email delivery and administrator approval
- Mobile/printed personal QR rejection after disable/replacement
- Gate authorization expiry and nonce replay
- Entry/exit sensor-confirmed passage
- Three-book and configurable teacher limits
- Reservation conflicts
- Checkouts, returns, damages, penalties, and payments
- Standing restriction and one-month recovery policy
- Notifications with lock-screen privacy
- Role permission boundaries and audit records
- Emergency gate release and power failure
