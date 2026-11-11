# Hardware Integration

Gate identifiers:

- `GATE-ENTRY`
- `GATE-EXIT`

The current repository contains the server-side authorization and passage API, but no ESP32 firmware or physical device integration. Until the hardware is installed and commissioned, treat the gate workflow as unverified and simulated by API tests only.

For a commissioned ESP32, scan the JSON personal credential QR and send it to `/api/gates/authorize` using a staff-authorized workflow. The backend checks the current SQLite credential/account state and returns a nonce valid for 15 seconds. The device then sends that nonce to `/api/gates/passage` over HTTPS with the `X-Gate-Token` secret and `sensor_confirmed: true`, `movement_complete: true`, only after its scanner, passage sensor, and encoder confirm the action. The API rejects missing/incorrect device authentication, expired or replayed nonces, and passage events without both completion flags. Configure the token only in the backend and protected device storage; never embed it in the mobile app or dashboard.

Required safety design:

- Maintain a mechanical/manual emergency release.
- Emergency release must work with no network or power to the controller.
- Use a commercially rated gate actuator for full-size gates; do not use a hobby motor.
- Add passage sensors and debounce logic.
- Acknowledge only actual sensor-confirmed passage.
- Place relays behind protective enclosures and use an appropriate power supply.

Physical validation is required for authorization timing, lock timing, sensor behavior, fail-safe operation, and emergency release. No physical hardware has been claimed as tested.

The API test suite uses a temporary database and a test-only device token to simulate the nonce/passage handshake. That verifies software behavior only. It does not verify motor movement, encoder feedback, scanner direction, network outage behavior, or safe human egress. Do not describe the turnstile as production-ready until those tests are completed on the real mechanism.
