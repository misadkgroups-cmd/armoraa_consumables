import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { supabase } from '../config/supabase';

const FeatureItem = ({ text }) => (
  <div className="flex items-center gap-3">
    <div className="w-5 h-5 rounded-full bg-[#6D5EF5]/10 flex items-center justify-center flex-shrink-0">
      <svg className="w-3 h-3 text-[#6D5EF5]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
        <polyline points="20 6 9 17 4 12" />
      </svg>
    </div>
    <span className="text-sm text-[#475569]">{text}</span>
  </div>
);

const FloatingCard = ({ label, value, color, delay }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0, y: [0, -6, 0] }}
    transition={{ delay, duration: 3, repeat: Infinity, ease: 'easeInOut' }}
    className="absolute bg-white/90 backdrop-blur-sm rounded-xl px-4 py-3 shadow-lg shadow-[#6D5EF5]/5 border border-[#E2E8F0]/60"
    style={{ boxShadow: '0 4px 24px rgba(109,94,245,0.08), 0 1px 4px rgba(0,0,0,0.04)' }}
  >
    <div className="text-[10px] font-semibold text-[#64748B] uppercase tracking-wider">{label}</div>
    <div className="flex items-baseline gap-1.5 mt-0.5">
      <span className="text-lg font-bold" style={{ color }}>{value}</span>
      <span className="text-[10px] font-medium text-[#10B981]">↑</span>
    </div>
  </motion.div>
);

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
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#F8FAFC] via-[#EEF2FF] to-[#EDE9FE]">
        <motion.div className="text-center space-y-4"
          initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.4 }}>
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#6D5EF5] to-[#8B7FFF] flex items-center justify-center mx-auto shadow-lg shadow-[#6D5EF5]/20">
            <span className="text-white font-bold text-xl">A</span>
          </div>
          <div className="w-8 h-8 border-2 border-[#6D5EF5]/20 border-t-[#6D5EF5] rounded-full animate-spin mx-auto" />
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex overflow-hidden relative bg-gradient-to-br from-[#F8FAFC] via-[#EEF2FF] to-[#EDE9FE]">
      {/* Abstract Background Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-[#6D5EF5]/5 rounded-full blur-3xl" />
        <div className="absolute top-1/3 -right-20 w-80 h-80 bg-[#8B7FFF]/5 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-1/2 w-96 h-96 bg-[#C7D2FE]/10 rounded-full blur-3xl" />
        {[...Array(12)].map((_, i) => (
          <motion.div key={i}
            className="absolute w-1.5 h-1.5 rounded-full bg-[#6D5EF5]/20"
            style={{
              left: `${10 + (i * 8) % 80}%`,
              top: `${5 + (i * 13) % 85}%`,
            }}
            animate={{
              y: [0, -8, 0],
              opacity: [0.2, 0.5, 0.2],
            }}
            transition={{ duration: 3 + i % 3, repeat: Infinity, delay: i * 0.3, ease: 'easeInOut' }}
          />
        ))}
      </div>

      {/* ===== LEFT SIDE (60%) ===== */}
      <div className="hidden lg:flex w-[60%] flex-col justify-center px-16 relative z-10">
        <motion.div initial={{ opacity: 0, x: -30 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.6, ease: 'easeOut' }}>
          {/* Logo */}
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#6D5EF5] to-[#8B7FFF] flex items-center justify-center shadow-lg shadow-[#6D5EF5]/20">
              <span className="text-white font-bold text-lg">A</span>
            </div>
            <span className="text-lg font-bold text-[#0F172A] tracking-tight">ARMORAA</span>
          </div>

          {/* Heading */}
          <h1 className="text-[56px] font-bold text-[#0F172A] leading-[1.08] tracking-tight mb-4">
            Enterprise Clinic &<br />
            Consumables Platform
          </h1>

          {/* Description */}
          <p className="text-base text-[#64748B] max-w-lg leading-relaxed mb-8">
            Manage inventory, consumables, services, machinery utilization, branch operations,
            reporting, and analytics from one unified platform.
          </p>

          {/* Features */}
          <div className="grid grid-cols-2 gap-y-3 gap-x-8 mb-12">
            <FeatureItem text="Billable Consumables Tracking" />
            <FeatureItem text="Non-Billable Inventory Management" />
            <FeatureItem text="Service Analytics" />
            <FeatureItem text="Machinery Performance Tracking" />
            <FeatureItem text="Multi-Branch Operations" />
            <FeatureItem text="Executive Reporting Dashboard" />
          </div>

          {/* Footer info */}
          <div className="flex items-center gap-6 text-xs text-[#94A3B8]">
            <span>Version 2.0</span>
            <div className="w-1 h-1 rounded-full bg-[#CBD5E1]" />
            <span>© ARMORAA Healthcare Technologies</span>
          </div>
        </motion.div>

        {/* Floating Cards */}
        <div className="relative" style={{ height: 0, overflow: 'visible' }}>
          <div style={{ position: 'absolute', left: '520px', top: '-340px' }}>
            <FloatingCard label="Revenue Growth" value="+18.4%" color="#10B981" delay={0} />
          </div>
          <div style={{ position: 'absolute', left: '420px', top: '-120px' }}>
            <FloatingCard label="Inventory Health" value="98%" color="#6D5EF5" delay={0.5} />
          </div>
          <div style={{ position: 'absolute', left: '540px', top: '-200px' }}>
            <FloatingCard label="Active Branches" value="12" color="#3B82F6" delay={1} />
          </div>
          <div style={{ position: 'absolute', left: '350px', top: '-260px' }}>
            <FloatingCard label="Service Utilization" value="92%" color="#F59E0B" delay={1.5} />
          </div>
        </div>

        {/* Dashboard Preview Mockup */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0, y: [0, -4, 0] }}
          transition={{ duration: 0.8, delay: 0.3, y: { duration: 4, repeat: Infinity, ease: 'easeInOut' } }}
          className="absolute bottom-16 left-16 right-16 bg-white/80 backdrop-blur-md rounded-2xl border border-[#E2E8F0]/60 p-6 shadow-xl shadow-[#6D5EF5]/5"
          style={{ maxWidth: 520 }}
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-red-400" />
              <div className="w-3 h-3 rounded-full bg-amber-400" />
              <div className="w-3 h-3 rounded-full bg-emerald-400" />
            </div>
            <span className="text-[10px] font-semibold text-[#64748B] uppercase tracking-wider">Dashboard Preview</span>
          </div>
          <div className="grid grid-cols-4 gap-2 mb-3">
            {[48, 32, 56, 12400].map((v, i) => (
              <div key={i} className="bg-[#F8FAFC] rounded-lg p-2.5 border border-[#E2E8F0]/50">
                <div className="text-[8px] font-semibold text-[#94A3B8] uppercase tracking-wider mb-1">
                  {['Week', 'Month', 'Total', 'Revenue'][i]}
                </div>
                <div className="text-sm font-bold text-[#0F172A]">
                  {i < 3 ? v : `₹${v.toLocaleString()}`}
                </div>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <div className="flex-1 h-12 bg-gradient-to-r from-[#6D5EF5]/10 to-[#8B7FFF]/10 rounded-lg border border-[#E2E8F0]/50 flex items-center justify-center">
              <div className="flex gap-1 items-end">
                {[35, 55, 42, 78, 62, 90, 70].map((h, i) => (
                  <div key={i} className="w-3 rounded-t" style={{ height: `${h * 0.35}px`, background: 'linear-gradient(180deg, #6D5EF5, #8B7FFF)' }} />
                ))}
              </div>
            </div>
            <div className="flex-1 h-12 bg-gradient-to-r from-[#10B981]/10 to-[#6EE7B7]/10 rounded-lg border border-[#E2E8F0]/50 flex items-center justify-center">
              <svg className="w-8 h-4 text-[#10B981]" viewBox="0 0 24 8" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M0 7 Q4 3 8 5 Q12 1 16 4 Q20 2 24 3" />
              </svg>
            </div>
          </div>
        </motion.div>
      </div>

      {/* ===== RIGHT SIDE (40%) ===== */}
      <div className="w-full lg:w-[40%] min-h-screen flex items-center justify-center p-6 relative z-10">
        <motion.div
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, delay: 0.15, ease: 'easeOut' }}
          className="w-full max-w-md bg-white/70 backdrop-blur-xl rounded-3xl border border-white/50 p-10"
          style={{
            boxShadow: '0 8px 32px rgba(109,94,245,0.06), 0 2px 8px rgba(0,0,0,0.03)',
            backdropFilter: 'blur(20px)',
          }}
        >
          {/* Logo */}
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#6D5EF5] to-[#8B7FFF] flex items-center justify-center shadow-lg shadow-[#6D5EF5]/20">
              <span className="text-white font-bold text-lg">A</span>
            </div>
            <span className="text-lg font-bold text-[#0F172A]">ARMORAA</span>
          </div>

          {/* Welcome */}
          <h2 className="text-2xl font-bold text-[#0F172A] mb-1">Welcome Back</h2>
          <p className="text-sm text-[#64748B] mb-8">Select your workspace to continue</p>

          {/* Branch Selector */}
          <div className="space-y-4 mb-8">
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-[#64748B]">Workspace</label>
            
            <div className="relative">
              <button
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className="w-full h-12 px-4 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-sm font-medium text-[#0F172A] flex items-center justify-between hover:border-[#6D5EF5]/30 focus:border-[#6D5EF5] focus:ring-2 focus:ring-[#6D5EF5]/10 transition-all outline-none"
              >
                <div className="flex items-center gap-3">
                  <svg className="w-4 h-4 text-[#64748B]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" /><circle cx="12" cy="10" r="3" />
                  </svg>
                  <span>{selectedBranchData?.branch_name || 'Select Branch'}</span>
                </div>
                <svg className={`w-4 h-4 text-[#64748B] transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>

              {dropdownOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -8, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl border border-[#E2E8F0] shadow-xl z-20 overflow-hidden"
                  style={{ boxShadow: '0 8px 32px rgba(0,0,0,0.08)' }}
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
                  <div className="max-h-48 overflow-y-auto">
                    {filteredBranches.map((branch) => (
                      <button
                        key={branch.id}
                        onClick={() => {
                          setSelectedBranch(String(branch.id));
                          setDropdownOpen(false);
                          setSearchTerm('');
                        }}
                        className={`w-full flex items-center gap-3 px-4 py-3 text-sm transition-colors ${String(branch.id) === selectedBranch ? 'bg-[#EEF2FF] text-[#6D5EF5] font-semibold' : 'text-[#475569] hover:bg-[#F8FAFC]'}`}
                      >
                        <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" /><circle cx="12" cy="10" r="3" />
                        </svg>
                        <div className="text-left">
                          <div>{branch.branch_name}</div>
                          {branch.address && <div className="text-[10px] text-[#94A3B8]">{branch.address}</div>}
                        </div>
                        {String(branch.id) === selectedBranch && (
                          <svg className="w-4 h-4 ml-auto text-[#6D5EF5]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        )}
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </div>

            {/* Branch Info */}
            {selectedBranchData && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="space-y-2 px-1">
                <div className="flex items-center gap-2 text-xs text-[#64748B]">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
                  {selectedBranchData.address || 'Active Clinic Branch'}
                </div>
                <div className="flex items-center gap-2 text-xs text-[#64748B]">
                  <svg className="w-3.5 h-3.5 text-[#10B981]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><polyline points="20 6 9 17 4 12"/></svg>
                  Inventory Synced
                </div>
                <div className="flex items-center gap-2 text-xs text-[#64748B]">
                  <svg className="w-3.5 h-3.5 text-[#6D5EF5]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/></svg>
                  Analytics Enabled
                </div>
              </motion.div>
            )}
          </div>

          {/* CTA Button */}
          <motion.button
            onClick={handleContinue}
            disabled={!selectedBranch}
            whileHover={{ scale: 1.01, boxShadow: '0 8px 32px rgba(109,94,245,0.25)' }}
            whileTap={{ scale: 0.98 }}
            className="w-full h-13 bg-gradient-to-r from-[#6D5EF5] to-[#8B7FFF] text-white rounded-xl text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-[#6D5EF5]/20 transition-shadow mb-4"
          >
            Go to Workspace
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
            </svg>
          </motion.button>

          {/* Secure Badge */}
          <div className="flex items-center justify-center gap-2 text-[10px] text-[#94A3B8] mb-8">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
            Secure Healthcare Management Platform
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between pt-6 border-t border-[#E2E8F0]/60">
            <span className="text-[10px] text-[#94A3B8]">Version 2.0</span>
            <span className="text-[10px] text-[#94A3B8]">© ARMORAA Healthcare</span>
          </div>
        </motion.div>
      </div>

      {/* Mobile View (only shows the access card) */}
      <div className="lg:hidden w-full min-h-screen flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full bg-white/80 backdrop-blur-xl rounded-2xl border border-white/50 p-8"
          style={{ boxShadow: '0 8px 32px rgba(109,94,245,0.06)' }}
        >
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#6D5EF5] to-[#8B7FFF] flex items-center justify-center">
              <span className="text-white font-bold text-lg">A</span>
            </div>
            <span className="text-lg font-bold text-[#0F172A]">ARMORAA</span>
          </div>
          <h2 className="text-xl font-bold text-[#0F172A] mb-1">Welcome Back</h2>
          <p className="text-sm text-[#64748B] mb-6">Select your workspace to continue</p>

          <select
            value={selectedBranch}
            onChange={(e) => setSelectedBranch(e.target.value)}
            className="w-full h-12 px-4 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-sm font-medium text-[#0F172A] outline-none focus:border-[#6D5EF5] mb-4"
          >
            <option value="">Select Branch</option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>{branch.branch_name}</option>
            ))}
          </select>

          <button
            onClick={handleContinue}
            disabled={!selectedBranch}
            className="w-full h-12 bg-gradient-to-r from-[#6D5EF5] to-[#8B7FFF] text-white rounded-xl font-semibold disabled:opacity-40 shadow-lg shadow-[#6D5EF5]/20"
          >
            Go to Workspace
          </button>
        </motion.div>
      </div>
    </div>
  );
};

export default Welcome;