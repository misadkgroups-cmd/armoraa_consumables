import { useState, useEffect } from 'react';
import { useBranch } from '../context/BranchContext';
import { supabase } from '../config/supabase';

const BranchSwitcher = () => {
  const { misMode, branchId, updateBranch } = useBranch();
  const [branches, setBranches] = useState([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const fetchBranches = async () => {
      try {
        const { data, error } = await supabase.from('branches').select('*');
        if (!error && data) {
          setBranches(data.map(b => ({
            id: b.id,
            branch_name: b.branch_name || b.name || `Branch ${b.id}`
          })));
        }
      } catch {
        // ignore — switcher just won't list
      }
    };
    if (misMode) fetchBranches();
  }, [misMode]);

  if (!misMode) return null;

  const current = branches.find(b => String(b.id) === String(branchId));

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2.5 rounded-xl border border-violet-500/30 bg-[#12121a] px-4 py-2.5 text-sm font-semibold text-white transition-all hover:bg-violet-500/15 hover:border-violet-400/50"
        style={{ boxShadow: open ? '0 0 20px rgba(139,92,246,0.2)' : 'none' }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="2" y1="12" x2="22" y2="12" />
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>
        <span>{current ? current.branch_name : 'Select Branch'}</span>
        <svg className={`w-4 h-4 text-violet-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div
            className="absolute left-0 top-full z-40 mt-2 w-56 overflow-hidden rounded-xl border border-violet-500/25 py-1.5"
            style={{
              background: 'rgba(15,15,25,0.95)',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              boxShadow: '0 0 60px rgba(139,92,246,0.2), 0 8px 32px rgba(0,0,0,0.4)',
            }}
          >
            <div className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-gray-500 border-b border-violet-500/10 flex items-center justify-between">
              <span>Switch Branch</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#6c727f" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="2" y1="12" x2="22" y2="12" />
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
              </svg>
            </div>
            {branches.map((b) => {
              const active = String(b.id) === String(branchId);
              return (
                <button
                  key={b.id}
                  onClick={() => {
                    updateBranch(Number(b.id), b.branch_name);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center justify-between px-4 py-2.5 text-left text-sm transition-all ${
                    active
                      ? 'bg-violet-500/15 text-violet-200 font-semibold'
                      : 'text-gray-300 hover:bg-violet-500/10 hover:text-white'
                  }`}
                >
                  <span>{b.branch_name}</span>
                  {active && (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};

export default BranchSwitcher;