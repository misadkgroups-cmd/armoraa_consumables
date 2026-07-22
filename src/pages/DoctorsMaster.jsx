import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../config/supabase';
import { Search, Plus, Edit2, X, Stethoscope } from 'lucide-react';
import SearchableDropdown from '../components/SearchableDropdown';

const SectionHeader = ({ title, subtitle, action }) => (
  <div className="cust-head">
    <div><h2>{title}</h2><p>{subtitle}</p></div>
    <div className="cust-actions">{action}</div>
  </div>
);
const StatCard = ({ icon: Icon, label, value, color }) => (
  <div className="stat-box"><div className="ic" style={{ background: color }}><Icon size={16} /></div><div className="v">{value}</div><div className="l">{label}</div></div>
);
const Modal = ({ open, onClose, title, children }) => {
  if (!open) return null;
  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: 520 }}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button onClick={onClose} className="btn btn-ghost btn-icon">×</button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
};

const DoctorsMaster = () => {
  const [doctors, setDoctors] = useState([]);
  const [branches, setBranches] = useState([]);
  const [branchMap, setBranchMap] = useState({});
  const [search, setSearch] = useState('');
  const [branchFilter, setBranchFilter] = useState('');
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({ doctor_name: '', branch_id: '', status: 'Active' });
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);

  const showToast = (type, message) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchBranches = useCallback(async () => {
    try {
      const { data } = await supabase.from('branches').select('id, branch_name').order('branch_name');
      if (data) {
        setBranches(data);
        const map = {};
        data.forEach(b => { map[b.id] = b.branch_name; });
        setBranchMap(map);
      }
    } catch (e) { console.error(e); }
  }, []);

  const fetchDoctors = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase.from('master_doctors').select('*').order('doctor_name');
      if (branchFilter) query = query.eq('branch_id', branchFilter);
      const { data, error } = await query;
      if (error) throw error;
      setDoctors(data || []);
    } catch (e) {
      console.error(e);
      showToast('error', e.message || 'Failed to fetch doctors');
    } finally {
      setLoading(false);
    }
  }, [branchFilter]);

  useEffect(() => {
    fetchBranches();
    fetchDoctors();
  }, [fetchBranches, fetchDoctors]);

  const openModal = (mode, data = null) => {
    setModal({ mode, data });
    setForm(data
      ? { doctor_name: data.doctor_name || '', branch_id: String(data.branch_id || ''), status: data.status || 'Active' }
      : { doctor_name: '', branch_id: '', status: 'Active' });
  };

  const saveModal = async () => {
    if (!form.doctor_name.trim()) return showToast('error', 'Doctor Name is required');
    if (!form.branch_id) return showToast('error', 'Branch is required');
    setLoading(true);
    try {
      const payload = {
        doctor_name: form.doctor_name.trim(),
        branch_id: Number(form.branch_id),
        status: form.status || 'Active',
      };
      if (modal.mode === 'add') {
        const { data: existing } = await supabase
          .from('master_doctors')
          .select('id')
          .ilike('doctor_name', payload.doctor_name)
          .eq('branch_id', payload.branch_id);
        if (existing && existing.length) return showToast('warning', 'A doctor with this name already exists in the selected branch');
        const { error } = await supabase.from('master_doctors').insert(payload);
        if (error) throw error;
        showToast('success', 'Successfully added doctor');
      } else {
        const { error } = await supabase.from('master_doctors').update(payload).eq('id', modal.data.id);
        if (error) throw error;
        showToast('success', 'Successfully updated doctor');
      }
      setModal(null);
      await fetchDoctors();
    } catch (e) {
      showToast('error', e.message || 'Failed to save');
    }
    setLoading(false);
  };

  const toggleStatus = async (item) => {
    const newStatus = item.status === 'Active' ? 'Inactive' : 'Active';
    if (!window.confirm(`Deactivate / re-activate ${item.doctor_name}?`)) return;
    setLoading(true);
    try {
      const { error } = await supabase.from('master_doctors').update({ status: newStatus }).eq('id', item.id);
      if (error) throw error;
      showToast('success', `Status updated to ${newStatus}`);
      await fetchDoctors();
    } catch (e) {
      showToast('error', e.message || 'Status update failed');
    }
    setLoading(false);
  };

  const deleteDoctor = async (id) => {
    if (!window.confirm('Delete this doctor permanently?')) return;
    setLoading(true);
    try {
      const { error } = await supabase.from('master_doctors').delete().eq('id', id);
      if (error) throw error;
      showToast('success', 'Successfully deleted');
      await fetchDoctors();
    } catch (e) {
      showToast('error', e.message || 'Failed to delete');
    }
    setLoading(false);
  };

  const filtered = doctors.filter(d =>
    (d.doctor_name || '').toLowerCase().includes(search.toLowerCase())
  );

  const branchOptions = branches.map(b => ({ value: String(b.id), label: b.branch_name }));

  return (
    <div className="page-wrapper">
      <div className="page-header">
        <div className="page-header-left">
          <h1>Doctors Master</h1>
          <p>Manage branch-specific doctor records</p>
        </div>
      </div>

      <SectionHeader
        title="Doctors"
        subtitle={`${doctors.length} configured`}
        action={
          <div className="cust-actions">
            <div className="search-box"><Search size={15} /><input placeholder="Search doctor…" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
            <SearchableDropdown
              value={branchFilter}
              onChange={(val) => setBranchFilter(val)}
              options={[{ value: '', label: 'All Branches' }, ...branchOptions]}
              placeholder="All Branches"
              displayKey="label"
              valueKey="value"
            />
            <button onClick={() => openModal('add')} className="btn btn-primary"><Plus size={16} /> Add Doctor</button>
          </div>
        }
      />

      <div className="stat-grid">
        <StatCard icon={Stethoscope} label="Total Doctors" value={doctors.length} color="linear-gradient(135deg,#7C5CFC,#A78BFA)" />
        <StatCard icon={Stethoscope} label="Active" value={doctors.filter(d => (d.status || 'Active') === 'Active').length} color="linear-gradient(135deg,#10B981,#34D399)" />
        <StatCard icon={Stethoscope} label="Inactive" value={doctors.filter(d => (d.status || 'Active') === 'Inactive').length} color="linear-gradient(135deg,#EF4444,#F87171)" />
      </div>

      <div className="table-container">
        <table className="dt">
          <thead>
            <tr>
              <th style={{ width: 80 }}>ID</th>
              <th style={{ width: 280 }}>Doctor Name</th>
              <th style={{ width: 200 }}>Branch</th>
              <th style={{ width: 120 }}>Status</th>
              <th style={{ width: 140 }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan="5">
                  <div className="prem-empty">
                    <div className="ico"><Stethoscope size={24} /></div>
                    <h3>No doctors found</h3>
                    <p>Add your first doctor to get started.</p>
                    <button onClick={() => openModal('add')} className="btn btn-primary"><Plus size={16} /> Add Doctor</button>
                  </div>
                </td>
              </tr>
            )}
            {filtered.map(d => (
              <tr key={d.id}>
                <td className="font-medium">{d.id}</td>
                <td className="font-medium">{d.doctor_name}</td>
                <td>{branchMap[d.branch_id] || '-'}</td>
                <td><span className={`sbadge ${d.status === 'Inactive' ? 'inactive' : 'active'}`}><span className={`status-dot ${d.status === 'Inactive' ? 'orange' : 'green'}`} /> {d.status || 'Active'}</span></td>
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <div style={{ display: 'inline-flex', gap: 6 }}>
                    <button className="ia" title="Edit" onClick={() => openModal('edit', d)}><Edit2 size={14} /></button>
                    <button className="ia" title={d.status === 'Active' ? 'Deactivate' : 'Activate'} onClick={() => toggleStatus(d)}><X size={14} /></button>
                    <button className="ia danger" title="Delete" onClick={() => deleteDoctor(d.id)}><Stethoscope size={14} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={!!modal} onClose={() => setModal(null)} title={modal?.mode === 'add' ? 'Add Doctor' : 'Edit Doctor'}>
        <div className="space-y-4">
          <div className="space-y-1"><label className="text-xs font-semibold text-muted block">Doctor Name</label><input className="form-input" value={form.doctor_name} onChange={(e) => setForm({ ...form, doctor_name: e.target.value })} placeholder="e.g. Dr. Kumar" /></div>
          <div className="space-y-1"><label className="text-xs font-semibold text-muted block">Branch</label><SearchableDropdown value={form.branch_id} onChange={(val) => setForm({ ...form, branch_id: val })} options={branchOptions} placeholder="Select branch" displayKey="label" valueKey="value" /></div>
          <div className="space-y-1"><label className="text-xs font-semibold text-muted block">Status</label><SearchableDropdown value={form.status} onChange={(val) => setForm({ ...form, status: val })} options={[{ value: 'Active', label: 'Active' }, { value: 'Inactive', label: 'Inactive' }]} placeholder="Select status" displayKey="label" valueKey="value" /></div>
          <div className="flex justify-end gap-3 mt-2"><button onClick={() => setModal(null)} className="btn btn-secondary">Cancel</button><button onClick={saveModal} disabled={loading} className="btn btn-primary">Save</button></div>
        </div>
      </Modal>

      {toast && (
        <div className={`toast ${toast.type === 'success' ? 'toast-success' : toast.type === 'warning' ? 'toast-warning' : 'toast-error'}`}>
          <span>{toast.message}</span>
          <button onClick={() => setToast(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', opacity: 0.7, fontSize: 16 }}>×</button>
        </div>
      )}
    </div>
  );
};

export default DoctorsMaster;