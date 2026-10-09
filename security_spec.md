# Security Specification & Threat Model

## Application Architecture
- **Application**: Thesis & Clinical Case Progress Tracker
- **Database**: Google Cloud Firestore & Express API
- **Authentication**: Google OAuth / Firebase Authentication & JWT session cookies

---

## Part 1: Data Invariants

1. **Identity & Ownership Invariant**:
   - Every patient case record MUST belong to a valid research group (`group_id`).
   - The creator and assigned investigator (`assigned_to`) MUST be the authenticated user (`request.auth.uid`).
   - The `assigned_to` and `group_id` fields are strictly immutable after creation.

2. **Group Access & Membership Invariant**:
   - A research study group is owned by `ownerId`.
   - Modifying group details or removing members is restricted to the group owner or verified platform administrator.
   - Group `ownerId` and creation timestamp are immutable.

3. **User Profile & Anti-Privilege Escalation Invariant**:
   - A user profile at `/users/{userId}` can only be read or created by the matching authenticated user (`userId == request.auth.uid`).
   - Users cannot grant themselves administrative privileges (`role == 'admin'` or `role == 'super_admin'`). The initial role on creation is locked to `'member'`.
   - Role modifications can only be performed by verified administrators.

4. **Zero-Trust Patient Case Isolation**:
   - Unauthenticated or cross-organization users MUST NOT read, query, create, or modify clinical records belonging to other investigators.
   - Blanket access (`allow read, write: if isSignedIn();`) is strictly forbidden.
   - `allow list` queries on cases MUST evaluate `resource.data.assigned_to == request.auth.uid` to prevent bulk scraping across studies.

5. **Terminal State Integrity**:
   - A case status is constrained to `['In Progress', 'Completed', 'Excluded']`.
   - Once a case is marked terminal (`Completed` or `Excluded`), regular non-administrative users cannot arbitrarily modify immutable clinical attributes.

---

## Part 2: The Dirty Dozen Payloads (Adversarial Test Vectors)

1. **Payload 1 (Identity Forgery on Profile Creation)**:
   - Target: `POST /users/victim-uid`
   - Data: `{ "id": "victim-uid", "role": "super_admin", "email": "victim@hospital.org" }`
   - Expected Result: `PERMISSION_DENIED` (User ID mismatch + self-assigned admin role forbidden).

2. **Payload 2 (Ghost Field Privilege Escalation)**:
   - Target: `PATCH /users/{my-uid}`
   - Data: `{ "role": "admin", "isAdmin": true, "isVerified": true }`
   - Expected Result: `PERMISSION_DENIED` (Affected keys whitelist rejection).

3. **Payload 3 (Arbitrary Case Creation in Foreign Group)**:
   - Target: `POST /cases/case-999`
   - Data: `{ "group_id": "foreign-group-456", "assigned_to": "other-doctor-789", "patient_id": "PT-001" }`
   - Expected Result: `PERMISSION_DENIED` (assigned_to != request.auth.uid).

4. **Payload 4 (Orphaned Write / Empty Group ID)**:
   - Target: `POST /cases/case-invalid`
   - Data: `{ "group_id": "", "assigned_to": "my-uid", "patient_id": "PT-001" }`
   - Expected Result: `PERMISSION_DENIED` (group_id validation size > 0 failed).

5. **Payload 5 (Cross-Tenant Case Modification)**:
   - Target: `PATCH /cases/other-user-case`
   - Data: `{ "status": "Excluded", "patient_name": "Tampered Name" }`
   - Expected Result: `PERMISSION_DENIED` (Caller is neither assigned researcher nor group owner nor admin).

6. **Payload 6 (Immutability Violation / Reassigning Case Ownership)**:
   - Target: `PATCH /cases/my-case`
   - Data: `{ "assigned_to": "someone-else-uid", "group_id": "another-group" }`
   - Expected Result: `PERMISSION_DENIED` (Immutable ownership attributes cannot be modified).

7. **Payload 7 (Denial of Wallet - Oversized Junk Document ID)**:
   - Target: `POST /cases/` + `'A'.repeat(5000)`
   - Data: `{ ... }`
   - Expected Result: `PERMISSION_DENIED` (isValidId regex & size <= 128 violation).

8. **Payload 8 (Bulk List Query Scraping Across Other Groups)**:
   - Target: `GET /cases` (Unconstrained query without assigned_to filter)
   - Expected Result: `PERMISSION_DENIED` (allow list requires resource.data.assigned_to == request.auth.uid).

9. **Payload 9 (Unauthorized Invitation Minting)**:
   - Target: `POST /groups/{group-id}/invitations/fake-invite`
   - Data: `{ "code": "HACK123", "group_id": "group-id" }`
   - Expected Result: `PERMISSION_DENIED` (Caller is not group owner or admin).

10. **Payload 10 (Unauthorized Group Ownership Theft)**:
    - Target: `PATCH /groups/{target-group}`
    - Data: `{ "ownerId": "attacker-uid" }`
    - Expected Result: `PERMISSION_DENIED` (Group ownerId is immutable).

11. **Payload 11 (Audit Log Tampering)**:
    - Target: `POST /admin_audit_logs/tamper-log`
    - Data: `{ "action": "ERASE_EVIDENCE" }`
    - Expected Result: `PERMISSION_DENIED` (Admin-only restricted collection).

12. **Payload 12 (Admin Claim Spoofing via Unverified Token Claim)**:
    - Target: `GET /admin_settings/config` with JWT claim `role: 'admin'` without verified email
    - Expected Result: `PERMISSION_DENIED` (Claims ignored; verified email or database admin document lookup required).
