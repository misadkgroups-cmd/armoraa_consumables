import { useState, useEffect, useRef } from 'react';
import { supabase } from '../config/supabase';
import { 
  checkActiveSession, 
  createSession, 
  endSession,
  logoutConcurrentUser,
  startHeartbeat,
  clearHeartbeat 
} from '../services/sessionApi';

const MISModal = ({ onClose, onSuccess }) => {
  const [value, setValue] = useState('');
  const [error, setError] = useState(false);
  const [checking, setChecking] = useState(true);
  const [expected, setExpected] = useState(import.meta.env.VITE_MASTER_PASSWORD || 'armoraa@2026');
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    const fetchPassword = async () => {
      try {
        const { data, error } = await supabase
          .from('system_settings')
          .select('setting_value')
          .eq('setting_key', 'mis_password')
          .maybeSingle();
        if (!error && data?.setting_value) {
          setExpected(data.setting_value);
        }
      } catch {
        // keep fallback from VITE_MASTER_PASSWORD
      } finally {
        setChecking(false);
      }
    };
    fetchPassword();
  }, []);

  const handleLogin = () => {
    if (value === expected) {
      onSuccess();
    } else {
      setError(true);
    }
  };
  
  const handleMouseDown = () => setShowPassword(true);
  const handleMouseUp = () => setShowPassword(false);
  const handleMouseLeave = () => setShowPassword(false);

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)' }}
      onClick={onClose}
    >
      <div
        style={{
          width: 520,
          background: 'rgba(13,10,22,0.9)',
          borderRadius: 18,
          border: '1px solid rgba(109,62,255,0.25)',
          boxShadow: '0 0 80px rgba(109,62,255,0.25), 0 0 0 1px rgba(255,255,255,0.04)',
          padding: 24,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-5">
          {/* Logo */}
          <div
            style={{
              width: 110,
              height: 110,
              borderRadius: 18,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              overflow: 'hidden',
              background: 'transparent',
            }}
          >
            <img
              src="/armoraa.png"
              alt="Armoraa"
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            />
          </div>

          {/* Title block */}
          <div className="flex-1" style={{ paddingTop: 4 }}>
            <h3 style={{ fontSize: 40, fontWeight: 700, color: '#fff', letterSpacing: '-0.02em', lineHeight: 1.1, margin: 0 }}>
              MIS ACCESS
            </h3>
            <p style={{ fontSize: 16, fontWeight: 400, color: '#9CA3AF', margin: '6px 0 0 0' }}>
              Enter MIS password to continue
            </p>
          </div>
        </div>

        {/* Input field */}
        <div style={{ marginTop: 20, position: 'relative' }}>
          <input
            type={showPassword ? 'text' : 'password'}
            autoFocus
            disabled={checking}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setError(false);
            }}
            onKeyDown={(e) => e.key === 'Enter' && !checking && handleLogin()}
            placeholder="Enter your password"
            style={{
              width: '100%',
              height: 56,
              borderRadius: 12,
              border: error ? '1px solid rgba(239,68,68,0.6)' : '1px solid rgba(109,62,255,0.35)',
              background: 'rgba(0,0,0,0.5)',
              padding: '0 48px 0 16px',
              fontSize: 15,
              fontWeight: 600,
              color: '#fff',
              outline: 'none',
              letterSpacing: showPassword ? '0' : value ? '0.15em' : '0',
              boxShadow: error ? '0 0 0 4px rgba(239,68,68,0.12)' : 'none',
              boxSizing: 'border-box',
            }}
          />
          <button
            type="button"
            onMouseDown={handleMouseDown}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseLeave}
            onTouchStart={handleMouseDown}
            onTouchEnd={handleMouseUp}
            onTouchCancel={handleMouseLeave}
            tabIndex={-1}
            style={{
              position: 'absolute',
              right: 12,
              top: '50%',
              transform: 'translateY(-50%)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#6B7280',
              transition: 'color 0.2s',
              outline: 'none',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = '#D1D5DB'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = '#6B7280'; }}
            title="Hold to show password"
          >
            {showPassword ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                <line x1="1" y1="1" x2="23" y2="23"/>
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
            )}
          </button>
          {error && (
            <p style={{ margin: '8px 0 0 0', textAlign: 'center', fontSize: 13, fontWeight: 600, color: '#F87171' }}>
              Invalid password
            </p>
          )}
        </div>

        {/* Buttons */}
        <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
          <button
            onClick={onClose}
            style={{
              flex: 1,
              height: 50,
              borderRadius: 12,
              border: '1px solid rgba(109,62,255,0.2)',
              background: 'rgba(0,0,0,0.5)',
              color: '#D1D5DB',
              fontSize: 15,
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(109,62,255,0.1)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(0,0,0,0.5)'; }}
          >
            Cancel
          </button>
          <button
            onClick={handleLogin}
            disabled={checking}
            style={{
              flex: 1,
              height: 50,
              borderRadius: 12,
              border: 'none',
              background: 'linear-gradient(135deg, #8A2BE2, #6C63FF)',
              color: '#fff',
              fontSize: 15,
              fontWeight: 700,
              cursor: checking ? 'not-allowed' : 'pointer',
              opacity: checking ? 0.5 : 1,
              transition: 'all 0.2s',
              boxShadow: '0 4px 16px rgba(108,99,255,0.3)',
            }}
            onMouseEnter={(e) => { if (!checking) e.currentTarget.style.transform = 'scale(1.02)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
          >
            {checking ? 'Loading…' : 'Login'}
          </button>
        </div>
      </div>
    </div>
  );
};

const ConcurrentLoginModal = ({ isOpen, onClose, onConfirm, username }) => {
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)' }}>
      <div className="bg-gray-900 border border-violet-500/30 rounded-xl p-6 max-w-md w-full text-center">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-yellow-500/20 flex items-center justify-center">
          <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-yellow-400">
            <path d="M12 9v2m0 4h.01M5.47 5.47A9 9 0 1 1 12 21a9 9 0 0 1-6.53-4.53" />
          </svg>
        </div>
        <h3 className="text-xl font-bold text-white mb-2">Login Already in Use</h3>
        <p className="text-gray-400 mb-4">The user "{username}" is already logged in on another device. Do you want to log them out and continue?</p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={onClose}
            className="px-6 py-2 rounded-lg border border-violet-500/30 text-violet-300 hover:bg-violet-500/15 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-6 py-2 rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-medium hover:scale-[1.02] transition-transform"
          >
            Continue Login
          </button>
        </div>
      </div>
    </div>
  );
};

