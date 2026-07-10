import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { supabase } from '../config/supabase';

const Welcome = ({ onBranchSelect }) => {
  const [branches, setBranches] = useState([]);
  const [selectedBranch, setSelectedBranch] = useState('');
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);

  useEffect(() => {
    fetchBranches();
  }, []);

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
        const fallbackData = [
          { id: 1, branch_name: 'ANNA NAGAR', address: 'No 109/3, 2nd Ave, Anna Nagar 600040' },
          { id: 2, branch_name: 'ALWARPET', address: '3, Sriram Nagar N St, Alwarpet 600018' },
          { id: 3, branch_name: 'VELACHERY', address: '11-70, 7th Main Rd, Dhandeeswaram 600042' }
        ];
        setBranches(fallbackData);
        setSelectedBranch(String(fallbackData[0].id));
      }
    } catch (error) {
      const fallbackData = [
        { id: 1, branch_name: 'ANNA NAGAR', address: 'No 109/3, 2nd Ave, Anna Nagar 600040' },
        { id: 2, branch_name: 'ALWARPET', address: '3, Sriram Nagar N St, Alwarpet 600018' },
        { id: 3, branch_name: 'VELACHERY', address: '11-70, 7th Main Rd, Dhandeeswaram 600042' }
      ];
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

  const selectedBranchData = branches.find(b => String(b.id) === String(selectedBranch));
  const filteredBranches = branches.filter(b =>
    b.branch_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-[#F8FAFC] to-[#EEF2FF]">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
          className="flex flex-col items-center gap-4"
        >
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#6D5EF5] to-[#8B7FFF] flex items-center justify-center shadow-lg shadow-[#6D5EF5]/20">
            <span className="text-white font-bold text-lg">A</span>
          </div>
          <div className="loading-spinner" />
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-[#F8FAFC] to-[#EEF2FF] relative overflow-hidden">
      {/* Subtle ambient glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-[#6D5EF5]/3 rounded-full blur-3xl pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="w-full max-w-[500px] px-6 relative"
      >
        {/* Logo */}
        <div className="flex flex-col items-center mb-10">
          <img src="/armoraa-logo.png" alt="ARMORAA" className="h-14 w-auto mb-4" />
          <h1 className="text-2xl font-bold text-[#0F172A] tracking-tight">ARMORAA</h1>
          <p className="text-sm text-[#64748B] mt-1">Enterprise Clinic Management Platform</p>
        </div>

        {/* Description */}
        <p className="text-xs text-[#94A3B8] text-center leading-relaxed mb-8">
          Manage consumables, services, machinery,<br />inventory and branch operations.
        </p>

        {/* Card */}
        <div className="bg-white rounded-[20px] p-8 shadow-lg shadow-[#6D5EF5]/5 border border-[#E2E8F0]/60">
          <h2 className="text-base font-semibold text-[#0F172A] mb-5">Select Workspace</h2>

          {/* Dropdown */}
          <div className="relative mb-5">
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="w-full h-12 px-4 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-sm font-medium text-[#0F172A] flex items-center justify-between hover:border-[#6D5EF5]/30 focus:border-[#6D5EF5] focus:ring-2 focus:ring-[#6D5EF5]/10 transition-all outline-none"
            >
              <div className="flex items-center gap-3">
                <svg className="w-4 h-4 text-[#64748B] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" /><circle cx="12" cy="10" r="3" />
                </svg>
                <span>{selectedBranchData?.branch_name || 'Select workspace'}</span>
              </div>
              <svg className={`w-4 h-4 text-[#64748B] transition-transform flex-shrink-0 ${dropdownOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>

            {dropdownOpen && (
              <motion.div
                initial={{ opacity: 0, y: -6, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.97 }}
                transition={{ duration: 0.15, ease: 'easeOut' }}
                className="absolute top-full left-0 right-0 mt-1.5 bg-white rounded-xl border border-[#E2E8F0] shadow-xl z-20 overflow-hidden"
              >
                <div className="p-2 border-b border-[#E2E8F0]">
                  <input
                    type="text"
                    placeholder="Search branches..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full h-9 px-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg text-sm outline-none focus:border-[#6D5EF5] focus:ring-2 focus:ring-[#6D5EF5]/10 transition-all"
                    autoFocus
                  />
                </div>
                <div className="max-h-48 overflow-y-auto py-1">
                  {filteredBranches.length === 0 ? (
                    <div className="px-4 py-6 text-center text-sm text-[#94A3B8]">No branches found</div>
                  ) : (
                    filteredBranches.map((branch) => (
                      <button
                        key={branch.id}
                        onClick={() => {
                          setSelectedBranch(String(branch.id));
                          setDropdownOpen(false);
                          setSearchTerm('');
                        }}
                        className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${String(branch.id) === selectedBranch ? 'bg-[#EEF2FF] text-[#6D5EF5] font-medium' : 'text-[#475569] hover:bg-[#F8FAFC]'}`}
                      >
                        <svg className="w-4 h-4 flex-shrink-0 text-[#94A3B8]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" /><circle cx="12" cy="10" r="3" />
                        </svg>
                        <div className="text-left flex-1 min-w-0">
                          <div className="truncate">{branch.branch_name}</div>
                          {branch.address && <div className="text-[11px] text-[#94A3B8] truncate">{branch.address}</div>}
                        </div>
                        {String(branch.id) === selectedBranch && (
                          <svg className="w-4 h-4 flex-shrink-0 text-[#6D5EF5]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        )}
                      </button>
                    ))
                  )}
                </div>
              </motion.div>
            )}
          </div>

          {/* Branch status */}
          {selectedBranchData && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="flex items-center gap-2 mb-5 px-1"
            >
              <svg className="w-4 h-4 text-[#10B981]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <span className="text-xs text-[#64748B]">{selectedBranchData.address || 'Workspace ready'}</span>
            </motion.div>
          )}

          {/* CTA */}
          <motion.button
            onClick={handleContinue}
            disabled={!selectedBranch}
            whileHover={selectedBranch ? { boxShadow: '0 8px 24px rgba(109,94,245,0.25)' } : {}}
            whileTap={selectedBranch ? { scale: 0.98 } : {}}
            className="w-full h-12 bg-gradient-to-r from-[#6D5EF5] to-[#8B7FFF] text-white rounded-xl text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-[#6D5EF5]/20 transition-shadow flex items-center justify-center gap-2"
          >
            Go to Workspace
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
            </svg>
          </motion.button>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-center gap-2 mt-8">
          <svg className="w-3 h-3 text-[#94A3B8]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
            <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0110 0v4" />
          </svg>
          <span className="text-[11px] text-[#94A3B8]">Secure Healthcare Management Platform</span>
        </div>
      </motion.div>
    </div>
  );
};

export default Welcome;