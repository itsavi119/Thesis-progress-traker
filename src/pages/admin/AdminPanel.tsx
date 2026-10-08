import React, { useState, useEffect, useCallback } from 'react';
import {
  LayoutDashboard,
  Users,
  FolderKanban,
  ShieldAlert,
  Settings,
  LogOut,
  RefreshCw,
  Search,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  UserCheck,
  UserX,
  Trash2,
  Shield,
  Clock,
  Activity,
  FileSpreadsheet,
  Layers,
  Calendar,
  Eye,
  X,
  Radio,
  UserPlus,
  Mail,
  Copy,
  Send,
  KeyRound,
  Check,
} from 'lucide-react';
import { api } from '../../services/api.js';
import type {
  AdminGroup,
  AdminInvitation,
  AdminSettings,
  AdminStats,
  AdminUser,
  AuditLogEntry,
  UserProfile,
  UserRole,
} from '../../types/index.js';

interface AdminPanelProps {
  currentUser: UserProfile;
  onLogout: () => void;
  onNavigateHome: () => void;
}

type AdminTab = 'overview' | 'users' | 'admins' | 'groups' | 'audit' | 'settings';

export const AdminPanel: React.FC<AdminPanelProps> = ({
  currentUser,
  onLogout,
  onNavigateHome,
}) => {
  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);

  // Overview Data
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [recentAudit, setRecentAudit] = useState<AuditLogEntry[]>([]);
  const [recentUsers, setRecentUsers] = useState<AdminUser[]>([]);

  // Users Data
  const [usersList, setUsersList] = useState<AdminUser[]>([]);
  const [userSearch, setUserSearch] = useState<string>('');
  const [userStatusFilter, setUserStatusFilter] = useState<string>('ALL');
  const [userRoleFilter, setUserRoleFilter] = useState<string>('ALL');
  const [selectedUserDetail, setSelectedUserDetail] = useState<{
    user: AdminUser;
    activity: AuditLogEntry[];
    casesCount: number;
  } | null>(null);
  const [loadingUserDetail, setLoadingUserDetail] = useState<boolean>(false);

  // Administrator Invitations & Team Data
  const [adminInvitations, setAdminInvitations] = useState<AdminInvitation[]>([]);
  const [showInviteModal, setShowInviteModal] = useState<boolean>(false);
  const [inviteEmail, setInviteEmail] = useState<string>('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'super_admin'>('admin');
  const [inviteNote, setInviteNote] = useState<string>('');
  const [isSendingInvite, setIsSendingInvite] = useState<boolean>(false);
  const [sentInviteResult, setSentInviteResult] = useState<{
    invitation: AdminInvitation;
    inviteLink: string;
  } | null>(null);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);

  // Groups Data
  const [groupsList, setGroupsList] = useState<AdminGroup[]>([]);
  const [groupSearch, setGroupSearch] = useState<string>('');
  const [groupStatusFilter, setGroupStatusFilter] = useState<string>('ALL');
  const [deletingGroup, setDeletingGroup] = useState<AdminGroup | null>(null);
  const [deleteConfirmationInput, setDeleteConfirmationInput] = useState<string>('');

  // Audit Logs Data
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [auditFilterAction, setAuditFilterAction] = useState<string>('');
  const [auditFilterEntity, setAuditFilterEntity] = useState<string>('ALL');

  // Settings Data
  const [settings, setSettings] = useState<AdminSettings | null>(null);

  const isSuperAdmin = currentUser.role === 'super_admin';

  const showNotification = (msg: string, type: 'success' | 'error' = 'success') => {
    if (type === 'success') {
      setSuccessBanner(msg);
      setTimeout(() => setSuccessBanner(null), 4000);
    } else {
      setErrorBanner(msg);
      setTimeout(() => setErrorBanner(null), 5000);
    }
  };

  const loadData = useCallback(async () => {
    setRefreshing(true);
    try {
      if (activeTab === 'overview') {
        const res = await api.getAdminOverview();
        setStats(res.stats);
        setRecentAudit(res.recentAudit);
        setRecentUsers(res.recentUsers);
        try {
          const invRes = await api.getAdminInvitations();
          setAdminInvitations(invRes.invitations);
        } catch {}
      } else if (activeTab === 'users') {
        const res = await api.getAdminUsers({
          search: userSearch,
          status: userStatusFilter,
          role: userRoleFilter,
        });
        setUsersList(res.users);
      } else if (activeTab === 'admins') {
        const [invRes, usersRes] = await Promise.all([
          api.getAdminInvitations(),
          api.getAdminUsers(),
        ]);
        setAdminInvitations(invRes.invitations);
        setUsersList(usersRes.users);
      } else if (activeTab === 'groups') {
        const res = await api.getAdminGroups({
          search: groupSearch,
          status: groupStatusFilter,
        });
        setGroupsList(res.groups);
      } else if (activeTab === 'audit') {
        const res = await api.getAdminAuditLogs({
          limit: 150,
          action: auditFilterAction || undefined,
          entityType: auditFilterEntity !== 'ALL' ? auditFilterEntity : undefined,
        });
        setAuditLogs(res.logs);
      } else if (activeTab === 'settings') {
        const res = await api.getAdminSettings();
        setSettings(res.settings);
      }
    } catch (err: any) {
      showNotification(err?.message || 'Failed to load administrative data.', 'error');
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, [
    activeTab,
    userSearch,
    userStatusFilter,
    userRoleFilter,
    groupSearch,
    groupStatusFilter,
    auditFilterAction,
    auditFilterEntity,
  ]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Periodic heartbeat & refresh
  useEffect(() => {
    const interval = setInterval(() => {
      api.sendPresenceHeartbeat().catch(() => {});
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  // User Actions
  const handleToggleUserStatus = async (user: AdminUser) => {
    const newStatus = user.status === 'active' ? 'suspended' : 'active';
    try {
      await api.setAdminUserStatus(user.id, newStatus);
      showNotification(`Account ${user.email} marked as ${newStatus}.`);
      loadData();
      if (selectedUserDetail && selectedUserDetail.user.id === user.id) {
        setSelectedUserDetail({
          ...selectedUserDetail,
          user: { ...selectedUserDetail.user, status: newStatus },
        });
      }
    } catch (err: any) {
      showNotification(err?.message || 'Failed to update user status.', 'error');
    }
  };

  const handleChangeUserRole = async (user: AdminUser, newRole: UserRole) => {
    try {
      await api.setAdminUserRole(user.id, newRole);
      showNotification(`Role for ${user.email} changed to ${newRole}.`);
      loadData();
      if (selectedUserDetail && selectedUserDetail.user.id === user.id) {
        setSelectedUserDetail({
          ...selectedUserDetail,
          user: { ...selectedUserDetail.user, role: newRole },
        });
      }
    } catch (err: any) {
      showNotification(err?.message || 'Failed to change user role.', 'error');
    }
  };

  const handleDeleteUser = async (user: AdminUser) => {
    if (!window.confirm(`Permanently remove user "${user.email}"? This action cannot be undone.`)) {
      return;
    }
    try {
      await api.deleteAdminUser(user.id);
      showNotification(`User account ${user.email} removed.`);
      setSelectedUserDetail(null);
      loadData();
    } catch (err: any) {
      showNotification(err?.message || 'Failed to delete user account.', 'error');
    }
  };

  const handleInspectUser = async (userId: string) => {
    setLoadingUserDetail(true);
    try {
      const detail = await api.getAdminUserDetail(userId);
      setSelectedUserDetail(detail);
    } catch (err: any) {
      showNotification(err?.message || 'Failed to retrieve user details.', 'error');
    } finally {
      setLoadingUserDetail(false);
    }
  };

  // Group Actions
  const handleToggleGroupStatus = async (group: AdminGroup, newStatus: 'active' | 'archived' | 'suspended') => {
    try {
      await api.setAdminGroupStatus(group.id, newStatus);
      showNotification(`Research study "${group.name}" status updated to ${newStatus}.`);
      loadData();
    } catch (err: any) {
      showNotification(err?.message || 'Failed to update study status.', 'error');
    }
  };

  const handleConfirmDeleteGroup = async () => {
    if (!deletingGroup) return;
    if (deleteConfirmationInput.trim().toLowerCase() !== deletingGroup.name.trim().toLowerCase()) {
      showNotification('Confirmation study name does not match exactly.', 'error');
      return;
    }

    try {
      await api.deleteAdminGroup(deletingGroup.id, deleteConfirmationInput.trim());
      showNotification(`Study "${deletingGroup.name}" deleted and purged.`);
      setDeletingGroup(null);
      setDeleteConfirmationInput('');
      loadData();
    } catch (err: any) {
      showNotification(err?.message || 'Failed to delete study.', 'error');
    }
  };

  // Administrator Invitation Actions
  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) {
      showNotification('Recipient administrator email is required.', 'error');
      return;
    }
    setIsSendingInvite(true);
    try {
      const res = await api.createAdminInvitation({
        email: inviteEmail.trim(),
        role: inviteRole,
        note: inviteNote.trim() || undefined,
      });
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      setSentInviteResult({
        invitation: res.invitation,
        inviteLink: `${origin}${res.inviteLink}`,
      });
      setInviteEmail('');
      setInviteNote('');
      showNotification(`Administrator invitation dispatched to ${res.invitation.email}!`);
      loadData();
    } catch (err: any) {
      showNotification(err?.message || 'Failed to send administrator invitation.', 'error');
    } finally {
      setIsSendingInvite(false);
    }
  };

  const handleRevokeInvite = async (inviteId: string) => {
    if (!window.confirm('Are you sure you want to revoke this administrator invitation?')) return;
    try {
      await api.revokeAdminInvitation(inviteId);
      showNotification('Administrator invitation revoked.');
      loadData();
    } catch (err: any) {
      showNotification(err?.message || 'Failed to revoke invitation.', 'error');
    }
  };

  const handleResendInvite = async (inviteId: string) => {
    try {
      const res = await api.resendAdminInvitation(inviteId);
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      setSentInviteResult({
        invitation: res.invitation,
        inviteLink: `${origin}${res.inviteLink}`,
      });
      setShowInviteModal(true);
      showNotification(`Administrator invitation renewed for ${res.invitation.email}.`);
      loadData();
    } catch (err: any) {
      showNotification(err?.message || 'Failed to renew invitation.', 'error');
    }
  };

  const handleCopyInviteLink = (linkOrToken: string) => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const url = linkOrToken.startsWith('http')
      ? linkOrToken
      : `${origin}/admin/accept-invite?token=${encodeURIComponent(linkOrToken)}`;
    navigator.clipboard
      .writeText(url)
      .then(() => {
        setCopiedLink(true);
        showNotification('Invitation link copied to clipboard!');
        setTimeout(() => setCopiedLink(false), 2500);
      })
      .catch(() => {
        showNotification('Could not copy link automatically.', 'error');
      });
  };

  // Settings Actions
  const handleToggleMaintenance = async () => {
    if (!settings) return;
    const newMaintenance = !settings.maintenanceMode;
    try {
      const res = await api.updateAdminSettings({ maintenanceMode: newMaintenance });
      setSettings(res.settings);
      showNotification(`Maintenance mode is now ${newMaintenance ? 'ACTIVE' : 'OFF'}.`);
    } catch (err: any) {
      showNotification(err?.message || 'Failed to update maintenance mode.', 'error');
    }
  };

  const handleToggleRegistration = async () => {
    if (!settings) return;
    const newAllow = !settings.allowRegistration;
    try {
      const res = await api.updateAdminSettings({ allowRegistration: newAllow });
      setSettings(res.settings);
      showNotification(`Researcher registration is now ${newAllow ? 'ENABLED' : 'PAUSED'}.`);
    } catch (err: any) {
      showNotification(err?.message || 'Failed to update registration setting.', 'error');
    }
  };

  const handleAdminLogout = async () => {
    await api.adminLogout();
    onLogout();
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col antialiased">
      {/* Top Administrative Header */}
      <header className="bg-slate-900 border-b border-slate-800 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-rose-600 to-amber-600 flex items-center justify-center shadow-md shadow-rose-950/50">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm tracking-tight text-white">Thesis Progress Tracker</span>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30">
                  {currentUser.role === 'super_admin' ? 'Super Admin' : 'Admin'}
                </span>
              </div>
              <p className="text-[11px] text-slate-400">Security Administration & Monitoring Console</p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-4">
            <button
              type="button"
              onClick={loadData}
              disabled={refreshing}
              title="Refresh Data"
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            </button>

            <div className="h-6 w-px bg-slate-800 hidden sm:block" />

            <div className="hidden sm:flex flex-col text-right">
              <span className="text-xs font-medium text-slate-200">{currentUser.display_name}</span>
              <span className="text-[10px] text-slate-400 truncate max-w-[180px]">{currentUser.email}</span>
            </div>

            <button
              type="button"
              onClick={handleAdminLogout}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium transition-colors cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex overflow-x-auto gap-1 border-t border-slate-800/80">
          <button
            type="button"
            onClick={() => setActiveTab('overview')}
            className={`flex items-center gap-2 px-4 py-3 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'overview'
                ? 'border-rose-500 text-white bg-slate-800/40'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
            }`}
          >
            <LayoutDashboard className="w-4 h-4" />
            <span>Dashboard</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('users')}
            className={`flex items-center gap-2 px-4 py-3 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'users'
                ? 'border-rose-500 text-white bg-slate-800/40'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>User Management</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('admins')}
            className={`flex items-center gap-2 px-4 py-3 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'admins'
                ? 'border-rose-500 text-white bg-slate-800/40'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
            }`}
          >
            <Shield className="w-4 h-4" />
            <span>Admin Team & Invites</span>
            {adminInvitations.filter((i) => i.status === 'pending').length > 0 && (
              <span className="ml-1 px-1.5 py-0.2 rounded-full bg-rose-500/30 text-rose-300 text-[10px] font-bold">
                {adminInvitations.filter((i) => i.status === 'pending').length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('groups')}
            className={`flex items-center gap-2 px-4 py-3 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'groups'
                ? 'border-rose-500 text-white bg-slate-800/40'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
            }`}
          >
            <FolderKanban className="w-4 h-4" />
            <span>Research Groups</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('audit')}
            className={`flex items-center gap-2 px-4 py-3 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'audit'
                ? 'border-rose-500 text-white bg-slate-800/40'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
            }`}
          >
            <ShieldAlert className="w-4 h-4" />
            <span>Activity & Security Log</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('settings')}
            className={`flex items-center gap-2 px-4 py-3 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'settings'
                ? 'border-rose-500 text-white bg-slate-800/40'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
            }`}
          >
            <Settings className="w-4 h-4" />
            <span>System Settings</span>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Banner Notifications */}
        {errorBanner && (
          <div className="mb-6 p-4 rounded-xl bg-rose-950/70 border border-rose-800 text-rose-200 text-sm flex items-center justify-between">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
              <span>{errorBanner}</span>
            </div>
            <button onClick={() => setErrorBanner(null)} className="text-rose-400 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {successBanner && (
          <div className="mb-6 p-4 rounded-xl bg-emerald-950/70 border border-emerald-800 text-emerald-200 text-sm flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
              <span>{successBanner}</span>
            </div>
            <button onClick={() => setSuccessBanner(null)} className="text-emerald-400 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {isLoading ? (
          <div className="py-24 flex flex-col items-center justify-center text-slate-400">
            <div className="w-8 h-8 border-2 border-slate-700 border-t-rose-500 rounded-full animate-spin mb-4" />
            <p className="text-sm">Loading security and database telemetry...</p>
          </div>
        ) : (
          <>
            {/* ========================================================================= */}
            {/* TAB 1: DASHBOARD / OVERVIEW */}
            {/* ========================================================================= */}
            {activeTab === 'overview' && stats && (
              <div className="space-y-8">
                {/* Super Admin Identity & Authority Banner */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-3.5">
                    <div className="w-11 h-11 rounded-xl bg-gradient-to-tr from-rose-600 to-amber-600 flex items-center justify-center text-white shadow-md shadow-rose-950/50 shrink-0">
                      <Shield className="w-6 h-6" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold text-white">Super Administrator:</span>
                        <span className="text-xs font-semibold text-rose-300 font-mono">avishah.as118@gmail.com</span>
                        <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30">
                          Sole Authority
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Clean database telemetry. Primary super administrator can invite team members to accept and become administrators via email.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        setActiveTab('admins');
                        setShowInviteModal(true);
                      }}
                      className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white text-xs font-bold shadow-md shadow-rose-950/50 transition-all cursor-pointer whitespace-nowrap"
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                      <span>Invite Administrator</span>
                    </button>
                  </div>
                </div>

                {/* Metric Summary Cards */}
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4 flex items-center gap-2">
                    <Activity className="w-4 h-4 text-rose-400" />
                    <span>Real Platform Metrics (Verified Database Telemetry)</span>
                  </h3>

                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
                    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                      <p className="text-xs text-slate-400">Total Users</p>
                      <p className="text-2xl font-bold text-white mt-1">{stats.totalUsers}</p>
                      <p className="text-[11px] text-emerald-400 mt-1">+{stats.newUsersLast30Days} new (30d)</p>
                    </div>

                    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                      <p className="text-xs text-slate-400">Active Accounts</p>
                      <p className="text-2xl font-bold text-emerald-400 mt-1">{stats.activeUsers}</p>
                      <p className="text-[11px] text-slate-500 mt-1">{stats.inactiveUsers} suspended</p>
                    </div>

                    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                      <p className="text-xs text-slate-400">Active (24 Hours)</p>
                      <p className="text-2xl font-bold text-cyan-400 mt-1">{stats.recentlyActiveUsers24h}</p>
                      <p className="text-[11px] text-slate-500 mt-1">Authenticated</p>
                    </div>

                    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 relative overflow-hidden">
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-slate-400">Online Now</p>
                        <span className="flex h-2 w-2 relative">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                        </span>
                      </div>
                      <p className="text-2xl font-bold text-emerald-300 mt-1">{stats.currentlyOnlineUsers}</p>
                      <p className="text-[11px] text-slate-500 mt-1">&lt;5 min presence</p>
                    </div>

                    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                      <p className="text-xs text-slate-400">Research Studies</p>
                      <p className="text-2xl font-bold text-purple-400 mt-1">{stats.totalGroups}</p>
                      <p className="text-[11px] text-slate-500 mt-1">{stats.activeGroups} active cohorts</p>
                    </div>

                    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                      <p className="text-xs text-slate-400">Thesis Records</p>
                      <p className="text-2xl font-bold text-amber-400 mt-1">{stats.totalCases}</p>
                      <p className="text-[11px] text-slate-500 mt-1">{stats.totalMemberships} memberships</p>
                    </div>
                  </div>
                </div>

                {/* Split: Recent Users & Recent Audit Events */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  {/* Recent User Registrations */}
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="text-sm font-bold text-white flex items-center gap-2">
                        <Users className="w-4 h-4 text-blue-400" />
                        <span>Recent User Accounts</span>
                      </h4>
                      <button
                        type="button"
                        onClick={() => setActiveTab('users')}
                        className="text-xs text-rose-400 hover:text-rose-300 font-semibold cursor-pointer"
                      >
                        View All Users →
                      </button>
                    </div>

                    {recentUsers.length === 0 ? (
                      <p className="text-xs text-slate-500 py-4">No user accounts found.</p>
                    ) : (
                      <div className="space-y-3">
                        {recentUsers.map((u) => (
                          <div
                            key={u.id}
                            className="flex items-center justify-between p-3 rounded-xl bg-slate-950/60 border border-slate-800/80"
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center font-bold text-xs text-slate-300">
                                {u.displayName.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-semibold text-white">{u.displayName}</span>
                                  <span className={`text-[9px] uppercase px-1.5 py-0.2 rounded font-bold ${
                                    u.role === 'super_admin'
                                      ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                                      : u.role === 'admin'
                                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                      : 'bg-slate-800 text-slate-400'
                                  }`}>
                                    {u.role}
                                  </span>
                                </div>
                                <span className="text-[11px] text-slate-400">{u.email}</span>
                              </div>
                            </div>

                            <div className="text-right">
                              <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                u.status === 'active' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-rose-950 text-rose-400 border border-rose-800'
                              }`}>
                                {u.status}
                              </span>
                              <p className="text-[10px] text-slate-500 mt-1">
                                {new Date(u.createdAt).toLocaleDateString()}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Recent Security & Administrative Logs */}
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="text-sm font-bold text-white flex items-center gap-2">
                        <ShieldAlert className="w-4 h-4 text-amber-400" />
                        <span>Security & Audit Stream</span>
                      </h4>
                      <button
                        type="button"
                        onClick={() => setActiveTab('audit')}
                        className="text-xs text-rose-400 hover:text-rose-300 font-semibold cursor-pointer"
                      >
                        Full Audit Log →
                      </button>
                    </div>

                    {recentAudit.length === 0 ? (
                      <p className="text-xs text-slate-500 py-4">No audit events recorded.</p>
                    ) : (
                      <div className="space-y-3">
                        {recentAudit.map((log) => (
                          <div
                            key={log.id}
                            className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 text-xs"
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-semibold text-slate-200">{log.action}</span>
                              <span className="text-[10px] text-slate-500">
                                {new Date(log.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-400 line-clamp-1">{log.details}</p>
                            <p className="text-[10px] text-slate-500 mt-1 truncate">
                              Actor: <span className="text-slate-400">{log.performedByEmail}</span>
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ========================================================================= */}
            {/* TAB 2: USER MANAGEMENT */}
            {/* ========================================================================= */}
            {activeTab === 'users' && (
              <div className="space-y-6">
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-bold text-white">Registered Researchers & Users</h3>
                    <p className="text-xs text-slate-400">
                      Manage platform accounts, roles, access status, and view group memberships.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <div className="relative flex-1 sm:w-64">
                      <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={userSearch}
                        onChange={(e) => setUserSearch(e.target.value)}
                        placeholder="Search by name or email..."
                        className="w-full pl-9 pr-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
                      />
                    </div>

                    <select
                      value={userStatusFilter}
                      onChange={(e) => setUserStatusFilter(e.target.value)}
                      className="px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-300 focus:outline-none cursor-pointer"
                    >
                      <option value="ALL">All Status</option>
                      <option value="active">Active Only</option>
                      <option value="suspended">Suspended Only</option>
                    </select>

                    <select
                      value={userRoleFilter}
                      onChange={(e) => setUserRoleFilter(e.target.value)}
                      className="px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-300 focus:outline-none cursor-pointer"
                    >
                      <option value="ALL">All Roles</option>
                      <option value="member">Researchers (Members)</option>
                      <option value="admin">Administrators</option>
                      <option value="super_admin">Super Admins</option>
                    </select>
                  </div>
                </div>

                {/* Users Table */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-950/80 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800">
                        <tr>
                          <th className="py-3.5 px-4">User</th>
                          <th className="py-3.5 px-4">Role</th>
                          <th className="py-3.5 px-4">Status</th>
                          <th className="py-3.5 px-4">Created Date</th>
                          <th className="py-3.5 px-4">Last Activity</th>
                          <th className="py-3.5 px-4">Studies</th>
                          <th className="py-3.5 px-4 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/80">
                        {usersList.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="text-center py-12 text-slate-500">
                              No users match the search criteria.
                            </td>
                          </tr>
                        ) : (
                          usersList.map((u) => (
                            <tr key={u.id} className="hover:bg-slate-800/30 transition-colors">
                              <td className="py-3.5 px-4">
                                <div className="font-semibold text-white">{u.displayName}</div>
                                <div className="text-[11px] text-slate-400">{u.email}</div>
                              </td>

                              <td className="py-3.5 px-4">
                                <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                  u.role === 'super_admin'
                                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                                    : u.role === 'admin'
                                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                    : 'bg-slate-800 text-slate-300'
                                }`}>
                                  {u.role}
                                </span>
                              </td>

                              <td className="py-3.5 px-4">
                                <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                  u.status === 'active'
                                    ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800/80'
                                    : 'bg-rose-950/80 text-rose-400 border border-rose-800/80'
                                }`}>
                                  <span className={`w-1.5 h-1.5 rounded-full ${u.status === 'active' ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                                  {u.status}
                                </span>
                              </td>

                              <td className="py-3.5 px-4 text-slate-400">
                                {new Date(u.createdAt).toLocaleDateString()}
                              </td>

                              <td className="py-3.5 px-4 text-slate-400">
                                {u.lastActiveAt ? new Date(u.lastActiveAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Never'}
                              </td>

                              <td className="py-3.5 px-4 text-slate-300">
                                {u.groupCount} group{u.groupCount !== 1 ? 's' : ''}
                              </td>

                              <td className="py-3.5 px-4 text-right">
                                <div className="flex items-center justify-end gap-2">
                                  <button
                                    type="button"
                                    onClick={() => handleInspectUser(u.id)}
                                    title="View User Details"
                                    className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
                                  >
                                    <Eye className="w-3.5 h-3.5" />
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => handleToggleUserStatus(u)}
                                    title={u.status === 'active' ? 'Suspend Account' : 'Reactivate Account'}
                                    className={`p-1.5 rounded transition-colors cursor-pointer ${
                                      u.status === 'active'
                                        ? 'bg-slate-800 hover:bg-amber-950 hover:text-amber-300 text-slate-400'
                                        : 'bg-emerald-900/60 hover:bg-emerald-800 text-emerald-300'
                                    }`}
                                  >
                                    {u.status === 'active' ? <UserX className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
                                  </button>

                                  {isSuperAdmin && (
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteUser(u)}
                                      title="Permanently Delete Account"
                                      className="p-1.5 rounded bg-slate-800 hover:bg-rose-950 text-slate-400 hover:text-rose-400 transition-colors cursor-pointer"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Inspect User Detail Modal */}
                {selectedUserDetail && (
                  <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto">
                      <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center font-bold text-white">
                            {selectedUserDetail.user.displayName.charAt(0)}
                          </div>
                          <div>
                            <h4 className="text-base font-bold text-white">{selectedUserDetail.user.displayName}</h4>
                            <p className="text-xs text-slate-400">{selectedUserDetail.user.email}</p>
                          </div>
                        </div>
                        <button
                          onClick={() => setSelectedUserDetail(null)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
                        >
                          <X className="w-5 h-5" />
                        </button>
                      </div>

                      {/* Summary details */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                        <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                          <span className="text-slate-500 block">Status</span>
                          <span className={`font-semibold ${selectedUserDetail.user.status === 'active' ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {selectedUserDetail.user.status}
                          </span>
                        </div>
                        <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                          <span className="text-slate-500 block">Role</span>
                          <span className="font-semibold text-slate-200 uppercase">{selectedUserDetail.user.role}</span>
                        </div>
                        <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                          <span className="text-slate-500 block">Cases Assigned</span>
                          <span className="font-semibold text-amber-400">{selectedUserDetail.casesCount}</span>
                        </div>
                        <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                          <span className="text-slate-500 block">Joined</span>
                          <span className="font-semibold text-slate-300">
                            {new Date(selectedUserDetail.user.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                      </div>

                      {/* Role Management (Super Admin only) */}
                      {isSuperAdmin && (
                        <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                          <span className="text-xs font-semibold text-slate-300 block mb-2">
                            Role Assignment (Server-Enforced Privileges)
                          </span>
                          <div className="flex gap-2">
                            {(['member', 'admin', 'super_admin'] as UserRole[]).map((r) => (
                              <button
                                key={r}
                                type="button"
                                onClick={() => handleChangeUserRole(selectedUserDetail.user, r)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize cursor-pointer transition-colors ${
                                  selectedUserDetail.user.role === r
                                    ? 'bg-rose-600 text-white'
                                    : 'bg-slate-800 text-slate-400 hover:text-white'
                                }`}
                              >
                                {r.replace('_', ' ')}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Associated Research Groups */}
                      <div>
                        <h5 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                          Associated Research Groups ({selectedUserDetail.user.groups.length})
                        </h5>
                        {selectedUserDetail.user.groups.length === 0 ? (
                          <p className="text-xs text-slate-500 bg-slate-950 p-3 rounded-xl border border-slate-800">
                            User is not currently a member of any research study.
                          </p>
                        ) : (
                          <div className="space-y-2">
                            {selectedUserDetail.user.groups.map((g) => (
                              <div key={g.groupId} className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between text-xs">
                                <div>
                                  <p className="font-semibold text-white">{g.groupName}</p>
                                  <p className="text-[10px] text-slate-500">Joined: {new Date(g.joinedAt).toLocaleDateString()}</p>
                                </div>
                                <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px] font-bold uppercase">
                                  {g.role}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Recent User Activity Logs */}
                      <div>
                        <h5 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                          Recent User Activity
                        </h5>
                        {selectedUserDetail.activity.length === 0 ? (
                          <p className="text-xs text-slate-500 bg-slate-950 p-3 rounded-xl border border-slate-800">
                            No recent audit logs for this account.
                          </p>
                        ) : (
                          <div className="space-y-2 max-h-40 overflow-y-auto">
                            {selectedUserDetail.activity.map((l) => (
                              <div key={l.id} className="p-2.5 bg-slate-950 rounded-lg border border-slate-800 text-[11px]">
                                <div className="flex justify-between text-slate-400 mb-0.5">
                                  <span className="font-semibold text-slate-200">{l.action}</span>
                                  <span>{new Date(l.createdAt).toLocaleString()}</span>
                                </div>
                                <p className="text-slate-400">{l.details}</p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ========================================================================= */}
            {/* TAB: ADMINISTRATOR TEAM & INVITATIONS */}
            {/* ========================================================================= */}
            {activeTab === 'admins' && (
              <div className="space-y-6">
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                      <Shield className="w-5 h-5 text-rose-400" />
                      <span>Administrator Team & Invitations</span>
                    </h3>
                    <p className="text-xs text-slate-400">
                      Primary Super Administrator: <strong className="text-rose-300 font-mono">avishah.as118@gmail.com</strong>.
                      Send email invitations to colleagues so they can accept and become administrators.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setSentInviteResult(null);
                      setShowInviteModal(true);
                    }}
                    className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white text-xs font-bold shadow-lg shadow-rose-900/30 transition-all cursor-pointer"
                  >
                    <UserPlus className="w-4 h-4" />
                    <span>Invite Administrator</span>
                  </button>
                </div>

                {/* Active Administrators Section */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>Active System Administrators</span>
                  </h4>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Primary Super Admin Card */}
                    <div className="p-4 rounded-xl bg-slate-950/80 border border-rose-500/30 relative overflow-hidden">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-300 flex items-center justify-center font-bold text-sm">
                            AS
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-white">Avi Shah</span>
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-950 text-rose-300 border border-rose-800 font-bold uppercase">
                                Sole Super Admin
                              </span>
                            </div>
                            <p className="text-xs text-slate-400 font-mono mt-0.5">avishah.as118@gmail.com</p>
                          </div>
                        </div>
                        <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800">
                          Active Primary
                        </span>
                      </div>
                      <p className="mt-3 text-[11px] text-slate-400">
                        Primary administrator with sovereign authority. Can invite other administrators via email, manage roles, and review security events.
                      </p>
                    </div>

                    {/* Other Active Administrators (if any) */}
                    {usersList
                      .filter(
                        (u) =>
                          (u.role === 'admin' || u.role === 'super_admin') &&
                          u.email.toLowerCase() !== 'avishah.as118@gmail.com'
                      )
                      .map((admin) => (
                        <div key={admin.id} className="p-4 rounded-xl bg-slate-950/80 border border-slate-800">
                          <div className="flex items-start justify-between">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-xl bg-slate-800 text-slate-200 flex items-center justify-center font-bold text-sm">
                                {admin.displayName.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-bold text-white">{admin.displayName}</span>
                                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-950 text-amber-300 border border-amber-800 font-bold uppercase">
                                    {admin.role}
                                  </span>
                                </div>
                                <p className="text-xs text-slate-400 font-mono mt-0.5">{admin.email}</p>
                              </div>
                            </div>
                            <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800">
                              {admin.status}
                            </span>
                          </div>
                          <p className="mt-3 text-[11px] text-slate-500">
                            Invited administrator • Joined {new Date(admin.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                      ))}
                  </div>
                </div>

                {/* Sent Administrator Invitations */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                      <Mail className="w-4 h-4 text-rose-400" />
                      <span>Administrator Invitations Sent via Email</span>
                    </h4>
                    <span className="text-xs text-slate-500 font-medium">
                      {adminInvitations.length} total invitation{adminInvitations.length === 1 ? '' : 's'}
                    </span>
                  </div>

                  {adminInvitations.length === 0 ? (
                    <div className="py-12 text-center border border-dashed border-slate-800 rounded-xl bg-slate-950/40">
                      <Mail className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                      <p className="text-xs font-semibold text-slate-300">No administrator invitations sent yet</p>
                      <p className="text-[11px] text-slate-500 max-w-sm mx-auto mt-1">
                        avishah.as118@gmail.com can invite colleagues through email. The recipient receives an invitation link to accept and become an administrator.
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setSentInviteResult(null);
                          setShowInviteModal(true);
                        }}
                        className="mt-4 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white transition-colors cursor-pointer inline-flex items-center gap-2"
                      >
                        <UserPlus className="w-3.5 h-3.5" />
                        <span>Send First Invitation</span>
                      </button>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-800 bg-slate-950/60">
                          <tr>
                            <th className="py-3 px-4">Recipient Email</th>
                            <th className="py-3 px-4">Invited Role</th>
                            <th className="py-3 px-4">Status</th>
                            <th className="py-3 px-4">Invited By</th>
                            <th className="py-3 px-4">Sent At</th>
                            <th className="py-3 px-4">Expires</th>
                            <th className="py-3 px-4 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60">
                          {adminInvitations.map((inv) => (
                            <tr key={inv.id} className="hover:bg-slate-800/30 transition-colors">
                              <td className="py-3.5 px-4">
                                <span className="font-semibold text-white">{inv.email}</span>
                                {inv.note && <p className="text-[10px] text-slate-500 italic mt-0.5">{inv.note}</p>}
                              </td>
                              <td className="py-3.5 px-4">
                                <span
                                  className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
                                    inv.role === 'super_admin'
                                      ? 'bg-rose-950 text-rose-300 border border-rose-800'
                                      : 'bg-amber-950 text-amber-300 border border-amber-800'
                                  }`}
                                >
                                  {inv.role}
                                </span>
                              </td>
                              <td className="py-3.5 px-4">
                                <span
                                  className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                                    inv.status === 'accepted'
                                      ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                                      : inv.status === 'pending'
                                      ? 'bg-amber-950 text-amber-400 border border-amber-800'
                                      : 'bg-slate-800 text-slate-400'
                                  }`}
                                >
                                  {inv.status}
                                </span>
                              </td>
                              <td className="py-3.5 px-4 text-slate-400">{inv.invitedByEmail}</td>
                              <td className="py-3.5 px-4 text-slate-400">{new Date(inv.createdAt).toLocaleDateString()}</td>
                              <td className="py-3.5 px-4 text-slate-400">{new Date(inv.expiresAt).toLocaleDateString()}</td>
                              <td className="py-3.5 px-4 text-right">
                                <div className="flex items-center justify-end gap-2">
                                  {inv.status === 'pending' && inv.token && (
                                    <button
                                      type="button"
                                      onClick={() => handleCopyInviteLink(inv.token!)}
                                      title="Copy Invitation Link"
                                      className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer"
                                    >
                                      <Copy className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                  {inv.status === 'pending' && (
                                    <button
                                      type="button"
                                      onClick={() => handleResendInvite(inv.id)}
                                      title="Resend Email Invitation"
                                      className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer"
                                    >
                                      <Send className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                  {inv.status === 'pending' && (
                                    <button
                                      type="button"
                                      onClick={() => handleRevokeInvite(inv.id)}
                                      title="Revoke Invitation"
                                      className="p-1.5 rounded bg-slate-800 hover:bg-rose-950 text-slate-400 hover:text-rose-400 transition-colors cursor-pointer"
                                    >
                                      <XCircle className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                  {inv.status === 'accepted' && (
                                    <span className="text-[11px] text-emerald-400 flex items-center gap-1">
                                      <Check className="w-3 h-3" /> Accepted
                                    </span>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ========================================================================= */}
            {/* TAB 3: GROUPS MANAGEMENT */}
            {/* ========================================================================= */}
            {activeTab === 'groups' && (
              <div className="space-y-6">
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-bold text-white">Research Studies & Cohorts</h3>
                    <p className="text-xs text-slate-400">
                      Manage thesis studies, clinical research groups, sample size targets, and enrolled case totals.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <div className="relative flex-1 sm:w-64">
                      <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={groupSearch}
                        onChange={(e) => setGroupSearch(e.target.value)}
                        placeholder="Search study name or title..."
                        className="w-full pl-9 pr-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
                      />
                    </div>

                    <select
                      value={groupStatusFilter}
                      onChange={(e) => setGroupStatusFilter(e.target.value)}
                      className="px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-300 focus:outline-none cursor-pointer"
                    >
                      <option value="ALL">All Status</option>
                      <option value="active">Active Only</option>
                      <option value="archived">Archived Only</option>
                      <option value="suspended">Suspended Only</option>
                    </select>
                  </div>
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-950/80 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800">
                        <tr>
                          <th className="py-3.5 px-4">Research Study</th>
                          <th className="py-3.5 px-4">Principal Investigator / Owner</th>
                          <th className="py-3.5 px-4">Study Type</th>
                          <th className="py-3.5 px-4">Target Sample</th>
                          <th className="py-3.5 px-4">Enrolled Cases</th>
                          <th className="py-3.5 px-4">Status</th>
                          <th className="py-3.5 px-4 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/80">
                        {groupsList.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="text-center py-12 text-slate-500">
                              No research groups found matching criteria.
                            </td>
                          </tr>
                        ) : (
                          groupsList.map((g) => (
                            <tr key={g.id} className="hover:bg-slate-800/30 transition-colors">
                              <td className="py-3.5 px-4">
                                <div className="font-semibold text-white">{g.name}</div>
                                <div className="text-[11px] text-slate-400">{g.studyTitle}</div>
                                {g.institution && (
                                  <div className="text-[10px] text-slate-500 mt-0.5">{g.institution}</div>
                                )}
                              </td>

                              <td className="py-3.5 px-4">
                                <div className="text-slate-200 font-medium">{g.ownerName}</div>
                                <div className="text-[11px] text-slate-400">{g.ownerEmail}</div>
                              </td>

                              <td className="py-3.5 px-4 text-slate-300">
                                {g.studyType || 'Observational'}
                              </td>

                              <td className="py-3.5 px-4 text-slate-300">
                                {g.targetSampleSize || 0}
                              </td>

                              <td className="py-3.5 px-4">
                                <span className="font-semibold text-amber-400">{g.caseCount}</span>
                                <span className="text-[11px] text-slate-500"> / {g.memberCount} members</span>
                              </td>

                              <td className="py-3.5 px-4">
                                <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                  g.status === 'active'
                                    ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800/80'
                                    : g.status === 'archived'
                                    ? 'bg-slate-800 text-slate-300'
                                    : 'bg-rose-950/80 text-rose-400 border border-rose-800/80'
                                }`}>
                                  {g.status}
                                </span>
                              </td>

                              <td className="py-3.5 px-4 text-right">
                                <div className="flex items-center justify-end gap-2">
                                  <select
                                    value={g.status}
                                    onChange={(e) => handleToggleGroupStatus(g, e.target.value as any)}
                                    className="bg-slate-800 border border-slate-700 text-slate-200 text-[11px] px-2 py-1 rounded cursor-pointer"
                                  >
                                    <option value="active">Active</option>
                                    <option value="archived">Archived</option>
                                    <option value="suspended">Suspended</option>
                                  </select>

                                  <button
                                    type="button"
                                    onClick={() => {
                                      setDeletingGroup(g);
                                      setDeleteConfirmationInput('');
                                    }}
                                    title="Delete Study"
                                    className="p-1.5 rounded bg-slate-800 hover:bg-rose-950 text-slate-400 hover:text-rose-400 transition-colors cursor-pointer"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Explicit Group Deletion Confirmation Modal */}
                {deletingGroup && (
                  <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-slate-900 border border-rose-800/60 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
                      <div className="flex items-center gap-3 text-rose-400">
                        <AlertTriangle className="w-6 h-6" />
                        <h4 className="font-bold text-base text-white">Confirm Study Deletion</h4>
                      </div>

                      <p className="text-xs text-slate-300 leading-relaxed">
                        You are about to permanently delete the research study{' '}
                        <strong className="text-white">"{deletingGroup.name}"</strong> along with its associated records ({deletingGroup.caseCount} cases, {deletingGroup.memberCount} memberships).
                      </p>

                      <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                        <label className="block text-[11px] text-slate-400 mb-1">
                          Type <span className="text-rose-400 font-bold">{deletingGroup.name}</span> to confirm:
                        </label>
                        <input
                          type="text"
                          value={deleteConfirmationInput}
                          onChange={(e) => setDeleteConfirmationInput(e.target.value)}
                          placeholder={deletingGroup.name}
                          className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white"
                        />
                      </div>

                      <div className="flex justify-end gap-3 pt-2">
                        <button
                          type="button"
                          onClick={() => setDeletingGroup(null)}
                          className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          disabled={deleteConfirmationInput.trim().toLowerCase() !== deletingGroup.name.trim().toLowerCase()}
                          onClick={handleConfirmDeleteGroup}
                          className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                        >
                          Permanently Delete Study
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ========================================================================= */}
            {/* TAB 4: ACTIVITY & SECURITY AUDIT LOG */}
            {/* ========================================================================= */}
            {activeTab === 'audit' && (
              <div className="space-y-6">
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-bold text-white">Administrative & Security Audit Trail</h3>
                    <p className="text-xs text-slate-400">
                      Immutable, server-recorded security events, administrative logins, and account changes.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <div className="relative flex-1 sm:w-64">
                      <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={auditFilterAction}
                        onChange={(e) => setAuditFilterAction(e.target.value)}
                        placeholder="Filter by action keyword..."
                        className="w-full pl-9 pr-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
                      />
                    </div>

                    <select
                      value={auditFilterEntity}
                      onChange={(e) => setAuditFilterEntity(e.target.value)}
                      className="px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-300 focus:outline-none cursor-pointer"
                    >
                      <option value="ALL">All Entity Types</option>
                      <option value="security">Security & Auth</option>
                      <option value="user">User Accounts</option>
                      <option value="group">Research Studies</option>
                      <option value="settings">System Settings</option>
                      <option value="legal">Legal & Policy</option>
                    </select>
                  </div>
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-950/80 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800">
                        <tr>
                          <th className="py-3.5 px-4">Timestamp</th>
                          <th className="py-3.5 px-4">Action</th>
                          <th className="py-3.5 px-4">Entity Type</th>
                          <th className="py-3.5 px-4">Actor</th>
                          <th className="py-3.5 px-4">Details</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/80">
                        {auditLogs.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="text-center py-12 text-slate-500">
                              No audit log records match filter.
                            </td>
                          </tr>
                        ) : (
                          auditLogs.map((log) => (
                            <tr key={log.id} className="hover:bg-slate-800/30 transition-colors">
                              <td className="py-3.5 px-4 text-slate-400 whitespace-nowrap">
                                {new Date(log.createdAt).toLocaleString([], {
                                  month: 'short',
                                  day: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                  second: '2-digit',
                                })}
                              </td>

                              <td className="py-3.5 px-4 whitespace-nowrap">
                                <span className={`inline-block px-2 py-0.5 rounded font-mono text-[10px] font-bold ${
                                  log.action.includes('FAIL') || log.action.includes('UNAUTHORIZED') || log.action.includes('DELETED')
                                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                                    : log.action.includes('SUCCESS') || log.action.includes('REACTIVATED')
                                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                    : 'bg-slate-800 text-slate-300'
                                }`}>
                                  {log.action}
                                </span>
                              </td>

                              <td className="py-3.5 px-4 capitalize text-slate-400">
                                {log.entityType}
                              </td>

                              <td className="py-3.5 px-4">
                                <span className="text-slate-200 font-medium">{log.performedByEmail}</span>
                              </td>

                              <td className="py-3.5 px-4 text-slate-300 max-w-md break-words">
                                {log.details}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* ========================================================================= */}
            {/* TAB 5: SYSTEM SETTINGS */}
            {/* ========================================================================= */}
            {activeTab === 'settings' && settings && (
              <div className="max-w-3xl space-y-8">
                <div>
                  <h3 className="text-lg font-bold text-white">Platform System & Security Controls</h3>
                  <p className="text-xs text-slate-400">
                    Control global researcher registration, application availability, and review security boundaries.
                  </p>
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6">
                  {/* Registration Toggle */}
                  <div className="flex items-center justify-between pb-6 border-b border-slate-800">
                    <div>
                      <h4 className="text-sm font-bold text-white">Researcher Registration Gate</h4>
                      <p className="text-xs text-slate-400 mt-0.5">
                        When paused, standard user signup is rejected with server-side validation error.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={handleToggleRegistration}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        settings.allowRegistration ? 'bg-emerald-600' : 'bg-slate-700'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                          settings.allowRegistration ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>

                  {/* Maintenance Mode Toggle */}
                  <div className="flex items-center justify-between pb-6 border-b border-slate-800">
                    <div>
                      <h4 className="text-sm font-bold text-white">System Maintenance Mode</h4>
                      <p className="text-xs text-slate-400 mt-0.5">
                        When enabled, non-admin sessions are held in maintenance mode.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={handleToggleMaintenance}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        settings.maintenanceMode ? 'bg-rose-600' : 'bg-slate-700'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                          settings.maintenanceMode ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>

                  {/* Security Boundary Info */}
                  <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                      Administrative Security Architecture
                    </p>
                    <ul className="text-xs text-slate-400 space-y-1 list-disc pl-4">
                      <li>Server-side token verification and strict role validation on every administrative route.</li>
                      <li>Zero client-side role authority; roles cannot be modified through frontend payloads.</li>
                      <li>Audited authentication with IP and account-level rate limiting.</li>
                      <li>Heartbeat presence tracking accurately separating registered, 24h active, and online users.</li>
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* ========================================================================= */}
        {/* INVITE ADMINISTRATOR MODAL */}
        {/* ========================================================================= */}
        {showInviteModal && (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl relative">
              <button
                type="button"
                onClick={() => {
                  setShowInviteModal(false);
                  setSentInviteResult(null);
                }}
                className="absolute top-5 right-5 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>

              {sentInviteResult ? (
                /* Success / Link Generated Preview */
                <div className="space-y-4">
                  <div className="w-12 h-12 rounded-xl bg-emerald-950/80 border border-emerald-800 text-emerald-400 flex items-center justify-center">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>

                  <div>
                    <h4 className="text-base font-bold text-white">Administrator Invitation Dispatched</h4>
                    <p className="text-xs text-slate-400 mt-1">
                      An official invitation has been recorded for <strong className="text-white">{sentInviteResult.invitation.email}</strong> as{' '}
                      <span className="text-rose-300 font-semibold">{sentInviteResult.invitation.role}</span>.
                    </p>
                  </div>

                  {/* Simulated Email Notification Preview */}
                  <div className="p-3.5 bg-slate-950 rounded-xl border border-slate-800 text-xs space-y-2">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-800 text-slate-400">
                      <span className="flex items-center gap-1.5 font-semibold text-slate-300">
                        <Mail className="w-3.5 h-3.5 text-rose-400" />
                        <span>Email Notification Dispatched</span>
                      </span>
                      <span className="text-[10px] text-emerald-400">Delivered</span>
                    </div>
                    <div className="text-[11px] text-slate-400 space-y-1">
                      <p><strong className="text-slate-300">To:</strong> {sentInviteResult.invitation.email}</p>
                      <p><strong className="text-slate-300">From:</strong> avishah.as118@gmail.com (Super Administrator)</p>
                      <p><strong className="text-slate-300">Subject:</strong> You have been invited to become an Administrator</p>
                    </div>
                  </div>

                  {/* Copyable Link */}
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                      Direct Invitation & Acceptance URL
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        readOnly
                        value={sentInviteResult.inviteLink}
                        className="flex-1 px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-300 font-mono select-all focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => handleCopyInviteLink(sentInviteResult.inviteLink)}
                        className="px-3 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
                      >
                        {copiedLink ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedLink ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>
                    <p className="mt-1 text-[10px] text-slate-500">
                      Link valid for 7 days. Recipient can click this link to set password and access the admin dashboard.
                    </p>
                  </div>

                  <div className="pt-2 flex justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        setShowInviteModal(false);
                        setSentInviteResult(null);
                      }}
                      className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white transition-colors cursor-pointer"
                    >
                      Done
                    </button>
                  </div>
                </div>
              ) : (
                /* Invitation Form */
                <form onSubmit={handleSendInvite} className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center">
                      <UserPlus className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-base font-bold text-white">Invite Administrator via Email</h4>
                      <p className="text-xs text-slate-400">Recipient will receive an email to accept and become an admin.</p>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Recipient Email Address *
                    </label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                      <input
                        type="email"
                        required
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                        placeholder="colleague@institution.org"
                        className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Administrator Role
                    </label>
                    <select
                      value={inviteRole}
                      onChange={(e) => setInviteRole(e.target.value as 'admin' | 'super_admin')}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:ring-1 focus:ring-rose-500"
                    >
                      <option value="admin">Administrator (Full Access & Management)</option>
                      {isSuperAdmin && (
                        <option value="super_admin">Super Administrator (Can also manage and invite administrators)</option>
                      )}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Optional Note / Department
                    </label>
                    <input
                      type="text"
                      value={inviteNote}
                      onChange={(e) => setInviteNote(e.target.value)}
                      placeholder="e.g. Clinical Ethics Chair / Lead Co-Investigator"
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
                    />
                  </div>

                  <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 text-[11px] text-slate-400 space-y-1">
                    <p className="font-semibold text-slate-300 flex items-center gap-1.5">
                      <Shield className="w-3.5 h-3.5 text-rose-400" />
                      <span>Security Notice</span>
                    </p>
                    <p>
                      Super Administrator <strong>avishah.as118@gmail.com</strong> generates a cryptographically signed 7-day token. The recipient cannot access administrative data until they click and accept the invitation.
                    </p>
                  </div>

                  <div className="pt-2 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowInviteModal(false)}
                      className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSendingInvite}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white text-xs font-bold transition-all disabled:opacity-50 cursor-pointer shadow-md shadow-rose-950/40"
                    >
                      {isSendingInvite ? (
                        <>
                          <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          <span>Sending Invitation...</span>
                        </>
                      ) : (
                        <>
                          <Send className="w-3.5 h-3.5" />
                          <span>Dispatch Invitation Email</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
