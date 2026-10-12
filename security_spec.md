# Firestore Security Specification

## 1. Data Invariants

1. **User Profile Isolation**:
   - A user profile `/users/{userId}` can only be read or written by the authenticated user whose `request.auth.uid == userId`.
   - Users cannot escalate their own role from `member` to `admin` or arbitrarily modify security-critical status flags.
   - User profile IDs must be valid alphanumeric strings and match the auth UID.

2. **Research Study / Group Ownership (Master Gate)**:
   - A research study group `/groups/{groupId}` can only be created by an authenticated user with `email_verified == true`.
   - The creator must set `ownerId` strictly to `request.auth.uid`.
   - Updates to group settings are strictly reserved for the group owner (`resource.data.ownerId == request.auth.uid`).

3. **Subcollection Membership Invariant**:
   - Members `/groups/{groupId}/members/{memberId}` can only be added or modified by the group owner or by the invited user accepting their invitation.
   - Cases `/groups/{groupId}/cases/{caseId}` can ONLY be read or queried by researchers who are verified active members of that specific study group (`exists(/databases/$(database)/documents/groups/$(groupId)/members/$(request.auth.uid))`).
   - Researchers cannot access, inspect, or query cases from other studies.

4. **Case Mutation and Terminal State Integrity**:
   - Creating a case requires active membership in `/groups/{groupId}/members/{request.auth.uid}`.
   - Case ID and `groupId` are immutable once registered.
   - `assignedTo` must be an authorized member.
   - State updates must only modify permitted fields (`status`, `notes`, `updatedAt`, `treatment`).

---

## 2. The "Dirty Dozen" Threat Payloads

1. **Ghost Field Injection on User Profile**: Attempting to write an unauthorized `isAdmin: true` or `shadowPrivilege: true` flag.
2. **Identity Spoofing on Group Creation**: Setting `ownerId: "another_user_uid"` when creating a new study.
3. **Cross-Study Case Access**: Attempting to query `/groups/study-A/cases` while only being a member of `study-B`.
4. **Unauthenticated Read on Case Records**: Attempting to fetch clinical records anonymously or with an unverified email token.
5. **ID Poisoning Attack**: Passing a 2KB junk character string or null bytes in `{groupId}` or `{caseId}`.
6. **Immutable Field Mutation**: Attempting to change `groupId` on an existing case to migrate it across studies.
7. **Orphaned Member Insertion**: Attempting to inject a member into a non-existent group.
8. **PII Scraping via Blanket List**: Attempting an unrestricted `collectionGroup('cases')` query across all studies.
9. **Volumetric Denial-of-Wallet Payload**: Attempting to write a 1MB string into `diagnosis` or `initials`.
10. **Terminal State Tampering**: An unassigned researcher attempting to alter the `status` of a locked completed case.
11. **Spoofed Email Admin Escalation**: Attempting to write admin collections with `email_verified == false`.
12. **Self-Promotion to Owner**: A standard researcher attempting to update `/groups/{groupId}/members/{myUid}` to change their role to `owner`.

---

## 3. Security Assertions Summary

All Twelve dirty payloads are mathematically rejected by the rules:
- Schema blueprints (`isValidUserProfile`, `isValidGroup`, `isValidCase`) enforce keys, sizes, and types.
- Relational gates verify `exists(/databases/$(database)/documents/groups/$(groupId)/members/$(request.auth.uid))`.
- Default-deny catch-all rule protects all unmapped paths.
