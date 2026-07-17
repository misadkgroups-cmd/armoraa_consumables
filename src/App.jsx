import { useState, useEffect } from 'react';
import { BranchProvider, useBranch } from './context/BranchContext';
import Welcome from './pages/Welcome';
import Dashboard from './pages/Dashboard';
import './App.css';

const AppContent = () => {
  const [currentPage, setCurrentPage] = useState('overview');
  const [urlState, setUrlState] = useState({});
  const { branchId, switchBranch, updateBranch, loginMis, logout } = useBranch();

  // Sync URL with current page state
  useEffect(() => {
    let path = '/';
    if (currentPage === 'billing-log') path = '/billing-log';
    else if (currentPage === 'all-bills') path = '/billing-log/all-bills';
    else if (currentPage === 'billable') path = '/billable-consumables';
    else if (currentPage === 'non-billable') path = '/non-billable-consumables';
    else if (currentPage === 'reports') path = '/reports';
    else if (currentPage === 'customization') path = '/customization';
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
      else if (path === '/masters/doctors') pageId = 'doctors-master';
      else if (path === '/masters/staff') pageId = 'staff-master';
      
      if (pageId !== currentPage) {
        setCurrentPage(pageId);
      }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [currentPage]);

  const isAuthenticated = sessionStorage.getItem('branchAuthenticated') === 'true';

  if (!branchId || !isAuthenticated) {
    return (
      <Welcome
        onBranchSelect={(id, name) => {
          sessionStorage.setItem('selectedBranch', String(id));
          sessionStorage.setItem('branchAuthenticated', 'true');
          switchBranch(id, name);
        }}
        onMisLogin={(id, name) => {
          sessionStorage.setItem('selectedBranch', id != null ? String(id) : '');
          sessionStorage.setItem('branchAuthenticated', 'true');
          loginMis(id, name);
        }}
      />
    );
  }

  const handleLogout = () => {
    sessionStorage.removeItem('branchAuthenticated');
    sessionStorage.removeItem('selectedBranch');
    logout();
    setCurrentPage('overview');
  };

  const navigateWithState = (page, state = {}) => {
    setUrlState(state);
    setCurrentPage(page);
  };

  return (
    <Dashboard
      currentPage={currentPage}
      onNavigate={navigateWithState}
      onLogout={handleLogout}
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

