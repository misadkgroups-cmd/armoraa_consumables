import { useState, useEffect, useRef } from 'react';
import { BranchProvider, useBranch } from './context/BranchContext';
import Welcome from './pages/Welcome';
import Dashboard from './pages/Dashboard';
import { validateSession, endSession, startHeartbeat, clearHeartbeat } from './services/sessionApi';
import './App.css';

const AppContent = () => {
  const [currentPage, setCurrentPage] = useState('overview');
  const [urlState, setUrlState] = useState({});
  const { branchId, switchBranch, updateBranch, loginMis, logout } = useBranch();
  const heartbeatIntervalRef = useRef(null);
  const [showConflictModal, setShowConflictModal] = useState(false);
  const [conflictMessage, setConflictMessage] = useState('');

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
    else if (currentPage === 'doctors-master') path = '/masters/doctors';
    else if (currentPage === 'staff-master') path = '/masters/staff';
    
    // Build URL with query params from urlState
    const search = Object.keys(urlState).length > 0 
      ? '?' + new URLSearchParams(urlState).toString()
      : window.location.search;
    const newUrl = path + search;
    
    const currentPath = window.location.pathname;
    if (currentPath !== path || window.location.search !== search) {
      window.history.pushState({}, '', newUrl);
      // Dispatch custom event so useQueryParams can detect the URL change
      const event = new Event('pushstate');
      window.dispatchEvent(event);
    }
  }, [currentPage, urlState]);

  // Handle browser back/forward
  useEffect(() => {
    const onPop = () => {
      const path = window.location.pathname;
      // Map URL paths back to page IDs
      let pageId = 'overview';
      if (path === '/' || path === '') pageId = 'overview';
      else if (path === '/billing-log') pageId = 'billing-log';
      else if (path === '/billing-log/all-bills') pageId = 'all-bills';
      else if (path === '/billable-consumables') pageId = 'billable';
      else if (path === '/non-billable-consumables') pageId = 'non-billable';
      else if (path === '/reports') pageId = 'reports';
      else if (path === '/customization') pageId = 'customization';
      else if (path === '/stock-management') pageId = 'stock-management';
      else if (path === '/masters/doctors') pageId = 'doctors-master';
      else if (path === '/masters/staff') pageId = 'staff-master';
      
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

  // Check session validity when app loads
  useEffect(() => {
    const checkSession = async () => {
      if (!isAuthenticated) return;
      
      const isValid = await validateSession();
      if (!isValid) {
        // Session was ended by concurrent login
        setShowConflictModal(true);
        setConflictMessage('Your session was ended because you logged in on another device. Please login again.');
      }
    };
    
    checkSession();
    
    // Start heartbeat
    if (isAuthenticated) {
      heartbeatIntervalRef.current = startHeartbeat();
    }
    
    return () => {
      if (heartbeatIntervalRef.current) {
        clearHeartbeat(heartbeatIntervalRef.current);
      }
    };
  }, [isAuthenticated]);

  if (!effectiveBranchId && !isAuthenticated) {
    return (
      <Welcome
        onBranchSelect={(id, name) => {
          switchBranch(id, name);
        }}
        onMisLogin={(id, name) => {
          loginMis(id, name);
        }}
      />
    );
  }

  if (showConflictModal) {
    return (
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

  // Expose refresh function for child pages
  const refreshCurrentPage = () => {
    if (currentPage === 'all-bills' || currentPage === 'billing-log') {
      // Force re-render by toggling urlState
      setUrlState(prev => ({ ...prev, _refresh: Date.now() }));
    }
  };

  return (
    <Dashboard
      currentPage={currentPage}
      urlState={urlState}
      onNavigate={navigateWithState}
      onLogout={handleLogout}
      onConflictLogin={() => {
        setShowConflictModal(false);
      }}
    />
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