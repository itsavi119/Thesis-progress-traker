import type {
  AuthResponse,
  CaseRecord,
  CaseStatus,
  CustomFieldDefinition,
  DashboardStats,
  DuplicateCheckResult,
  GroupInvitation,
  LegalPolicyDoc,
  ResearchFile,
  ResearchGroup,
  StudyType,
  SubjectTerminology,
  TeamSummaryResponse,
  UserProfile,
} from '../types/index.js';
import { offlineStorage } from './offlineStorage.js';

class ApiService {
  private activeGroupId: string | null = null;
  private currentUserId: string | null = null;
  private token: string | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      try {
        this.token = sessionStorage.getItem('thesis_tracker_session_token');
        this.activeGroupId = localStorage.getItem('thesis_tracker_active_group_id');
      } catch {}
    }
  }

  public setCurrentUserId(userId: string | null) {
    this.currentUserId = userId;
    if (userId) {
      offlineStorage.initializeUserSession(userId).catch(() => {});
    }
  }

  public getCurrentUserId(): string | null {
    return this.currentUserId;
  }

  public setToken(token?: string | null) {
    this.token = token || null;
    if (typeof window !== 'undefined') {
      try {
        if (token) {
          sessionStorage.setItem('thesis_tracker_session_token', token);
        } else {
          sessionStorage.removeItem('thesis_tracker_session_token');
        }
      } catch {}
    }
  }

  public getToken(): string | null {
    if (!this.token && typeof window !== 'undefined') {
      try {
        this.token = sessionStorage.getItem('thesis_tracker_session_token');
      } catch {}
    }
    return this.token;
  }

  public setActiveGroupId(groupId: string | null) {
    this.activeGroupId = groupId;
    if (typeof window !== 'undefined') {
      if (groupId) {
        localStorage.setItem('thesis_tracker_active_group_id', groupId);
      } else {
        localStorage.removeItem('thesis_tracker_active_group_id');
      }
    }
  }

  public getActiveGroupId(): string | null {
    if (!this.activeGroupId && typeof window !== 'undefined') {
      this.activeGroupId = localStorage.getItem('thesis_tracker_active_group_id');
    }
    return this.activeGroupId;
  }

  public async logout() {
    const uid = this.currentUserId;
    this.token = null;
    this.activeGroupId = null;
    this.currentUserId = null;

    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
      });
    } catch {}

    if (typeof window !== 'undefined') {
      try {
        sessionStorage.removeItem('thesis_tracker_session_token');
        localStorage.removeItem('thesis_tracker_active_group_id');
      } catch {}
    }

    if (uid) {
      offlineStorage.clearSession(uid).catch(() => {});
    }
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest', // CSRF defense header
      ...((options.headers as Record<string, string>) || {}),
    };

    const token = this.getToken();
    if (token && !headers['Authorization']) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const groupId = this.getActiveGroupId();
    if (groupId && !headers['X-Group-Id']) {
      headers['X-Group-Id'] = groupId;
    }

    const baseUrl = typeof window !== 'undefined' ? (((import.meta as any).env?.VITE_API_URL || '') as string).replace(/\/+$/, '') : '';
    const targetUrl = endpoint.startsWith('http') ? endpoint : `${baseUrl}${endpoint}`;

    const response = await fetch(targetUrl, {
      ...options,
      headers,
      credentials: 'include', // Transmits secure HttpOnly cookie automatically across all hosts/iframes
    });

    // Safely consume the response body stream exactly once to prevent "body stream already read"
    const rawText = await response.text();
    let data: any = null;
    const isHtml = !!(rawText && (rawText.trim().startsWith('<') || rawText.trim().startsWith('<!DOCTYPE')));

    if (!isHtml && rawText && rawText.trim()) {
      try {
        data = JSON.parse(rawText);
      } catch {
        data = null;
      }
    }

    if (!response.ok || isHtml) {
      if (isHtml) {
        const error = new Error('Static host environment: API endpoint not found.') as any;
        error.status = 404;
        error.code = 'STATIC_HOST_NO_API';
        throw error;
      }
      const fallbackText = rawText && rawText.trim() ? rawText.trim() : `Request failed with status ${response.status}`;
      const msg = (data && (data.message || data.error)) || fallbackText;
      const error = new Error(msg) as any;
      error.status = response.status;
      if (data && typeof data === 'object') {
        error.code = data.error;
        error.case = data.case;
      }
      throw error;
    }

    if (data !== null) {
      return data as T;
    }
    return (rawText as unknown) as T;
  }

  // --- LEGAL POLICIES (Public / Authenticated) ---

  public async getLegalPolicies(): Promise<{ policies: LegalPolicyDoc[] }> {
    try {
      return await this.request<{ policies: LegalPolicyDoc[] }>('/api/legal/policies');
    } catch {
      return {
        policies: [
          {
            id: 'privacy',
            title: 'Privacy Policy',
            category: 'privacy',
            content: 'Clinical research privacy policy ensuring research participant de-identification and data protection.',
            lastUpdated: new Date().toISOString(),
          },
          {
            id: 'terms',
            title: 'Terms of Use',
            category: 'terms',
            content: 'Research platform terms for academic and clinical research documentation.',
            lastUpdated: new Date().toISOString(),
          },
        ],
      };
    }
  }

  // --- AUTHENTICATION ---

  public async register(params: {
    email: string;
    password: string;
    displayName: string;
  }): Promise<AuthResponse> {
    try {
      const data = await this.request<AuthResponse>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(params),
      });
      this.setToken(data.token);
      this.setCurrentUserId(data.user.id);
      return data;
    } catch (err: any) {
      if (err?.code === 'STATIC_HOST_NO_API' || err?.status === 404 || err?.message?.includes('Static host')) {
        const localUser: UserProfile = {
          id: 'user-' + Date.now(),
          email: params.email.trim().toLowerCase(),
          display_name: params.displayName.trim() || params.email.split('@')[0],
          role: 'member',
          status: 'active',
          has_password: true,
          auth_provider: 'password',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        const token = 'static-jwt-' + Date.now();
        this.setToken(token);
        this.setCurrentUserId(localUser.id);
        if (typeof window !== 'undefined') {
          try {
            localStorage.setItem('thesis_tracker_static_user', JSON.stringify(localUser));
            const users = JSON.parse(localStorage.getItem('thesis_tracker_local_users') || '[]');
            users.push({ ...localUser, password: params.password });
            localStorage.setItem('thesis_tracker_local_users', JSON.stringify(users));
          } catch {}
        }
        return { token, user: localUser, isBrowserClient: true };
      }
      throw err;
    }
  }

  public async login(params: {
    email: string;
    password: string;
  }): Promise<AuthResponse> {
    try {
      const data = await this.request<AuthResponse>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify(params),
      });
      this.setToken(data.token);
      this.setCurrentUserId(data.user.id);
      return data;
    } catch (err: any) {
      if (err?.code === 'STATIC_HOST_NO_API' || err?.status === 404 || err?.message?.includes('Static host')) {
        const normalizedEmail = params.email.trim().toLowerCase();
        let localUser: UserProfile | null = null;
        if (typeof window !== 'undefined') {
          try {
            const users = JSON.parse(localStorage.getItem('thesis_tracker_local_users') || '[]');
            const found = users.find((u: any) => u.email === normalizedEmail);
            if (found) {
              if (found.password && found.password !== params.password) {
                throw new Error('Invalid email or password.');
              }
              localUser = found;
            }
          } catch (e: any) {
            if (e.message === 'Invalid email or password.') throw e;
          }
        }
        if (!localUser) {
          localUser = {
            id: 'user-' + Date.now(),
            email: normalizedEmail,
            display_name: normalizedEmail.split('@')[0],
            role: 'member',
            status: 'active',
            has_password: true,
            auth_provider: 'password',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          if (typeof window !== 'undefined') {
            try {
              const users = JSON.parse(localStorage.getItem('thesis_tracker_local_users') || '[]');
              users.push({ ...localUser, password: params.password });
              localStorage.setItem('thesis_tracker_local_users', JSON.stringify(users));
            } catch {}
          }
        }
        const token = 'static-jwt-' + Date.now();
        this.setToken(token);
        this.setCurrentUserId(localUser.id);
        if (typeof window !== 'undefined') {
          try {
            localStorage.setItem('thesis_tracker_static_user', JSON.stringify(localUser));
          } catch {}
        }
        return { token, user: localUser, isBrowserClient: true };
      }
      throw err;
    }
  }

  public async organizationLogin(params: {
    email: string;
    displayName?: string;
    uid?: string;
    password?: string;
  }): Promise<AuthResponse> {
    try {
      const data = await this.request<AuthResponse>('/api/auth/organization-login', {
        method: 'POST',
        body: JSON.stringify(params),
      });
      this.setToken(data.token);
      this.setCurrentUserId(data.user.id);
      return data;
    } catch (err: any) {
      if (err?.code === 'STATIC_HOST_NO_API' || err?.status === 404 || err?.message?.includes('Static host')) {
        const localUser: UserProfile = {
          id: params.uid || 'user-' + Date.now(),
          email: params.email.trim().toLowerCase(),
          display_name: params.displayName?.trim() || params.email.split('@')[0],
          role: 'member',
          status: 'active',
          has_password: !!params.password,
          auth_provider: 'password',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        const token = 'static-jwt-' + Date.now();
        this.setToken(token);
        this.setCurrentUserId(localUser.id);
        if (typeof window !== 'undefined') {
          try {
            localStorage.setItem('thesis_tracker_static_user', JSON.stringify(localUser));
          } catch {}
        }
        return { token, user: localUser, isBrowserClient: true };
      }
      throw err;
    }
  }

  public async syncAuth(params: {
    uid?: string;
    email?: string;
    displayName?: string;
    photoUrl?: string;
    idToken?: string;
    accessToken?: string;
  }): Promise<AuthResponse> {
    try {
      const data = await this.request<AuthResponse>('/api/auth/sync', {
        method: 'POST',
        body: JSON.stringify(params),
      });
      this.setToken(data.token);
      this.setCurrentUserId(data.user.id);
      return data;
    } catch (err: any) {
      if (err?.code === 'STATIC_HOST_NO_API' || err?.status === 404 || err?.message?.includes('Static host')) {
        const localUser: UserProfile = {
          id: params.uid || 'user-' + Date.now(),
          email: (params.email || 'user@research.org').trim().toLowerCase(),
          display_name: params.displayName?.trim() || 'Researcher',
          role: 'member',
          status: 'active',
          photo_url: params.photoUrl || null,
          has_password: false,
          auth_provider: 'password',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        const token = 'static-jwt-' + Date.now();
        this.setToken(token);
        this.setCurrentUserId(localUser.id);
        if (typeof window !== 'undefined') {
          try {
            localStorage.setItem('thesis_tracker_static_user', JSON.stringify(localUser));
          } catch {}
        }
        return { token, user: localUser, isBrowserClient: true };
      }
      throw err;
    }
  }

  public async getMe(): Promise<{ user: UserProfile }> {
    try {
      const res = await this.request<{ user: UserProfile }>('/api/auth/me');
      if (res.user?.id) {
        this.setCurrentUserId(res.user.id);
      }
      return res;
    } catch (err: any) {
      if (typeof window !== 'undefined') {
        try {
          const raw = localStorage.getItem('thesis_tracker_static_user');
          if (raw) {
            const user = JSON.parse(raw);
            if (user?.id) {
              this.setCurrentUserId(user.id);
              return { user };
            }
          }
        } catch {}
      }
      throw err;
    }
  }

  public async getTeamCapacity(): Promise<{
    registeredMembers: number;
    availableSeats: number;
    isFull: boolean;
  }> {
    try {
      return await this.request('/api/auth/team-capacity');
    } catch {
      return {
        registeredMembers: 1,
        availableSeats: 9999,
        isFull: false,
      };
    }
  }

  public async forgotPassword(params: {
    email: string;
  }): Promise<{ success: boolean; message: string; devResetToken?: string }> {
    return this.request('/api/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  public async changePassword(params: {
    currentPassword: string;
    newPassword: string;
    confirmPassword?: string;
  }): Promise<{ success: boolean; message: string }> {
    return this.request('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  public async resetPassword(params: {
    email: string;
    resetToken: string;
    newPassword: string;
    confirmPassword?: string;
  }): Promise<{ success: boolean; message: string }> {
    return this.request('/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  // --- RESEARCH GROUPS / STUDIES MANAGEMENT ---

  public async getUserGroups(): Promise<{ groups: ResearchGroup[] }> {
    try {
      return await this.request<{ groups: ResearchGroup[] }>('/api/groups');
    } catch (err: any) {
      if (err?.code === 'STATIC_HOST_NO_API' || err?.status === 404 || err?.message?.includes('Static host')) {
        let groups: ResearchGroup[] = [];
        if (typeof window !== 'undefined') {
          try {
            const raw = localStorage.getItem('thesis_tracker_static_groups');
            if (raw) groups = JSON.parse(raw);
          } catch {}
        }
        if (groups.length === 0) {
          const defaultGroup: ResearchGroup = {
            id: 'group-default-1',
            name: 'Clinical Thesis Cohort',
            studyTitle: 'Pharmacotherapy & Clinical Outcomes Evaluation',
            studyType: 'Observational',
            subjectTerminology: 'Patient',
            targetSampleSize: 50,
            description: 'Local workspace initialized for patient record entry and progress tracking.',
            institution: 'Clinical Research Center',
            ownerId: this.currentUserId || 'local-user',
            members: [
              {
                userId: this.currentUserId || 'local-user',
                email: 'researcher@clinical.org',
                displayName: 'Principal Investigator',
                role: 'owner',
                joinedAt: new Date().toISOString(),
              },
            ],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          groups = [defaultGroup];
          if (typeof window !== 'undefined') {
            try {
              localStorage.setItem('thesis_tracker_static_groups', JSON.stringify(groups));
            } catch {}
          }
          this.setActiveGroupId(defaultGroup.id);
        }
        return { groups };
      }
      throw err;
    }
  }

  public async createGroup(params: {
    name: string;
    studyTitle: string;
    studyType?: StudyType;
    subjectTerminology?: SubjectTerminology;
    targetSampleSize: number;
    description?: string;
    institution?: string;
    customFields?: CustomFieldDefinition[];
  }): Promise<{ group: ResearchGroup }> {
    try {
      return await this.request<{ group: ResearchGroup }>('/api/groups', {
        method: 'POST',
        body: JSON.stringify(params),
      });
    } catch (err: any) {
      if (err?.code === 'STATIC_HOST_NO_API' || err?.status === 404 || err?.message?.includes('Static host')) {
        let groups: ResearchGroup[] = [];
        if (typeof window !== 'undefined') {
          try {
            const raw = localStorage.getItem('thesis_tracker_static_groups');
            if (raw) groups = JSON.parse(raw);
          } catch {}
        }
        const newGroup: ResearchGroup = {
          id: 'group-' + Date.now(),
          name: params.name,
          studyTitle: params.studyTitle,
          studyType: params.studyType || 'Observational',
          subjectTerminology: params.subjectTerminology || 'Patient',
          targetSampleSize: params.targetSampleSize || 50,
          description: params.description || '',
          institution: params.institution || '',
          customFields: params.customFields || [],
          ownerId: this.currentUserId || 'local-user',
          members: [
            {
              userId: this.currentUserId || 'local-user',
              email: 'researcher@clinical.org',
              displayName: 'Principal Investigator',
              role: 'owner',
              joinedAt: new Date().toISOString(),
            },
          ],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        groups.push(newGroup);
        if (typeof window !== 'undefined') {
          try {
            localStorage.setItem('thesis_tracker_static_groups', JSON.stringify(groups));
          } catch {}
        }
        this.setActiveGroupId(newGroup.id);
        return { group: newGroup };
      }
      throw err;
    }
  }

  public async getGroup(groupId: string): Promise<{ group: ResearchGroup }> {
    return this.request<{ group: ResearchGroup }>(`/api/groups/${groupId}`);
  }

  public async updateGroupSettings(
    groupId: string,
    updates: {
      name?: string;
      studyTitle?: string;
      studyType?: StudyType;
      subjectTerminology?: SubjectTerminology;
      targetSampleSize?: number;
      description?: string;
      institution?: string;
      customFields?: CustomFieldDefinition[];
    }
  ): Promise<{ group: ResearchGroup }> {
    return this.request<{ group: ResearchGroup }>(`/api/groups/${groupId}/settings`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  }

  public async createInvitation(
    groupId: string,
    intendedEmail?: string
  ): Promise<{ invitation: GroupInvitation }> {
    return this.request<{ invitation: GroupInvitation }>(`/api/groups/${groupId}/invitations`, {
      method: 'POST',
      body: JSON.stringify({ intendedEmail }),
    });
  }

  public async getInvitationDetails(code: string): Promise<{
    invitation: GroupInvitation;
    group: {
      id: string;
      name: string;
      studyTitle: string;
      targetSampleSize: number;
      memberCount: number;
      maxMembers?: number;
      isFull: boolean;
    };
  }> {
    return this.request(`/api/invitations/${encodeURIComponent(code)}`);
  }

  public async acceptInvitation(code: string): Promise<{ success: boolean; group: ResearchGroup }> {
    return this.request<{ success: boolean; group: ResearchGroup }>(
      `/api/invitations/${encodeURIComponent(code)}/accept`,
      {
        method: 'POST',
      }
    );
  }

  public async removeMember(
    groupId: string,
    targetUserId: string
  ): Promise<{ success: boolean; group: ResearchGroup }> {
    return this.request<{ success: boolean; group: ResearchGroup }>(
      `/api/groups/${groupId}/members/${targetUserId}`,
      {
        method: 'DELETE',
      }
    );
  }

  // --- RESEARCH FILES MANAGEMENT ---

  public async getGroupFiles(groupId?: string): Promise<{ files: ResearchFile[] }> {
    const gid = groupId || this.getActiveGroupId();
    if (!gid) throw new Error('Active research group required.');
    return this.request<{ files: ResearchFile[] }>(`/api/groups/${gid}/files`);
  }

  public async uploadGroupFile(
    groupId: string,
    data: {
      name: string;
      size: number;
      mimeType: string;
      category?: string;
      fileData?: string;
    }
  ): Promise<{ file: ResearchFile }> {
    return this.request<{ file: ResearchFile }>(`/api/groups/${groupId}/files`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  public async deleteGroupFile(
    groupId: string,
    fileId: string
  ): Promise<{ success: boolean; fileName: string }> {
    return this.request<{ success: boolean; fileName: string }>(`/api/groups/${groupId}/files/${fileId}`, {
      method: 'DELETE',
    });
  }

  // --- GROUP-SCOPED RESEARCH RECORDS ---

  public async checkPatientId(patientId: string, groupId?: string): Promise<DuplicateCheckResult> {
    const gid = groupId || this.getActiveGroupId();
    const query = gid ? `?groupId=${encodeURIComponent(gid)}` : '';
    return this.request<DuplicateCheckResult>(`/api/cases/check/${encodeURIComponent(patientId)}${query}`);
  }

  public async registerCase(params: {
    patientId: string;
    patientName?: string;
    diagnosis?: string;
    drugNames?: string;
    customValues?: Record<string, any>;
    groupId?: string;
  }): Promise<{ success: boolean; case: CaseRecord }> {
    const gid = params.groupId || this.getActiveGroupId();
    const res = await this.request<{ success: boolean; case: CaseRecord }>('/api/cases/register', {
      method: 'POST',
      body: JSON.stringify({ ...params, groupId: gid }),
    });
    if (this.currentUserId && res.case) {
      offlineStorage.saveCase(res.case, this.currentUserId).catch(() => {});
    }
    return res;
  }

  public async updateCaseDetails(
    caseId: string,
    details: {
      patientName?: string;
      diagnosis?: string;
      drugNames?: string;
      customValues?: Record<string, any>;
    },
    groupId?: string
  ): Promise<{ success: boolean; case: CaseRecord }> {
    const gid = groupId || this.getActiveGroupId();
    const res = await this.request<{ success: boolean; case: CaseRecord }>(`/api/cases/${caseId}/details`, {
      method: 'PATCH',
      body: JSON.stringify({ ...details, groupId: gid }),
    });
    if (this.currentUserId && res.case) {
      offlineStorage.saveCase(res.case, this.currentUserId).catch(() => {});
    }
    return res;
  }

  public async deleteCase(
    caseId: string,
    groupId?: string
  ): Promise<{ success: boolean; message: string }> {
    const gid = groupId || this.getActiveGroupId();
    const query = gid ? `?groupId=${encodeURIComponent(gid)}` : '';
    const res = await this.request<{ success: boolean; message: string }>(`/api/cases/${caseId}${query}`, {
      method: 'DELETE',
    });
    offlineStorage.deleteCase(caseId).catch(() => {});
    return res;
  }

  public async getAllCases(filters?: {
    search?: string;
    memberId?: string;
    status?: string;
    groupId?: string;
  }): Promise<{ cases: CaseRecord[] }> {
    const gid = filters?.groupId || this.getActiveGroupId();
    const params = new URLSearchParams();
    if (gid) params.append('groupId', gid);
    if (filters?.search) params.append('search', filters.search);
    if (filters?.memberId) params.append('memberId', filters.memberId);
    if (filters?.status) params.append('status', filters.status);

    const query = params.toString() ? `?${params.toString()}` : '';
    try {
      const res = await this.request<{ cases: CaseRecord[] }>(`/api/cases${query}`);
      // Asynchronously encrypt and persist authorized cases to IndexedDB
      if (this.currentUserId && gid && res.cases) {
        offlineStorage.saveCases(res.cases, this.currentUserId).catch((err) => {
          console.warn('[SEC-004] Could not update offline cache:', err);
        });
      }
      return res;
    } catch (err: any) {
      // Offline fallback: if network is down, serve authenticated decrypted cases from encrypted IndexedDB
      if (
        gid &&
        this.currentUserId &&
        (typeof navigator !== 'undefined' && !navigator.onLine ||
          err?.name === 'TypeError' ||
          err?.message?.includes('fetch') ||
          err?.message?.includes('NetworkError'))
      ) {
        console.info('[SEC-004] Network unavailable; retrieving cases from encrypted offline store.');
        let cached = await offlineStorage.getCases(gid, this.currentUserId);
        if (filters?.memberId && filters.memberId !== 'ALL') {
          cached = cached.filter((c) => c.assigned_to === filters.memberId);
        }
        if (filters?.status && filters.status !== 'ALL') {
          cached = cached.filter((c) => c.status === filters.status);
        }
        if (filters?.search && filters.search.trim()) {
          const q = filters.search.trim().toLowerCase();
          cached = cached.filter((c) =>
            c.patient_id.toLowerCase().includes(q) ||
            (c.patient_name && c.patient_name.toLowerCase().includes(q)) ||
            (c.diagnosis && c.diagnosis.toLowerCase().includes(q)) ||
            (c.drug_names && c.drug_names.toLowerCase().includes(q))
          );
        }
        return { cases: cached };
      }
      throw err;
    }
  }

  public async getMyCases(params?: {
    search?: string;
    groupId?: string;
  }): Promise<{ cases: CaseRecord[] }> {
    const gid = params?.groupId || this.getActiveGroupId();
    const searchParams = new URLSearchParams();
    if (gid) searchParams.append('groupId', gid);
    if (params?.search) searchParams.append('search', params.search);
    const query = searchParams.toString() ? `?${searchParams.toString()}` : '';

    try {
      const res = await this.request<{ cases: CaseRecord[] }>(`/api/cases/my${query}`);
      if (this.currentUserId && gid && res.cases) {
        offlineStorage.saveCases(res.cases, this.currentUserId).catch(() => {});
      }
      return res;
    } catch (err: any) {
      if (
        gid &&
        this.currentUserId &&
        (typeof navigator !== 'undefined' && !navigator.onLine ||
          err?.name === 'TypeError' ||
          err?.message?.includes('fetch') ||
          err?.message?.includes('NetworkError'))
      ) {
        console.info('[SEC-004] Network unavailable; retrieving my cases from encrypted offline store.');
        let cached = await offlineStorage.getCases(gid, this.currentUserId);
        cached = cached.filter((c) => c.assigned_to === this.currentUserId);
        if (params?.search && params.search.trim()) {
          const q = params.search.trim().toLowerCase();
          cached = cached.filter((c) =>
            c.patient_id.toLowerCase().includes(q) ||
            (c.patient_name && c.patient_name.toLowerCase().includes(q)) ||
            (c.diagnosis && c.diagnosis.toLowerCase().includes(q)) ||
            (c.drug_names && c.drug_names.toLowerCase().includes(q))
          );
        }
        return { cases: cached };
      }
      throw err;
    }
  }

  public async updateCaseStatus(
    caseId: string,
    status: CaseStatus,
    groupId?: string
  ): Promise<{ success: boolean; case: CaseRecord }> {
    const gid = groupId || this.getActiveGroupId();
    const res = await this.request<{ success: boolean; case: CaseRecord }>(`/api/cases/${caseId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status, groupId: gid }),
    });
    if (this.currentUserId && res.case) {
      offlineStorage.saveCase(res.case, this.currentUserId).catch(() => {});
    }
    return res;
  }

  public async getStats(groupId?: string): Promise<{ stats: DashboardStats }> {
    const gid = groupId || this.getActiveGroupId();
    const query = gid ? `?groupId=${encodeURIComponent(gid)}` : '';
    return this.request(`/api/cases/stats${query}`);
  }

  public async getTeamSummary(groupId?: string): Promise<{ summary: TeamSummaryResponse }> {
    const gid = groupId || this.getActiveGroupId();
    const query = gid ? `?groupId=${encodeURIComponent(gid)}` : '';
    return this.request(`/api/cases/team-summary${query}`);
  }

  public getExportCsvUrl(groupId?: string): string {
    const gid = groupId || this.getActiveGroupId();
    const query = gid ? `?groupId=${encodeURIComponent(gid)}` : '';
    return `/api/cases/export/csv${query}`;
  }

  // --- REAL-TIME SSE SUBSCRIPTION (Group-Scoped) ---

  public subscribeToRealtime(
    groupId: string | null,
    onEvent: (event: string, payload: any) => void,
    onStatusChange?: (connected: boolean) => void
  ): () => void {
    if (!groupId) {
      onStatusChange?.(true);
      return () => {};
    }

    let isClosed = false;
    let es: EventSource | null = null;
    let reconnectTimeout: any = null;

    const connect = () => {
      if (isClosed) return;

      const params = new URLSearchParams();
      if (groupId) {
        params.append('groupId', groupId);
      }
      // SEC-HIGH-05: Authenticated via secure HttpOnly cookie with withCredentials: true.
      // Omit token from URL query string to prevent leak into proxy and access logs.

      const url = `/api/cases/events?${params.toString()}`;
      es = new EventSource(url, { withCredentials: true });

      es.onopen = () => {
        onStatusChange?.(true);
      };

      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'connected') {
            onStatusChange?.(true);
            return;
          }
          onEvent(data.type, data.payload);
        } catch (err) {
          console.warn('Realtime event parse warning:', err);
        }
      };

      es.onerror = () => {
        onStatusChange?.(false);
        es?.close();
        if (!isClosed) {
          reconnectTimeout = setTimeout(connect, 3000);
        }
      };
    };

    connect();

    return () => {
      isClosed = true;
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      es?.close();
    };
  }
}

export const api = new ApiService();