const Welcome = ({ onBranchSelect, onMisLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [misOpen, setMisOpen] = useState(false);
  const [showConcurrentModal, setShowConcurrentModal] = useState(false);
  const [concurrentUserData, setConcurrentUserData] = useState(null);
  const [branches, setBranches] = useState([]);
  const [showPassword, setShowPassword] = useState(false);
  const heartbeatIntervalRef = useRef(null);

  useEffect(() => {
    fetchBranches();
    setupSessionCleanup();
    
    return () => {
      if (heartbeatIntervalRef.current) {
        clearHeartbeat(heartbeatIntervalRef.current);
      }
    };
  }, []);

  const setupSessionCleanup = () => {
    // Handle page visibility change - logout when tab is closed
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        // User is leaving the page - mark session as ended if no session token exists yet
        // (i.e., they're on the login page)
        const sessionToken = localStorage.getItem('sessionToken');
        if (!sessionToken) return;
      }
    };

    // Handle before unload - logout when tab is closed
    const handleBeforeUnload = () => {
      const sessionToken = localStorage.getItem('sessionToken');
      if (sessionToken) {
        // Use sendBeacon for reliable delivery during page unload
        const data = JSON.stringify({ sessionToken });
        const url = supabase.supabaseUrl + '/rest/v1/user_sessions?session_token=eq.' + sessionToken;
        navigator.sendBeacon(url, data);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  };

  const getFallbackBranches = () => [
    { id: 1, branch_name: 'ANNA NAGAR', address: 'No 109/3, 2nd Ave, Anna Nagar 600040' },
    { id: 2, branch_name: 'ALWARPET', address: '3, Sriram Nagar N St, Alwarpet 600018' },
    { id: 3, branch_name: 'VELACHERY', address: '11-70, 7th Main Rd, Dhandeeswaram 600042' }
  ];

  const fetchBranches = async () => {
    try {
      const { data, error } = await supabase.from('branches').select('*');
      if (!error && data && data.length > 0) {
        const formattedBranches = data.map(branch => ({
          id: branch.id,
          branch_name: branch.branch_name || branch.name || `Branch ${branch.id}`,
          address: branch.address || ''
        }));
        setBranches(formattedBranches);
      } else {
        setBranches(getFallbackBranches());
      }
    } catch {
      setBranches(getFallbackBranches());
    }
  };

  // Helper function to complete the login process
  const completeLogin = async (user) => {
    // Create new session in database
    const sessionResult = await createSession(user.id);
    if (!sessionResult.success && sessionResult.error?.code !== 'PGRST116') {
      console.warn('Could not create session in DB, continuing anyway:', sessionResult.error);
    }

    // Start heartbeat to track active session
    heartbeatIntervalRef.current = startHeartbeat();

    // Store user session in localStorage for persistence
    localStorage.setItem('userId', String(user.id));
    localStorage.setItem('username', user.username);
    localStorage.setItem('userRole', user.role);
    localStorage.setItem('branchId', String(user.branch_id || ''));
    const userBranch = branches.find(b => b.id === user.branch_id);
    localStorage.setItem('branchName', userBranch?.branch_name || '');
    localStorage.setItem('branchAuthenticated', 'true');

    console.log('Session stored. Branch:', userBranch?.branch_name, 'Role:', user.role);

    // Determine if MIS user
    if (user.role === 'MIS') {
      const firstBranch = branches[0];
      onMisLogin(firstBranch ? Number(firstBranch.id) : null, firstBranch?.branch_name || 'MIS');
    } else {
      if (!user.branch_id) {
        setError('User account is not assigned to any branch. Contact administrator.');
        setLoading(false);
        return;
      }
      onBranchSelect(Number(user.branch_id), userBranch?.branch_name || 'Branch');
    }
  };

  const handleLogin = async () => {
    if (!username || !password) {
      setError('Please enter both username and password');
      return;
    }

    setLoading(true);
    setError('');

    try {
      console.log('=== LOGIN ATTEMPT ===');
      console.log('Username:', username, 'Password:', password);

      // Query users table - use .maybeSingle() to avoid errors
      const { data: users, error: queryError } = await supabase
        .from('users')
        .select('*')
        .eq('username', username.trim())
        .eq('status', 'Active');

      console.log('Query result:', { users, queryError });

      if (queryError) {
        console.error('Database query error:', queryError);
        setError('Login failed: ' + queryError.message);
        setLoading(false);
        return;
      }

      if (!users || users.length === 0) {
        console.warn('No user found with username:', username);
        setError('Invalid username or password');
        setLoading(false);
        return;
      }

      const user = users[0];
      console.log('Found user:', user.username, 'role:', user.role, 'branch_id:', user.branch_id);

      // Verify password
      const storedPassword = (user.password_hash || '').trim();
      const enteredPassword = password.trim();
      
      console.log('Password check - stored:', storedPassword, 'entered:', enteredPassword, 'match:', storedPassword === enteredPassword);
      
      if (!storedPassword) {
        setError('Account not configured. Contact administrator.');
        setLoading(false);
        return;
      }
      
      if (storedPassword !== enteredPassword) {
        setError('Invalid username or password');
        setLoading(false);
        return;
      }

      // Check for existing active session (concurrent login detection)
      const existingSession = await checkActiveSession(user.id);
      
      if (existingSession) {
        // There's an active session - check if it's from another device
        const sessionToken = localStorage.getItem('sessionToken');
        const isOwnSession = sessionToken && existingSession.session_token === sessionToken;
        
        if (!isOwnSession) {
          // Another device has an active session - show confirmation modal
          setConcurrentUserData(user);
          setShowConcurrentModal(true);
          setLoading(false);
          return;
        }
      }

      // No concurrent login - proceed with login
      await completeLogin(user);
    } catch (err) {
      console.error('Login exception:', err);
      setError('Login failed. Check console for details.');
    } finally {
      setLoading(false);
    }
  };

  const handleConcurrentLoginConfirm = async () => {
    if (!concurrentUserData) return;
    
    setLoading(true);
    setShowConcurrentModal(false);
    
    try {
      // Logout the other session
      await logoutConcurrentUser(concurrentUserData.id);
      
      // Proceed with login
      await completeLogin(concurrentUserData);
    } catch (err) {
      console.error('Concurrent login exception:', err);
      setError('Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleMIS = async () => {
    const first = branches[0];
    const id = first ? Number(first.id) : 1;
    const name = first?.branch_name || 'MIS';
    
    // Direct MIS login - no session check
    sessionStorage.setItem('branchAuthenticated', 'true');
    sessionStorage.setItem('userRole', 'MIS');
    sessionStorage.setItem('username', 'MIS Admin');
    localStorage.setItem('userId', '0');
    localStorage.setItem('branchId', String(id));
    localStorage.setItem('branchName', name);
    localStorage.setItem('misMode', 'true');
    localStorage.setItem('sessionToken', 'mis_direct_' + Date.now());
    
    // Clear conflicts
    setShowConcurrentModal(false);
    setConcurrentUserData(null);
    
    // Reload page
    window.location.reload();
  };

  const handleMouseDown = () => setShowPassword(true);
  const handleMouseUp = () => setShowPassword(false);
  const handleMouseLeave = () => setShowPassword(false);

  return (
    <div className="min-h-screen relative overflow-hidden flex items-center justify-center" style={{ background: '#050505' }}>

      <button
        onClick={() => setMisOpen(true)}
        className="absolute top-6 right-6 z-20 rounded-xl border border-violet-500/30 px-5 py-2.5 text-sm font-bold tracking-wider text-violet-300 transition-all hover:bg-violet-500/15 hover:scale-[1.03]"
      >
        MIS
      </button>

      <div className="w-full max-w-7xl mx-auto px-6 flex flex-col lg:flex-row items-center justify-center gap-24" style={{ padding: '0 40px' }}>

        <div className="flex flex-col items-center text-center w-full">
          <div style={{ width: 140, height: 140, display: 'flex', alignItems: 'center', justifyContent: 'center', filter: 'drop-shadow(0px 0px 25px rgba(168, 85, 247, 0.4))' }} className="mb-3">
            <img
              src="/armoraa.png"
              alt="Armoraa"
              style={{ width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none' }}
            />
          </div>

          <h1 className="brand-title">ARMORAA</h1>

          <p className="text-2xl font-semibold text-white mt-3">Clinic Operations Platform</p>

          <div className="flex items-center justify-center gap-2 mt-4 text-sm text-gray-500">
            <span>Consumables</span>
            <span className="text-gray-600">•</span>
            <span>Services</span>
            <span className="text-gray-600">•</span>
            <span>Inventory</span>
            <span className="text-gray-600">•</span>
            <span>Reporting</span>
          </div>
        </div>

        <div className="flex justify-center">
          <div className="login-card">
            <h2 className="text-3xl font-bold text-white text-center">Welcome Back!</h2>
            <p className="text-gray-400 text-center mt-2 text-sm">Enter your credentials to continue</p>

            <div className="flex flex-col w-full mt-6">
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-gray-400 block mb-1.5">Username</label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => { setUsername(e.target.value); setError(''); }}
                    onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                    placeholder="Enter your username"
                    className="form-input"
                    disabled={loading}
                  />
                </div>
                
                <div>
                  <label className="text-xs font-semibold text-gray-400 block mb-1.5">Password</label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => { setPassword(e.target.value); setError(''); }}
                      onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                      placeholder="Enter your password"
                      className="form-input"
                      disabled={loading}
                    />
                    <button
                      type="button"
                      onMouseDown={handleMouseDown}
                      onMouseUp={handleMouseUp}
                      onMouseLeave={handleMouseLeave}
                      onTouchStart={handleMouseDown}
                      onTouchEnd={handleMouseUp}
                      onTouchCancel={handleMouseLeave}
                      tabIndex={-1}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
                    >
                      {showPassword ? (
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                          <line x1="1" y1="1" x2="23" y2="23"/>
                        </svg>
                      ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                          <circle cx="12" cy="12" r="3"/>
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {error && (
                <p style={{ margin: '12px 0 0 0', textAlign: 'center', fontSize: 13, fontWeight: 600, color: '#F87171' }}>
                  {error}
                </p>
              )}

              <button
                onClick={handleLogin}
                disabled={loading}
                className="w-full h-14 rounded-xl text-base font-bold text-white bg-gradient-to-r from-[#7C3AED] to-[#6366F1] hover:scale-[1.01] transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100 mt-6"
              >
                {loading ? 'Logging in…' : 'Login'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {misOpen && (
        <MISModal
          onClose={() => setMisOpen(false)}
          onSuccess={handleMIS}
        />
      )}

      {showConcurrentModal && concurrentUserData && (
        <ConcurrentLoginModal
          isOpen={showConcurrentModal}
          onClose={() => setShowConcurrentModal(false)}
          onConfirm={handleConcurrentLoginConfirm}
          username={concurrentUserData.username}
        />
      )}
    </div>
  );
};

export default Welcome;
