import React, { useState, useEffect, useRef } from 'react';
import {
  LayoutDashboard,
  UserPlus,
  Files,
  UserCheck,
  Users,
  LogOut,
  Radio,
  Menu,
  X,
  User,
  ChevronDown,
  Plus,
  FolderOpen,
  Check,
  ShieldCheck,
  FileText,
  History,
  Archive,
  Settings,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.js';
import { useGroup } from '../context/GroupContext.js';
import { api } from '../services/api.js';
import { PrivacyNotice } from './PrivacyNotice.js';
import { Logo } from './Logo.js';
import { CreateGroupModal } from './CreateGroupModal.js';
import { JoinGroupModal } from './JoinGroupModal.js';
import { UserProfileModal } from './UserProfileModal.js';
import { BackupRestoreModal } from './BackupRestoreModal.js';
import { StudySettingsModal } from './StudySettingsModal.js';

export type ActiveTab =
  | 'my-groups'
  | 'dashboard'
  | 'add-patient'
  | 'all-cases'
  | 'my-cases'
  | 'case-history'
  | 'study-files'
  | 'team-summary'
  | 'app-owner';

interface LayoutProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ activeTab, setActiveTab, children }) => {
  const { user, logout } = useAuth();
  const { currentGroup, userGroups, selectGroup, refreshGroups } = useGroup();

