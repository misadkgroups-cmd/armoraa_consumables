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
        className="flex items-center gap-2 rounded-xl border border-violet-500/20 bg-[#12121a] px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-violet-500/10"
      >
        <span>📍</span>
        <span>{current ? current.branch_name : 'Select Branch'}</span>
        <svg className={`w-4 h-4 text-violet-300 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div
            className="absolute left-0 top-full z-40 mt-2 w-56 overflow-hidden rounded-xl border border-violet-500/20 bg-[#0f0f19] py-2"
            style={{ boxShadow: '0 0 40px rgba(139,92,246,0.25)' }}
          >
            <div className="px-4 py-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
              Select Branch
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
                  className={`flex w-full items-center justify-between px-4 py-2 text-left text-sm transition-colors hover:bg-violet-500/10 ${active ? 'font-semibold text-violet-300' : 'text-gray-300'}`}
                >
                  <span>{b.branch_name}</span>
                  {active && <span className="text-violet-400">✓</span>}
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