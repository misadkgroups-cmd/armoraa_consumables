import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../config/supabase';
import { useBranch } from '../context/BranchContext';
import SearchableDropdown from '../components/SearchableDropdown';

const FIELD_LABEL = {
  fontSize: '11px',
  fontWeight: 600,
  color: '#475569',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
};

const CARD_STYLE = {
  background: '#ffffff',
  borderRadius: '12px',
  border: '1px solid #e2e8f0',
  boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
};

const STATUS_BADGE = {
  Complete: { bg: '#D1FAE5', color: '#065F46', border: '#A7F3D0' },
  Incomplete: { bg: '#FEE2E2', color: '#991B1B', border: '#FECACA' },
};

export default function BillingLog({ onNavigate }) {
  const { branchId } = useBranch();
  const [bills, setBills] = useState([]);
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showViewModal, setShowViewModal] = useState(false);
  const [viewData, setViewData] = useState(null);
  const [toast, setToast] = useState(null);

  // Master data
  const [doctors, setDoctors] = useState([]);
  const [staff, setStaff] = useState([]);

  // Form state
  const [formData, setFormData] = useState({
    bill_no: '',
    uid: '',
    patient_name: '',
    rendering_doctor_id: '',
    staff_id: '',
    service_id: '',
    service_name: '',
    service_date: new Date().toISOString().split('T')[0],
  });
  const [formErrors, setFormErrors] = useState({});

  // Auto-set today's date on mount
  useEffect(() => {
    setFormData(prev => ({ ...prev, service_date: new Date().toISOString().split('T')[0] }));
  }, []);

  // Filters
  const [filters, setFilters] = useState({
    bill_no: '',
    uid: '',
    patient_name: '',
    service_id: '',
    service_date: '',
    consumable_status: 'All',
  });

  useEffect(() => {
    if (branchId) {
      fetchServices();
      fetchDoctors();
      fetchStaff();
      fetchBills();
    } else {
      setDoctors([]);
      setStaff([]);
    }
  }, [branchId]);

  const fetchDoctors = useCallback(async () => {
    if (!branchId) return;
    try {
      const { data, error } = await supabase
        .from('master_doctors')
        .select('id, doctor_name')
        .eq('branch_id', branchId)
        .eq('status', 'Active')
        .order('doctor_name');
      if (error) throw error;
      setDoctors(data || []);
    } catch (error) {
      console.error('Error fetching doctors:', error);
      setDoctors([]);
    }
  }, [branchId]);

  const fetchStaff = useCallback(async () => {
    if (!branchId) return;
    try {
      const { data, error } = await supabase
        .from('master_staff')
        .select('id, staff_name')
        .eq('branch_id', branchId)
        .eq('status', 'Active')
        .order('staff_name');
      if (error) throw error;
      setStaff(data || []);
    } catch (error) {
      console.error('Error fetching staff:', error);
      setStaff([]);
    }
  }, [branchId]);

  const fetchServices = async () => {
    try {
      // Try without branch filter first to ensure services load
      const { data, error } = await supabase
        .from('master_services')
        .select('id, service_name')
        .order('service_name');
      
      if (data) setServices(data || []);
    } catch (error) {
      console.error('Error fetching services:', error);
      setServices([]);
    }
  };

  const fetchBills = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('billing_log')
        .select(`
          *,
          master_doctors ( id, doctor_name ),
          master_staff ( id, staff_name )
        `)
        .order('created_at', { ascending: false })
        .limit(20);
      if (branchId) query = query.eq('branch_id', branchId);

      // Apply filters
      if (filters.bill_no) query = query.ilike('bill_no', `%${filters.bill_no}%`);
      if (filters.uid) query = query.ilike('uid', `%${filters.uid}%`);
      if (filters.patient_name) query = query.ilike('patient_name', `%${filters.patient_name}%`);
      if (filters.service_id) query = query.eq('service_id', filters.service_id);
      if (filters.service_date) query = query.eq('service_date', filters.service_date);
      if (filters.consumable_status && filters.consumable_status !== 'All') query = query.eq('consumable_status', filters.consumable_status);

      const { data, error } = await query;
      if (error) throw error;
      setBills(data || []);
    } catch (error) {
      console.error('Error fetching bills:', error);
      setBills([]);
      if (error.message && error.message.includes("billing_log")) {
        showToast('warning', 'Database table not set up. Please run the migration script.');
      } else {
        showToast('error', 'Failed to fetch bills');
      }
    } finally {
      setLoading(false);
    }
  }, [branchId, filters]);

  const showToast = (type, message) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3000);
  };

  const validateForm = () => {
    const errors = {};
    if (!formData.bill_no.trim()) errors.bill_no = 'Bill Number is required';
    if (!formData.patient_name.trim()) errors.patient_name = 'Patient Name is required';
    if (!formData.service_id) errors.service_id = 'Service is required';
    if (!formData.service_date) errors.service_date = 'Service Date is required';

    if (errors.bill_no) {
      setFormErrors(errors);
      return false;
    }

    // Check duplicate bill number
    const duplicate = bills.find(b => b.bill_no === formData.bill_no.trim());
    if (duplicate) {
      setFormErrors({ bill_no: 'Bill Number already exists' });
      showToast('error', 'Bill Number already exists');
      return false;
    }

    setFormErrors({});
    return true;
  };

  const handleSaveBill = async () => {
    if (!validateForm()) return;

    try {
      const selectedService = services.find(s => s.id === parseInt(formData.service_id));
      const payload = {
        bill_no: formData.bill_no.trim(),
        uid: formData.uid.trim() || null,
        patient_name: formData.patient_name.trim(),
        rendering_doctor_id: formData.rendering_doctor_id ? parseInt(formData.rendering_doctor_id) : null,
        staff_id: formData.staff_id ? parseInt(formData.staff_id) : null,
        service_id: parseInt(formData.service_id),
        service_name: selectedService?.service_name || '',
        service_date: formData.service_date,
        branch_id: branchId,
        consumable_status: 'Incomplete',
      };

      const { error } = await supabase.from('billing_log').insert(payload);
      if (error) throw error;

      showToast('success', 'Bill created successfully');
      resetForm();
      fetchBills();
      
      // Scroll to Show All Bills button after saving
      setTimeout(() => {
        const btn = document.querySelector('.btn-outline');
        if (btn) btn.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    } catch (error) {
      console.error('Error saving bill:', error);
      if (error.message && error.message.includes("billing_log")) {
        showToast('error', 'Database table not set up. Please run the migration script.');
      } else {
        showToast('error', error.message || 'Failed to save bill');
      }
    }
  };

  const resetForm = () => {
    setFormData({
      bill_no: '',
      uid: '',
      patient_name: '',
      rendering_doctor_id: '',
      staff_id: '',
      service_id: '',
      service_name: '',
      service_date: new Date().toISOString().split('T')[0],
    });
    setFormErrors({});
  };

  const handleSearch = () => {
    fetchBills();
  };

  const handleShowAll = async () => {
    setFilters({
      bill_no: '',
      uid: '',
      patient_name: '',
      service_id: '',
      service_date: '',
      consumable_status: 'All',
    });
    // Fetch all bills directly
    setLoading(true);
    try {
      let query = supabase.from('billing_log').select('*').order('created_at', { ascending: false });
      if (branchId) query = query.eq('branch_id', branchId);
      const { data, error } = await query;
      if (error) throw error;
      setBills(data || []);
    } catch (error) {
      console.error('Error fetching all bills:', error);
      showToast('error', 'Failed to fetch bills');
    } finally {
      setLoading(false);
    }
  };

  const handleClearFilters = () => {
    setFilters({
      bill_no: '',
      uid: '',
      patient_name: '',
      service_id: '',
      service_date: '',
      consumable_status: 'All',
    });
    resetForm();
  };

  const handleAddConsumables = (bill) => {
    // Navigate to billable consumables with bill data in state
    const billData = {
      bill_no: bill.bill_no,
      uid: bill.uid || '',
      service_id: bill.service_id,
      service_name: bill.service_name,
      service_date: bill.service_date,
      billing_log_id: bill.id,
    };
    if (onNavigate) {
      onNavigate('billable', billData);
    } else {
      // Fallback: update URL directly
      const url = `/billable-consumables?bill_no=${encodeURIComponent(bill.bill_no)}&uid=${encodeURIComponent(bill.uid || '')}&service_id=${bill.service_id}&service_name=${encodeURIComponent(bill.service_name)}&service_date=${bill.service_date}&billing_log_id=${bill.id}`;
      window.history.pushState({}, '', url);
      window.location.reload();
    }
  };

  const handleViewConsumables = async (bill) => {
    try {
      const { data: reports, error } = await supabase
        .from('billable_report')
        .select('*')
        .eq('bill_id', bill.bill_no)
        .eq('branch_id', branchId)
        .single();

      if (error || !reports) {
        showToast('warning', 'No consumables found for this bill');
        return;
      }

      const consumables = [];
      for (let i = 1; i <= 14; i++) {
        const cId = reports[`consumable_${i}_id`];
        const cUnits = reports[`consumable_${i}_units`];
        const cBatch = reports[`consumable_${i}_batch_id`];
        if (cId) {
          consumables.push({
            name: cId,
            units: cUnits,
            batch: cBatch,
          });
        }
      }

      setViewData({ bill, consumables });
      setShowViewModal(true);
    } catch (error) {
      console.error('Error fetching consumables:', error);
      showToast('error', 'Failed to fetch consumables');
    }
  };

  const getStatusBadge = (status) => {
    const style = STATUS_BADGE[status] || STATUS_BADGE.Incomplete;
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          padding: '3px 10px',
          borderRadius: '20px',
          fontSize: '11.5px',
          fontWeight: 600,
          background: style.bg,
          color: style.color,
          border: `1px solid ${style.border}`,
        }}
      >
        {status}
      </span>
    );
  };

  return (
    <div className="page-wrapper animate-fade-in">
      {/* Page Header */}
      <div className="page-header">
        <div className="page-header-left">
          <h1>Billing Log</h1>
          <p>Track all patient bills and consumable completion status</p>
        </div>
      </div>

      {/* New Bill Inline Form */}
      <div className="card" style={{ ...CARD_STYLE, marginBottom: 20 }}>
        <div className="card-header" style={{ marginBottom: 16, paddingBottom: 12, borderBottom: '1px solid var(--color-line-2)' }}>
          <div>
            <div className="card-title">New Bill</div>
            <div className="card-subtitle">Create a new bill record</div>
          </div>
          <button onClick={handleSaveBill} className="btn btn-primary">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><polyline points="20 6 9 17 4 12"/></svg>
            Save Bill
          </button>
        </div>
        {/* Row 1 */}
        <div className="grid grid-cols-6 gap-4" style={{ marginBottom: 12 }}>
          <div style={{ gridColumn: 'span 1' }}>
            <label style={FIELD_LABEL}>Bill Number <span style={{ color: '#EF4444' }}>*</span></label>
            <input
              type="text"
              value={formData.bill_no}
              onChange={(e) => setFormData({ ...formData, bill_no: e.target.value })}
              placeholder="Enter Bill Number"
              className="form-input"
              style={formErrors.bill_no ? { borderColor: '#EF4444' } : {}}
            />
            {formErrors.bill_no && <div style={{ fontSize: 11, color: '#EF4444', marginTop: 4 }}>{formErrors.bill_no}</div>}
          </div>
          <div style={{ gridColumn: 'span 1' }}>
            <label style={FIELD_LABEL}>UID</label>
            <input
              type="text"
              value={formData.uid}
              onChange={(e) => setFormData({ ...formData, uid: e.target.value })}
              placeholder="Enter UID"
              className="form-input"
            />
          </div>
          <div style={{ gridColumn: 'span 1' }}>
            <label style={FIELD_LABEL}>Patient Name <span style={{ color: '#EF4444' }}>*</span></label>
            <input
              type="text"
              value={formData.patient_name}
              onChange={(e) => setFormData({ ...formData, patient_name: e.target.value })}
              placeholder="Enter Patient Name"
              className="form-input"
              style={formErrors.patient_name ? { borderColor: '#EF4444' } : {}}
            />
            {formErrors.patient_name && <div style={{ fontSize: 11, color: '#EF4444', marginTop: 4 }}>{formErrors.patient_name}</div>}
          </div>
          <div style={{ gridColumn: 'span 1' }}>
            <label style={FIELD_LABEL}>Service <span style={{ color: '#EF4444' }}>*</span></label>
            <SearchableDropdown
              value={formData.service_id}
              onChange={(val) => {
                const service = services.find(s => s.id === parseInt(val));
                setFormData({ ...formData, service_id: val, service_name: service?.service_name || '' });
              }}
              options={services.map(s => ({ value: s.id, label: s.service_name }))}
              placeholder="Select Service"
              displayKey="label"
              valueKey="value"
            />
            {formErrors.service_id && <div style={{ fontSize: 11, color: '#EF4444', marginTop: 4 }}>{formErrors.service_id}</div>}
          </div>
          <div style={{ gridColumn: 'span 1' }}>
            <label style={FIELD_LABEL}>Service Date <span style={{ color: '#EF4444' }}>*</span></label>
            <input
              type="date"
              value={formData.service_date}
              onChange={(e) => setFormData({ ...formData, service_date: e.target.value })}
              className="form-input"
              style={formErrors.service_date ? { borderColor: '#EF4444' } : {}}
            />
            {formErrors.service_date && <div style={{ fontSize: 11, color: '#EF4444', marginTop: 4 }}>{formErrors.service_date}</div>}
          </div>
        </div>
        {/* Row 2 */}
        <div className="grid grid-cols-6 gap-4">
          <div style={{ gridColumn: 'span 1' }}>
            <label style={FIELD_LABEL}>Rendering Doctor</label>
            <SearchableDropdown
              value={formData.rendering_doctor_id}
              onChange={(val) => setFormData({ ...formData, rendering_doctor_id: val })}
              options={doctors.map(d => ({ value: String(d.id), label: d.doctor_name }))}
              placeholder="Select Doctor"
              displayKey="label"
              valueKey="value"
            />
          </div>
          <div style={{ gridColumn: 'span 1' }}>
            <label style={FIELD_LABEL}>Staff</label>
            <SearchableDropdown
              value={formData.staff_id}
              onChange={(val) => setFormData({ ...formData, staff_id: val })}
              options={staff.map(s => ({ value: String(s.id), label: s.staff_name }))}
              placeholder="Select Staff"
              displayKey="label"
              valueKey="value"
            />
          </div>
        </div>
      </div>

      {/* Recently Added Bills - Shows last 3 bills */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-ink)' }}>Recently Added Bills</div>
          <button onClick={() => onNavigate && onNavigate('all-bills')} className="btn btn-outline btn-sm">
            View All
          </button>
        </div>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th style={{ width: 120 }}>Bill No</th>
                <th style={{ width: 180 }}>Patient Name</th>
                <th style={{ width: 280 }}>Service</th>
                <th style={{ width: 180 }}>Rendering Doctor</th>
                <th style={{ width: 180 }}>Staff</th>
                <th style={{ width: 140 }}>Date</th>
                <th style={{ width: 120, textAlign: 'center' }}>Status</th>
                <th style={{ width: 140, textAlign: 'center' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="8" style={{ textAlign: 'center', padding: '20px', color: 'var(--color-muted)' }}>Loading...</td>
                </tr>
              ) : bills.slice(0, 3).length === 0 ? (
                <tr>
                  <td colSpan="8" style={{ textAlign: 'center', padding: '20px', color: 'var(--color-muted)' }}>No bills yet. Create your first bill above.</td>
                </tr>
              ) : (
                bills.slice(0, 3).map((bill) => {
                  const hasConsumables = bill.consumable_status === 'Complete';
                  return (
                    <tr key={bill.id}>
                      <td style={{ fontWeight: 600, color: 'var(--color-primary)', whiteSpace: 'nowrap', verticalAlign: 'middle' }}>{bill.bill_no}</td>
                      <td style={{ whiteSpace: 'nowrap', verticalAlign: 'middle' }}>{bill.patient_name || '-'}</td>
                      <td style={{ whiteSpace: 'nowrap', verticalAlign: 'middle' }}>{bill.service_name || '-'}</td>
                      <td style={{ whiteSpace: 'nowrap', verticalAlign: 'middle' }}>{bill.master_doctors?.doctor_name || '-'}</td>
                      <td style={{ whiteSpace: 'nowrap', verticalAlign: 'middle' }}>{bill.master_staff?.staff_name || '-'}</td>
                      <td style={{ whiteSpace: 'nowrap', verticalAlign: 'middle' }}>{bill.service_date || '-'}</td>
                      <td style={{ textAlign: 'center', verticalAlign: 'middle' }}>{getStatusBadge(bill.consumable_status)}</td>
                      <td style={{ textAlign: 'center', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                        {bill.consumable_status === 'Incomplete' ? (
                          <button onClick={() => handleAddConsumables(bill)} className="btn btn-primary btn-sm">Add Consumables</button>
                        ) : (
                          <button onClick={() => handleViewConsumables(bill)} className="btn btn-outline btn-sm" style={{ border: '1px solid var(--color-primary)', color: 'var(--color-primary)' }}>View</button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* View Consumables Modal */}
      {showViewModal && viewData && (
        <div className="modal-overlay" onClick={() => setShowViewModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '600px' }}>
            <div className="modal-header">
              <h3>Bill Information</h3>
              <button onClick={() => setShowViewModal(false)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--color-muted)' }}>×</button>
            </div>
            <div className="modal-body">
              <div style={{ background: 'var(--color-tint-2)', padding: 16, borderRadius: 8, marginBottom: 20 }}>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--color-muted)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.05em' }}>Bill No</div>
                    <div style={{ fontWeight: 600, color: 'var(--color-primary)', marginTop: 2 }}>{viewData.bill.bill_no}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--color-muted)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.05em' }}>UID</div>
                    <div style={{ fontWeight: 600, marginTop: 2 }}>{viewData.bill.uid || '-'}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--color-muted)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.05em' }}>Patient Name</div>
                    <div style={{ fontWeight: 600, marginTop: 2 }}>{viewData.bill.patient_name}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--color-muted)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.05em' }}>Service</div>
                    <div style={{ fontWeight: 600, marginTop: 2 }}>{viewData.bill.service_name}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--color-muted)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.05em' }}>Date</div>
                    <div style={{ fontWeight: 600, marginTop: 2 }}>{viewData.bill.service_date}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--color-muted)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.05em' }}>Status</div>
                    <div style={{ marginTop: 4 }}>{getStatusBadge(viewData.bill.consumable_status)}</div>
                  </div>
                </div>
              </div>

              {viewData.consumables.length > 0 && (
                <>
                  <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: 'var(--color-ink)' }}>Consumables Used</div>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--color-muted)', textTransform: 'uppercase', borderBottom: '1px solid var(--color-line)', background: 'var(--color-tint-2)' }}>Consumable Name</th>
                        <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--color-muted)', textTransform: 'uppercase', borderBottom: '1px solid var(--color-line)', background: 'var(--color-tint-2)' }}>Units</th>
                        <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--color-muted)', textTransform: 'uppercase', borderBottom: '1px solid var(--color-line)', background: 'var(--color-tint-2)' }}>Batch</th>
                      </tr>
                    </thead>
                    <tbody>
                      {viewData.consumables.map((c, i) => (
                        <tr key={i}>
                          <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--color-line-2)', fontSize: 13 }}>{c.name}</td>
                          <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--color-line-2)', fontSize: 13 }}>{c.units || '-'}</td>
                          <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--color-line-2)', fontSize: 13 }}>{c.batch || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </div>
            <div className="modal-footer">
              <button onClick={() => setShowViewModal(false)} className="btn btn-secondary">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`toast ${toast.type === 'success' ? 'toast-success' : toast.type === 'warning' ? 'toast-warning' : 'toast-error'}`}>
          <span>{toast.message}</span>
          <button onClick={() => setToast(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', opacity: 0.7, fontSize: 16, lineHeight: 1 }}>×</button>
        </div>
      )}
    </div>
  );
}