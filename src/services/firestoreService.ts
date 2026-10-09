import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocFromServer,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  onSnapshot,
} from 'firebase/firestore';
import { db, auth } from '../firebase/config.js';
import type { CaseRecord, ResearchGroup, UserProfile } from '../types/index.js';

export function normalizePatientId(rawId: string): string {
  if (!rawId) return '';
  return rawId
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Connection test on boot per Firebase skill guidelines
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn('Firebase client offline check notice:', error.message);
    }
  }
}
testConnection();

export interface FirestoreCaseDoc {
  id: string;
  group_id: string;
  patient_id: string;
  normalized_patient_id: string;
  assigned_to: string;
  assigned_name: string;
  assigned_email?: string;
  patient_name?: string;
  diagnosis?: string;
  drug_names?: string;
  status: 'In Progress' | 'Completed' | 'Excluded';
  registered_at: string;
  updated_at: string;
}

export interface FirestoreUserDoc {
  id: string;
  email: string;
  display_name: string;
  role: 'member';
  photo_url?: string;
  created_at: string;
  updated_at: string;
}

export const firestoreService = {
  // --- USER PROFILES (Open multi-tenant Google / email sign-in) ---
  async syncUserProfile(user: {
    uid: string;
    email: string | null;
    displayName: string | null;
    photoURL?: string | null;
  }): Promise<UserProfile> {
    const userPath = `users/${user.uid}`;
    const userRef = doc(db, 'users', user.uid);
    let snap;
    try {
      snap = await getDoc(userRef);
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, userPath);
    }

    const now = new Date().toISOString();
    if (snap.exists()) {
      const data = snap.data() as FirestoreUserDoc;
      const updatedProfile: UserProfile = {
        id: user.uid,
        email: user.email || data.email,
        display_name: user.displayName || data.display_name || 'Researcher',
        role: 'member',
        created_at: data.created_at || now,
        updated_at: now,
      };
      try {
        await updateDoc(userRef, {
          display_name: updatedProfile.display_name,
          email: updatedProfile.email,
          updated_at: now,
          ...(user.photoURL ? { photo_url: user.photoURL } : {}),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, userPath);
      }
      return updatedProfile;
    }

    const newProfile: UserProfile = {
      id: user.uid,
      email: user.email || 'researcher@hospital.org',
      display_name: user.displayName || 'Research Team Member',
      role: 'member',
      created_at: now,
      updated_at: now,
    };

    try {
      await setDoc(userRef, {
        ...newProfile,
        ...(user.photoURL ? { photo_url: user.photoURL } : {}),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, userPath);
    }

    return newProfile;
  },

  // --- RESEARCH GROUPS ---
  async syncGroup(group: ResearchGroup): Promise<void> {
    const groupPath = `groups/${group.id}`;
    try {
      const groupRef = doc(db, 'groups', group.id);
      await setDoc(groupRef, group, { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, groupPath);
    }
  },

  // --- GROUP-SCOPED CASES ---
  subscribeToGroupCases(
    groupId: string,
    callback: (cases: CaseRecord[]) => void
  ): () => void {
    const casesCol = collection(db, 'cases');
    const q = query(
      casesCol,
      where('group_id', '==', groupId),
      orderBy('registered_at', 'desc')
    );

    return onSnapshot(
      q,
      (snapshot) => {
        const cases = snapshot.docs.map((d) => d.data() as CaseRecord);
        callback(cases);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'cases');
      }
    );
  },

  async syncCase(caseRecord: CaseRecord): Promise<void> {
    const casePath = `cases/${caseRecord.id}`;
    try {
      const caseRef = doc(db, 'cases', caseRecord.id);
      await setDoc(caseRef, caseRecord, { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, casePath);
    }
  },

  async deleteCase(caseId: string): Promise<void> {
    const casePath = `cases/${caseId}`;
    try {
      const caseRef = doc(db, 'cases', caseId);
      await deleteDoc(caseRef);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, casePath);
    }
  },
};
