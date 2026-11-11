# Database Design

Account lifecycle records are stored in `account_archives` and `account_archive_events`. Archiving suspends login and revokes active QR credentials without removing a user row or any linked circulation, penalty, payment, or audit history. A final administrator cannot be archived or suspended. Administrator deletion is a separate, confirmed anonymization action permitted only after archiving; it replaces personal identity fields and revokes credentials while keeping transaction history linked to the anonymized account.

Core tables implement the requested entities:

`users`, `student_profiles`, `staff_profiles`, `user_credentials`, `credential_events`,
`books`, `book_copies`, `reservations`, `loans`, `loan_items`, `access_logs`,
`passage_events`, `condition_inspections`, `damage_reports`, `penalties`, `payments`,
`user_records`, `standing_history`, `notifications`, `notification_devices`, `gates`,
`hardware_events`, `audit_logs`, and `system_settings`.

The migration uses foreign keys and status constraints. Transactions protect approval, credential replacement, checkout, return, and passage recording workflows.

Production PostgreSQL/MySQL migration must preserve all constraints and add server-generated timestamps, soft-delete policy, and backup encryption.

## LIRA assistant

Migration `005_lira_assistant.sql` adds `lira_faqs` for administrator-managed student FAQ content and `lira_chat_messages` for per-user private conversation history. FAQ reads are student-only; chat reads, sends, and deletion are scoped to the authenticated user. LIRA's own-account replies query only the current user's library records. Optional AI provider calls do not include retrieved account records.
