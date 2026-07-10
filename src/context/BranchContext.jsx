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
  const [loading, setLoading] = useState(false);

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

  const switchBranch = (id, name) => {
    setBranchId(id);
    setBranchName(name);
  };

  return (
    <BranchContext.Provider value={{ branchId, branchName, loading, switchBranch }}>
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