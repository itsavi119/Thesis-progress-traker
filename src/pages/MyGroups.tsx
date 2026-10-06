import React, { useState } from 'react';
import {
  Users,
  Plus,
  UserPlus,
  ArrowRight,
  Shield,
  FolderOpen,
  Target,
  Sparkles,
  Building2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.js';
import { useGroup } from '../context/GroupContext.js';
import { CreateGroupModal } from '../components/CreateGroupModal.js';
import { JoinGroupModal } from '../components/JoinGroupModal.js';
import { PrivacyNotice } from '../components/PrivacyNotice.js';
import { Logo } from '../components/Logo.js';

interface MyGroupsProps {
  onOpenGroup: (groupId: string) => void;
}

export const MyGroups: React.FC<MyGroupsProps> = ({ onOpenGroup }) => {
  const { user } = useAuth();
  const { userGroups, selectGroup, refreshGroups } = useGroup();

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [joinModalOpen, setJoinModalOpen] = useState(false);

  const handleSelectAndNavigate = (groupId: string) => {
    selectGroup(groupId);
    onOpenGroup(groupId);
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto animate-in fade-in duration-200">
      {/* Welcome Banner */}
      <div className="bg-white border border-slate-200 p-6 sm:p-7 rounded-3xl shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-5">
        <div className="flex items-start gap-4">
          <Logo size="lg" showText={false} />
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 font-bold text-[10px] uppercase tracking-wider border border-blue-200/60 mb-1.5">
              <span>Thesis Research Workspace</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
              Welcome, {user?.display_name}!
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 mt-1 max-w-lg">
              Manage your clinical thesis studies, collaborate with up to 3 researchers per group, and eliminate duplicate patient registrations.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 self-start sm:self-center flex-wrap sm:flex-nowrap">
          <button
            onClick={() => setJoinModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-800 rounded-xl text-xs font-bold cursor-pointer transition-colors shadow-2xs active:scale-95"
          >
            <UserPlus className="w-4 h-4 text-blue-600" />
            <span>Join a Group</span>
          </button>
          <button
            onClick={() => setCreateModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-500/20 cursor-pointer transition-all active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>Create New Group</span>
          </button>
        </div>
      </div>

      {/* GROUPS SECTION */}
      <div className="space-y-4">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-extrabold text-slate-900 tracking-tight uppercase">
              My Research Groups
            </h3>
            <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-xs font-bold">
              {userGroups.length}
            </span>
          </div>
        </div>

        {userGroups.length === 0 ? (
          /* Empty Groups State */
          <div className="bg-white border border-slate-200 rounded-3xl p-10 sm:p-12 text-center space-y-5 shadow-xs">
            <div className="w-16 h-16 rounded-3xl bg-blue-50 border border-blue-100 text-blue-600 flex items-center justify-center mx-auto shadow-xs">
              <FolderOpen className="w-8 h-8" />
            </div>
            <div className="max-w-md mx-auto space-y-1.5">
              <h4 className="text-lg font-bold text-slate-900">
                Welcome to Thesis Case Tracker
              </h4>
              <p className="text-xs text-slate-500">
                You haven&apos;t joined a research group yet. Start a new thesis research study or join an existing study using an invitation code from your colleague.
              </p>
            </div>
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                onClick={() => setCreateModalOpen(true)}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-md shadow-blue-500/20 cursor-pointer transition-all active:scale-95"
              >
                <Plus className="w-4 h-4" />
                <span>Create New Group</span>
              </button>
              <button
                onClick={() => setJoinModalOpen(true)}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-bold text-xs rounded-xl cursor-pointer transition-colors"
              >
                <UserPlus className="w-4 h-4 text-blue-600" />
                <span>Join a Group</span>
              </button>
            </div>
          </div>
        ) : (
          /* Group Cards Grid */
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {userGroups.map((group) => {
              const myMember = group.members.find((m) => m.userId === user?.id);
              const isOwner = myMember?.role === 'owner' || group.ownerId === user?.id;

              return (
                <div
                  key={group.id}
                  onClick={() => handleSelectAndNavigate(group.id)}
                  className="bg-white border border-slate-200 hover:border-blue-300 rounded-3xl p-5 sm:p-6 flex flex-col justify-between gap-4 transition-all duration-150 shadow-xs hover:shadow-md cursor-pointer group"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h4 className="text-base font-extrabold text-slate-900 group-hover:text-blue-600 transition-colors">
                          {group.name}
                        </h4>
                        {group.institution && (
                          <p className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                            <Building2 className="w-3 h-3" />
                            <span>{group.institution}</span>
                          </p>
                        )}
                      </div>
                      <span
                        className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider border shrink-0 ${
                          isOwner
                            ? 'bg-amber-50 text-amber-800 border-amber-200'
                            : 'bg-blue-50 text-blue-700 border-blue-200'
                        }`}
                      >
                        {isOwner ? 'Owner' : 'Researcher'}
                      </span>
                    </div>

                    <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">
                      &ldquo;{group.studyTitle}&rdquo;
                    </p>
                  </div>

                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                    <div className="flex items-center gap-3 text-xs text-slate-500 font-medium">
                      <span className="flex items-center gap-1 font-bold text-slate-700">
                        <Target className="w-3.5 h-3.5 text-blue-600" />
                        <span>{group.targetSampleSize} target</span>
                      </span>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <Users className="w-3.5 h-3.5 text-slate-400" />
                        <span>{group.members.length} / 3 members</span>
                      </span>
                    </div>

                    <div className="w-8 h-8 rounded-xl bg-slate-50 group-hover:bg-blue-600 text-slate-400 group-hover:text-white flex items-center justify-center transition-all">
                      <ArrowRight className="w-4 h-4" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <PrivacyNotice />

      <CreateGroupModal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onSuccess={() => {
          refreshGroups();
        }}
      />

      <JoinGroupModal
        isOpen={joinModalOpen}
        onClose={() => setJoinModalOpen(false)}
        onSuccess={() => {
          refreshGroups();
        }}
      />
    </div>
  );
};
