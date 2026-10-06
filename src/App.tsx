import React, { useState, useEffect, useCallback } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext.js';
import { GroupProvider, useGroup } from './context/GroupContext.js';
import { Layout, type ActiveTab } from './components/Layout.js';
import { Logo } from './components/Logo.js';
import { Login } from './pages/Login.js';
import { MyGroups } from './pages/MyGroups.js';
import { Dashboard } from './pages/Dashboard.js';
import { AddPatient } from './pages/AddPatient.js';
import { AllCases } from './pages/AllCases.js';
import { MyCases } from './pages/MyCases.js';
import { TeamSummary } from './pages/TeamSummary.js';
import { AppOwnerDashboard } from './pages/AppOwnerDashboard.js';
import { AlertTriangle } from 'lucide-react';

const VALID_TABS: ActiveTab[] = [
  'my-groups',
  'dashboard',
  'add-patient',
  'all-cases',
  'my-cases',
  'team-summary',
  'app-owner',
];

function getInitialTab(): ActiveTab {
  if (typeof window !== 'undefined') {
    const hash = window.location.hash.replace(/^#\/?/, '') as ActiveTab;
    if (VALID_TABS.includes(hash)) {
      return hash;
    }
  }
  return 'my-groups';
}

const MainApp: React.FC = () => {
  const { isAuthenticated, isLoading } = useAuth();
  const { currentGroup, userGroups, isLoadingGroups } = useGroup();
  const [activeTab, setActiveTabState] = useState<ActiveTab>(getInitialTab);

  // Sync state with browser History for native Android Back / Forward button support
  const navigateTo = useCallback((tab: ActiveTab, replace = false) => {
    setActiveTabState((prev) => {
      if (prev === tab) return prev;
      if (typeof window !== 'undefined') {
        const hash = `#${tab}`;
        if (replace) {
          window.history.replaceState({ tab }, '', hash);
        } else {
          window.history.pushState({ tab }, '', hash);
        }
      }
      return tab;
    });
  }, []);

  // Listen for browser & Android Back / Forward navigation
  useEffect(() => {
    if (!isAuthenticated) return;

    const currentHash = window.location.hash.replace(/^#\/?/, '') as ActiveTab;
    const initial = VALID_TABS.includes(currentHash) ? currentHash : 'my-groups';
    window.history.replaceState({ tab: initial }, '', `#${initial}`);

    const handlePopState = (event: PopStateEvent) => {
      if (event.state && event.state.tab && VALID_TABS.includes(event.state.tab)) {
        setActiveTabState(event.state.tab);
      } else {
        const hash = window.location.hash.replace(/^#\/?/, '') as ActiveTab;
        if (VALID_TABS.includes(hash)) {
          setActiveTabState(hash);
        } else {
          setActiveTabState('my-groups');
        }
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [isAuthenticated]);

  if (isLoading || (isAuthenticated && isLoadingGroups)) {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col items-center justify-center p-4">
        <div className="flex flex-col items-center gap-4">
          <Logo size="lg" className="animate-pulse" />
          <div className="flex items-center gap-2 text-slate-500 text-sm font-medium">
            <span className="w-4 h-4 border-2 border-blue-600/30 border-t-blue-600 rounded-full animate-spin" />
            <span>Connecting to research database...</span>
          </div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Login />;
  }

  return (
    <Layout activeTab={activeTab} setActiveTab={navigateTo}>
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
