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
      className="fixed inset-0 z-[200] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="w-[400px] max-w-[90vw] rounded-3xl p-8 text-center"
        style={{
          background: 'rgba(15,15,25,0.85)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          border: '1px solid rgba(139,92,246,0.25)',
          boxShadow: '0 0 80px rgba(139,92,246,0.2), inset 0 0 0 1px rgba(255,255,255,0.03)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl text-2xl"
          style={{
            background: 'linear-gradient(135deg, #7C3AED, #8B5CF6)',
            boxShadow: '0 0 40px rgba(124,58,237,0.5)'
          }}
        >
          🔒
        </div>

        <h3 className="text-2xl font-bold text-white">MIS Access</h3>
        <p className="mt-2 text-sm text-gray-400">Enter MIS password to continue</p>

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
          placeholder="••••••••"
          className="mt-6 w-full rounded-2xl border bg-[#12121a] px-5 py-4 text-center text-lg text-white outline-none disabled:opacity-50"
          style={{
            borderColor: error ? 'rgba(239,68,68,0.6)' : 'rgba(139,92,246,0.2)',
            boxShadow: error ? '0 0 0 3px rgba(239,68,68,0.15)' : 'none'
          }}
        />

        {error && (
          <p className="mt-3 text-sm font-medium text-red-400">Invalid password</p>
        )}

        <div className="mt-7 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl border border-violet-500/20 py-3 text-base font-semibold text-gray-300 transition-all hover:bg-violet-500/10"
          >
            Cancel
          </button>
          <button
            onClick={handleLogin}
            disabled={checking}
            className="flex-1 rounded-xl bg-gradient-to-r from-violet-600 via-purple-500 to-indigo-500 py-3 text-base font-bold text-white shadow-[0_0_40px_rgba(139,92,246,0.5)] transition-all hover:scale-[1.02] disabled:opacity-50"
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

  useEffect(() => {
    fetchBranches();
  }, []);

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

  // Memoized star field so positions stay stable across re-renders
  const stars = useMemo(() =>
    [...Array(40)].map(() => ({
      size: Math.random() * 3 + 'px',
      left: Math.random() * 100 + '%',
      top: Math.random() * 100 + '%'
    })), []
  );

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

      {/* Top-right MIS button */}
      <button
        onClick={() => setMisOpen(true)}
        className="absolute top-6 right-6 z-20 rounded-xl border border-violet-500/30 px-5 py-2.5 text-sm font-bold tracking-wider text-violet-300 transition-all hover:bg-violet-500/15 hover:scale-[1.03]"
      >
        MIS
      </button>

      <div className="w-full max-w-7xl mx-auto px-6 flex flex-col lg:flex-row items-center justify-center gap-24" style={{ padding: '0 40px' }}>

        {/* Left Side — Hero Branding */}
        <div className="flex flex-col items-center text-center">

          {/* Large glowing floating logo with aura */}
          <div className="logo-container relative mb-10 flex items-center justify-center">
            <div className="absolute w-80 h-80 bg-violet-600/30 blur-[120px] rounded-full" />
            <img
              src="/armoraa-logo.png"
              alt="Armoraa"
              className="armoraa-logo relative"
            />
          </div>

          {/* Brand */}
          <h1 className="brand-title">
            ARMORAA
          </h1>

          <p className="text-2xl font-semibold text-white mt-5">
            Clinic Operations Platform
          </p>

          <p className="text-gray-500 text-lg mt-4 tracking-wide">
            Consumables • Services • Inventory • Reporting
          </p>
        </div>

        {/* Right Side — Glass Login Card */}
        <div className="flex justify-center">

          <div className="login-card">
            <h2 className="text-4xl font-bold text-white text-center">
              Welcome Back!
            </h2>

            <p className="text-gray-400 text-center mt-3 text-lg">
              Select your branch to continue
            </p>

            <select
              value={selectedBranch}
              onChange={(e) => setSelectedBranch(e.target.value)}
              className="
                mt-10
                w-full
                h-16
                rounded-2xl
                bg-[#12121a]
                border
                border-violet-500/20
                px-5
                text-white
                text-lg
                outline-none
              "
            >
              {branches.map((branch) => (
                <option key={branch.id} value={String(branch.id)}>
                  {branch.branch_name}
                </option>
              ))}
            </select>

            <button
              onClick={handleContinue}
              disabled={!selectedBranch}
              className="
                mt-8
                w-full
                h-16
                rounded-2xl
                text-xl
                font-bold
                text-white
                bg-gradient-to-r
                from-violet-600
                via-purple-500
                to-indigo-500
                hover:scale-[1.02]
                transition-all
                shadow-[0_0_40px_rgba(139,92,246,0.5)]
                disabled:opacity-40
                disabled:cursor-not-allowed
                disabled:hover:scale-100
              "
            >
              Go To Workspace →
            </button>
          </div>
        </div>
      </div>

      {/* Stars */}
      {stars.map((star, i) => (
        <div
          key={i}
          className="absolute bg-violet-400 rounded-full opacity-30"
          style={{
            width: star.size,
            height: star.size,
            left: star.left,
            top: star.top
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