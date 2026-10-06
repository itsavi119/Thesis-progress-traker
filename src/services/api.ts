import type {
  AppOwnerGroup,
  AppOwnerSettings,
  AppOwnerStats,
  AppOwnerUser,
  AuditLogEntry,
  AuthResponse,
  CaseRecord,
  CaseStatus,
  DashboardStats,
  DuplicateCheckResult,
  GroupInvitation,
  LegalPolicyDoc,
  ResearchGroup,
  TeamSummaryResponse,
  UserProfile,
} from '../types/index.js';

class ApiService {
  private token: string | null = null;
  private activeGroupId: string | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      this.token = localStorage.getItem('thesis_tracker_jwt_token');
      this.activeGroupId = localStorage.getItem('thesis_tracker_active_group_id');
    }
  }

  public setToken(token: string | null) {
    this.token = token;
    if (typeof window !== 'undefined') {
      if (token) {
        localStorage.setItem('thesis_tracker_jwt_token', token);
      } else {
        localStorage.removeItem('thesis_tracker_jwt_token');
      }
    }
  }

  public getToken(): string | null {
    if (!this.token && typeof window !== 'undefined') {
      this.token = localStorage.getItem('thesis_tracker_jwt_token');
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

  public logout() {
    this.setToken(null);
    this.setActiveGroupId(null);
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...((options.headers as Record<string, string>) || {}),
    };

    const token = this.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const groupId = this.getActiveGroupId();
    if (groupId && !headers['X-Group-Id']) {
      headers['X-Group-Id'] = groupId;
    }

    const response = await fetch(endpoint, {
      ...options,
      headers,
    });

    if (!response.ok) {
      let errPayload: any = null;
      try {
        errPayload = await response.json();
      } catch {
        const text = await response.text();
        throw new Error(text || `Request failed with status ${response.status}`);
      }

      const msg = errPayload.message || errPayload.error || `HTTP error ${response.status}`;
      const error = new Error(msg) as any;
      error.status = response.status;
      error.code = errPayload.error;
      error.case = errPayload.case;
      throw error;
    }

    return response.json();
  }

  // --- LEGAL POLICIES (Public / Authenticated) ---

  public async getLegalPolicies(): Promise<{ policies: LegalPolicyDoc[] }> {
    return this.request<{ policies: LegalPolicyDoc[] }>('/api/legal/policies');
  }

  // --- AUTHENTICATION ---

  public async register(params: {
    email: string;
    password: string;
    displayName: string;
  }): Promise<AuthResponse> {
    const data = await this.request<AuthResponse>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(params),
    });
    this.setToken(data.token);
    return data;
  }

  public async login(params: {
    email: string;
    password: string;
  }): Promise<AuthResponse> {
    const data = await this.request<AuthResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(params),
    });
    this.setToken(data.token);
    return data;
  }

  public async syncGoogleUser(params: {
    uid: string;
    email: string;
    displayName: string;
  }): Promise<AuthResponse> {
    const data = await this.request<AuthResponse>('/api/auth/google-sync', {
      method: 'POST',
      body: JSON.stringify(params),
    });
    this.setToken(data.token);
    return data;
  }

  public async getMe(): Promise<{ user: UserProfile }> {
    return this.request<{ user: UserProfile }>('/api/auth/me');
  }

  public async getTeamCapacity(): Promise<{
    registeredMembers: number;
    maxMembers?: number;
    availableSeats: number;
    isFull: boolean;
  }> {
    return this.request('/api/auth/team-capacity');
  }

  // --- RESEARCH GROUPS MANAGEMENT ---

  public async getUserGroups(): Promise<{ groups: ResearchGroup[] }> {
    return this.request<{ groups: ResearchGroup[] }>('/api/groups');
  }

  public async createGroup(params: {
    name: string;
    studyTitle: string;
    targetSampleSize: number;
    description?: string;
    institution?: string;
  }): Promise<{ group: ResearchGroup }> {
    return this.request<{ group: ResearchGroup }>('/api/groups', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  public async getGroup(groupId: string): Promise<{ group: ResearchGroup }> {
    return this.request<{ group: ResearchGroup }>(`/api/groups/${groupId}`);
  }

  public async updateGroupSettings(
    groupId: string,
    updates: {
      name?: string;
      studyTitle?: string;
      targetSampleSize?: number;
      description?: string;
      institution?: string;
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

  // --- GROUP-SCOPED PATIENT CASES ---

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
    groupId?: string;
  }): Promise<{ success: boolean; case: CaseRecord }> {
    const gid = params.groupId || this.getActiveGroupId();
    return this.request('/api/cases/register', {
      method: 'POST',
      body: JSON.stringify({ ...params, groupId: gid }),
    });
  }

  public async updateCaseDetails(
    caseId: string,
    details: { patientName?: string; diagnosis?: string; drugNames?: string },
    groupId?: string
  ): Promise<{ success: boolean; case: CaseRecord }> {
    const gid = groupId || this.getActiveGroupId();
    return this.request(`/api/cases/${caseId}/details`, {
      method: 'PATCH',
      body: JSON.stringify({ ...details, groupId: gid }),
    });
  }

  public async deleteCase(
    caseId: string,
    groupId?: string
  ): Promise<{ success: boolean; message: string }> {
    const gid = groupId || this.getActiveGroupId();
    const query = gid ? `?groupId=${encodeURIComponent(gid)}` : '';
    return this.request(`/api/cases/${caseId}${query}`, {
      method: 'DELETE',
    });
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
    return this.request(`/api/cases${query}`);
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
    return this.request(`/api/cases/my${query}`);
  }

  public async updateCaseStatus(
    caseId: string,
    status: CaseStatus,
    groupId?: string
  ): Promise<{ success: boolean; case: CaseRecord }> {
    const gid = groupId || this.getActiveGroupId();
    return this.request(`/api/cases/${caseId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status, groupId: gid }),
    });
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
    let isClosed = false;
    let es: EventSource | null = null;
    let reconnectTimeout: any = null;

    const connect = () => {
      if (isClosed) return;

      const token = this.getToken();
      if (!token) {
        onStatusChange?.(false);
        return;
      }

      const params = new URLSearchParams({ token });
      if (groupId) {
        params.append('groupId', groupId);
      }

      const url = `/api/cases/events?${params.toString()}`;
      es = new EventSource(url);

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
      onStatusChange?.(false);
    };
  }

  // =========================================================================
  // --- APP OWNER & ORGANIZATION ADMINISTRATION CLIENT API ---
  // =========================================================================

  public async getAppOwnerOverview(): Promise<{ stats: AppOwnerStats }> {
    return this.request<{ stats: AppOwnerStats }>('/api/app-owner/overview');
  }

  public async getAppOwnerUsers(options?: {
    search?: string;
    status?: string;
  }): Promise<{ users: AppOwnerUser[] }> {
    const params = new URLSearchParams();
    if (options?.search) params.append('search', options.search);
    if (options?.status) params.append('status', options.status);
    const query = params.toString() ? `?${params.toString()}` : '';
    return this.request<{ users: AppOwnerUser[] }>(`/api/app-owner/users${query}`);
  }

  public async setAppOwnerUserStatus(
    userId: string,
    status: 'active' | 'suspended'
  ): Promise<{ success: boolean; user: AppOwnerUser }> {
    return this.request<{ success: boolean; user: AppOwnerUser }>(
      `/api/app-owner/users/${userId}/status`,
      {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      }
    );
  }

  public async getAppOwnerGroups(options?: {
    search?: string;
    status?: string;
  }): Promise<{ groups: AppOwnerGroup[] }> {
    const params = new URLSearchParams();
    if (options?.search) params.append('search', options.search);
    if (options?.status) params.append('status', options.status);
    const query = params.toString() ? `?${params.toString()}` : '';
    return this.request<{ groups: AppOwnerGroup[] }>(`/api/app-owner/groups${query}`);
  }

  public async setAppOwnerGroupStatus(
    groupId: string,
    status: 'active' | 'archived' | 'suspended'
  ): Promise<{ success: boolean; group: AppOwnerGroup }> {
    return this.request<{ success: boolean; group: AppOwnerGroup }>(
      `/api/app-owner/groups/${groupId}/status`,
      {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      }
    );
  }

  public async deleteAppOwnerGroup(
    groupId: string
  ): Promise<{ success: boolean; groupName: string }> {
    return this.request<{ success: boolean; groupName: string }>(
      `/api/app-owner/groups/${groupId}`,
      {
        method: 'DELETE',
      }
    );
  }

  public async getAppOwnerAuditLogs(options?: {
    limit?: number;
    action?: string;
    entityType?: string;
  }): Promise<{ logs: AuditLogEntry[] }> {
    const params = new URLSearchParams();
    if (options?.limit) params.append('limit', String(options.limit));
    if (options?.action) params.append('action', options.action);
    if (options?.entityType) params.append('entityType', options.entityType);
    const query = params.toString() ? `?${params.toString()}` : '';
    return this.request<{ logs: AuditLogEntry[] }>(`/api/app-owner/audit-logs${query}`);
  }

  public async getAppOwnerSettings(): Promise<{ settings: AppOwnerSettings }> {
    return this.request<{ settings: AppOwnerSettings }>('/api/app-owner/settings');
  }

  public async updateAppOwnerSettings(
    updates: Partial<AppOwnerSettings>
  ): Promise<{ settings: AppOwnerSettings }> {
    return this.request<{ settings: AppOwnerSettings }>('/api/app-owner/settings', {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  }

  public async updateLegalPolicy(
    id: string,
    content: string
  ): Promise<{ policy: LegalPolicyDoc }> {
    return this.request<{ policy: LegalPolicyDoc }>(`/api/app-owner/legal-policies/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ content }),
    });
  }
}

export const api = new ApiService();
