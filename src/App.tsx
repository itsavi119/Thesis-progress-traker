import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext.js';
import { GroupProvider, useGroup } from './context/GroupContext.js';
import { Layout, type ActiveTab } from './components/Layout.js';
import { Logo } from './components/Logo.js';
import { Login } from './pages/Login.js';
import { PublicWebsite } from './pages/PublicWebsite.js';
import { MyGroups } from './pages/MyGroups.js';
import { Dashboard } from './pages/Dashboard.js';
import { AddPatient } from './pages/AddPatient.js';
import { AllCases } from './pages/AllCases.js';
import { MyCases } from './pages/MyCases.js';
import { StudyFiles } from './pages/StudyFiles.js';
import { TeamSummary } from './pages/TeamSummary.js';
import { AdminLogin } from './pages/admin/AdminLogin.js';
import { AdminPanel } from './pages/admin/AdminPanel.js';
import { AccessDenied } from './pages/admin/AccessDenied.js';
import { AcceptAdminInvite } from './pages/admin/AcceptAdminInvite.js';
import { api } from './services/api.js';
import type { UserProfile } from './types/index.js';

const VALID_TABS: ActiveTab[] = [
  'my-groups',
  'dashboard',
  'add-patient',
  'all-cases',
  'my-cases',
  'study-files',
  'team-summary',
];

const AUTH_ROUTES = ['login', 'register', 'auth', 'signup', 'signin'];
const PUBLIC_SECTIONS = ['home', 'about', 'capabilities', 'features', 'how-it-works', 'privacy', 'policies', 'contact'];

