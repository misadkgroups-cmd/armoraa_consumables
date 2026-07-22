import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../config/supabase';
import { useBranch } from '../context/BranchContext';
import SearchableDropdown from '../components/SearchableDropdown';
import { Eye, Pencil, FlaskConical } from 'lucide-react';
import * as auditApi from '../services/auditApi';

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

// Status badge styles
const STATUS_BADGE = {
  Complete: { bg: '#D1FAE5', color: '#065F46', border: '#A7F3D0' },
  Incomplete: { bg: '#FEE2E2', color: '#991B1B', border: '#FECACA' },
  Pending: { bg: '#FEF3C7', color: '#92400E', border: '#FDE68A' },
};

export default function BillingLog({ onNavigate }) {
  const { branchId } = useBranch();
  const [bills, setBills] = useState([]);
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewData, setViewData] = useState(null);
  const [billServices, setBillServices] = useState([]);
  const [toast, setToast] = useState(null);

  // Master data
  const [doctors, setDoctors] = useState([]);
  const [staff, setStaff] = useState([]);

  // Form state - support multiple services
  const [formData, setFormData] = useState({
    bill_no: '',
    uid: '',
    patient_name: '',
    rendering_doctor_id: '',
    staff_id: '',
    service_date: new Date().toISOString().split('T')[0],
  });
  const [formErrors, setFormErrors] = useState({});
  
  // Multiple services array
  const [serviceRows, setServiceRows] = useState([]);

  // Filters
  const [filters, setFilters] = useState({
    bill_no: '',
    uid: '',
    patient_name: '',
    service_date: '',
    status: 'All',
  });

  useEffect(() => {
    setFormData(prev => ({ ...prev, service_date: new Date().toISOString().split('T')[0] }));
  }, []);

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
      const { data } = await supabase
        .from('master_services')
        .select('id, service_name')
        .order('service_name');
      
      if (data) setServices(data || []);
    } catch (e) {
      console.error('Error fetching services:', e);
      setServices([]);
    }
  };

  // Calculate bill status based on bill_services consumable_completed
  const calculateBillStatus = (services) => {
    if (!services || services.length === 0) return 'Incomplete';
    const hasPending = services.some(s => !s.consumable_completed);
    return hasPending ? 'Incomplete' : 'Complete';
  };

  // Get service counts for a bill
  const getServiceCounts = async (billId) => {
    try {
      const { data, error } = await supabase
        .from('bill_services')
        .select('consumable_completed')
        .eq('bill_id', billId);
      
      if (error) return { total: 0, completed: 0, pending: 0 };
      
      const total = data.length;
      const completed = data.filter(s => s.consumable_completed).length;
      return { total, completed, pending: total - completed };
    } catch (error) {
      return { total: 0, completed: 0, pending: 0 };
    }
  };

  // Get service counts from services array (used when bill_services is embedded)
  const getServiceCountsFromServices = (services) => {
    if (!services || services.length === 0) return { total: 0, completed: 0, pending: 0 };
    const total = services.length;
    const completed = services.filter(s => s.consumable_completed).length;
    return { total, completed, pending: total - completed };
  };

  const fetchBills = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('billing_log')
        .select(`
          *,
          master_doctors ( id, doctor_name ),
          master_staff ( id, staff_name ),
          bill_services(id, service_id, service_name, consumable_completed, service_status)
        `)
        .order('created_at', { ascending: false })
        .limit(20);
      if (branchId) query = query.eq('branch_id', branchId);

      // Apply filters
      if (filters.bill_no) query = query.ilike('bill_no', `%${filters.bill_no}%`);
      if (filters.uid) query = query.ilike('uid', `%${filters.uid}%`);
      if (filters.patient_name) query = query.ilike('patient_name', `%${filters.patient_name}%`);
      if (filters.service_date) query = query.eq('service_date', filters.service_date);

      const { data, error } = await query;
      if (error) throw error;
      
      // Calculate status for each bill based on bill_services
      const billsWithCounts = (data || []).map(bill => {
        const counts = bill.bill_services ? getServiceCountsFromServices(bill.bill_services) : { total: 0, completed: 0, pending: 0 };
        return {
          ...bill,
          serviceCounts: counts,
          calculatedStatus: calculateBillStatus(bill.bill_services),
        };
      });
      
      // Apply status filter after calculation
      let filteredBills = billsWithCounts;
      if (filters.status && filters.status !== 'All') {
        filteredBills = billsWithCounts.filter(b => b.calculatedStatus === filters.status);
      }
      
      setBills(filteredBills);
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
    
    // Validate at least one service is selected
    if (serviceRows.length === 0) {
      errors.services = 'At least one service is required';
    } else {
      const hasInvalidService = serviceRows.some(row => !row.service_id);
      if (hasInvalidService) errors.services = 'All services must be selected';
    }
    
    if (!formData.service_date) errors.service_date = 'Service Date is required';

    if (Object.keys(errors).length > 0) {
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

  const addServiceRow = () => {
    setServiceRows([...serviceRows, { id: Date.now() + serviceRows.length, service_id: '', service_name: '' }]);
  };

  const removeServiceRow = (id) => {
    setServiceRows(serviceRows.filter(row => row.id !== id));
  };

  const handleServiceChange = (id, value) => {
    const service = services.find(s => s.id === parseInt(value));
    setServiceRows(serviceRows.map(row => 
      row.id === id 
        ? { ...row, service_id: value, service_name: service?.service_name || '' }
        : row
    ));
  };

  const handleSaveBill = async () => {
    if (!validateForm()) return;

    try {
      // Create main bill record
      const billPayload = {
        bill_no: formData.bill_no.trim(),
        uid: formData.uid.trim() || null,
        patient_name: formData.patient_name.trim(),
        doctor_id: formData.rendering_doctor_id ? parseInt(formData.rendering_doctor_id) : null,
        staff_id: formData.staff_id ? parseInt(formData.staff_id) : null,
        service_date: formData.service_date,
        branch_id: branchId,
        bill_status: 'Incomplete',
      };

      // Create all bill_services records
      const { data: billData, error: billError } = await supabase.from('billing_log').insert(billPayload).select().single();
      if (billError) throw billError;

      // Create bill_services for each selected service
      const billServicesPayload = serviceRows.map(row => ({
        bill_id: billData.id,
        service_id: parseInt(row.service_id),
        service_name: row.service_name,
        service_status: 'Pending',
        consumable_completed: false,
      }));

      const { error: servicesError } = await supabase.from('bill_services').insert(billServicesPayload);
      if (servicesError) {
        console.warn('Warning: Could not create bill_services:', servicesError);
      }

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
      service_date: new Date().toISOString().split('T')[0],
    });
    setServiceRows([{ id: Date.now(), service_id: '', service_name: '' }]);
    setFormErrors({});
  };

  const _handleSearch = () => {
    fetchBills();
  };

  const _handleShowAll = async () => {
    setFilters({
      bill_no: '',
      uid: '',
      patient_name: '',
      service_date: '',
      status: 'All',
    });
    // Fetch all bills directly
    setLoading(true);
    try {
      let query = supabase.from('billing_log').select('*, master_doctors(doctor_name), master_staff(staff_name)').order('created_at', { ascending: false });
      if (branchId) query = query.eq('branch_id', branchId);
      const { data, error } = await query;
      if (error) throw error;
      
      // Calculate status for each bill
      const billsWithCounts = await Promise.all((data || []).map(async (bill) => {
        const counts = await getServiceCounts(bill.id);
        return {
          ...bill,
          serviceCounts: counts,
          calculatedStatus: calculateBillStatus(counts),
        };
      }));
      setBills(billsWithCounts);
    } catch (error) {
      console.error('Error fetching all bills:', error);
      showToast('error', 'Failed to fetch bills');
    } finally {
      setLoading(false);
    }
  };

  const _handleClearFilters = () => {
    setFilters({
      bill_no: '',
      uid: '',
      patient_name: '',
      service_date: '',
      status: 'All',
    });
    resetForm();
  };

  // Navigate to Add Consumables for a specific service
  const handleAddConsumables = (bill, billServiceId, serviceId, serviceName) => {
    const billData = {
      bill_no: bill.bill_no,
      uid: bill.uid || '',
      service_date: bill.service_date,
      billing_log_id: bill.id,
      bill_service_id: billServiceId,
      service_id: serviceId,
      service_name: serviceName,
    };
    if (onNavigate) {
      onNavigate('billable', billData);
    } else {
      const url = `/billable-consumables?bill_no=${encodeURIComponent(bill.bill_no)}&uid=${encodeURIComponent(bill.uid || '')}&service_date=${bill.service_date}&billing_log_id=${bill.id}&bill_service_id=${billServiceId}&service_id=${serviceId}&service_name=${encodeURIComponent(serviceName)}`;
      window.history.pushState({}, '', url);
      window.location.reload();
    }
  };

  // Navigate to Edit Consumables for a completed service
  const handleEditConsumables = (bill, billServiceId, serviceId, serviceName) => {
    const billData = {
      bill_no: bill.bill_no,
      uid: bill.uid || '',
      service_date: bill.service_date,
      billing_log_id: bill.id,
      bill_service_id: billServiceId,
      service_id: serviceId,
      service_name: serviceName,
    };
    if (onNavigate) {
      onNavigate('billable', billData);
    } else {
      const url = `/billable-consumables?bill_no=${encodeURIComponent(bill.bill_no)}&uid=${encodeURIComponent(bill.uid || '')}&service_date=${bill.service_date}&billing_log_id=${bill.id}&bill_service_id=${billServiceId}&service_id=${serviceId}&service_name=${encodeURIComponent(serviceName)}`;
      window.history.pushState({}, '', url);
      window.location.reload();
    }
  };

  // View bill details modal
  const handleViewBill = async (bill) => {
    try {
      // Fetch all services for this bill
      const { data: services, error } = await supabase
        .from('bill_services')
        .select('id, service_id, service_name, consumable_completed, service_status')
        .eq('bill_id', bill.id);
      
      if (error) throw error;
      
      setBillServices(services || []);
      setViewData({ bill, viewMode: 'details' });
    } catch (error) {
      console.error('Error fetching bill services:', error);
      showToast('error', 'Failed to fetch bill details');
    }
  };

  // Edit bill - navigate to edit mode
  const handleEditBill = (bill) => {
    if (onNavigate) {
      onNavigate('edit-bill', bill);
    } else {
      // Fallback: reload with edit parameter
      const url = `/billing-log?edit=${encodeURIComponent(bill.bill_no)}`;
      window.history.pushState({}, '', url);
      window.location.reload();
    }
  };

  // View history for a bill
  const [historyLoading, setHistoryLoading] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [historyData, setHistoryData] = useState({ audit: [], activity: [] });

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

  const handleViewHistory = async (bill) => {
    setHistoryLoading(true);
    try {
      const auditHistory = await auditApi.getAuditHistory('billing_log', bill.id);
      const activityHistory = await auditApi.getActivityLogs('BillingLog');
      setHistoryData({ audit: auditHistory, activity: activityHistory });
      setShowHistoryModal(true);
    } catch (error) {
      console.error('Error fetching history:', error);
      showToast('error', 'Failed to fetch history');
    } finally {
      setHistoryLoading(false);
    }
  };

  // Initialize with one service row
  useEffect(() => {
    if (serviceRows.length === 0) {
      setServiceRows([{ id: Date.now(), service_id: '', service_name: '' }]);
    }
  }, [serviceRows]);

  return (
    <div className="page-wrapper animate-fade-in">
      {/* Page Header */}
      <div className="page-header">
        <div className="page-header-left">
          <h1>Billing Log</h1>
          <p>Track all patient bills and service-wise consumable completion status</p>
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

        {/* Services Section */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <label style={{ ...FIELD_LABEL, marginBottom: 0 }}>Services <span style={{ color: '#EF4444' }}>*</span></label>
            <button 
              onClick={addServiceRow} 
              className="btn btn-ghost btn-sm"
              style={{ fontSize: 12 }}
            >
              + Add Service
            </button>
          </div>
          {formErrors.services && <div style={{ fontSize: 11, color: '#EF4444', marginBottom: 8 }}>{formErrors.services}</div>}
          
          <div className="space-y-3">
            {serviceRows.map((row, index) => (
              <div key={row.id} className="grid grid-cols-6 gap-4 items-center">
                <div style={{ gridColumn: 'span 4' }}>
                  <SearchableDropdown
                    value={row.service_id}
                    onChange={(val) => handleServiceChange(row.id, val)}
                    options={services.map(s => ({ value: s.id, label: s.service_name }))}
                    placeholder="Select Service"
                    displayKey="label"
                    valueKey="value"
                  />
                </div>
                <div style={{ gridColumn: 'span 1' }}>
                  <span className="text-xs text-muted">{index + 1}.</span>
                </div>
                <div style={{ gridColumn: 'span 1' }}>
                  {serviceRows.length > 1 && (
                    <button 
                      onClick={() => removeServiceRow(row.id)}
                      className="btn btn-ghost btn-sm"
                      style={{ color: '#f43f5e', fontSize: 12 }}
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Row 2 - Doctor and Staff */}
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
                <th style={{ width: 80 }}>Bill No</th>
                <th style={{ width: 120 }}>Patient</th>
                <th style={{ width: 100 }}>Date</th>
                <th style={{ width: 180 }}>Services</th>
                <th style={{ width: 80, textAlign: 'center' }}>Completed</th>
                <th style={{ width: 80, textAlign: 'center' }}>Pending</th>
                <th style={{ width: 100, textAlign: 'center' }}>Status</th>
                <th style={{ width: 200, textAlign: 'center' }}>Actions</th>
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
                  const counts = bill.serviceCounts || { total: 0, completed: 0, pending: 0 };
                  const status = bill.calculatedStatus;
                  const pendingServices = (bill.bill_services || []).filter(s => !s.consumable_completed);
                  
                  return (
                    <tr key={bill.id}>
                      <td style={{ fontWeight: 600, color: 'var(--color-primary)', whiteSpace: 'nowrap', verticalAlign: 'middle', cursor: 'pointer' }} onClick={() => handleViewBill(bill)}>
                        {bill.bill_no}
                      </td>
                      <td style={{ whiteSpace: 'nowrap', verticalAlign: 'middle' }}>{bill.patient_name || '-'}</td>
                      <td style={{ fontSize: 13 }}>{bill.service_date || '-'}</td>
                      <td style={{ fontSize: 13 }}>{bill.bill_services ? bill.bill_services.map(s => s.service_name).join(', ') : '-'}</td>
                      <td style={{ whiteSpace: 'nowrap', verticalAlign: 'middle', textAlign: 'center' }}>
                        <span style={{ color: '#065F46', fontWeight: 600 }}>{counts.completed}</span>
                      </td>
                      <td style={{ whiteSpace: 'nowrap', verticalAlign: 'middle', textAlign: 'center' }}>
                        <span style={{ color: '#991B1B', fontWeight: 600 }}>{counts.pending}</span>
                      </td>
                      <td style={{ textAlign: 'center', verticalAlign: 'middle' }}>{getStatusBadge(status)}</td>
                       <td style={{ textAlign: 'center', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                         <div style={{ display: 'flex', justifyContent: 'center', gap: 6, flexWrap: 'wrap' }}>
                           {/* View Button */}
                           <button 
                             onClick={() => handleViewBill(bill)}
                             className="btn btn-ghost btn-sm"
                             title="View Bill Details"
                             style={{ padding: '6px 8px' }}
                           >
                             <Eye size={16} />
                           </button>
                           
                           {/* Edit Bill Button */}
                           <button 
                             onClick={() => handleEditBill(bill)}
                             className="btn btn-ghost btn-sm"
                             title="Edit Bill"
                             style={{ padding: '6px 8px', color: 'var(--color-primary)' }}
                           >
                             <Pencil size={16} />
                           </button>
                           
                           {/* Add Consumables Button - only for Incomplete bills */}
                           {status === 'Incomplete' && pendingServices.length > 0 && (
                             <button 
                               onClick={() => {
                                 const firstPending = pendingServices[0];
                                 handleAddConsumables(bill, firstPending.id, firstPending.service_id, firstPending.service_name);
                               }}
                               className="btn btn-primary btn-sm"
                               title="Add Consumables"
                               style={{ padding: '6px 10px', fontSize: 12 }}
                             >
                               <FlaskConical size={14} style={{ marginRight: 4 }} />
                               Add Consumables
                             </button>
                           )}
                           
                           {/* History Button */}
                           <button 
                             onClick={() => handleViewHistory(bill)} 
                             className="btn btn-ghost btn-sm" 
                             style={{ padding: '6px 8px' }}
                             title="View History"
                           >
                             <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                               <circle cx="12" cy="12" r="10"/>
                               <polyline points="12 6 12 12 16 12"/>
                             </svg>
                           </button>
                         </div>
                       </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* View Bill Details Modal */}
      {viewData && (
        <div className="modal-overlay" onClick={() => setViewData(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '800px', width: '95%' }}>
            <div className="modal-header">
              <h3>Bill Details</h3>
              <button onClick={() => setViewData(null)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--color-muted)' }}>×</button>
            </div>
            <div className="modal-body">
              <div style={{ background: 'var(--color-tint-2)', padding: 16, borderRadius: 8, marginBottom: 20 }}>
                <div className="grid grid-cols-3 gap-3">
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
                    <div style={{ fontSize: 11, color: 'var(--color-muted)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.05em' }}>Date</div>
                    <div style={{ fontWeight: 600, marginTop: 2 }}>{viewData.bill.service_date}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--color-muted)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.05em' }}>Doctor</div>
                    <div style={{ fontWeight: 600, marginTop: 2 }}>{viewData.bill.master_doctors?.doctor_name || '-'}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--color-muted)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.05em' }}>Staff</div>
                    <div style={{ fontWeight: 600, marginTop: 2 }}>{viewData.bill.master_staff?.staff_name || '-'}</div>
                  </div>
                </div>
              </div>

              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: 'var(--color-ink)' }}>Services & Consumable Status</div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--color-muted)', textTransform: 'uppercase', borderBottom: '1px solid var(--color-line)', background: 'var(--color-tint-2)' }}>Service</th>
                    <th style={{ padding: '8px 12px', textAlign: 'center', fontSize: 11, fontWeight: 600, color: 'var(--color-muted)', textTransform: 'uppercase', borderBottom: '1px solid var(--color-line)', background: 'var(--color-tint-2)' }}>Consumable Status</th>
                    <th style={{ padding: '8px 12px', textAlign: 'center', fontSize: 11, fontWeight: 600, color: 'var(--color-muted)', textTransform: 'uppercase', borderBottom: '1px solid var(--color-line)', background: 'var(--color-tint-2)' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {billServices.map((bs) => (
                    <tr key={bs.id}>
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--color-line-2)', fontSize: 13 }}>{bs.service_name}</td>
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--color-line-2)', textAlign: 'center' }}>
                        {bs.consumable_completed ? getStatusBadge('Complete') : getStatusBadge('Pending')}
                      </td>
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--color-line-2)', textAlign: 'center' }}>
                        {bs.consumable_completed ? (
                          <button 
                            onClick={() => handleEditConsumables(viewData.bill, bs.id, bs.service_id, bs.service_name)} 
                            className="btn btn-outline btn-sm"
                            style={{ border: '1px solid var(--color-primary)', color: 'var(--color-primary)' }}
                          >
                            Edit
                          </button>
                        ) : (
                          <button 
                            onClick={() => handleAddConsumables(viewData.bill, bs.id, bs.service_id, bs.service_name)} 
                            className="btn btn-primary btn-sm"
                          >
                            Add Consumables
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="modal-footer">
              <button onClick={() => setViewData(null)} className="btn btn-secondary">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* History Modal */}
      {showHistoryModal && (
        <div className="modal-overlay" onClick={() => setShowHistoryModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '700px' }}>
            <div className="modal-header">
              <h3>Change History</h3>
              <button onClick={() => setShowHistoryModal(false)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--color-muted)' }}>×</button>
            </div>
            <div className="modal-body">
              {historyLoading ? (
                <div style={{ textAlign: 'center', padding: '40px' }}>Loading history...</div>
              ) : (
                <>
                  {/* Audit History */}
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: 'var(--color-ink)' }}>Audit Trail (Record Changes)</div>
                    {historyData.audit.length === 0 ? (
                      <div style={{ fontSize: 12, color: 'var(--color-muted)', padding: 12 }}>No record changes found</div>
                    ) : (
                      <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ background: 'var(--color-tint-2)' }}>
                            <th style={{ padding: '6px 8px', textAlign: 'left' }}>Date</th>
                            <th style={{ padding: '6px 8px', textAlign: 'left' }}>User</th>
                            <th style={{ padding: '6px 8px', textAlign: 'left' }}>Action</th>
                            <th style={{ padding: '6px 8px', textAlign: 'left' }}>Module</th>
                          </tr>
                        </thead>
                        <tbody>
                          {historyData.audit.map((h, i) => (
                            <tr key={i} style={{ borderBottom: '1px solid var(--color-line-2)' }}>
                              <td style={{ padding: '6px 8px' }}>{h.created_at ? new Date(h.created_at).toLocaleString('en-GB') : '-'}</td>
                              <td style={{ padding: '6px 8px' }}>{h.username || '-'}</td>
                              <td style={{ padding: '6px 8px' }}>{h.action_type}</td>
                              <td style={{ padding: '6px 8px' }}>{h.module_name || '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>

                  {/* Activity History */}
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: 'var(--color-ink)' }}>Activity Log (Page Actions)</div>
                    {historyData.activity.length === 0 ? (
                      <div style={{ fontSize: 12, color: 'var(--color-muted)', padding: 12 }}>No activity found</div>
                    ) : (
                      <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ background: 'var(--color-tint-2)' }}>
                            <th style={{ padding: '6px 8px', textAlign: 'left' }}>Date</th>
                            <th style={{ padding: '6px 8px', textAlign: 'left' }}>User</th>
                            <th style={{ padding: '6px 8px', textAlign: 'left' }}>Action</th>
                            <th style={{ padding: '6px 8px', textAlign: 'left' }}>Remarks</th>
                          </tr>
                        </thead>
                        <tbody>
                          {historyData.activity.map((h, i) => (
                            <tr key={i} style={{ borderBottom: '1px solid var(--color-line-2)' }}>
                              <td style={{ padding: '6px 8px' }}>{h.created_at ? new Date(h.created_at).toLocaleString('en-GB') : '-'}</td>
                              <td style={{ padding: '6px 8px' }}>{h.username || '-'}</td>
                              <td style={{ padding: '6px 8px' }}>{h.action}</td>
                              <td style={{ padding: '6px 8px' }}>{h.remarks || '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </>
              )}
            </div>
            <div className="modal-footer">
              <button onClick={() => setShowHistoryModal(false)} className="btn btn-secondary">Close</button>
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