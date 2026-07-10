import { useState, useEffect } from 'react';
import { supabase } from '../config/supabase';
import { useBranch } from '../context/BranchContext';

const NonBillableConsumables = () => {
  const { branchId } = useBranch();
  
  const [activeTab, setActiveTab] = useState('incomplete');
  const [bulkItems, setBulkItems] = useState([]);
  const [formData, setFormData] = useState({
    productName: '',
    batchId: '',
    openDate: new Date().toISOString().slice(0, 10)
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (branchId) fetchBulkItems();
  }, [branchId]);

  const fetchBulkItems = async () => {
    try {
      const { data, error } = await supabase
        .from('bulk_consumables_registry')
        .select('*')
        .eq('branch_id', branchId)
        .order('open_date', { ascending: false });
      if (!error) setBulkItems(data || []);
    } catch (error) {
      console.error('Error fetching bulk items:', error);
      setBulkItems([]);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.productName || !formData.batchId) return;
    
    setLoading(true);
    try {
      const { error } = await supabase
        .from('bulk_consumables_registry')
        .insert({
          branch_id: branchId,
          product_name: formData.productName,
          batch_id: formData.batchId,
          open_date: new Date(formData.openDate).toISOString(),
          status: 'Active'
        });

      if (!error) {
        setFormData({ 
          productName: '', 
          batchId: '', 
          openDate: new Date().toISOString().slice(0, 10)
        });
        fetchBulkItems();
      }
    } catch (error) {
      console.error('Error registering bulk item:', error);
    }
    setLoading(false);
  };

  const closeItem = async (item) => {
    if (!window.confirm(`Mark "${item.product_name}" as completed?`)) return;
    
    try {
      const { error } = await supabase
        .from('bulk_consumables_registry')
        .update({
          closing_date: new Date().toISOString(),
          status: 'Depleted'
        })
        .eq('id', item.id);

      if (!error) fetchBulkItems();
    } catch (error) {
      console.error('Error closing item:', error);
    }
  };

  const getUsageString = (item) => {
    return `used by 0 Patients`;
  };

  const incompleteItems = bulkItems.filter(item => item.status === 'Active');
  const completedItems = bulkItems.filter(item => item.status === 'Depleted');

  return (
    <div className="space-y-6">
      {/* Registration Form */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">Register New Bulk Item</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">Product Name</label>
              <input
                type="text"
                value={formData.productName}
                onChange={(e) => setFormData({ ...formData, productName: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-sky-500 focus:bg-white transition-all text-sm"
                placeholder="Enter product name"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">Batch ID</label>
              <input
                type="text"
                value={formData.batchId}
                onChange={(e) => setFormData({ ...formData, batchId: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-sky-500 focus:bg-white transition-all text-sm"
                placeholder="Enter batch ID"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">Open Date</label>
              <input
                type="date"
                value={formData.openDate}
                onChange={(e) => setFormData({ ...formData, openDate: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-sky-500 focus:bg-white transition-all text-sm"
                required
              />
            </div>

            <div className="flex items-end">
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-sky-500 text-white px-4 py-2 rounded-lg hover:bg-sky-600 transition-all text-sm font-semibold shadow-sm disabled:bg-slate-400 disabled:cursor-not-allowed"
              >
                {loading ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* Tab Separator */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="flex border-b border-slate-200">
          <button
            onClick={() => setActiveTab('incomplete')}
            className={`flex-1 px-6 py-3 text-sm font-medium transition-all duration-200 relative ${
              activeTab === 'incomplete'
                ? 'text-sky-600 border-b-2 border-sky-600 bg-sky-50/30'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            Incomplete ({incompleteItems.length})
          </button>
          <button
            onClick={() => setActiveTab('completed')}
            className={`flex-1 px-6 py-3 text-sm font-medium transition-all duration-200 relative ${
              activeTab === 'completed'
                ? 'text-sky-600 border-b-2 border-sky-600 bg-sky-50/30'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            Completed ({completedItems.length})
          </button>
        </div>

        {/* Table Content */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 border-b-2 border-slate-200">
                <th className="text-left px-6 py-3 text-xs font-bold uppercase tracking-wider text-slate-700">Product Name</th>
                <th className="text-left px-6 py-3 text-xs font-bold uppercase tracking-wider text-slate-700">Batch ID</th>
                <th className="text-left px-6 py-3 text-xs font-bold uppercase tracking-wider text-slate-700">Open Date</th>
                <th className="text-left px-6 py-3 text-xs font-bold uppercase tracking-wider text-slate-700">Usage</th>
                {activeTab === 'incomplete' && (
                  <th className="text-left px-6 py-3 text-xs font-bold uppercase tracking-wider text-slate-700">Action</th>
                )}
                {activeTab === 'completed' && (
                  <th className="text-left px-6 py-3 text-xs font-bold uppercase tracking-wider text-slate-700">Closing Date</th>
                )}
              </tr>
            </thead>
            <tbody>
              {(activeTab === 'incomplete' ? incompleteItems : completedItems).map((item, index) => (
                <tr key={item.id} className={`border-b border-slate-100 hover:bg-sky-50 transition-all ${index % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}>
                  <td className="px-6 py-4 text-slate-800 font-medium">{item.product_name}</td>
                  <td className="px-6 py-4">
                    <span className="bg-slate-100 px-3 py-1 rounded-md text-sm font-mono text-slate-700">
                      {item.batch_id}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-slate-600 text-sm">
                    {new Date(item.open_date).toLocaleDateString('en-GB')}
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm font-semibold text-sky-600">
                      {getUsageString(item)}
                    </span>
                  </td>
                  {activeTab === 'incomplete' && (
                    <td className="px-6 py-4">
                      <button
                        onClick={() => closeItem(item)}
                        className="bg-sky-500 text-white px-4 py-2 rounded-lg hover:bg-sky-600 transition-all text-sm font-semibold shadow-sm"
                      >
                        Mark Complete
                      </button>
                    </td>
                  )}
                  {activeTab === 'completed' && (
                    <td className="px-6 py-4 text-slate-600 text-sm">
                      {item.closing_date ? new Date(item.closing_date).toLocaleDateString('en-GB') : '-'}
                    </td>
                  )}
                </tr>
              ))}
              {(activeTab === 'incomplete' ? incompleteItems : completedItems).length === 0 && (
                <tr>
                  <td colSpan={activeTab === 'incomplete' ? 5 : 5} className="px-4 py-8 text-center text-slate-500 text-sm">
                    {activeTab === 'incomplete' 
                      ? 'No incomplete items. All items have been completed.' 
                      : 'No completed items yet.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default NonBillableConsumables;