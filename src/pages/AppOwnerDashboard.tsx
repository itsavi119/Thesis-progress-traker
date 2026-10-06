import React, { useState, useEffect, useCallback } from 'react';
import {
  ShieldAlert,
  Users,
  FolderOpen,
  Layers,
  Activity,
  Search,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Settings,
  FileText,
  RefreshCw,
  ArrowLeft,
  Trash2,
  Eye,
  UserCheck,
  UserX,
  Plus,
  ShieldCheck,
  ExternalLink,
  Calendar,
  Lock,
} from 'lucide-react';
import { api } from '../services/api.js';
import { useAuth } from '../context/AuthContext.js';
import type {
  AppOwnerGroup,
  AppOwnerSettings,
  AppOwnerStats,
  AppOwnerUser,
  AuditLogEntry,
  LegalPolicyDoc,
} from '../types/index.js';

interface AppOwnerDashboardProps {
  onReturnToApp: () => void;
}

type AdminTab = 'overview' | 'users' | 'groups' | 'audit' | 'settings' | 'legal';

export const AppOwnerDashboard: React.FC<AppOwnerDashboardProps> = ({ onReturnToApp }) => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  const [stats, setStats] = useState<AppOwnerStats>({
    totalUsers: 0,
    totalGroups: 0,
    activeGroups: 0,
    totalMemberships: 0,
    totalCases: 0,
  });
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Users state
  const [users, setUsers] = useState<AppOwnerUser[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [userStatusFilter, setUserStatusFilter] = useState('ALL');
  const [userToModify, setUserToModify] = useState<{ id: string; name: string; email: string; targetStatus: 'active' | 'suspended' } | null>(null);

  // Groups state
  const [groups, setGroups] = useState<AppOwnerGroup[]>([]);
  const [groupSearch, setGroupSearch] = useState('');
  const [groupStatusFilter, setGroupStatusFilter] = useState('ALL');
  const [selectedGroupDetails, setSelectedGroupDetails] = useState<AppOwnerGroup | null>(null);
  const [groupToDelete, setGroupToDelete] = useState<AppOwnerGroup | null>(null);

  // Audit Logs state
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [logSearch, setLogSearch] = useState('');

  // Settings state
  const [settings, setSettings] = useState<AppOwnerSettings | null>(null);
  const [newAdminEmail, setNewAdminEmail] = useState('');

  // Legal state
  const [legalPolicies, setLegalPolicies] = useState<LegalPolicyDoc[]>([]);
  const [editingPolicy, setEditingPolicy] = useState<{ id: string; title: string; content: string } | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const [overviewRes, usersRes, groupsRes, logsRes, settingsRes, legalRes] = await Promise.all([
        api.getAppOwnerOverview(),
        api.getAppOwnerUsers(),
        api.getAppOwnerGroups(),
        api.getAppOwnerAuditLogs({ limit: 100 }),
        api.getAppOwnerSettings(),
        api.getLegalPolicies(),
      ]);

      setStats(overviewRes.stats);
      setUsers(usersRes.users);
      setGroups(groupsRes.groups);
      setLogs(logsRes.logs);
      setSettings(settingsRes.settings);
      setLegalPolicies(legalRes.policies);
    } catch (err: any) {
      setError(err.message || 'Access denied or server connection error.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Handle User Status Change (Suspend / Reactivate)
  const handleConfirmUserStatus = async () => {
    if (!userToModify) return;
    try {
      setError(null);
      await api.setAppOwnerUserStatus(userToModify.id, userToModify.targetStatus);
      showToast(`User account status updated to "${userToModify.targetStatus}".`);
      setUserToModify(null);
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to update user status.');
    }
  };

  // Handle Group Status Change
  const handleGroupStatusChange = async (groupId: string, newStatus: 'active' | 'archived' | 'suspended') => {
    try {
      setError(null);
      await api.setAppOwnerGroupStatus(groupId, newStatus);
      showToast(`Group status updated to "${newStatus}".`);
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to update group status.');
    }
  };

  // Handle Group Deletion
  const handleConfirmDeleteGroup = async () => {
    if (!groupToDelete) return;
    try {
      setError(null);
      await api.deleteAppOwnerGroup(groupToDelete.id);
      showToast(`Research group "${groupToDelete.name}" was permanently removed.`);
      setGroupToDelete(null);
      if (selectedGroupDetails?.id === groupToDelete.id) {
        setSelectedGroupDetails(null);
      }
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to delete research group.');
    }
  };

  // Handle Add Admin Email
  const handleAddAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAdminEmail.trim() || !settings) return;

    const email = newAdminEmail.trim().toLowerCase();
    if (settings.authorizedAppOwners.includes(email)) {
      setError('This email address is already an authorized App Owner.');
      return;
    }

    try {
      setError(null);
      const updatedOwners = [...settings.authorizedAppOwners, email];
      const res = await api.updateAppOwnerSettings({ authorizedAppOwners: updatedOwners });
      setSettings(res.settings);
      setNewAdminEmail('');
      showToast(`Authorized administrator "${email}" added successfully.`);
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to update administrator list.');
    }
  };

  // Handle Remove Secondary Admin Email
  const handleRemoveAdmin = async (emailToRemove: string) => {
    if (!settings) return;
    try {
      setError(null);
      const updatedOwners = settings.authorizedAppOwners.filter((e) => e.toLowerCase() !== emailToRemove.toLowerCase());
      const res = await api.updateAppOwnerSettings({ authorizedAppOwners: updatedOwners });
      setSettings(res.settings);
      showToast(`Administrator privilege revoked for "${emailToRemove}".`);
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to revoke administrator privilege.');
    }
  };

  // Handle System Setting Toggle
  const handleToggleSetting = async (key: 'maintenanceMode' | 'allowRegistration', val: boolean) => {
    try {
      setError(null);
      const res = await api.updateAppOwnerSettings({ [key]: val });
      setSettings(res.settings);
      showToast(`Setting "${key}" updated.`);
    } catch (err: any) {
      setError(err.message || 'Failed to update setting.');
    }
  };

  // Handle Save Legal Policy
  const handleSaveLegalPolicy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPolicy) return;
    try {
      setError(null);
      const res = await api.updateLegalPolicy(editingPolicy.id, editingPolicy.content);
      setLegalPolicies((prev) => prev.map((p) => (p.id === res.policy.id ? res.policy : p)));
      setEditingPolicy(null);
      showToast(`Policy "${res.policy.title}" saved successfully.`);
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to update policy.');
    }
  };

  // Filtered Users
  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      u.displayName.toLowerCase().includes(userSearch.toLowerCase()) ||
      u.email.toLowerCase().includes(userSearch.toLowerCase());
    const matchesStatus = userStatusFilter === 'ALL' || u.status === userStatusFilter;
    return matchesSearch && matchesStatus;
  });

  // Filtered Groups
  const filteredGroups = groups.filter((g) => {
    const matchesSearch =
      g.name.toLowerCase().includes(groupSearch.toLowerCase()) ||
      g.studyTitle.toLowerCase().includes(groupSearch.toLowerCase()) ||
      g.ownerName.toLowerCase().includes(groupSearch.toLowerCase()) ||
      g.ownerEmail.toLowerCase().includes(groupSearch.toLowerCase());
    const matchesStatus = groupStatusFilter === 'ALL' || g.status === groupStatusFilter;
    return matchesSearch && matchesStatus;
  });

  // Filtered Logs
  const filteredLogs = logs.filter((l) => {
    const q = logSearch.toLowerCase();
    return (
      l.action.toLowerCase().includes(q) ||
      l.details.toLowerCase().includes(q) ||
      l.performedByEmail.toLowerCase().includes(q) ||
      (l.entityName && l.entityName.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-16">
      {/* Top Banner & Return Bar */}
      <div className="bg-slate-900 text-white p-5 sm:p-6 rounded-3xl shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-blue-600/30 border border-blue-400/40 flex items-center justify-center font-bold text-blue-300">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300 font-bold text-[10px] uppercase tracking-wider border border-blue-400/30 mb-1">
              <span>App Owner Administration</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black tracking-tight">Organization Workspace</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Platform-level governance, study groups oversight, and security management.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-center">
          <button
            onClick={onReturnToApp}
            className="flex items-center gap-2 px-4 py-2.5 bg-white/10 hover:bg-white/20 border border-white/20 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Research Workspace</span>
          </button>
          <button
            onClick={loadData}
            disabled={isLoading}
            className="p-2.5 bg-white/10 hover:bg-white/20 border border-white/20 text-white rounded-xl transition-colors cursor-pointer"
            title="Refresh Organization Data"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {toast && (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center gap-2.5 font-bold shadow-sm animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{toast}</span>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center gap-2.5 font-bold shadow-sm animate-in fade-in">
          <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex items-center gap-1 p-1 bg-white border border-slate-200 rounded-2xl shadow-xs overflow-x-auto">
        <button
          onClick={() => setActiveTab('overview')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
            activeTab === 'overview'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <Activity className="w-4 h-4" />
          <span>Overview</span>
        </button>

        <button
          onClick={() => setActiveTab('users')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
            activeTab === 'users'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Users ({users.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('groups')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
            activeTab === 'groups'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <FolderOpen className="w-4 h-4" />
          <span>Research Groups ({groups.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('audit')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
            activeTab === 'audit'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>Audit Logs ({logs.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('settings')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
            activeTab === 'settings'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <Settings className="w-4 h-4" />
          <span>Settings</span>
        </button>

        <button
          onClick={() => setActiveTab('legal')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
            activeTab === 'legal'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <Lock className="w-4 h-4" />
          <span>Legal & Policies</span>
        </button>
      </div>

      {/* ================================================================= */}
      {/* 1. OVERVIEW TAB */}
      {/* ================================================================= */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Total Users</span>
              <div className="text-3xl font-black text-slate-900 mt-1">{stats.totalUsers}</div>
              <p className="text-[11px] text-slate-400 mt-1">Registered researchers</p>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Total Groups</span>
              <div className="text-3xl font-black text-blue-600 mt-1">{stats.totalGroups}</div>
              <p className="text-[11px] text-slate-400 mt-1">Research studies</p>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Active Groups</span>
              <div className="text-3xl font-black text-emerald-600 mt-1">{stats.activeGroups}</div>
              <p className="text-[11px] text-slate-400 mt-1">Active data collection</p>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Memberships</span>
              <div className="text-3xl font-black text-indigo-600 mt-1">{stats.totalMemberships}</div>
              <p className="text-[11px] text-slate-400 mt-1">Team assignments</p>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs col-span-2 sm:col-span-1">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Total Cases</span>
              <div className="text-3xl font-black text-slate-900 mt-1">{stats.totalCases}</div>
              <p className="text-[11px] text-slate-400 mt-1">Patients tracked across app</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Quick Overview Groups */}
            <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                  Recent Research Groups
                </h3>
                <button
                  onClick={() => setActiveTab('groups')}
                  className="text-xs text-blue-600 font-bold hover:underline cursor-pointer"
                >
                  View All ({groups.length})
                </button>
              </div>

              {groups.length === 0 ? (
                <div className="text-center py-8 text-xs text-slate-400">No research groups created yet.</div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {groups.slice(0, 5).map((g) => (
                    <div key={g.id} className="py-3 flex items-center justify-between gap-3 text-xs">
                      <div>
                        <p className="font-bold text-slate-900">{g.name}</p>
                        <p className="text-slate-500 text-[11px]">Owner: {g.ownerName}</p>
                      </div>
                      <div className="text-right">
                        <span className="font-bold text-slate-800">{g.caseCount} cases</span>
                        <p className="text-slate-400 text-[11px]">{g.memberCount} members</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Quick Overview Users */}
            <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                  Recent Registered Users
                </h3>
                <button
                  onClick={() => setActiveTab('users')}
                  className="text-xs text-blue-600 font-bold hover:underline cursor-pointer"
                >
                  View All ({users.length})
                </button>
              </div>

              {users.length === 0 ? (
                <div className="text-center py-8 text-xs text-slate-400">No users registered yet.</div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {users.slice(0, 5).map((u) => (
                    <div key={u.id} className="py-3 flex items-center justify-between gap-3 text-xs">
                      <div>
                        <p className="font-bold text-slate-900 flex items-center gap-1.5">
                          <span>{u.displayName}</span>
                          {u.isAppOwner && (
                            <span className="px-1.5 py-0.2 rounded-full bg-blue-100 text-blue-700 text-[9px] font-bold">
                              Owner
                            </span>
                          )}
                        </p>
                        <p className="text-slate-500 text-[11px]">{u.email}</p>
                      </div>
                      <div className="text-right">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            u.status === 'suspended'
                              ? 'bg-rose-100 text-rose-800'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          {u.status}
                        </span>
                        <p className="text-slate-400 text-[11px] mt-0.5">{u.groups.length} groups</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* 2. USERS TAB */}
      {/* ================================================================= */}
      {activeTab === 'users' && (
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                placeholder="Search user by name or email..."
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:bg-white focus:border-blue-600"
              />
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 font-medium">Status:</span>
              <select
                value={userStatusFilter}
                onChange={(e) => setUserStatusFilter(e.target.value)}
                className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none"
              >
                <option value="ALL">All Statuses</option>
                <option value="active">Active</option>
                <option value="suspended">Suspended</option>
              </select>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-xs">
            {filteredUsers.length === 0 ? (
              <div className="p-10 text-center text-xs text-slate-400">No users match your criteria.</div>
            ) : (
              <div className="divide-y divide-slate-100">
                {filteredUsers.map((u) => (
                  <div key={u.id} className="p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-slate-900">{u.displayName}</span>
                        {u.isAppOwner && (
                          <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 text-[10px] font-bold uppercase tracking-wider">
                            App Owner
                          </span>
                        )}
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                            u.status === 'suspended'
                              ? 'bg-rose-100 text-rose-800'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          {u.status}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 font-mono">{u.email}</p>
                      <p className="text-[11px] text-slate-400">
                        Joined: {new Date(u.createdAt).toLocaleDateString()}
                      </p>
                    </div>

                    <div className="flex flex-col md:items-end gap-2">
                      <div className="text-xs text-slate-600">
                        <span className="font-semibold">Connected Groups ({u.groups.length}):</span>{' '}
                        {u.groups.length === 0 ? (
                          <span className="text-slate-400 italic">None</span>
                        ) : (
                          u.groups.map((g) => (
                            <span
                              key={g.groupId}
                              className="inline-block mr-1.5 px-2 py-0.5 rounded-md bg-slate-100 text-[11px] text-slate-700 font-medium"
                            >
                              {g.groupName} ({g.role})
                            </span>
                          ))
                        )}
                      </div>

                      {!u.isAppOwner && (
                        <div className="pt-1">
                          {u.status === 'active' ? (
                            <button
                              onClick={() =>
                                setUserToModify({
                                  id: u.id,
                                  name: u.displayName,
                                  email: u.email,
                                  targetStatus: 'suspended',
                                })
                              }
                              className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                            >
                              Suspend Account
                            </button>
                          ) : (
                            <button
                              onClick={() =>
                                setUserToModify({
                                  id: u.id,
                                  name: u.displayName,
                                  email: u.email,
                                  targetStatus: 'active',
                                })
                              }
                              className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                            >
                              Reactivate Account
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* 3. GROUPS TAB */}
      {/* ================================================================= */}
      {activeTab === 'groups' && (
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={groupSearch}
                onChange={(e) => setGroupSearch(e.target.value)}
                placeholder="Search group by name, study title, or owner..."
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:bg-white focus:border-blue-600"
              />
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 font-medium">Status:</span>
              <select
                value={groupStatusFilter}
                onChange={(e) => setGroupStatusFilter(e.target.value)}
                className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none"
              >
                <option value="ALL">All Statuses</option>
                <option value="active">Active</option>
                <option value="archived">Archived</option>
                <option value="suspended">Suspended</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredGroups.length === 0 ? (
              <div className="col-span-2 bg-white border border-slate-200 rounded-3xl p-10 text-center text-xs text-slate-400">
                No research groups match your criteria.
              </div>
            ) : (
              filteredGroups.map((g) => (
                <div
                  key={g.id}
                  className="bg-white border border-slate-200 rounded-3xl p-5 sm:p-6 shadow-xs flex flex-col justify-between gap-4"
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h4 className="text-base font-extrabold text-slate-900">{g.name}</h4>
                        {g.institution && <p className="text-xs text-slate-400">{g.institution}</p>}
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                          g.status === 'active'
                            ? 'bg-emerald-100 text-emerald-800'
                            : g.status === 'suspended'
                            ? 'bg-rose-100 text-rose-800'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {g.status}
                      </span>
                    </div>

                    <p className="text-xs text-slate-600 line-clamp-2 italic">
                      &ldquo;{g.studyTitle}&rdquo;
                    </p>

                    <div className="text-xs text-slate-500 pt-2 border-t border-slate-100 flex items-center justify-between">
                      <span>Owner: <strong>{g.ownerName}</strong></span>
                      <span className="font-mono text-[11px]">{g.ownerEmail}</span>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                    <div className="flex items-center gap-3 text-xs text-slate-600">
                      <span className="font-bold text-slate-900">{g.caseCount} / {g.targetSampleSize} cases</span>
                      <span>•</span>
                      <span>{g.memberCount} members</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setSelectedGroupDetails(g)}
                        className="p-2 text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-colors cursor-pointer"
                        title="View Group Details"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setGroupToDelete(g)}
                        className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer"
                        title="Delete Group"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* 4. AUDIT LOGS TAB */}
      {/* ================================================================= */}
      {activeTab === 'audit' && (
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-xs flex items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={logSearch}
                onChange={(e) => setLogSearch(e.target.value)}
                placeholder="Search audit trail by action, email, or entity..."
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:bg-white focus:border-blue-600"
              />
            </div>
            <span className="text-xs text-slate-500">{filteredLogs.length} events logged</span>
          </div>

          <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-xs">
            {filteredLogs.length === 0 ? (
              <div className="p-10 text-center text-xs text-slate-400">No audit log records found.</div>
            ) : (
              <div className="divide-y divide-slate-100">
                {filteredLogs.map((l) => (
                  <div key={l.id} className="p-4 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200">
                          {l.action}
                        </span>
                        <span className="text-slate-400 text-[11px]">[{l.entityType}]</span>
                      </div>
                      <p className="text-slate-800 font-medium">{l.details}</p>
                    </div>

                    <div className="text-right text-[11px] text-slate-400 shrink-0">
                      <p className="font-mono text-slate-600">{l.performedByEmail}</p>
                      <p>{new Date(l.createdAt).toLocaleString()}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* 5. SETTINGS TAB */}
      {/* ================================================================= */}
      {activeTab === 'settings' && settings && (
        <div className="space-y-6">
          {/* Authorized Administrators */}
          <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-7 shadow-xs space-y-4">
            <div className="border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                Authorized Application Owners / Administrators
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Accounts with organization-level access. The primary owner account is permanently protected.
              </p>
            </div>

            <div className="space-y-2">
              {settings.authorizedAppOwners.map((email, idx) => {
                const isPrimary = idx === 0 || email.toLowerCase() === 'avishah.as119@gmail.com';
                return (
                  <div
                    key={email}
                    className="p-3 bg-slate-50 rounded-2xl border border-slate-200 flex items-center justify-between text-xs"
                  >
                    <div className="flex items-center gap-2.5">
                      <ShieldCheck className="w-4 h-4 text-blue-600" />
                      <span className="font-mono font-bold text-slate-900">{email}</span>
                      {isPrimary && (
                        <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 text-[10px] font-bold">
                          Primary App Owner
                        </span>
                      )}
                    </div>

                    {!isPrimary && (
                      <button
                        onClick={() => handleRemoveAdmin(email)}
                        className="text-rose-600 font-bold hover:underline cursor-pointer"
                      >
                        Revoke Access
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Add secondary admin form */}
            <form onSubmit={handleAddAdmin} className="pt-2 flex gap-2">
              <input
                type="email"
                required
                value={newAdminEmail}
                onChange={(e) => setNewAdminEmail(e.target.value)}
                placeholder="colleague.admin@hospital.org"
                className="flex-1 px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:bg-white focus:border-blue-600"
              />
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Authorize Admin</span>
              </button>
            </form>
          </div>

          {/* System Switches */}
          <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-7 shadow-xs space-y-4">
            <div className="border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                System Toggles & Security Controls
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Application availability and onboarding governance.
              </p>
            </div>

            <div className="divide-y divide-slate-100">
              <div className="py-3 flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-slate-900">Allow New User Registration</p>
                  <p className="text-[11px] text-slate-500">
                    When enabled, new researchers can create accounts and sign in.
                  </p>
                </div>
                <button
                  onClick={() => handleToggleSetting('allowRegistration', !settings.allowRegistration)}
                  className={`w-12 h-6 rounded-full transition-colors p-1 cursor-pointer flex items-center ${
                    settings.allowRegistration ? 'bg-blue-600 justify-end' : 'bg-slate-300 justify-start'
                  }`}
                >
                  <span className="w-4 h-4 rounded-full bg-white shadow-xs" />
                </button>
              </div>

              <div className="py-3 flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-slate-900">Maintenance Mode</p>
                  <p className="text-[11px] text-slate-500">
                    Temporarily limits user access for database upgrades or audits.
                  </p>
                </div>
                <button
                  onClick={() => handleToggleSetting('maintenanceMode', !settings.maintenanceMode)}
                  className={`w-12 h-6 rounded-full transition-colors p-1 cursor-pointer flex items-center ${
                    settings.maintenanceMode ? 'bg-amber-600 justify-end' : 'bg-slate-300 justify-start'
                  }`}
                >
                  <span className="w-4 h-4 rounded-full bg-white shadow-xs" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* 6. LEGAL & POLICIES TAB */}
      {/* ================================================================= */}
      {activeTab === 'legal' && (
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs">
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-1">
              Legal, Privacy & Compliance Documents
            </h3>
            <p className="text-xs text-slate-500">
              Manage in-app institutional policies, terms of use, data deletion disclosures, and disclaimers.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {legalPolicies.map((p) => (
              <div key={p.id} className="bg-white border border-slate-200 rounded-3xl p-5 sm:p-6 shadow-xs space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-base font-extrabold text-slate-900">{p.title}</h4>
                    <span className="text-[11px] text-slate-400">
                      Last updated: {new Date(p.lastUpdated).toLocaleDateString()}
                    </span>
                  </div>
                  <button
                    onClick={() => setEditingPolicy({ id: p.id, title: p.title, content: p.content })}
                    className="px-3.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                  >
                    Edit Content
                  </button>
                </div>

                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 text-xs text-slate-700 max-h-40 overflow-y-auto whitespace-pre-line leading-relaxed">
                  {p.content}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Group Details Modal */}
      {selectedGroupDetails && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-lg shadow-2xl p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h4 className="text-base font-bold text-slate-900">{selectedGroupDetails.name}</h4>
                <p className="text-xs text-slate-500">{selectedGroupDetails.institution || 'No institution listed'}</p>
              </div>
              <button
                onClick={() => setSelectedGroupDetails(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <span className="font-bold text-slate-700 block mb-0.5">Study Title:</span>
                <p className="text-slate-600 italic bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                  &ldquo;{selectedGroupDetails.studyTitle}&rdquo;
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-[10px] font-bold uppercase text-slate-400 block">Target Cases</span>
                  <span className="text-base font-bold text-slate-900">{selectedGroupDetails.targetSampleSize}</span>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-[10px] font-bold uppercase text-slate-400 block">Cases Registered</span>
                  <span className="text-base font-bold text-slate-900">{selectedGroupDetails.caseCount}</span>
                </div>
              </div>

              <div>
                <span className="font-bold text-slate-700 block mb-1">Study Researchers ({selectedGroupDetails.members.length}):</span>
                <div className="space-y-1.5">
                  {selectedGroupDetails.members.map((m) => (
                    <div key={m.userId} className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
                      <div>
                        <span className="font-bold text-slate-900">{m.displayName}</span>
                        <span className="text-slate-500 text-[11px] block">{m.email}</span>
                      </div>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-slate-200 text-slate-700">
                        {m.role}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100 flex items-center justify-end">
              <button
                onClick={() => setSelectedGroupDetails(null)}
                className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Legal Policy Modal */}
      {editingPolicy && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-2xl shadow-2xl p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h4 className="text-base font-bold text-slate-900">Edit {editingPolicy.title}</h4>
              <button
                onClick={() => setEditingPolicy(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveLegalPolicy} className="flex-1 flex flex-col space-y-4 min-h-0">
              <textarea
                value={editingPolicy.content}
                onChange={(e) => setEditingPolicy({ ...editingPolicy, content: e.target.value })}
                rows={12}
                required
                className="w-full flex-1 p-3.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono text-slate-900 focus:outline-none focus:bg-white focus:border-blue-600 resize-none leading-relaxed"
              />

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingPolicy(null)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
                >
                  Save Policy Updates
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* User Status Modal Confirmation */}
      {userToModify && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-sm shadow-2xl p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div className="text-center space-y-1">
              <h4 className="text-base font-bold text-slate-900">
                {userToModify.targetStatus === 'suspended' ? 'Suspend Researcher Account?' : 'Reactivate Researcher Account?'}
              </h4>
              <p className="text-xs text-slate-500">
                User: <strong>{userToModify.name}</strong> ({userToModify.email})
              </p>
            </div>

            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                onClick={() => setUserToModify(null)}
                className="px-4 py-2 border border-slate-300 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmUserStatus}
                className={`px-4 py-2 text-white rounded-xl text-xs font-bold cursor-pointer ${
                  userToModify.targetStatus === 'suspended'
                    ? 'bg-rose-600 hover:bg-rose-700'
                    : 'bg-emerald-600 hover:bg-emerald-700'
                }`}
              >
                Confirm {userToModify.targetStatus === 'suspended' ? 'Suspend' : 'Reactivate'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Group Modal Confirmation */}
      {groupToDelete && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-sm shadow-2xl p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="w-10 h-10 rounded-2xl bg-rose-100 text-rose-700 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div className="text-center space-y-1">
              <h4 className="text-base font-bold text-slate-900">Permanently Delete Group?</h4>
              <p className="text-xs text-slate-500">
                Are you sure you want to delete <strong>{groupToDelete.name}</strong>? All {groupToDelete.caseCount} patient cases and invitations for this study will be permanently purged.
              </p>
            </div>

            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                onClick={() => setGroupToDelete(null)}
                className="px-4 py-2 border border-slate-300 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDeleteGroup}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold cursor-pointer"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
