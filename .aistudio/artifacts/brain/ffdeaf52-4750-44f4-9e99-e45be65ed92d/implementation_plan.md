# Detach Firebase Auth & Switch to Native Authentication

Remove Firebase Authentication and Firestore client connections to eliminate domain restriction notices and popup blockers, switching to the application's built-in server authentication and relational storage.

## User Review & Critical Decisions

> [!IMPORTANT]
> The following choices were confirmed in the interactive interview:
> - **Authentication Method**: Rely exclusively on built-in email, password, and instant 1-click workspace access. Remove external Firebase Google popups.
> - **Database Strategy**: Detach Firestore client sync completely; use the existing built-in high-performance relational backend store (`data/thesis_tracker_db.json`) for all cases, files, milestones, and studies.
> - **Future Firebase Project**: Leaves a clean configuration interface so a new Firebase Console project can be connected whenever ready.

---

## 1. Overview & Core Concept

- **What It Does**: Fully decouples the application from external Firebase Authentication and Firestore cloud APIs. All authentication (sign-in, account creation, password reset, session validation) and data operations (cases, studies, collaborators, files) run directly through the full-stack Node/Express server and client API layer.
- **Target Audience**: Research teams, study investigators, and thesis students accessing the app across cloud preview iframes, internal hospital networks, and mobile browsers without requiring third-party domain allowlists or popup permissions.
- **Key Value**: Zero authentication errors (`auth/unauthorized-domain`, popup blocked, or CORS rejections), instant 1-click investigator access, and consistent offline-ready data persistence.

---

## 2. User Experience & Visual Design

- **Simplified Sign-In Screen**:
  - Removes the external Google Sign-In button that previously triggered domain authorization notices.
  - Highlights clean, responsive Email & Password sign-in with password visibility toggle and "Remember Me" option.
  - Prominently features **Quick Workspace Access** with 1-click instant login buttons for **Nikhil (Lead Investigator)** and **Anil Shah (Admin)**.
  - Keeps the **Create Account** and **Forgot Password** workflows operational through local server validation.
- **Notification & Notice Banner**:
  - Eliminates Firebase error codes from login failure banners.
  - Standardizes alert feedback with clear messages and dismiss buttons (`✕`).
- **Workspace Navigation**:
  - Authenticated sessions use secure HTTP-only cookies and Bearer tokens seamlessly across all tabs (Dashboard, Add Case, All Cases, My Cases, Study Files, Team Summary).

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Native Server-Side Authentication vs. External OAuth**
  - *Chosen Approach*: Use the server's existing JWT-based auth and bcrypt-hashed password system.
  - *Why*: Eliminates all `auth/unauthorized-domain` and popup restriction errors in Cloud Run and preview environments.
  - *Alternatives Considered*: Retaining Firebase Google Auth was rejected because it requires continuous manual domain whitelisting in the Firebase Console for each preview URL.

- **Decision 2: Complete Firestore Detachment**
  - *Chosen Approach*: Toggle off live Firestore listeners and boot connection probes; rely on the Express server's file-backed relational store.
  - *Why*: Prevents network offline errors and permission conflicts while preparing for a fresh Firebase project creation.

---

## 4. Technical Architecture & Data Strategy

```
┌─────────────────────────────────────────────────────────────┐
│                       Client Browser                        │
│                                                             │
│   ┌─────────────────────┐       ┌───────────────────────┐   │
│   │      Login.tsx      │       │      Workspace UI     │   │
│   │ (Email/Pass + 1-Tap)│       │  (Cases/Files/Team)   │   │
│   └──────────┬──────────┘       └───────────┬───────────┘   │
│              │                              │               │
│              ▼                              ▼               │
│   ┌─────────────────────────────────────────────────────┐   │
│   │       AuthContext & GroupContext (Client State)     │   │
│   └──────────────────────────┬──────────────────────────┘   │
└──────────────────────────────┼──────────────────────────────┘
                               │ HTTP / JSON API
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                    Full-Stack Express Server                │
│                                                             │
│   ┌─────────────────────────────────────────────────────┐   │
│   │   Auth Controller (/api/auth/login, /register, /me) │   │
│   └──────────────────────────┬──────────────────────────┘   │
│                              ▼                              │
│   ┌─────────────────────────────────────────────────────┐   │
│   │       Relational In-Memory + JSON Database Engine   │   │
│   │            (data/thesis_tracker_db.json)            │   │
│   └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### Planned Code Adjustments:
1. **`src/firebase/config.ts`**:
   - Neutralize Firebase client initialization; set `isFirebaseConfigured = false`.
   - Remove background `getDocFromServer(doc(db, 'test', 'connection'))` boot probe so no network errors occur.
2. **`src/context/AuthContext.tsx`**:
   - Streamline `signInWithGoogle` to cleanly guide users or perform instant investigator login.
   - Ensure `onAuthStateChanged` gracefully defers to the server session via `api.getMe()`.
   - Route `signInWithEmail` and `signUpWithEmail` directly to `api.login` and `api.register`.
3. **`src/pages/Login.tsx`**:
   - Update layout to remove the external Google button and OR divider.
   - Focus the view on Email/Password fields and the 1-click **Quick Workspace Access** panel (Nikhil & Anil).
4. **Verification**:
   - Run compilation and TypeScript validation to guarantee zero regression before finalizing.
