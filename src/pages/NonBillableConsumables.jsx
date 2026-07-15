import { useState, useEffect } from 'react';
import { supabase } from '../config/supabase';
import { useBranch } from '../context/BranchContext';
import { Search, Plus, Edit2, Trash2, Archive, X } from 'lucide-react';
import SearchableDropdown from '../components/SearchableDropdown';

const NonBillableConsumables = () => {
  const { branchId } = useBranch();
  const [activeTab, setActiveTab] = useState('incomplete');
  const [registry, setRegistry] = useState([]);
  const [products, setProducts] = useState([]);
  const [usageCounts, setUsageCounts] = useState({});
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  const [form, setForm] = useState({ product_id: '', batch_id: '', opening_date: new Date().toISOString().slice(0,10) });
  const [editItem, setEditItem] = useState(null);
  const [editForm, setEditForm] = useState({ batch_id: '', opening_date: '', closing_date: '', status: 'active' });

  useEffect(() => { if (branchId) { fetchRegistry(); fetchProducts(); fetchUsage(); } }, [branchId]);

  const fetchProducts = async () => {
    try {
      // Only fetch Active Non-Billable consumables
      const { data } = await supabase
        .from('master_non_billable_consumables')
        .select('id, product_name, cost')
        .eq('status', 'Active')
        .order('product_name');
      if (data) setProducts(data || []);
    } catch (e) { console.error(e); }
  };
  
  const fetchRegistry = async () => {
    try {
      const { data } = await supabase
        .from('non_billable_consumable_registry')
        .select('*, master_non_billable_consumables(product_name)')
        .eq('branch_id', branchId)
        .order('opening_date', { ascending: false });
      const mapped = (data || []).map(r => ({ ...r, product_name: r.master_non_billable_consumables?.product_name || '-' }));
      setRegistry(mapped);
    } catch (e) { console.error(e); }
  };
  
  const fetchUsage = async () => {
    try {
      const { data } = await supabase.from('billable_report').select('consumable_1_batch_id,consumable_2_batch_id,consumable_3_batch_id,consumable_4_batch_id,consumable_5_batch_id,consumable_6_batch_id,consumable_7_batch_id,consumable_8_batch_id,consumable_9_batch_id,consumable_10_batch_id,consumable_11_batch_id,consumable_12_batch_id,consumable_13_batch_id,consumable_14_batch_id');
      const counts = {};
      data?.forEach(row => { for (let i = 1; i <= 14; i++) { const b = row[`consumable_${i}_batch_id`]; if (b) counts[b] = (counts[b] || 0) + 1; } });
      setUsageCounts(counts);
    } catch (e) { console.error(e); }
  };

  const saveRegistry = async () => {
    if (!form.product_id || !form.batch_id) return;
    setLoading(true);
    try {
      // Check for duplicate batch
      const { data: existing } = await supabase
        .from('non_billable_consumable_registry')
        .select('id')
        .eq('product_id', Number(form.product_id))
        .eq('batch_id', form.batch_id.trim());
      if (existing && existing.length > 0) {
        setLoading(false);
        alert('Batch ID already exists for this product.');
        return;
      }
      const { error } = await supabase.from('non_billable_consumable_registry').insert({ branch_id: branchId, product_id: Number(form.product_id), batch_id: form.batch_id.trim(), opening_date: form.opening_date, status: 'active' });
      if (error) throw error;
      setForm({ product_id: '', batch_id: '', opening_date: new Date().toISOString().slice(0,10) });
      fetchRegistry();
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const updateRegistry = async () => {
    if (!editItem || !editForm.batch_id) return;
    setLoading(true);
    try {
      const payload = { batch_id: editForm.batch_id, opening_date: editForm.opening_date, closing_date: editForm.closing_date || null, status: editForm.status };
      const { error } = await supabase.from('non_billable_consumable_registry').update(payload).eq('id', editItem.id);
      if (error) throw error;
      setEditItem(null); fetchRegistry();
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const markComplete = async (item) => {
    if (!window.confirm('Mark this batch as completed?')) return;
    try {
      const { error } = await supabase.from('non_billable_consumable_registry').update({ status: 'completed', closing_date: new Date().toISOString().slice(0,10) }).eq('id', item.id);
      if (error) throw error;
      fetchRegistry();
    } catch (e) { console.error(e); }
  };

  const reopenItem = async (item) => {
    if (!window.confirm('Reopen this batch as active?')) return;
    try {
      const { error } = await supabase.from('non_billable_consumable_registry').update({ status: 'active', closing_date: null }).eq('id', item.id);
      if (error) throw error;
      fetchRegistry();
    } catch (e) { console.error(e); }
  };

  const deleteItem = async (id) => {
    if (!window.confirm('Delete this batch record?')) return;
    try { const { error } = await supabase.from('non_billable_consumable_registry').delete().eq('id', id); if (!error) fetchRegistry(); }
    catch (e) { console.error(e); }
  };

  const usageText = (batchId) => `Used in ${usageCounts[batchId] || 0} Services`;
  const filtered = registry.filter(r => ((r.product_name || '') + ' ' + (r.batch_id || '')).toLowerCase().includes(search.toLowerCase()));
  const incomplete = filtered.filter(i => i.status !== 'completed');
  const completed = filtered.filter(i => i.status === 'completed');

  // Get batches for selected product - ALL active batches
  const getBatchesForProduct = (productId) => {
    if (!productId) return [];
    const productBatches = registry.filter(r => 
      r.product_id === Number(productId) && r.status === 'active'
    );
    return productBatches.map(b => ({ value: b.batch_id, label: b.batch_id }));
  };

  const selectedProductBatches = form.product_id ? getBatchesForProduct(form.product_id) : [];

  return (
    <div className="page-wrapper animate-fade-in">
      <div className="page-header">
        <div className="page-header-left">
          <h1>Non-Billable Consumables</h1>
          <p>Track bulk inventory and non-billable consumable usage</p>
        </div>
      </div>

      <div className="card">
        <div className="section-header">
          <h2>Register New Batch</h2>
          <p>Add a new non-billable batch to registry</p>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); saveRegistry(); }} className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted block">Product</label>
            <SearchableDropdown
              value={form.product_id}
              onChange={(val) => { setForm({ ...form, product_id: val, batch_id: '' }); }}
              options={products.map(p => ({value: String(p.id), label: p.product_name}))}
              placeholder="Select product"
              displayKey="label"
              valueKey="value"
              required
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted block">Batch ID *</label>
            <input
              type="text"
              value={form.batch_id}
              onChange={(e) => setForm({ ...form, batch_id: e.target.value })}
              placeholder="Enter Batch ID"
              className="form-input"
              required
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted block">Opening Date</label>
            <input type="date" value={form.opening_date} onChange={(e) => setForm({ ...form, opening_date: e.target.value })} className="form-input" required />
          </div>
          <div className="flex items-end">
            <button type="submit" disabled={loading} className="btn btn-primary w-full" style={{ height: '44px' }}>{loading ? 'Saving...' : 'Save Batch'}</button>
          </div>
        </form>
      </div>

      <div className="table-container">
        <div className="flex items-center gap-3 mb-4">
          <div className="search-box"><Search size={15} /><input placeholder="Search batches..." value={search} onChange={(e) => setSearch(e.target.value)} /></div>
          <div className="flex border-b border-[var(--color-line)] flex-1">
            <button onClick={() => setActiveTab('incomplete')} className={`flex-1 px-6 py-3.5 text-sm font-medium transition-all relative ${activeTab === 'incomplete' ? 'text-[var(--color-primary)] border-b-2 border-[var(--color-primary)]' : 'text-muted hover:text-text'}`}>Incomplete ({incomplete.length})</button>
            <button onClick={() => setActiveTab('completed')} className={`flex-1 px-6 py-3.5 text-sm font-medium transition-all relative ${activeTab === 'completed' ? 'text-[var(--color-primary)] border-b-2 border-[var(--color-primary)]' : 'text-muted hover:text-text'}`}>Completed ({completed.length})</button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="rpt-table">
            <thead><tr><th className="rpt-c-service">Product</th><th className="rpt-c-units">Batch</th><th className="rpt-c-date">Open Date</th><th className="rpt-c-service">Usage</th><th className="rpt-c-cost">Status</th><th className="rpt-c-actions sticky" style={{ background: 'var(--color-tint-2)' }}>Actions</th></tr></thead>
            <tbody>
              {(activeTab === 'incomplete' ? incomplete : completed).map(item => (
                <tr key={item.id}>
                  <td className="rpt-wrap">{item.product_name}</td>
                  <td className="rpt-nowrap" style={{ textAlign: 'center' }}>{item.batch_id || '-'}</td>
                  <td className="rpt-nowrap"><span className="rpt-date">{item.opening_date ? new Date(item.opening_date).toLocaleDateString('en-GB') : '-'}</span></td>
                  <td className="rpt-wrap" style={{ color: 'var(--color-primary)' }}>{usageText(item.batch_id)}</td>
                  <td className="rpt-nowrap"><span className={`sbadge ${item.status === 'completed' ? 'inactive' : 'active'}`}><span className={`status-dot ${item.status === 'completed' ? 'orange' : 'green'}`} /> {item.status || 'active'}</span></td>
                  <td className="rpt-actions-cell">
                    <div className="flex items-center justify-center gap-1.5">
                      {activeTab === 'incomplete' && <button onClick={() => markComplete(item)} className="rpt-act-icon" title="Mark Complete" style={{ color: 'var(--color-warning)' }}><Archive size={16} /></button>}
                      {activeTab === 'completed' && <button onClick={() => reopenItem(item)} className="rpt-act-icon" title="Reopen" style={{ color: 'var(--color-success)' }}><Archive size={16} /></button>}
                      <button className="rpt-act-icon edit" title="Edit" onClick={() => { setEditItem(item); setEditForm({ batch_id: item.batch_id, opening_date: item.opening_date || '', closing_date: item.closing_date || '', status: item.status }); }}><Edit2 size={16} /></button>
                      <button className="rpt-act-icon del" title="Delete" onClick={() => deleteItem(item.id)}><Trash2 size={16} /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {(activeTab === 'incomplete' ? incomplete : completed).length === 0 && (<tr><td colSpan={6} className="text-center text-muted" style={{ padding: 32 }}>No {activeTab} batches found. Add a new batch above.</td></tr>)}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Modal */}
      {editItem && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 520 }}>
            <div className="modal-header"><h3>Edit Batch</h3><button onClick={() => setEditItem(null)} className="btn btn-ghost btn-icon">×</button></div>
            <div className="modal-body space-y-4">
              <div className="space-y-1"><label className="text-xs font-semibold text-muted block">Product</label><SearchableDropdown value={editItem.product_id} onChange={(val) => { }} options={products.map(p => ({value: String(p.id), label: p.product_name}))} placeholder="Select product" displayKey="label" valueKey="value" /></div>
              <div className="space-y-1"><label className="text-xs font-semibold text-muted block">Batch ID</label><input className="form-input" value={editForm.batch_id} onChange={(e) => setEditForm({ ...editForm, batch_id: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1"><label className="text-xs font-semibold text-muted block">Opening Date</label><input type="date" className="form-input" value={editForm.opening_date} onChange={(e) => setEditForm({ ...editForm, opening_date: e.target.value })} /></div>
                <div className="space-y-1"><label className="text-xs font-semibold text-muted block">Closing Date</label><input type="date" className="form-input" value={editForm.closing_date} onChange={(e) => setEditForm({ ...editForm, closing_date: e.target.value })} /></div>
              </div>
              <div className="space-y-1"><label className="text-xs font-semibold text-muted block">Status</label><select className="form-input" value={editForm.status} onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}><option value="active">Active</option><option value="completed">Completed</option></select></div>
              <div className="flex justify-end gap-3 mt-2"><button onClick={() => setEditItem(null)} className="btn btn-secondary">Cancel</button><button onClick={updateRegistry} disabled={loading} className="btn btn-primary">Save</button></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default NonBillableConsumables;