  const [isLiveConnected, setIsLiveConnected] = useState<boolean>(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);
  const [groupDropdownOpen, setGroupDropdownOpen] = useState<boolean>(false);
  const [createGroupModalOpen, setCreateGroupModalOpen] = useState<boolean>(false);
  const [joinGroupModalOpen, setJoinGroupModalOpen] = useState<boolean>(false);
  const [profileModalOpen, setProfileModalOpen] = useState<boolean>(false);
  const [backupModalOpen, setBackupModalOpen] = useState<boolean>(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState<boolean>(false);

  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setGroupDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // SSE subscription scoped to current group
  useEffect(() => {
    const unsubscribe = api.subscribeToRealtime(
      currentGroup?.id || null,
      () => {},
      (connected) => setIsLiveConnected(connected)
    );
    return () => unsubscribe();
  }, [currentGroup?.id]);

  const terminology = currentGroup?.subjectTerminology || 'Patient';
  const navItems = [
    { id: 'dashboard' as ActiveTab, label: 'Dashboard', icon: LayoutDashboard },
    { id: 'add-patient' as ActiveTab, label: `Add ${terminology}`, icon: UserPlus, highlight: true },
    { id: 'all-cases' as ActiveTab, label: 'All Records', icon: Files },
    { id: 'my-cases' as ActiveTab, label: 'My Records', icon: UserCheck },
    { id: 'case-history' as ActiveTab, label: 'History', icon: History },
    { id: 'study-files' as ActiveTab, label: 'Files', icon: FileText },
    { id: 'team-summary' as ActiveTab, label: 'Team', icon: Users },
  ];

  const handleSelectGroupAndSwitch = (groupId: string) => {
    selectGroup(groupId);
    setGroupDropdownOpen(false);
    setMobileMenuOpen(false);
    if (activeTab === 'my-groups') {
      setActiveTab('dashboard');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col md:flex-row antialiased selection:bg-blue-100 selection:text-blue-900">
      {/* DESKTOP SIDEBAR */}
      <aside className="hidden md:flex md:w-64 lg:w-72 flex-col bg-white border-r border-slate-200 shrink-0 select-none shadow-xs h-screen sticky top-0">
        {/* Brand Header */}
        <div className="p-5 lg:p-6 border-b border-slate-200">
          <Logo
            size="md"
            showText={true}
            subtitle={currentGroup ? currentGroup.name : 'Hospital Research Platform'}
            clickable={true}
            onClick={() => setActiveTab('my-groups')}
          />

          {/* Group Switcher Button */}
          <div className="relative mt-4" ref={dropdownRef}>
            <button
              type="button"
              onClick={() => setGroupDropdownOpen(!groupDropdownOpen)}
              className="w-full flex items-center justify-between gap-2 px-3 py-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-left transition-colors cursor-pointer"
            >
              <div className="min-w-0 flex-1">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Active Group
                </span>
                <span className="block text-xs font-bold text-slate-900 truncate">
                  {currentGroup ? currentGroup.name : 'No Group Selected'}
                </span>
              </div>
              <ChevronDown className="w-4 h-4 text-slate-500 shrink-0" />
            </button>

            {/* Dropdown Menu */}
            {groupDropdownOpen && (
              <div className="absolute left-0 right-0 mt-1.5 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 p-2 space-y-1 animate-in fade-in duration-100 max-h-72 overflow-y-auto">
                <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Switch Group
                </div>
                {userGroups.map((g) => (
                  <button
                    key={g.id}
                    onClick={() => handleSelectGroupAndSwitch(g.id)}
                    className={`w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs font-medium text-left cursor-pointer transition-colors ${
                      currentGroup?.id === g.id
                        ? 'bg-blue-50 text-blue-700 font-bold'
                        : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span className="truncate">{g.name}</span>
                    {currentGroup?.id === g.id && <Check className="w-3.5 h-3.5 text-blue-600 shrink-0" />}
                  </button>
                ))}

                <div className="pt-1.5 border-t border-slate-100 space-y-1">
                  <button
                    onClick={() => {
                      setGroupDropdownOpen(false);
                      setActiveTab('my-groups');
                    }}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-xs text-slate-700 hover:bg-slate-100 font-medium cursor-pointer"
                  >
                    <FolderOpen className="w-3.5 h-3.5 text-blue-600" />
                    <span>Home / My Groups</span>
                  </button>
                  <button
                    onClick={() => {
                      setGroupDropdownOpen(false);
                      setCreateGroupModalOpen(true);
                    }}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-xs text-blue-700 hover:bg-blue-50 font-bold cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Create New Group</span>
                  </button>
                  <button
                    onClick={() => {
                      setGroupDropdownOpen(false);
                      setJoinGroupModalOpen(true);
                    }}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-xs text-slate-700 hover:bg-slate-100 font-medium cursor-pointer"
                  >
                    <UserPlus className="w-3.5 h-3.5 text-slate-500" />
                    <span>Join with Code</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Realtime Live Sync Indicator */}
          <div className="mt-3 flex items-center justify-between px-3 py-1.5 bg-slate-50 rounded-xl border border-slate-200 text-xs">
            <span className="text-slate-600 flex items-center gap-2">
              <span
                className={`w-2 h-2 rounded-full ${
                  isLiveConnected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
                }`}
              />
              {isLiveConnected ? 'Live Cloud Sync' : 'Connecting...'}
            </span>
            <Radio className={`w-3.5 h-3.5 ${isLiveConnected ? 'text-emerald-600' : 'text-amber-500'}`} />
          </div>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 p-3 lg:p-4 space-y-1.5 overflow-y-auto">
          {/* Direct link to Home / My Groups */}
          <button
            onClick={() => setActiveTab('my-groups')}
            className={`w-full min-h-[46px] flex items-center gap-3 px-3.5 py-2.5 rounded-xl font-medium text-sm transition-all duration-150 text-left cursor-pointer active:scale-[0.98] select-none touch-manipulation ${
              activeTab === 'my-groups'
                ? 'bg-blue-50 text-blue-700 border border-blue-200 shadow-xs font-semibold'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80 active:bg-slate-200/60'
            }`}
          >
            <FolderOpen className={`w-5 h-5 shrink-0 ${activeTab === 'my-groups' ? 'text-blue-600' : 'text-slate-400'}`} />
            <span className="truncate">Home / My Groups</span>
          </button>

          {currentGroup && (
            <>
              <div className="pt-2 pb-1 px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400 truncate">
                Study Workspace
              </div>

              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveTab(item.id)}
                    className={`w-full min-h-[46px] flex items-center gap-3 px-3.5 py-2.5 rounded-xl font-medium text-sm transition-all duration-150 text-left cursor-pointer active:scale-[0.98] select-none touch-manipulation ${
                      isActive
                        ? 'bg-blue-50 text-blue-700 border border-blue-200 shadow-xs font-semibold'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80 active:bg-slate-200/60'
                    }`}
                  >
                    <Icon className={`w-5 h-5 shrink-0 ${isActive ? 'text-blue-600' : 'text-slate-400'}`} />
                    <span className="truncate">
                      {item.id === 'team-summary' ? 'Team' : item.label}
                    </span>
                    {item.highlight && (
                      <span className="ml-auto text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-200/60 shrink-0">
                        Action
                      </span>
                    )}
                  </button>
                );
              })}
            </>
          )}
        </nav>

        {/* User Account Box */}
        <div className="p-4 border-t border-slate-200 bg-slate-50/70">
          {user?.is_app_owner && (
            <button
              onClick={() => setActiveTab('app-owner')}
              className={`w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl mb-3 text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'app-owner'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Organization Workspace</span>
            </button>
          )}

          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-sm border border-blue-200 shrink-0">
              <User className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-slate-900 truncate">{user?.display_name}</p>
              <p className="text-[11px] text-slate-500 truncate">{user?.email}</p>
            </div>
          </div>

          <button
            onClick={logout}
            className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-white hover:bg-rose-50 text-slate-600 hover:text-rose-600 border border-slate-200 hover:border-rose-200 text-xs font-semibold transition-colors cursor-pointer touch-manipulation"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* MOBILE HEADER */}
      <header className="md:hidden sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 px-4 py-3 flex items-center justify-between shadow-2xs">
        <button
          onClick={() => setActiveTab('my-groups')}
          className="flex items-center gap-2.5 text-left active:opacity-75 transition-opacity cursor-pointer touch-manipulation"
        >
          <Logo size="sm" showText={false} />
          <div className="min-w-0 max-w-[200px]">
            <h1 className="text-xs font-extrabold text-slate-900 tracking-wider uppercase select-none truncate">
              {currentGroup ? currentGroup.name : 'THESIS TRACKER'}
            </h1>
            <p className="text-[11px] text-blue-600 font-semibold truncate select-none">
              {user?.display_name}
            </p>
          </div>
        </button>

        <div className="flex items-center gap-2 shrink-0">
          <div
            className={`w-2.5 h-2.5 rounded-full ${
              isLiveConnected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
            }`}
            title={isLiveConnected ? 'Live Cloud Sync' : 'Reconnecting'}
          />

          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200 active:scale-95 transition-all cursor-pointer touch-manipulation"
            aria-label="Toggle Menu"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </header>

      {/* MOBILE DRAWER */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex flex-col justify-end">
          <div className="bg-white border-t border-slate-200 rounded-t-3xl p-5 space-y-4 max-h-[85vh] overflow-y-auto shadow-2xl animate-in slide-in-from-bottom duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center font-bold">
                  <User className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-900">{user?.display_name}</p>
                  <p className="text-xs text-slate-500">{user?.email}</p>
                </div>
              </div>
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="w-10 h-10 flex items-center justify-center text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Switch Group in Mobile Drawer */}
            <div className="space-y-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Your Research Groups
              </span>
              <div className="space-y-1">
                {userGroups.map((g) => (
                  <button
                    key={g.id}
                    onClick={() => handleSelectGroupAndSwitch(g.id)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold text-left cursor-pointer ${
                      currentGroup?.id === g.id
                        ? 'bg-blue-50 text-blue-700 font-bold border border-blue-200'
                        : 'bg-slate-50 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <span className="truncate">{g.name}</span>
                    {currentGroup?.id === g.id && <Check className="w-3.5 h-3.5 text-blue-600" />}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1 pt-2 border-t border-slate-100">
              <button
                onClick={() => {
                  setActiveTab('my-groups');
                  setMobileMenuOpen(false);
                }}
                className={`w-full min-h-[46px] flex items-center gap-3 px-3.5 py-3 rounded-xl font-medium text-sm transition-all cursor-pointer ${
                  activeTab === 'my-groups'
                    ? 'bg-blue-50 text-blue-700 font-bold border border-blue-200'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <FolderOpen className="w-5 h-5 text-blue-600" />
                <span>Home / My Groups</span>
              </button>

              {currentGroup &&
                navItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        setActiveTab(item.id);
                        setMobileMenuOpen(false);
                      }}
                      className={`w-full min-h-[46px] flex items-center gap-3 px-3.5 py-3 rounded-xl font-medium text-sm transition-all cursor-pointer ${
                        isActive
                          ? 'bg-blue-50 text-blue-700 font-bold border border-blue-200'
                          : 'text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      <Icon className="w-5 h-5 text-blue-600" />
                      <span>{item.id === 'team-summary' ? 'Team' : item.label}</span>
                    </button>
                  );
                })}
            </div>

            {user?.is_app_owner && (
              <div className="pt-2 border-t border-slate-100">
                <button
                  onClick={() => {
                    setActiveTab('app-owner');
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full min-h-[46px] flex items-center gap-3 px-3.5 py-3 rounded-xl font-bold text-sm transition-all cursor-pointer ${
                    activeTab === 'app-owner'
                      ? 'bg-slate-900 text-white'
                      : 'bg-blue-50 text-blue-700 border border-blue-200'
                  }`}
                >
                  <ShieldCheck className="w-5 h-5 text-blue-600" />
                  <span>Organization Workspace</span>
                </button>
              </div>
            )}

            <div className="flex gap-2 pt-2 border-t border-slate-100">
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  setCreateGroupModalOpen(true);
                }}
                className="flex-1 py-2.5 px-3 rounded-xl bg-blue-50 text-blue-700 text-xs font-bold text-center border border-blue-200"
              >
                + Create Group
              </button>
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  setJoinGroupModalOpen(true);
                }}
                className="flex-1 py-2.5 px-3 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold text-center border border-slate-200"
              >
                Join with Code
              </button>
            </div>

            <div className="pt-2 border-t border-slate-200">
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  logout();
                }}
                className="w-full min-h-[48px] flex items-center justify-center gap-2 py-3 rounded-xl bg-rose-50 text-rose-700 font-bold text-sm border border-rose-200 active:scale-[0.98] transition-all cursor-pointer touch-manipulation"
              >
                <LogOut className="w-4 h-4" />
                <span>Log Out</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 min-w-0 flex flex-col">
        <div className="w-full max-w-5xl mx-auto px-4 py-5 sm:px-6 sm:py-7 lg:px-8 space-y-6 flex-1 pb-32 sm:pb-12">
          {children}
        </div>

        {/* Academic & Clinical Compliance Footer */}
        <footer className="w-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-4 border-t border-slate-200/60 text-center text-[11px] text-slate-400 space-y-1 mb-16 md:mb-0">
          <p className="font-medium text-slate-500">
            Thesis Case Tracker • Academic & Clinical Study Coordination Platform
          </p>
          <p className="text-[10px] text-slate-400">
            Notice: This system coordinates research case enrollment and duplicate checks. It does not provide medical diagnoses or prescribing clinical advice. Studies must adhere to Institutional Ethics Committee (IEC/IRB) approval.
          </p>
        </footer>
      </main>

      {/* MOBILE BOTTOM NAVIGATION BAR */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-lg border-t border-slate-200/90 shadow-lg select-none"
        style={{
          paddingBottom: 'max(0.35rem, env(safe-area-inset-bottom, 8px))',
        }}
        aria-label="Mobile Navigation"
      >
        <div className="w-full max-w-md mx-auto grid grid-cols-5 gap-1 px-1 py-1">
          {/* 1. Groups / Home */}
          <button
            onClick={() => setActiveTab('my-groups')}
            className={`min-h-[50px] flex flex-col items-center justify-center py-1 px-1 rounded-2xl transition-all cursor-pointer active:scale-95 touch-manipulation select-none ${
              activeTab === 'my-groups' ? 'text-blue-700 font-bold' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <div
              className={`w-10 h-7 rounded-full flex items-center justify-center transition-all ${
                activeTab === 'my-groups' ? 'bg-blue-100 text-blue-700' : 'text-slate-500'
              }`}
            >
              <FolderOpen className="w-4 h-4" />
            </div>
            <span className="text-[10px] tracking-tight mt-0.5 truncate max-w-full leading-none">
              Groups
            </span>
          </button>

          {/* 2. Add Patient (Highlight) */}
          <button
            onClick={() => setActiveTab('add-patient')}
            className={`min-h-[50px] flex flex-col items-center justify-center py-1 px-1 rounded-2xl transition-all cursor-pointer active:scale-95 touch-manipulation select-none ${
              activeTab === 'add-patient' ? 'text-blue-700 font-bold' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <div
              className={`w-10 h-7 rounded-full flex items-center justify-center transition-all ${
                activeTab === 'add-patient'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-500/25 scale-105'
                  : 'bg-blue-50 text-blue-600 border border-blue-200/80'
              }`}
            >
              <UserPlus className="w-4 h-4" />
            </div>
            <span className="text-[10px] tracking-tight mt-0.5 truncate max-w-full leading-none">
              Add Case
            </span>
          </button>

          {/* 3. All Cases */}
          <button
            onClick={() => setActiveTab('all-cases')}
            className={`min-h-[50px] flex flex-col items-center justify-center py-1 px-1 rounded-2xl transition-all cursor-pointer active:scale-95 touch-manipulation select-none ${
              activeTab === 'all-cases' ? 'text-blue-700 font-bold' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <div
              className={`w-10 h-7 rounded-full flex items-center justify-center transition-all ${
                activeTab === 'all-cases' ? 'bg-blue-100 text-blue-700' : 'text-slate-500'
              }`}
            >
              <Files className="w-4 h-4" />
            </div>
            <span className="text-[10px] tracking-tight mt-0.5 truncate max-w-full leading-none">
              All Cases
            </span>
          </button>

          {/* 4. My Cases */}
          <button
            onClick={() => setActiveTab('my-cases')}
            className={`min-h-[50px] flex flex-col items-center justify-center py-1 px-1 rounded-2xl transition-all cursor-pointer active:scale-95 touch-manipulation select-none ${
              activeTab === 'my-cases' ? 'text-blue-700 font-bold' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <div
              className={`w-10 h-7 rounded-full flex items-center justify-center transition-all ${
                activeTab === 'my-cases' ? 'bg-blue-100 text-blue-700' : 'text-slate-500'
              }`}
            >
              <UserCheck className="w-4 h-4" />
            </div>
            <span className="text-[10px] tracking-tight mt-0.5 truncate max-w-full leading-none">
              My Cases
            </span>
          </button>

          {/* 5. Team */}
          <button
            onClick={() => setActiveTab('team-summary')}
            className={`min-h-[50px] flex flex-col items-center justify-center py-1 px-1 rounded-2xl transition-all cursor-pointer active:scale-95 touch-manipulation select-none ${
              activeTab === 'team-summary' ? 'text-blue-700 font-bold' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <div
              className={`w-10 h-7 rounded-full flex items-center justify-center transition-all ${
                activeTab === 'team-summary' ? 'bg-blue-100 text-blue-700' : 'text-slate-500'
              }`}
            >
              <Users className="w-4 h-4" />
            </div>
            <span className="text-[10px] tracking-tight mt-0.5 truncate max-w-full leading-none">
              Team
            </span>
          </button>
        </div>
      </nav>

      <CreateGroupModal
        isOpen={createGroupModalOpen}
        onClose={() => setCreateGroupModalOpen(false)}
        onSuccess={() => {
          refreshGroups();
          setActiveTab('dashboard');
        }}
      />

      <JoinGroupModal
        isOpen={joinGroupModalOpen}
        onClose={() => setJoinGroupModalOpen(false)}
        onSuccess={() => {
          refreshGroups();
          setActiveTab('dashboard');
        }}
      />
    </div>
  );
};
