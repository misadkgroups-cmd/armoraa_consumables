import { useState } from 'react';
import { BranchProvider, useBranch } from './context/BranchContext';
import Welcome from './pages/Welcome';
import Dashboard from './pages/Dashboard';
import './App.css';

const AppContent = () => {
  const [currentPage, setCurrentPage] = useState('overview');
  const { branchId, switchBranch, loginMis, logout } = useBranch();

  if (!branchId) {
    return (
      <Welcome
        onBranchSelect={(id, name) => switchBranch(id, name)}
        onMisLogin={loginMis}
      />
    );
  }

  const handleLogout = () => {
    logout();
    setCurrentPage('overview');
  };

  return (
    <Dashboard
      currentPage={currentPage}
      onNavigate={setCurrentPage}
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

