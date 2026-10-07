import React from 'react';
import { ShieldAlert, ArrowLeft, KeyRound, Home } from 'lucide-react';

interface AccessDeniedProps {
  userEmail?: string;
  onNavigateHome: () => void;
  onNavigateAdminLogin: () => void;
}

export const AccessDenied: React.FC<AccessDeniedProps> = ({
  userEmail,
  onNavigateHome,
  onNavigateAdminLogin,
}) => {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center items-center px-4 py-12">
      <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl text-center">
        <div className="w-16 h-16 rounded-2xl bg-rose-950/70 border border-rose-800/80 mx-auto flex items-center justify-center mb-6">
          <ShieldAlert className="w-8 h-8 text-rose-400" />
        </div>

        <h1 className="text-xl font-bold text-white mb-2">
          Administrative Access Denied
        </h1>

        <p className="text-sm text-slate-400 mb-6 leading-relaxed">
          {userEmail ? (
            <>
              Your account (<span className="text-slate-200 font-medium">{userEmail}</span>) does not possess verified administrator authorization to access the Security Administration Portal.
            </>
          ) : (
            <>
              This private portal requires verified administrator authorization. Normal researchers are not granted administrative access.
            </>
          )}
        </p>

        <div className="bg-slate-950 rounded-xl p-4 border border-slate-800/80 mb-6 text-left">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
            Security Policy Notice
          </p>
          <p className="text-xs text-slate-400 leading-relaxed">
            All administrative endpoints independently enforce server-side role validation.
            Administrative roles cannot be assigned or requested by standard users.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <button
            type="button"
            onClick={onNavigateHome}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition-all cursor-pointer shadow-sm"
          >
            <Home className="w-4 h-4" />
            <span>Return to Dashboard</span>
          </button>

          <button
            type="button"
            onClick={onNavigateAdminLogin}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium transition-all cursor-pointer"
          >
            <KeyRound className="w-4 h-4" />
            <span>Admin Sign-In</span>
          </button>
        </div>
      </div>
    </div>
  );
};
