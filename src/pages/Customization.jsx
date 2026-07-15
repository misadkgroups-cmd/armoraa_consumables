import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../config/supabase';
import { useBranch } from '../context/BranchContext';
import { Search, Plus, Edit2, Trash2, X, Package, Settings, Cog, Boxes } from 'lucide-react';
import SearchableDropdown from '../components/SearchableDropdown';

// These MUST be defined OUTSIDE the component to prevent remount on every render
const TABS = [
  { id: 'general', label: 'General Settings', icon: Settings },
  { id: 'billable', label: 'Billable Consumables', icon: Package },
  { id: 'non-billable', label: 'Non-Billable Consumables', icon: Boxes },
  { id: 'service', label: 'Services', icon: Settings },
  { id: 'machinery', label: 'Machinery Mapping', icon: Cog },
];

const SectionHeader = ({ title, subtitle, action }) => (<div className="cust-head"><div><h2>{title}</h2><p>{subtitle}</p></div><div className="cust-actions">{action}</div></div>);
const StatCard = ({ icon: Icon, label, value, color }) => (<div className="stat-box"><div className="ic" style={{ background: color }}><Icon size={16} /></div><div className="v">{value}</div><div className="l">{label}</div></div>);
const Modal = ({ open, onClose, title, children }) => { if (!open) return null; return (<div className="modal-overlay"><div className="modal" style={{ maxWidth: 520 }}><div className="modal-header"><h3>{title}</h3><button onClick={onClose} className="btn btn-ghost btn-icon">×</button></div><div className="modal-body">{children}</div></div></div>); };

