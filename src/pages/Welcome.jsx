import { useState, useEffect } from 'react';
import { supabase } from '../config/supabase';

const Welcome = ({ onBranchSelect }) => {
  const [branches, setBranches] = useState([]);
  const [selectedBranch, setSelectedBranch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchBranches();
  }, []);

  const fetchBranches = async () => {
    try {
      const { data, error } = await supabase
        .from('branches')
        .select('*');

      console.log('Supabase connected:', !!supabase);
      console.log('Branches data:', data);
      console.log('Branches error:', error);

      if (!error && data && data.length > 0) {
        const formattedBranches = data.map(branch => ({
          id: branch.id, // Keep this as whatever type Supabase returns (usually number)
          branch_name: branch.branch_name || branch.name || `Branch ${branch.id}`,
          address: branch.address || ''
        }));
        setBranches(formattedBranches);
        // Store as string to match standard HTML select element behavior
        setSelectedBranch(String(formattedBranches[0].id));
      } else {
        console.warn('No branches found, using fallback');
        const fallbackData = [
          { id: 1, branch_name: 'ANNA NAGAR', address: 'No 109/3, 2nd Ave, Anna Nagar 600040' },
          { id: 2, branch_name: 'ALWARPET', address: '3, Sriram Nagar N St, Alwarpet 600018' },
          { id: 3, branch_name: 'VELACHERY', address: '11-70, 7th Main Rd, Dhandeeswaram 600042' }
        ];
        setBranches(fallbackData);
        setSelectedBranch(String(fallbackData[0].id));
      }
    } catch (error) {
      console.error('Exception:', error);
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
      // Coerce b.id to a string to match the state string type perfectly
      const branch = branches.find(b => String(b.id) === String(selectedBranch));
      
      // Pass the correctly typed ID back up (converted back to a number if your parent app needs it)
      const numericId = Number(selectedBranch);
      onBranchSelect(numericId, branch?.branch_name);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="text-center space-y-4">
          <img src="/armoraa-logo.png" alt="ARMORAA" className="h-20 w-auto mx-auto animate-pulse" />
          <h1 className="text-2xl font-bold text-slate-900">Loading...</h1>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50/30 to-slate-100 p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-8 space-y-6 animate-scale-in">
          {/* Logo and Title */}
          <div className="text-center space-y-3">
            <img src="/armoraa-logo.png" alt="ARMORAA" className="h-16 w-auto mx-auto" />
            <h1 className="text-3xl font-bold text-slate-900">Welcome to ARMORAA</h1>
            <p className="text-sm text-slate-500">Clinic Management System</p>
          </div>

          {/* Branch Selection */}
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">
                Select Your Branch
              </label>
              <select
                value={selectedBranch}
                onChange={(e) => setSelectedBranch(e.target.value)}
                className="w-full h-12 px-4 bg-white border border-slate-300 rounded-xl focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 focus:outline-none transition-all text-sm font-medium text-slate-900"
              >
                <option value="">-- Select Branch --</option>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.branch_name}
                  </option>
                ))}
              </select>
              {branches.length === 0 && !loading && (
                <div className="text-xs text-red-600 mt-2 space-y-1">
                  <p>No branches found. Check browser console (F12) for errors.</p>
                  <p className="text-slate-500">Make sure Supabase URL and Anon Key are correct in .env file</p>
                </div>
              )}
            </div>

            {/* Continue Button */}
            <button
              onClick={handleContinue}
              disabled={!selectedBranch}
              className="w-full bg-sky-500 text-white py-3 rounded-xl hover:bg-sky-600 transition-all duration-200 text-sm font-semibold shadow-lg shadow-sky-500/30 disabled:bg-slate-300 disabled:cursor-not-allowed disabled:shadow-none"
            >
              Continue to Dashboard
            </button>
          </div>

          {/* Footer */}
          <div className="text-center pt-4 border-t border-slate-100">
            <p className="text-xs text-slate-400">© 2024 ARMORAA Clinic Management</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Welcome;