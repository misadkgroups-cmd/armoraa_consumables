import { useState, useEffect } from 'react';
import { supabase } from '../config/supabase';
import { useBranch } from '../context/BranchContext';

const NonBillableConsumables = () => {
  const { branchId } = useBranch();
  
  const [activeTab, setActiveTab] = useState('incomplete');
  const [bulkItems, setBulkItems] = useState([]);
  const [productNames, setProductNames] = useState([]);
  const [formData, setFormData] = useState({
    productName: '',
    batchId: '',
    openDate: new Date().toISOString().slice(0, 10)
  });
  const [loading, setLoading] = useState(false);
  const [usageCounts, setUsageCounts] = useState({});
  const [editingItem, setEditingItem] = useState(null);
  const [editFormData, setEditFormData] = useState({ productName: '', batchId: '', openDate: '' });

  useEffect(() => {
    if (branchId) {
      fetchBulkItems();
      fetchUsageCounts();
      fetchProductNames();
    }
  }, [branchId]);

  const fetchProductNames = async () => {
    try {
      const { data, error } = await supabase
        .from('bulk_consumables_registry')
        .select('product_name')
        .eq('branch_id', branchId);
      if (!error && data) {
        const uniqueNames = [...new Set(data.map(item => item.product_name))];
        setProductNames(uniqueNames);
      }
    } catch (error) { console.error('Error fetching product names:', error); }
  };

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

  const fetchUsageCounts = async () => {
    try {
      const { data, error } = await supabase
        .from('billable_report')
        .select('consumable_1_batch_id, consumable_2_batch_id, consumable_3_batch_id, consumable_4_batch_id, consumable_5_batch_id, consumable_6_batch_id, consumable_7_batch_id, consumable_8_batch_id, consumable_9_batch_id, consumable_10_batch_id, consumable_11_batch_id, consumable_12_batch_id, consumable_13_batch_id, consumable_14_batch_id');
      if (!error && data) {
        const counts = {};
        data.forEach(row => {
          for (let i = 1; i <= 14; i++) {
            const batchId = row[`consumable_${i}_batch_id`];
            if (batchId) counts[batchId] = (counts[batchId] || 0) + 1;
          }
        });
        setUsageCounts(counts);
      }
    } catch (error) { console.error('Error fetching usage counts:', error); }
  };

  const getUsageString = (item) => {
    const count = usageCounts[item.batch_id] || 0;
    return `used by ${count} Patient${count !== 1 ? 's' : ''}`;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.productName || !formData.batchId) return;
    setLoading(true);
    try {
      const { error } = await supabase
        .from('bulk_consumables_registry')
        .insert({ branch_id: branchId, product_name: formData.productName, batch_id: formData.batchId, open_date: new Date(formData.openDate).toISOString(), status: 'Active' });
      if (!error) {
        setFormData({ productName: '', batchId: '', openDate: new Date().toISOString().slice(0, 10) });
        fetchBulkItems();
        fetchUsageCounts();
        fetchProductNames();
      }
    } catch (error) { console.error('Error registering bulk item:', error); }
    setLoading(false);
  };

  const openEditItem = (item) => {
    setEditingItem(item);
    setEditFormData({ productName: item.product_name, batchId: item.batch_id, openDate: new Date(item.open_date).toISOString().slice(0, 10) });
  };

  const updateItem = async () => {
    if (!editingItem) return;
    setLoading(true);
    try {
      const { error } = await supabase
        .from('bulk_consumables_registry')
        .update({ product_name: editFormData.productName, batch_id: editFormData.batchId, open_date: new Date(editFormData.openDate).toISOString() })
        .eq('id', editingItem.id);
      if (!error) { setEditingItem(null); fetchBulkItems(); fetchUsageCounts(); fetchProductNames(); }
    } catch (error) { console.error('Error updating item:', error); }
    setLoading(false);
  };

  const closeItem = async (item) => {
    if (!window.confirm(`Mark "${item.product_name}" as completed?`)) return;
    try {
      const { error } = await supabase
        .from('bulk_consumables_registry')
        .update({ closing_date: new Date().toISOString(), status: 'Depleted' })
        .eq('id', item.id);
      if (!error) { fetchBulkItems(); fetchUsageCounts(); }
    } catch (error) { console.error('Error closing item:', error); }
  };

  const reopenItem = async (item) => {
    if (!window.confirm(`Reopen "${item.product_name}" as active?`)) return;
    try {
      const { error } = await supabase
        .from('bulk_consumables_registry')
        .update({ closing_date: null, status: 'Active' })
        .eq('id', item.id);
      if (!error) { fetchBulkItems(); fetchUsageCounts(); }
    } catch (error) { console.error('Error reopening item:', error); }
  };

  const deleteItem = async (item) => {
    if (!window.confirm(`Delete "${item.product_name}" (${item.batch_id})?`)) return;
    try {
      const { error } = await supabase.from('bulk_consumables_registry').delete().eq('id', item.id);
      if (!error) { fetchBulkItems(); fetchUsageCounts(); fetchProductNames(); }
    } catch (error) { console.error('Error deleting item:', error); }
  };

  const incompleteItems = bulkItems.filter(item => item.status === 'Active');
  const completedItems = bulkItems.filter(item => item.status === 'Depleted');

  return (
    <div className="animate-fade-in">
      {/* Edit Modal */}
      {editingItem && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h3>Edit Bulk Item</h3>
              <button onClick={() => setEditingItem(null)} className="btn btn-ghost btn-icon">×</button>
            </div>
            <div className="modal-body space-y-4">
              <div>
                <label className="text-xs font-semibold text-muted block mb-1.5">Product Name</label>
                <input type="text" value={editFormData.productName} onChange={(e) => setEditFormData({ ...editFormData, productName: e.target.value })} className="form-input" />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted block mb-1.5">Batch ID</label>
                <input type="text" value={editFormData.batchId} onChange={(e) => setEditFormData({ ...editFormData, batchId: e.target.value })} className="form-input" />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted block mb-1.5">Open Date</label>
                <input type="date" value={editFormData.openDate} onChange={(e) => setEditFormData({ ...editFormData, openDate: e.target.value })} className="form-input" />
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => setEditingItem(null)} className="btn btn-secondary">Cancel</button>
              <button onClick={updateItem} disabled={loading} className="btn btn-primary">{loading ? 'Updating...' : 'Update'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Page Header */}
      <div className="page-header">
        <div className="page-header-left">
          <h1>Non-Billable Consumables</h1>
          <p>Track bulk inventory and non-billable consumable usage</p>
        </div>
      </div>

      {/* Registration Form */}
      <div className="section-card">
        <div className="section-card-header">
          <div>
            <div className="section-title">Register New Bulk Item</div>
            <div className="section-subtitle">Add a new bulk consumable to the registry</div>
          </div>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="text-xs font-semibold text-muted block mb-1.5">Product Name</label>
              <select value={formData.productName} onChange={(e) => setFormData({ ...formData, productName: e.target.value })} className="form-input" required>
                <option value="">Select Product</option>
                {productNames.map((name, idx) => <option key={idx} value={name}>{name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-muted block mb-1.5">Batch ID</label>
              <input type="text" value={formData.batchId} onChange={(e) => setFormData({ ...formData, batchId: e.target.value })} className="form-input" placeholder="Enter batch ID" required />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted block mb-1.5">Open Date</label>
              <input type="date" value={formData.openDate} onChange={(e) => setFormData({ ...formData, openDate: e.target.value })} className="form-input" required />
            </div>
            <div className="flex items-end">
              <button type="submit" disabled={loading} className="btn btn-primary w-full">{loading ? 'Saving...' : 'Save'}</button>
            </div>
          </div>
        </form>
      </div>

      {/* Tabs + Table */}
      <div className="table-container">
        <div className="flex border-b border-[var(--color-line)]">
          <button onClick={() => setActiveTab('incomplete')} className={`flex-1 px-6 py-3 text-sm font-medium transition-all relative ${activeTab === 'incomplete' ? 'text-[var(--color-primary)] border-b-2 border-[var(--color-primary)]' : 'text-muted hover:text-text'}`}>
            Incomplete ({incompleteItems.length})
          </button>
          <button onClick={() => setActiveTab('completed')} className={`flex-1 px-6 py-3 text-sm font-medium transition-all relative ${activeTab === 'completed' ? 'text-[var(--color-primary)] border-b-2 border-[var(--color-primary)]' : 'text-muted hover:text-text'}`}>
            Completed ({completedItems.length})
          </button>
        </div>
        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>Product Name</th>
                <th>Batch ID</th>
                <th>Open Date</th>
                <th>Usage</th>
                <th>{activeTab === 'incomplete' ? 'Actions' : 'Closing Date'}</th>
              </tr>
            </thead>
            <tbody>
              {(activeTab === 'incomplete' ? incompleteItems : completedItems).map((item, index) => (
                <tr key={item.id}>
                  <td className="font-medium">{item.product_name}</td>
                  <td><span className="tag tag-neutral">{item.batch_id}</span></td>
                  <td>{new Date(item.open_date).toLocaleDateString('en-GB')}</td>
                  <td><span className="font-semibold" style={{ color: 'var(--color-primary)' }}>{getUsageString(item)}</span></td>
                  {activeTab === 'incomplete' ? (
                    <td>
                      <div className="flex gap-2">
                        <button onClick={() => openEditItem(item)} className="btn btn-ghost btn-sm">Edit</button>
                        <button onClick={() => closeItem(item)} className="btn btn-primary btn-sm">Mark Complete</button>
                        <button onClick={() => deleteItem(item)} className="btn btn-sm" style={{ background: 'transparent', color: 'var(--color-danger)' }}>Delete</button>
                      </div>
                    </td>
                  ) : (
                    <td>
                      <div className="flex items-center gap-2">
                        <span>{item.closing_date ? new Date(item.closing_date).toLocaleDateString('en-GB') : '-'}</span>
                        <button onClick={() => reopenItem(item)} className="btn btn-ghost btn-sm" style={{ color: 'var(--color-success)' }}>Reopen</button>
                        <button onClick={() => deleteItem(item)} className="btn btn-ghost btn-sm" style={{ color: 'var(--color-danger)' }}>Delete</button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
              {(activeTab === 'incomplete' ? incompleteItems : completedItems).length === 0 && (
                <tr>
                  <td colSpan={5} className="empty-state" style={{ padding: '32px' }}>
                    {activeTab === 'incomplete' ? 'No incomplete items. All items have been completed.' : 'No completed items yet.'}
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