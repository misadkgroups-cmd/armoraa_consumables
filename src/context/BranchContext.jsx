import { createContext, useContext, useState, useEffect, useRef } from 'react';
import { supabase } from '../config/supabase';
import { validateSession, endSession, startHeartbeat, clearHeartbeat, getCurrentSession } from '../services/sessionApi';

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
  const [userId, setUserId] = useState(() => {
    const saved = localStorage.getItem('userId');
    return saved ? parseInt(saved) : null;
  });
  const [userRole, setUserRole] = useState(() => {
    return localStorage.getItem('userRole') || '';
  });
  
  const heartbeatIntervalRef = useRef(null);
  const sessionCheckRef = useRef(null);

  // Validate session on mount and periodically check if still valid
  useEffect(() => {
    const checkAndRestoreSession = async () => {
      const isAuthenticated = localStorage.getItem('branchAuthenticated') === 'true';
      
      if (isAuthenticated) {
        // Check if session is still valid
        const isValid = await validateSession();
        
        if (!isValid) {
          // Session expired or ended - log out
          logout();
          return;
        }
        
        // Start heartbeat to keep session alive
        heartbeatIntervalRef.current = startHeartbeat();
      }
    };

    checkAndRestoreSession();

    // Periodic session check every 1 minute
    sessionCheckRef.current = setInterval(() => {
      const isAuthenticated = localStorage.getItem('branchAuthenticated') === 'true';
      if (isAuthenticated) {
        validateSession().then(isValid => {
          if (!isValid) {
            logout();
          }
        });
      }
    }, 60000);

    return () => {
      if (heartbeatIntervalRef.current) {
        clearHeartbeat(heartbeatIntervalRef.current);
      }
      if (sessionCheckRef.current) {
        clearInterval(sessionCheckRef.current);
      }
    };
  }, []);

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

  const logout = async () => {
    // End the session in database
    await endSession();
    
    // Clear all storage
    localStorage.removeItem('branchId');
    localStorage.removeItem('branchName');
    localStorage.removeItem('misMode');
    localStorage.removeItem('branchAuthenticated');
    localStorage.removeItem('userId');
    localStorage.removeItem('username');
    localStorage.removeItem('userRole');
    localStorage.removeItem('selectedBranch');
    sessionStorage.clear();
    
    // Reset state
    setBranchId(null);
    setBranchName('');
    setMisMode(false);
    setUserId(null);
    setUserRole('');
  };

  return (
    <BranchContext.Provider value={{ 
      branchId, 
      branchName, 
      misMode, 
      loading, 
      userId,
      userRole,
      switchBranch, 
      updateBranch, 
      loginMis, 
      logout 
    }}>
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