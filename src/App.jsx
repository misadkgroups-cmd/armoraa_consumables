import { useState, useEffect } from 'react';
import { BranchProvider, useBranch } from './context/BranchContext';
import Welcome from './pages/Welcome';
import Dashboard from './pages/Dashboard';
import { endSession } from './services/sessionApi';
import { syncCurrencyFromDb } from './utils/currency';
import UpdatePrompt from './components/UpdatePrompt';
import ChatBot from './components/ChatBot';
import './App.css';

const pathToPage = (path) => {
  if (path === '/' || path === '') return 'overview';
  if (path === '/billing-log') return 'billing-log';
  if (path === '/billing-log/all-bills') return 'all-bills';
  if (path === '/billable-consumables') return 'billable';
  if (path === '/non-billable-consumables') return 'non-billable';
  if (path === '/reports') return 'reports';
  if (path === '/customization') return 'customization';
  if (path === '/stock-management') return 'stock-management';
  if (path === '/stock-transfer' || path === '/transfer-stock') return 'stock-transfer';
  if (path === '/masters/doctors') return 'doctors-master';
  if (path === '/masters/staff') return 'staff-master';
  return 'overview';
};

// Deployment base captured in index.html before any URL rewriting
// (e.g. '/' for a domain root, '/armoraa_consumables/' for a GitHub Pages
// project site). All pushState/replaceState URLs and pathname parsing MUST
// go through these helpers — absolute paths would escape the deploy folder
// and produce 404/blank pages on reload.
const APP_BASE = typeof window !== 'undefined' && window.__APP_BASE__ ? window.__APP_BASE__ : '/';

const withBase = (path) => {
  const base = APP_BASE.endsWith('/') ? APP_BASE : APP_BASE + '/';
  return base === '/' ? path : base + path.slice(1);
};

const stripBase = (fullPath) => {
  if (APP_BASE === '/') return fullPath;
  if (fullPath.startsWith(APP_BASE)) return fullPath.slice(APP_BASE.length - 1) || '/';
  return fullPath;
};

