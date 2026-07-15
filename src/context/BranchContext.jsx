import { createContext, useContext, useState, useEffect } from 'react';

const BranchContext = createContext(null);

export const BranchProvider = ({ children }) => {
  const [branchId, setBranchId] = useState(() => {
    const saved = localStorage.getItem('branchId');
    return saved ? parseInt(saved) : null;
  });
  const [branchName, setBranchName] = useState(() => {
    return localStorage.getItem('branchName') || '';
  });
  const [misMode, setMisMode] = useState(() => {
    return localStorage.getItem('misMode') === 'true';
  });
  const [loading, _setLoading] = useState(false);

  useEffect(() => {
    if (branchId) {
      localStorage.setItem('branchId', branchId);
    } else {
      localStorage.removeItem('branchId');
    }
  }, [branchId]);

  useEffect(() => {
    if (branchName) {
      localStorage.setItem('branchName', branchName);
    } else {
      localStorage.removeItem('branchName');
    }
  }, [branchName]);

  useEffect(() => {
    if (misMode) {
      localStorage.setItem('misMode', 'true');
    } else {
      localStorage.removeItem('misMode');
    }
  }, [misMode]);

  const switchBranch = (id, name) => {
    setBranchId(id);
    setBranchName(name);
    setMisMode(false);
  };

  // Switch branch while keeping MIS mode active
  const updateBranch = (id, name) => {
    setBranchId(id);
    setBranchName(name);
  };

  const loginMis = (id = null, name = 'MIS') => {
    if (id != null) {
      setBranchId(id);
      setBranchName(name);
    } else {
      setBranchName(name);
    }
    setMisMode(true);
  };

  const logout = () => {
    setBranchId(null);
    setBranchName('');
    setMisMode(false);
  };

  return (
    <BranchContext.Provider value={{ branchId, branchName, misMode, loading, switchBranch, updateBranch, loginMis, logout }}>
      {children}
    </BranchContext.Provider>
  );
};

export const useBranch = () => {
  const context = useContext(BranchContext);
  if (!context) {
    throw new Error('useBranch must be used within BranchProvider');
  }
  return context;
};