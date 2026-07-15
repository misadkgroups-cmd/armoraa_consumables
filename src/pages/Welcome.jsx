import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../config/supabase';

const FALLBACK_MIS_PASSWORD = import.meta.env.VITE_MASTER_PASSWORD || 'armoraa@2026';

const MISModal = ({ onClose, onSuccess }) => {
  const [value, setValue] = useState('');
  const [error, setError] = useState(false);
  const [checking, setChecking] = useState(true);
  const [expected, setExpected] = useState(FALLBACK_MIS_PASSWORD);

  useEffect(() => {
    const fetchPassword = async () => {
      try {
        const { data, error } = await supabase
          .from('system_settings')
          .select('setting_value')
          .eq('setting_name', 'mis_password')
          .single();
        if (!error && data?.setting_value) {
          setExpected(data.setting_value);
        }
      } catch {
        // keep fallback
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
        <div style={{ marginTop: 20 }}>
          <input
            type="password"
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
              padding: '0 16px',
              fontSize: 15,
              fontWeight: 600,
              color: '#fff',
              outline: 'none',
              letterSpacing: value ? '0.15em' : '0',
              boxShadow: error ? '0 0 0 4px rgba(239,68,68,0.12)' : 'none',
              boxSizing: 'border-box',
            }}
          />
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

const Welcome = ({ onBranchSelect, onMisLogin }) => {
  const [branches, setBranches] = useState([]);
  const [selectedBranch, setSelectedBranch] = useState('');
  const [loading, setLoading] = useState(true);
  const [misOpen, setMisOpen] = useState(false);
  const [openDropdown, setOpenDropdown] = useState(false);

  useEffect(() => { fetchBranches(); }, []);

  const getFallback = () => [
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
        setSelectedBranch(String(formattedBranches[0].id));
      } else {
        const fallbackData = getFallback();
        setBranches(fallbackData);
        setSelectedBranch(String(fallbackData[0].id));
      }
    } catch {
      const fallbackData = getFallback();
      setBranches(fallbackData);
      setSelectedBranch(String(fallbackData[0].id));
    } finally {
      setLoading(false);
    }
  };

  const handleContinue = () => {
    if (selectedBranch) {
      const branch = branches.find(b => String(b.id) === String(selectedBranch));
      const numericId = Number(selectedBranch);
      onBranchSelect(numericId, branch?.branch_name);
    }
  };

  const stars = useMemo(() =>
    [...Array(40)].map(() => ({
      size: Math.random() * 3 + 'px',
      left: Math.random() * 100 + '%',
      top: Math.random() * 100 + '%'
    })), []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#050505' }}>
        <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-500 flex items-center justify-center animate-pulse" style={{ boxShadow: '0 0 60px rgba(124,58,237,0.5)' }}>
          <span className="text-white font-bold text-3xl">A</span>
        </div>
      </div>
    );
  }

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
            <p className="text-gray-400 text-center mt-2 text-sm">Select your branch to continue</p>

            <div className="flex flex-col w-full">
              <div className="custom-dropdown-container">
                <div className="dropdown-trigger" onClick={() => setOpenDropdown(!openDropdown)}>
                  <span>{selectedBranch ? branches.find(b => String(b.id) === String(selectedBranch))?.branch_name : 'Select branch'}</span>
                  <svg className={`chevron-icon ${openDropdown ? 'rotate-180' : ''}`} xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </div>
                {openDropdown && (
                  <ul className="dropdown-menu-list">
                    {branches.map((branch) => (
                      <li
                        key={branch.id}
                        className={`dropdown-item ${String(branch.id) === String(selectedBranch) ? 'active' : ''}`}
                        onClick={() => {
                          setSelectedBranch(String(branch.id));
                          setOpenDropdown(false);
                        }}
                      >
                        {branch.branch_name}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="h-4 w-full" />

              <button
                onClick={handleContinue}
                disabled={!selectedBranch}
                className="w-full h-14 rounded-xl text-base font-bold text-white bg-gradient-to-r from-[#7C3AED] to-[#6366F1] hover:scale-[1.01] transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
              >
                Go To Workspace →
              </button>
            </div>
          </div>
        </div>
      </div>

      {stars.map((star, i) => (
        <div
          key={i}
          className="absolute bg-violet-400 rounded-full"
          style={{
            width: star.size,
            height: star.size,
            left: star.left,
            top: star.top,
            opacity: 0.3 + Math.random() * 0.3,
            animation: `starFloat ${3 + Math.random() * 4}s ease-in-out infinite`,
            animationDelay: `${Math.random() * 5}s`,
          }}
        />
      ))}

      {misOpen && (
        <MISModal
          onClose={() => setMisOpen(false)}
          onSuccess={() => {
            setMisOpen(false);
            const first = branches[0];
            onMisLogin(first ? Number(first.id) : null, first?.branch_name || 'MIS');
          }}
        />
      )}
    </div>
  );
};

export default Welcome;