const Customization = () => {
  console.count('Customization Render');
  const { branchId } = useBranch();
  const [tab, setTab] = useState('billable');
  const [toast, setToast] = useState(null);
  const [loading, setLoading] = useState(false);

  const showToast = (type, message) => { setToast({ type, message }); setTimeout(() => setToast(null), 3000); };

  const [settings, setSettings] = useState({
    clinicName: 'ARMORAA Clinic',
    dateFormat: 'dd MMM yyyy',
    currency: 'INR',
    language: 'en',
    notifications: true,
  });

  /* =================== BILLABLE =================== */
  const [billable, setBillable] = useState([]);
  const [bSearch, setBSearch] = useState('');
  const [bModal, setBModal] = useState(null);
  const [bForm, setBForm] = useState({ consumable_name: '', cost_unit: '', status: 'Active' });

  const fetchBillable = useCallback(async () => {
    try { const { data } = await supabase.from('master_consumables').select('*').order('consumable_name'); if (data) setBillable(data || []); }
    catch (e) { console.error(e); }
  }, []);

  const openBModal = (mode, data = null) => { setBModal({ mode, data }); setBForm(data ? { consumable_name: data.consumable_name || '', cost_unit: data.cost_unit || '', status: data.status || 'Active' } : { consumable_name: '', cost_unit: '', status: 'Active' }); };
  const saveBModal = async () => {
    if (!bForm.consumable_name) return showToast('error', 'Consumable Name is required');
    const cost = Number(bForm.cost_unit || 0);
    if (isNaN(cost) || cost < 0) return showToast('error', 'Cost must be a positive number');
    const status = bForm.status || 'Active';
    setLoading(true);
    try {
      if (bModal.mode === 'add') {
        const { data: existing } = await supabase.from('master_consumables').select('id').ilike('consumable_name', bForm.consumable_name.trim());
        if (existing && existing.length) return showToast('warning', 'A consumable with this name already exists');
        const { error } = await supabase.from('master_consumables').insert({ consumable_name: bForm.consumable_name.trim(), cost_unit: cost, status });
        if (error) throw error;
        showToast('success', 'Successfully added consumable');
      } else {
        const { error } = await supabase.from('master_consumables').update({ consumable_name: bForm.consumable_name.trim(), cost_unit: cost, status }).eq('id', bModal.data.id);
        if (error) throw error;
        showToast('success', 'Successfully updated consumable');
      }
      setBModal(null);
      await fetchBillable();
    } catch (e) { showToast('error', e.message || 'Failed to save'); }
    setLoading(false);
  };
  const deleteB = async (id) => { if (!window.confirm('Delete this consumable permanently?')) return; setLoading(true); try { const { error } = await supabase.from('master_consumables').delete().eq('id', id); if (error) throw error; showToast('success', 'Successfully deleted'); await fetchBillable(); } catch (e) { showToast('error', e.message || 'Failed to delete'); } setLoading(false); };
  const filteredB = billable.filter(x => (x.consumable_name || '').toLowerCase().includes(bSearch.toLowerCase()));

  /* =================== NON-BILLABLE =================== */
  const [nonBillable, setNonBillable] = useState([]);
  const [nbSearch, setNbSearch] = useState('');
  const [nbModal, setNbModal] = useState(null);
  const [nbForm, setNbForm] = useState({ product_name: '', cost: '', status: 'Active' });

  const fetchNonBillable = useCallback(async () => {
    try {
      const { data, error } = await supabase.from('master_non_billable_consumables').select('*').order('product_name');
      if (!error && data) setNonBillable(data || []);
    } catch (e) { console.error(e); }
  }, []);

  const openNbModal = (mode, data = null) => { setNbModal({ mode, data }); setNbForm(data ? { product_name: data.product_name || '', cost: data.cost || '', status: data.status || 'Active' } : { product_name: '', cost: '', status: 'Active' }); };
  const saveNb = async () => {
    if (!nbForm.product_name) return showToast('error', 'Product Name required');
    setLoading(true);
    try {
      const cost = Number(nbForm.cost || 0);
      if (nbModal.mode === 'add') {
        const { data: existing } = await supabase.from('master_non_billable_consumables').select('id').ilike('product_name', nbForm.product_name.trim());
        if (existing && existing.length) return showToast('warning', 'A consumable with this name already exists');
        const { error } = await supabase.from('master_non_billable_consumables').insert({ product_name: nbForm.product_name.trim(), cost, status: nbForm.status || 'Active' });
        if (error) throw error;
        showToast('success', 'Consumable added');
      } else {
        const { error } = await supabase.from('master_non_billable_consumables').update({ product_name: nbForm.product_name.trim(), cost, status: nbForm.status }).eq('id', nbModal.data.id);
        if (error) throw error;
        showToast('success', 'Consumable updated');
      }
      setNbModal(null);
      await fetchNonBillable();
    } catch (e) { showToast('error', e.message || 'Save failed'); }
    setLoading(false);
  };
  const toggleNbStatus = async (item) => {
    const newStatus = item.status === 'Active' ? 'Inactive' : 'Active';
    if (!window.confirm(`Change status from ${item.status} to ${newStatus}?`)) return;
    setLoading(true);
    try {
      const { error } = await supabase.from('master_non_billable_consumables').update({ status: newStatus }).eq('id', item.id);
      if (error) throw error;
      showToast('success', 'Status updated');
      await fetchNonBillable();
    } catch (e) { showToast('error', e.message || 'Status update failed'); }
    setLoading(false);
  };
  const deleteNb = async (id) => {
    if (!window.confirm('Delete this consumable permanently?')) return;
    setLoading(true);
    try {
      const { error } = await supabase.from('master_non_billable_consumables').delete().eq('id', id);
      if (error) throw error;
      showToast('success', 'Deleted');
      await fetchNonBillable();
    } catch (e) { showToast('error', e.message || 'Delete failed'); }
    setLoading(false);
  };
  const filteredNb = nonBillable.filter(x => (x.product_name || '').toLowerCase().includes(nbSearch.toLowerCase()));

  /* =================== SERVICES =================== */
  const [services, setServices] = useState([]);
  const [svcSearch, setSvcSearch] = useState('');
  const [svcModal, setSvcModal] = useState(null);
  const [svcForm, setSvcForm] = useState({ service_name: '' });

  const fetchServices = useCallback(async () => {
    try { const { data } = await supabase.from('master_services').select('*').order('service_name'); if (data) setServices(data || []); }
    catch (e) { console.error(e); }
  }, []);

  const openSvcModal = (mode, data = null) => { setSvcModal({ mode, data }); setSvcForm(data || { service_name: '' }); };
  const saveSvcModal = async () => {
    if (!svcForm.service_name || !svcForm.service_name.trim()) return showToast('error', 'Service Name is required');
    setLoading(true);
    try {
      if (svcModal.mode === 'add') {
        const { data: existing } = await supabase.from('master_services').select('id').ilike('service_name', svcForm.service_name.trim());
        if (existing && existing.length) return showToast('warning', 'A service with this name already exists');
        const { error } = await supabase.from('master_services').insert({ service_name: svcForm.service_name.trim() });
        if (error) throw error;
        showToast('success', 'Successfully added service');
      } else {
        const { error } = await supabase.from('master_services').update({ service_name: svcForm.service_name.trim() }).eq('id', svcModal.data.id);
        if (error) throw error;
        showToast('success', 'Successfully updated service');
      }
      setSvcModal(null);
      await fetchServices();
    } catch (e) { showToast('error', e.message || 'Failed to save'); }
    setLoading(false);
  };
  const deleteSvc = async (id) => { if (!window.confirm('Delete this service permanently?')) return; setLoading(true); try { const { error } = await supabase.from('master_services').delete().eq('id', id); if (error) throw error; showToast('success', 'Successfully deleted'); await fetchServices(); } catch (e) { showToast('error', e.message || 'Failed to delete'); } setLoading(false); };
  const filteredSvc = services.filter(x => (x.service_name || '').toLowerCase().includes(svcSearch.toLowerCase()));

  /* =================== MACHINERY =================== */
  const [machines, setMachines] = useState([]);
  const [machServices, setMachServices] = useState([]);
  const [mSearch, setMSearch] = useState('');
  const [mModal, setMModal] = useState(null);
  const [mForm, setMForm] = useState({ machine_name: '', service_id: '' });

  const fetchMachines = useCallback(async () => {
    try { const { data, error } = await supabase.from('master_machinery').select('*, master_services(service_name)').order('machine_name'); if (error) return; const mapped = (data || []).map(it => ({ ...it, service_name: it.master_services?.service_name || '-' })); setMachines(mapped); }
    catch (e) { console.error(e); }
  }, []);
  const loadServicesForMach = useCallback(async () => { try { const { data } = await supabase.from('master_services').select('id, service_name').order('service_name'); setMachServices(data || []); } catch (e) { console.error(e); } }, []);

  const openMModal = (mode, data = null) => { setMModal({ mode, data }); setMForm(data ? { machine_name: data.machine_name || '', service_id: data.service_id || '' } : { machine_name: '', service_id: '' }); };
  const saveMModal = async () => {
    if (!mForm.machine_name || !mForm.service_id) return alert('Name and Service required');
    setLoading(true);
    try {
      if (mModal.mode === 'add') { const { error } = await supabase.from('master_machinery').insert({ branch_id: branchId, machine_name: mForm.machine_name, service_id: Number(mForm.service_id) }); if (error) throw error; showToast('success', 'Machine added'); }
      else { const { error } = await supabase.from('master_machinery').update({ machine_name: mForm.machine_name, service_id: Number(mForm.service_id) }).eq('id', mModal.data.id); if (error) throw error; showToast('success', 'Machine updated'); }
      setMModal(null);
      await fetchMachines();
    } catch (e) { showToast('error', e.message || 'Save failed'); }
    setLoading(false);
  };
  const deleteM = async (id) => { if (!window.confirm('Delete this machine?')) return; const { error } = await supabase.from('master_machinery').delete().eq('id', id); if (error) showToast('error', error.message); else { showToast('success', 'Deleted'); await fetchMachines(); } };
  const filteredM = machines.filter(x => (x.machine_name || '').toLowerCase().includes(mSearch.toLowerCase()));

  // Load data once on mount
  useEffect(() => {
    if (branchId) {
      fetchBillable();
      fetchNonBillable();
      fetchServices();
      fetchMachines();
      loadServicesForMach();
    }
  }, [branchId, fetchBillable, fetchNonBillable, fetchServices, fetchMachines, loadServicesForMach]);

  const renderContent = () => {
    if (tab === 'general') return (<div className="set-card"><h4>Organization & Preferences</h4><div className="set-row"><div className="space-y-1"><label className="text-xs font-semibold text-muted block">Clinic Name</label><input className="form-input" value={settings.clinicName} onChange={(e) => setSettings({ ...settings, clinicName: e.target.value })} /></div><div className="space-y-1"><label className="text-xs font-semibold text-muted block">Date Format</label><SearchableDropdown value={settings.dateFormat} onChange={(val) => setSettings({ ...settings, dateFormat: val })} options={[{value:'dd MMM yyyy',label:'dd MMM yyyy'},{value:'MM-dd-yyyy',label:'MM-dd-yyyy'},{value:'yyyy-MM-dd',label:'yyyy-MM-dd'}]} placeholder="Select date format" displayKey="label" valueKey="value" /></div><div className="space-y-1"><label className="text-xs font-semibold text-muted block">Base Currency</label><SearchableDropdown value={settings.currency} onChange={(val) => setSettings({ ...settings, currency: val })} options={[{value:'INR',label:'INR'},{value:'USD',label:'USD'},{value:'EUR',label:'EUR'}]} placeholder="Select currency" displayKey="label" valueKey="value" /></div><div className="space-y-1"><label className="text-xs font-semibold text-muted block">Language</label><SearchableDropdown value={settings.language} onChange={(val) => setSettings({ ...settings, language: val })} options={[{value:'en',label:'English'}]} placeholder="Select language" displayKey="label" valueKey="value" /></div></div><div className="flex items-center justify-between mt-4 p-4 bg-[var(--color-tint-2)] rounded-xl border border-[var(--color-line)]"><div><div className="text-sm font-semibold text-ink">Enable Notifications</div><div className="text-xs text-muted mt-0.5">Alerts for system events</div></div><div className={`sw ${settings.notifications ? 'on' : ''}`} onClick={() => setSettings({ ...settings, notifications: !settings.notifications })} /></div><div className="flex justify-end mt-6"><button onClick={() => showToast('success', 'Settings saved')} className="btn btn-primary">Save Changes</button></div></div>);

    const activeB = billable.filter(x => (x.status || 'Active') === 'Active').length;
    const inactiveB = billable.filter(x => (x.status || 'Active') === 'Inactive').length;
    if (tab === 'billable') return (<>
      <SectionHeader title="Billable Consumables" subtitle={`${billable.length} items configured`} action={<div className="cust-actions"><div className="search-box"><Search size={15} /><input placeholder="Search consumable…" value={bSearch} onChange={(e) => setBSearch(e.target.value)} /></div><button onClick={() => openBModal('add')} className="btn btn-primary"><Plus size={16} /> Add Consumable</button></div>} />
      <div className="stat-grid"><StatCard icon={Package} label="Total" value={billable.length} color="linear-gradient(135deg,#7C5CFC,#A78BFA)" /><StatCard icon={Package} label="Active" value={activeB} color="linear-gradient(135deg,#10B981,#34D399)" /><StatCard icon={Package} label="Inactive" value={inactiveB} color="linear-gradient(135deg,#EF4444,#F87171)" /></div>
      <div className="table-container">
        <table className="dt"><thead><tr><th style={{ width: 260 }}>Consumable Name</th><th style={{ width: 120 }}>Cost</th><th style={{ width: 100 }}>Status</th><th style={{ width: 100 }}>Actions</th></tr></thead>
        <tbody>
          {filteredB.length === 0 && (<tr><td colSpan="4"><div className="prem-empty"><div className="ico"><Package size={24} /></div><h3>No consumables found</h3><p>Add your first billable consumable to get started.</p><button onClick={() => openBModal('add')} className="btn btn-primary"><Plus size={16} /> Add Consumable</button></div></td></tr>)}
          {filteredB.map(c => (<tr key={c.id}><td className="font-medium">{c.consumable_name}</td><td style={{ textAlign: 'right' }}>{c.cost_unit || 0}</td><td><span className={`sbadge ${c.status === 'Inactive' ? 'inactive' : 'active'}`}><span className={`status-dot ${c.status === 'Inactive' ? 'orange' : 'green'}`} /> {c.status || 'Active'}</span></td><td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}><div style={{ display: 'inline-flex', gap: 6 }}><button className="ia" title="Edit" onClick={() => openBModal('edit', c)}><Edit2 size={14} /></button><button className="ia danger" title="Delete" onClick={() => deleteB(c.id)}><Trash2 size={14} /></button></div></td></tr>))}
        </tbody>
      </table>
    </div>
    <Modal open={!!bModal} onClose={() => setBModal(null)} title={bModal?.mode === 'add' ? 'Add Consumable' : 'Edit Consumable'}>
      <div className="space-y-4"><div className="space-y-1"><label className="text-xs font-semibold text-muted block">Consumable Name</label><input className="form-input" value={bForm.consumable_name} onChange={(e) => setBForm({ ...bForm, consumable_name: e.target.value })} /></div>
      <div className="space-y-1"><label className="text-xs font-semibold text-muted block">Cost</label><input className="form-input" type="number" value={bForm.cost_unit} onChange={(e) => setBForm({ ...bForm, cost_unit: e.target.value })} /></div>
      <div className="space-y-1"><label className="text-xs font-semibold text-muted block">Status</label><SearchableDropdown value={bForm.status} onChange={(val) => setBForm({ ...bForm, status: val })} options={[{value:'Active',label:'Active'},{value:'Inactive',label:'Inactive'}]} placeholder="Select status" displayKey="label" valueKey="value" /></div>
      <div className="flex justify-end gap-3 mt-2"><button onClick={() => setBModal(null)} className="btn btn-secondary">Cancel</button><button onClick={saveBModal} disabled={loading} className="btn btn-primary">Save</button></div></div>
    </Modal>
    </>);

    if (tab === 'non-billable') return (<>
      <SectionHeader title="Non-Billable Consumables" subtitle={`${nonBillable.length} items configured`} action={<div className="cust-actions"><div className="search-box"><Search size={15} /><input placeholder="Search non-billable consumable…" value={nbSearch} onChange={(e) => setNbSearch(e.target.value)} /></div><button onClick={() => openNbModal('add')} className="btn btn-primary"><Plus size={16} /> Add Non-Billable Consumable</button></div>} />
      <div className="stat-grid">
        <StatCard icon={Boxes} label="Total Non-Billable Consumables" value={nonBillable.length} color="linear-gradient(135deg,#6366F1,#8B7FFF)" />
        <StatCard icon={Boxes} label="Active" value={nonBillable.filter(x => (x.status || 'Active') === 'Active').length} color="linear-gradient(135deg,#10B981,#34D399)" />
        <StatCard icon={Boxes} label="Inactive" value={nonBillable.filter(x => (x.status || 'Active') === 'Inactive').length} color="linear-gradient(135deg,#EF4444,#F87171)" />
      </div>
      <div className="table-container">
        <table className="dt">
          <thead>
            <tr>
              <th style={{ width: 260 }}>Non-Billable Consumable Name</th>
              <th style={{ width: 120 }}>Cost</th>
              <th style={{ width: 100 }}>Status</th>
              <th style={{ width: 140 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredNb.length === 0 && (<tr><td colSpan="4"><div className="prem-empty"><div className="ico"><Boxes size={24} /></div><h3>No consumables found</h3><p>Add your first non-billable consumable to get started.</p><button onClick={() => openNbModal('add')} className="btn btn-primary"><Plus size={16} /> Add Non-Billable Consumable</button></div></td></tr>)}
            {filteredNb.map(item => (<tr key={item.id}>
              <td className="font-medium">{item.product_name}</td>
              <td style={{ textAlign: 'right' }}>{item.cost || 0}</td>
              <td><span className={`sbadge ${item.status === 'Inactive' ? 'inactive' : 'active'}`}><span className={`status-dot ${item.status === 'Inactive' ? 'orange' : 'green'}`} /> {item.status || 'Active'}</span></td>
              <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}><div style={{ display: 'inline-flex', gap: 6 }}>
                <button className="ia" title="Edit" onClick={() => openNbModal('edit', item)}><Edit2 size={14} /></button>
                <button className="ia" title="Toggle Status" onClick={() => toggleNbStatus(item)}><X size={14} /></button>
                <button className="ia danger" title="Delete" onClick={() => deleteNb(item.id)}><Trash2 size={14} /></button>
              </div></td>
            </tr>))}
          </tbody>
        </table>
      </div>
      <Modal open={!!nbModal} onClose={() => setNbModal(null)} title={nbModal?.mode === 'add' ? 'Add Non-Billable Consumable' : 'Edit Non-Billable Consumable'}>
        <div className="space-y-4">
          <div className="space-y-1"><label className="text-xs font-semibold text-muted block">Consumable Name</label><input className="form-input" value={nbForm.product_name} onChange={(e) => setNbForm({ ...nbForm, product_name: e.target.value })} /></div>
          <div className="space-y-1"><label className="text-xs font-semibold text-muted block">Cost</label><input className="form-input" type="number" value={nbForm.cost} onChange={(e) => setNbForm({ ...nbForm, cost: e.target.value })} /></div>
          <div className="space-y-1"><label className="text-xs font-semibold text-muted block">Status</label><SearchableDropdown value={nbForm.status} onChange={(val) => setNbForm({ ...nbForm, status: val })} options={[{value:'Active',label:'Active'},{value:'Inactive',label:'Inactive'}]} placeholder="Select status" displayKey="label" valueKey="value" /></div>
          <div className="flex justify-end gap-3 mt-2"><button onClick={() => setNbModal(null)} className="btn btn-secondary">Cancel</button><button onClick={saveNb} disabled={loading} className="btn btn-primary">Save</button></div>
        </div>
      </Modal>
    </>);

    if (tab === 'service') return (<>
      <SectionHeader title="Services" subtitle={`${services.length} configured`} action={<div className="cust-actions"><div className="search-box"><Search size={15} /><input placeholder="Search services…" value={svcSearch} onChange={(e) => setSvcSearch(e.target.value)} /></div><button onClick={() => openSvcModal('add')} className="btn btn-primary"><Plus size={16} /> Add Service</button></div>} />
      <div className="stat-grid"><StatCard icon={Settings} label="Total Services" value={services.length} color="linear-gradient(135deg,#F59E0B,#FBBF24)" /></div>
      <div className="table-container">
        <table className="dt"><thead><tr><th style={{ width: 260 }}>Service Name</th><th style={{ width: 140 }}>Linked Machines</th><th style={{ width: 100 }}>Status</th><th style={{ width: 100 }}>Actions</th></tr></thead>
        <tbody>
          {filteredSvc.length === 0 && (<tr><td colSpan="4"><div className="prem-empty"><div className="ico"><Settings size={24} /></div><h3>No services found</h3><p>Create your first service to begin configuring clinic operations.</p><button onClick={() => openSvcModal('add')} className="btn btn-primary"><Plus size={16} /> Add Service</button></div></td></tr>)}
          {filteredSvc.map(s => { const count = machines.filter(m => m.service_id === s.id).length; return (<tr key={s.id}><td className="font-medium">{s.service_name}</td><td>{count} Machine{count !== 1 ? 's' : ''}</td><td><span className="sbadge active"><span className="status-dot green" /> Active</span></td><td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}><div style={{ display: 'inline-flex', gap: 6 }}><button className="ia" title="Edit" onClick={() => openSvcModal('edit', s)}><Edit2 size={14} /></button><button className="ia danger" title="Delete" onClick={() => deleteSvc(s.id)}><Trash2 size={14} /></button></div></td></tr>); })}
        </tbody>
      </table>
    </div>
    <Modal open={!!svcModal} onClose={() => setSvcModal(null)} title={svcModal?.mode === 'add' ? 'Add Service' : 'Edit Service'}>
      <div className="space-y-4"><div className="space-y-1"><label className="text-xs font-semibold text-muted block">Service Name</label><input className="form-input" value={svcForm.service_name} onChange={(e) => setSvcForm({ ...svcForm, service_name: e.target.value })} /></div>
      <div className="flex justify-end gap-3 mt-2"><button onClick={() => setSvcModal(null)} className="btn btn-secondary">Cancel</button><button onClick={saveSvcModal} disabled={loading} className="btn btn-primary">Save</button></div></div>
    </Modal>
    </>);

    if (tab === 'machinery') return (<>
      <SectionHeader title="Machinery Mapping" subtitle={`${machines.length} machines`} action={<button onClick={() => openMModal('add')} className="btn btn-primary"><Plus size={16} /> Add Machine</button>} />
      <div className="stat-grid"><StatCard icon={Cog} label="Total Machines" value={machines.length} color="linear-gradient(135deg,#EC4899,#F472B6)" /></div>
      <div className="table-container">
        <table className="dt"><thead><tr><th style={{ width: 260 }}>Machine Name</th><th style={{ width: 240 }}>Assigned Service</th><th style={{ width: 100 }}>Status</th><th style={{ width: 100 }}>Actions</th></tr></thead>
        <tbody>
          {filteredM.length === 0 && (<tr><td colSpan="4"><div className="prem-empty"><div className="ico"><Cog size={24} /></div><h3>No machines found</h3><p>Add a machine and assign it to a service.</p><button onClick={() => openMModal('add')} className="btn btn-primary"><Plus size={16} /> Add Machine</button></div></td></tr>)}
          {filteredM.map(m => (<tr key={m.id}><td className="font-medium">{m.machine_name}</td><td>{m.service_name || '-'}</td><td><span className="sbadge active"><span className="status-dot green" /> Active</span></td><td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}><div style={{ display: 'inline-flex', gap: 6 }}><button className="ia" title="Reassign / Edit" onClick={() => openMModal('edit', m)}><Edit2 size={14} /></button><button className="ia danger" title="Delete" onClick={() => deleteM(m.id)}><Trash2 size={14} /></button></div></td></tr>))}
        </tbody>
      </table>
    </div>
    <Modal open={!!mModal} onClose={() => setMModal(null)} title={mModal?.mode === 'add' ? 'Add Machine' : 'Edit Machine'}>
      <div className="space-y-4"><div className="space-y-1"><label className="text-xs font-semibold text-muted block">Machine Name</label><input className="form-input" value={mForm.machine_name} onChange={(e) => setMForm({ ...mForm, machine_name: e.target.value })} /></div>
      <div className="space-y-1"><label className="text-xs font-semibold text-muted block">Assign to Service</label><SearchableDropdown value={mForm.service_id} onChange={(val) => setMForm({ ...mForm, service_id: val })} options={machServices.map(s => ({value: String(s.id), label: s.service_name}))} placeholder="Select service" displayKey="label" valueKey="value" /></div>
      <div className="flex justify-end gap-3 mt-2"><button onClick={() => setMModal(null)} className="btn btn-secondary">Cancel</button><button onClick={saveMModal} disabled={loading} className="btn btn-primary">Save</button></div></div>
    </Modal>
    </>);

    return null;
  };

  return (
    <div className="page-wrapper">
      <div className="page-header">
        <div className="page-header-left">
          <h1>Customization</h1>
          <p>Master data & preferences</p>
        </div>
      </div>
      <div className="seg-tabs">
        {TABS.map(t => { const Icon = t.icon; return (<button key={t.id} className={`seg-tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}><Icon />{t.label}</button>); })}
      </div>
      {renderContent()}
      {toast && (<div className={`toast ${toast.type === 'success' ? 'toast-success' : 'toast-error'}`}><span>{toast.message}</span><button onClick={() => setToast(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', opacity: 0.7, fontSize: 16 }}>×</button></div>)}
    </div>
  );
};

export default Customization;