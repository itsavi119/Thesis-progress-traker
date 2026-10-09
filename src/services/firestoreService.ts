import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  onSnapshot,
} from 'firebase/firestore';
import { db } from '../firebase/config.js';
import type { CaseRecord, ResearchGroup, UserProfile } from '../types/index.js';

export function normalizePatientId(rawId: string): string {
  if (!rawId) return '';
  return rawId
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
}

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
    const userRef = doc(db, 'users', user.uid);
    const snap = await getDoc(userRef);

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
      await updateDoc(userRef, {
        display_name: updatedProfile.display_name,
        email: updatedProfile.email,
        updated_at: now,
        ...(user.photoURL ? { photo_url: user.photoURL } : {}),
      });
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

    await setDoc(userRef, {
      ...newProfile,
      ...(user.photoURL ? { photo_url: user.photoURL } : {}),
    });

    return newProfile;
  },

  // --- RESEARCH GROUPS ---
  async syncGroup(group: ResearchGroup): Promise<void> {
    try {
      const groupRef = doc(db, 'groups', group.id);
      await setDoc(groupRef, group, { merge: true });
    } catch (err: any) {
      console.warn('Firestore syncGroup notice:', err?.message);
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
        console.warn('Firestore cases subscription notice:', error.message);
      }
    );
  },

  async syncCase(caseRecord: CaseRecord): Promise<void> {
    try {
      const caseRef = doc(db, 'cases', caseRecord.id);
      await setDoc(caseRef, caseRecord, { merge: true });
    } catch (err: any) {
      console.warn('Firestore syncCase notice:', err?.message);
    }
  },

  async deleteCase(caseId: string): Promise<void> {
    try {
      const caseRef = doc(db, 'cases', caseId);
      await deleteDoc(caseRef);
    } catch (err: any) {
      console.warn('Firestore deleteCase notice:', err?.message);
    }
  },
};
