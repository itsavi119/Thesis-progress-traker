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
import { AppOwnerDashboard } from './pages/AppOwnerDashboard.js';

const VALID_TABS: ActiveTab[] = [
  'my-groups',
  'dashboard',
  'add-patient',
  'all-cases',
  'my-cases',
  'study-files',
  'team-summary',
  'app-owner',
];

const AUTH_ROUTES = ['login', 'register', 'organization-login'];
const PUBLIC_SECTIONS = ['home', 'about', 'capabilities', 'features', 'how-it-works', 'privacy', 'policies', 'contact'];

function parseCurrentRoute(): string {
  if (typeof window === 'undefined') return 'home';

  const pathname = window.location.pathname.replace(/^\//, '').toLowerCase();
  if (AUTH_ROUTES.includes(pathname)) {
    return pathname;
  }

  const hash = window.location.hash.replace(/^#\/?/, '').toLowerCase();
  if (hash) {
    if (AUTH_ROUTES.includes(hash)) return hash;
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
  const { currentGroup, userGroups, isLoadingGroups } = useGroup();
  const [currentRoute, setCurrentRoute] = useState<string>(parseCurrentRoute);
  const preservedRedirectRef = useRef<ActiveTab | null>(null);

  // Sync route with browser history (supports standard pathnames and native back/forward)
  const navigateTo = useCallback((route: string, replace = false) => {
    setCurrentRoute((prev) => {
      if (prev === route) return prev;

      if (typeof window !== 'undefined') {
        let url = '/';
        if (AUTH_ROUTES.includes(route)) {
          url = `/${route}`;
        } else if (VALID_TABS.includes(route as ActiveTab)) {
          url = `#${route}`;
        } else if (route === 'home') {
          url = '/';
        }

        if (replace) {
          window.history.replaceState({ route }, '', url);
        } else {
          window.history.pushState({ route }, '', url);
        }
      }
      return route;
    });
  }, []);

  // Preserve intended tab when unauthenticated user directly opens a protected URL
  useEffect(() => {
    if (!isAuthenticated && typeof window !== 'undefined') {
      const parsed = parseCurrentRoute();
      if (VALID_TABS.includes(parsed as ActiveTab) && parsed !== 'my-groups') {
        preservedRedirectRef.current = parsed as ActiveTab;
      }
    }
  }, [isAuthenticated]);

  // When user becomes authenticated, restore requested tab or route to my-groups / app-owner
  useEffect(() => {
    if (isAuthenticated) {
      if (preservedRedirectRef.current) {
        const target = preservedRedirectRef.current;
        preservedRedirectRef.current = null;
        if (target === 'app-owner') {
          if (user?.is_app_owner) {
            navigateTo('app-owner', true);
          } else {
            navigateTo('my-groups', true);
          }
        } else {
          navigateTo(target, true);
        }
      } else if (AUTH_ROUTES.includes(currentRoute) || currentRoute === 'home') {
        if (user?.is_app_owner && window.location.hash.includes('app-owner')) {
          navigateTo('app-owner', true);
        } else {
          navigateTo('my-groups', true);
        }
      }
    }
  }, [isAuthenticated, user?.is_app_owner, currentRoute, navigateTo]);

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

  // Restrict app-owner tab from non-admin accounts
  useEffect(() => {
    if (currentRoute === 'app-owner' && isAuthenticated && !user?.is_app_owner) {
      navigateTo('my-groups', true);
    }
  }, [currentRoute, isAuthenticated, user?.is_app_owner, navigateTo]);

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
  // 1. UNAUTHENTICATED EXPERIENCES
  // =========================================================================
  if (!isAuthenticated) {
    // A. Dedicated Authentication Routes: /login, /register, /organization-login
    if (AUTH_ROUTES.includes(currentRoute)) {
      return (
        <Login
          initialMode={currentRoute as 'login' | 'register' | 'organization-login'}
          onNavigateHome={() => navigateTo('home')}
          onSwitchMode={(mode) => navigateTo(mode)}
          onSuccessfulLogin={(isOrgAdmin) => {
            if (isOrgAdmin) {
              navigateTo('app-owner', true);
            } else {
              navigateTo('my-groups', true);
            }
          }}
        />
      );
    }

    // B. Public Website at / (Homepage, About, Features, How It Works, Policies, Contact)
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
    <Layout activeTab={activeTab} setActiveTab={(tab) => navigateTo(tab)}>
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
        {activeTab === 'app-owner' && user?.is_app_owner && (
          <AppOwnerDashboard onReturnToApp={() => navigateTo('my-groups')} />
        )}
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