const AppContent = () => {
  // Start on the page matching the URL (supports reloads / shared links on
  // static hosts — index.html restores the deep-link before we get here).
  const [currentPage, setCurrentPage] = useState(() => pathToPage(stripBase(window.location.pathname)));
  const [urlState, setUrlState] = useState({});
  const { branchId, switchBranch, loginMis, logout, misMode } = useBranch();
  const [showConflictModal, setShowConflictModal] = useState(false);
  const [conflictMessage, setConflictMessage] = useState('');
  const [isOnline, setIsOnline] = useState(() => (typeof navigator !== 'undefined' ? navigator.onLine : true));
  const [showReconnected, setShowReconnected] = useState(false);

  // Monitor network connectivity changes with active WAN ping
  useEffect(() => {
    let pingTimer = null;
    const verifyConnection = async () => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        setIsOnline(false);
        setShowReconnected(false);
        return;
      }
      try {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
        if (!supabaseUrl) {
          setIsOnline(true);
          return;
        }
        const res = await fetch(`${supabaseUrl}/rest/v1/?apikey=${supabaseKey}`, {
          method: 'HEAD',
          cache: 'no-store',
        });
        const alive = res.ok || res.status === 404 || res.status === 200;
        setIsOnline(alive);
        if (alive) {
          setShowReconnected(true);
          clearTimeout(pingTimer);
          pingTimer = setTimeout(() => setShowReconnected(false), 3500);
        }
      } catch {
        setIsOnline(false);
      }
    };

    const handleOnline = () => {
      verifyConnection();
    };
    const handleOffline = () => {
      setIsOnline(false);
      setShowReconnected(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      clearTimeout(pingTimer);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Sync base currency from system_settings so every page renders amounts
  // with the currency selected in Customization → General Settings.
  useEffect(() => {
    syncCurrencyFromDb();
  }, []);

  // Handle browser back/forward and sync URL state
  useEffect(() => {
    let path = '/';
    if (currentPage === 'billing-log') path = '/billing-log';
    else if (currentPage === 'all-bills') path = '/billing-log/all-bills';
    else if (currentPage === 'billable') path = '/billable-consumables';
    else if (currentPage === 'non-billable') path = '/non-billable-consumables';
    else if (currentPage === 'reports') path = '/reports';
    else if (currentPage === 'customization') path = '/customization';
    else if (currentPage === 'stock-management') path = '/stock-management';
    else if (currentPage === 'stock-transfer') path = '/stock-transfer';
    else if (currentPage === 'doctors-master') path = '/masters/doctors';
    else if (currentPage === 'staff-master') path = '/masters/staff';
    
    // Build URL with query params from urlState
    const search = Object.keys(urlState).length > 0
      ? '?' + new URLSearchParams(urlState).toString()
      : window.location.search;

    const currentPath = window.location.pathname;
    const newFullPath = withBase(path);
    if (currentPath !== newFullPath || window.location.search !== search) {
      window.history.pushState({}, '', newFullPath + search);
      // Dispatch custom event so useQueryParams can detect the URL change
      const event = new Event('pushstate');
      window.dispatchEvent(event);
    }
  }, [currentPage, urlState]);

  // Handle browser back/forward
  useEffect(() => {
    const onPop = () => {
      const path = stripBase(window.location.pathname);
      // Map URL paths back to page IDs
      const pageId = pathToPage(path);

      if (pageId !== currentPage) {
        setCurrentPage(pageId);
      }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [currentPage]);

  const isAuthenticated = (
    localStorage.getItem('branchAuthenticated') === 'true' ||
    localStorage.getItem('misMode') === 'true'
  );
  
  const effectiveBranchId = branchId || (isAuthenticated ? Number(localStorage.getItem('branchId')) || null : null);

  // Listen for session conflict events from NotificationBell
  useEffect(() => {
    const handleConflict = () => {
      setShowConflictModal(true);
      setConflictMessage('Your session was ended because you logged in on another device. Please login again.');
    };
    window.addEventListener('session-conflict', handleConflict);
    return () => window.removeEventListener('session-conflict', handleConflict);
  }, []);

  const networkBanner = (
    <>
      {!isOnline && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            zIndex: 999999,
            background: '#EF4444',
            color: '#FFFFFF',
            padding: '8px 16px',
            textAlign: 'center',
            fontSize: '13px',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="1" y1="1" x2="23" y2="23" />
            <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
            <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
            <path d="M10.71 5.05A16 16 0 0 1 22.58 9" />
            <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
            <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
            <line x1="12" y1="20" x2="12.01" y2="20" />
          </svg>
          <span>You are offline. Network connection lost — please check your internet before saving.</span>
        </div>
      )}
      {isOnline && showReconnected && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            zIndex: 999999,
            background: '#10B981',
            color: '#FFFFFF',
            padding: '8px 16px',
            textAlign: 'center',
            fontSize: '13px',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
            animation: 'fadeIn 0.2s ease-in',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <span>Internet connection restored.</span>
        </div>
      )}
    </>
  );

  if (!effectiveBranchId && !isAuthenticated) {
    return (
      <>
        {networkBanner}
        <Welcome
          onBranchSelect={(id, name) => {
            switchBranch(id, name);
          }}
          onMisLogin={(id, name) => {
            loginMis(id, name);
          }}
        />
      </>
    );
  }

  if (showConflictModal) {
    return (
      <>
        {networkBanner}
        <div className="min-h-screen flex items-center justify-center" style={{ background: '#050505' }}>
          <div className="bg-gray-900 border border-violet-500/30 rounded-xl p-8 max-w-md w-full text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/20 flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-red-400">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">Session Conflict</h2>
            <p className="text-gray-400 mb-6">{conflictMessage}</p>
            <button
              onClick={() => {
                setShowConflictModal(false);
                logout();
              }}
              className="px-6 py-3 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-bold hover:scale-[1.02] transition-transform"
            >
              Login Again
            </button>
          </div>
        </div>
      </>
    );
  }

  const handleLogout = async () => {
    await endSession();
    // Clear sessionStorage
    sessionStorage.clear();
    // Clear localStorage (branchId, branchName, misMode, etc.)
    localStorage.removeItem('branchId');
    localStorage.removeItem('branchName');
    localStorage.removeItem('misMode');
    localStorage.removeItem('selectedBranch');
    localStorage.removeItem('branchAuthenticated');
    localStorage.removeItem('userId');
    localStorage.removeItem('username');
    localStorage.removeItem('userRole');
    // Reset context state
    logout();
    setCurrentPage('overview');
  };

  const navigateWithState = (page, state = {}) => {
    setUrlState(state);
    setCurrentPage(page);
  };

  // AI assistant is available to MIS logins only (per the ARMORAA AI spec).
  // misMode comes from BranchContext (reactive) so the widget mounts right
  // after MIS login without needing a page reload.

  return (
    <>
      {networkBanner}
      <Dashboard
        currentPage={currentPage}
        urlState={urlState}
        onNavigate={navigateWithState}
        onLogout={handleLogout}
      />
      {misMode && <ChatBot />}
      <UpdatePrompt />
    </>
  );
};

function App() {
  return (
    <BranchProvider>
      <AppContent />
    </BranchProvider>
  );
}

export default App;