function parseCurrentRoute(): string {
  if (typeof window === 'undefined') return 'home';

  // 1. Check URL query parameters (e.g., ?mode=signup or ?mode=register)
  try {
    const searchParams = new URLSearchParams(window.location.search);
    const modeParam = searchParams.get('mode')?.toLowerCase();
    if (modeParam === 'signup' || modeParam === 'register') {
      return 'register';
    }
    if (modeParam === 'login' || modeParam === 'signin') {
      return 'login';
    }
  } catch {
    // Ignore search param parse issues
  }

  // 2. Check pathname
  const pathname = window.location.pathname.replace(/^\//, '').toLowerCase();
  if (pathname === 'admin/login' || pathname.startsWith('admin/login')) {
    return 'admin-login';
  }
  if (
    pathname === 'admin/accept-invite' ||
    pathname.startsWith('admin/accept-invite') ||
    pathname === 'accept-admin-invite' ||
    pathname.startsWith('accept-admin-invite')
  ) {
    return 'admin-accept-invite';
  }
  if (pathname === 'admin' || pathname.startsWith('admin')) {
    return 'admin';
  }
  if (pathname === 'register' || pathname === 'signup') {
    return 'register';
  }
  if (pathname === 'login' || pathname === 'signin') {
    return 'login';
  }
  if (pathname === 'auth') {
    return 'login'; // Direct Authentication Page access -> Default to Sign In
  }

  // 3. Check hash
  const hash = window.location.hash.replace(/^#\/?/, '').toLowerCase();
  if (hash) {
    if (hash === 'admin/login') return 'admin-login';
    if (hash.startsWith('admin/accept-invite') || hash.startsWith('accept-admin-invite')) {
      return 'admin-accept-invite';
    }
    if (hash === 'admin') return 'admin';
    if (hash === 'register' || hash === 'signup') return 'register';
    if (hash === 'login' || hash === 'signin') return 'login';
    if (hash === 'auth') return 'login';
    if (VALID_TABS.includes(hash as ActiveTab)) return hash;
    if (PUBLIC_SECTIONS.includes(hash)) return 'home';
  }

  if (VALID_TABS.includes(pathname as ActiveTab)) {
    return pathname;
  }

  return 'home';
}

const MainApp: React.FC = () => {
  const { user, isAuthenticated, isLoading } = useAuth();
  const { isLoadingGroups } = useGroup();
  const [currentRoute, setCurrentRoute] = useState<string>(parseCurrentRoute);
  const preservedRedirectRef = useRef<ActiveTab | null>(null);

  // Administrative session state
  const [adminUser, setAdminUser] = useState<UserProfile | null>(null);
  const [isVerifyingAdmin, setIsVerifyingAdmin] = useState<boolean>(false);

  // Sync route with browser history (supports standard pathnames and native back/forward)
  const navigateTo = useCallback((route: string, replace = false) => {
    let normalized = route;
    if (route === 'signup') normalized = 'register';
    if (route === 'signin' || route === 'auth') normalized = 'login';

    setCurrentRoute((prev) => {
      if (prev === normalized) return prev;

      if (typeof window !== 'undefined') {
        let url = '/';
        if (normalized === 'admin-login') {
          url = '/admin/login';
        } else if (normalized === 'admin-accept-invite') {
          url = '/admin/accept-invite';
        } else if (normalized === 'admin') {
          url = '/admin';
        } else if (AUTH_ROUTES.includes(normalized)) {
          url = `/${normalized}`;
        } else if (VALID_TABS.includes(normalized as ActiveTab)) {
          url = `#${normalized}`;
        } else if (normalized === 'home') {
          url = '/';
        }

        if (replace) {
          window.history.replaceState({ route: normalized }, '', url);
        } else {
          window.history.pushState({ route: normalized }, '', url);
        }
      }
      return normalized;
    });
  }, []);

  // Check admin session when entering /admin route
  useEffect(() => {
    if (currentRoute === 'admin') {
      setIsVerifyingAdmin(true);
      api
        .verifyAdminSession()
        .then((res) => {
          setAdminUser(res.user);
        })
        .catch(() => {
          if (
            user &&
            (user.email?.toLowerCase() === 'avishah.as118@gmail.com' ||
              user.role === 'super_admin' ||
              user.role === 'admin')
          ) {
            setAdminUser(user);
          } else {
            setAdminUser(null);
          }
        })
        .finally(() => {
          setIsVerifyingAdmin(false);
        });
    }
  }, [currentRoute, user]);

  // Preserve intended tab when unauthenticated user directly opens a protected URL
  useEffect(() => {
    if (!isAuthenticated && typeof window !== 'undefined') {
      const parsed = parseCurrentRoute();
      if (VALID_TABS.includes(parsed as ActiveTab) && parsed !== 'my-groups') {
        preservedRedirectRef.current = parsed as ActiveTab;
      }
    }
  }, [isAuthenticated]);

  // When user becomes authenticated, restore requested tab or route
  useEffect(() => {
    if (isAuthenticated) {
      if (preservedRedirectRef.current) {
        const target = preservedRedirectRef.current;
        preservedRedirectRef.current = null;
        navigateTo(target, true);
      } else if (AUTH_ROUTES.includes(currentRoute) || currentRoute === 'home') {
        if (
          user?.email?.toLowerCase() === 'avishah.as118@gmail.com' ||
          user?.role === 'super_admin' ||
          user?.role === 'admin'
        ) {
          navigateTo('admin', true);
        } else {
          navigateTo('my-groups', true);
        }
      }
    }
  }, [isAuthenticated, currentRoute, navigateTo, user]);

  // Listen for browser Back / Forward events
  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      if (event.state?.route) {
        setCurrentRoute(event.state.route);
      } else {
        setCurrentRoute(parseCurrentRoute());
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  if (isLoading || (isAuthenticated && isLoadingGroups)) {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col items-center justify-center p-4">
        <div className="flex flex-col items-center gap-4">
          <Logo size="lg" className="animate-pulse" />
          <div className="flex items-center gap-2 text-slate-500 text-sm font-medium">
            <span className="w-4 h-4 border-2 border-blue-600/30 border-t-blue-600 rounded-full animate-spin" />
            <span>Loading research workspace...</span>
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // 0. ADMINISTRATIVE ACCESS ROUTES (/admin, /admin/login)
  // =========================================================================
  if (currentRoute === 'admin-login') {
    return (
      <AdminLogin
        onLoginSuccess={(adminProfile) => {
          setAdminUser(adminProfile);
          navigateTo('admin', true);
        }}
        onNavigateHome={() => navigateTo('home')}
        onNavigateResearcherLogin={() => navigateTo('login')}
      />
    );
  }

  if (currentRoute === 'admin') {
    if (isVerifyingAdmin) {
      return (
        <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-4">
          <div className="w-8 h-8 border-2 border-slate-700 border-t-rose-500 rounded-full animate-spin mb-4" />
          <p className="text-xs text-slate-400">Verifying administrative credentials...</p>
        </div>
      );
    }

    if (!adminUser || (adminUser.role !== 'admin' && adminUser.role !== 'super_admin')) {
      return (
        <AccessDenied
          userEmail={adminUser?.email || (isAuthenticated ? user?.email : undefined)}
          onNavigateHome={() => navigateTo('home')}
          onNavigateAdminLogin={() => navigateTo('admin-login')}
        />
      );
    }

    return (
      <AdminPanel
        currentUser={adminUser}
        onLogout={() => {
          setAdminUser(null);
          navigateTo('admin-login', true);
        }}
        onNavigateHome={() => navigateTo('home')}
      />
    );
  }

  // =========================================================================
  // 1. UNAUTHENTICATED EXPERIENCES
  // =========================================================================
  if (!isAuthenticated) {
    // Dedicated Authentication Routes: /login, /register
    if (AUTH_ROUTES.includes(currentRoute)) {
      const authMode: 'login' | 'register' =
        currentRoute === 'register' || currentRoute === 'signup'
          ? 'register'
          : 'login';

      return (
        <Login
          initialMode={authMode}
          onNavigateHome={() => navigateTo('home')}
          onSwitchMode={(mode) => navigateTo(mode)}
          onNavigateAdmin={() => navigateTo('admin-login')}
          onSuccessfulLogin={() => {
            navigateTo('my-groups', true);
          }}
        />
      );
    }

    // Public Website at / (Homepage, About, Features, How It Works, Policies, Contact)
    return (
      <PublicWebsite
        isAuthenticated={false}
        onNavigateToAuth={(mode = 'login') => navigateTo(mode)}
        onGoToWorkspace={() => navigateTo('my-groups')}
      />
    );
  }

  // =========================================================================
  // 2. AUTHENTICATED USER EXPERIENCES
  // =========================================================================

  // If authenticated user visits the public home page explicitly:
  if (currentRoute === 'home') {
    return (
      <PublicWebsite
        isAuthenticated={true}
        onNavigateToAuth={(mode = 'login') => navigateTo(mode)}
        onGoToWorkspace={() => navigateTo('my-groups')}
      />
    );
  }

  // Active Workspace tab
  const activeTab: ActiveTab = VALID_TABS.includes(currentRoute as ActiveTab)
    ? (currentRoute as ActiveTab)
    : 'my-groups';

  return (
    <Layout
      activeTab={activeTab}
      setActiveTab={(tab) => navigateTo(tab)}
      onNavigateAdmin={() => navigateTo('admin')}
    >
      <div key={activeTab} className="animate-in fade-in duration-150 ease-out">
        {activeTab === 'my-groups' && (
          <MyGroups
            onOpenGroup={() => {
              navigateTo('dashboard');
            }}
          />
        )}
        {activeTab === 'dashboard' && <Dashboard onNavigate={(tab) => navigateTo(tab)} />}
        {activeTab === 'add-patient' && (
          <AddPatient onNavigateToMyCases={() => navigateTo('my-cases')} />
        )}
        {activeTab === 'all-cases' && <AllCases />}
        {activeTab === 'my-cases' && (
          <MyCases onNavigateToAddPatient={() => navigateTo('add-patient')} />
        )}
        {activeTab === 'study-files' && <StudyFiles />}
        {activeTab === 'team-summary' && <TeamSummary />}
      </div>
    </Layout>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <GroupProvider>
        <MainApp />
      </GroupProvider>
    </AuthProvider>
  );
}
