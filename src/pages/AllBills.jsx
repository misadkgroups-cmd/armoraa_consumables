import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../config/supabase';
import { useBranch } from '../context/BranchContext';
import { Eye, Pencil, Trash2 } from 'lucide-react';
import SearchableDropdown from '../components/SearchableDropdown';
import * as auditApi from '../services/auditApi';
import AuditTimelineModal from '../components/AuditTimelineModal';
import BillDetailsModal from '../components/BillDetailsModal';

const STATUS_BADGE = {
  Complete: { bg: '#D1FAE5', color: '#065F46', border: '#A7F3D0' },
  Incomplete: { bg: '#FEE2E2', color: '#991B1B', border: '#FECACA' },
  Pending: { bg: '#FEF3C7', color: '#92400E', border: '#FDE68A' },
};

const FIELD_LABEL = {
  fontSize: '11px',
  fontWeight: 600,
  color: '#475569',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
};

export default function AllBills({ onNavigate, urlState }) {
  const { branchId, misMode } = useBranch();
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showViewModal, setShowViewModal] = useState(false);
  const [viewData, setViewData] = useState(null);
  const [billServices, setBillServices] = useState([]);
  const [consumableCounts, setConsumableCounts] = useState({});
  const [toast, setToast] = useState(null);
  const [selectedDate, setSelectedDate] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [refreshToken, setRefreshToken] = useState(0);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [editingBillId, setEditingBillId] = useState(null);
  const [services, setServices] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [staff, setStaff] = useState([]);
  const [formData, setFormData] = useState({
    bill_no: '',
    uid: '',
    patient_name: '',
    rendering_doctor_id: '',
    staff_id: '',
    service_date: new Date().toISOString().split('T')[0],
  });
  const [formErrors, setFormErrors] = useState({});
  const [serviceRows, setServiceRows] = useState([]);

  // Listen for refresh flag from BillableConsumables
  useEffect(() => {
    const checkRefresh = () => {
      const flag = localStorage.getItem('forceRefreshBills');
      if (flag) {
        localStorage.removeItem('forceRefreshBills');
        setRefreshToken(Date.now());
      }
    };
    
    const interval = setInterval(checkRefresh, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (branchId) {
      fetchAllBills();
      fetchServices();
      fetchDoctors();
      fetchStaff();
    }
  }, [branchId, selectedDate, statusFilter, refreshToken]);

  useEffect(() => {
    if (serviceRows.length === 0) {
      setServiceRows([{ id: Date.now(), service_id: '', service_name: '' }]);
    }
  }, [serviceRows]);

  // Check URL for edit parameter
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const editBillId = params.get('edit');
    if (editBillId && bills.length > 0) {
      const billToEdit = bills.find(b => b.id === Number(editBillId));
      if (billToEdit) {
        handleEditBill(billToEdit);
        window.history.replaceState({}, '', window.location.pathname);
      }
    }
  }, [bills]);

  // Auto-open the bill details popup when returning from Billable Consumables
  // (urlState.openBillDetails is set after a successful consumable save).
  useEffect(() => {
    if (urlState?.openBillDetails && urlState?.highlightBill && bills.length > 0) {
      const billToOpen = bills.find(b => b.id === Number(urlState.highlightBill));
      if (billToOpen) {
        handleViewBill(billToOpen);
      }
    }
  }, [urlState, bills]);

  const showToast = (type, message) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3000);
  };

  const calculateBillStatus = (services) => {
    if (!services || services.length === 0) return 'Incomplete';
    const hasPending = services.some(s => !s.consumable_completed);
    return hasPending ? 'Incomplete' : 'Complete';
  };

  const getServiceCounts = (services) => {
    if (!services || services.length === 0) return { total: 0, completed: 0, pending: 0, percentage: 0 };
    const total = services.length;
    const completed = services.filter(s => s.consumable_completed).length;
    return { total, completed, pending: total - completed, percentage: total > 0 ? Math.round((completed / total) * 100) : 0 };
  };

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

  const fetchAllBills = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('billing_log')
        .select(`
          *,
          master_doctors(doctor_name),
          master_staff(staff_name),
          bill_services(id, service_id, service_name, consumable_completed, service_status)
        `)
        .order('created_at', { ascending: false });
      if (branchId) query = query.eq('branch_id', branchId);
      if (selectedDate) query = query.eq('service_date', selectedDate);

      const { data, error } = await query;
      if (error) throw error;
      
      const billsWithCounts = (data || []).map(bill => {
        const counts = getServiceCounts(bill.bill_services);
        return {
          ...bill,
          serviceCounts: counts,
          calculatedStatus: calculateBillStatus(bill.bill_services),
        };
      });
      
      let filteredBills = billsWithCounts;
      if (statusFilter && statusFilter !== 'All') {
        filteredBills = billsWithCounts.filter(b => b.calculatedStatus === statusFilter);
      }
      
      setBills(filteredBills);
    } catch (error) {
      console.error('Error fetching all bills:', error);
      showToast('error', 'Failed to fetch bills');
    } finally {
      setLoading(false);
    }
  };

  const handleViewBill = (bill) => {
    const services = bill.bill_services || [];
    setBillServices(services);
    setViewData({ bill, viewMode: 'details' });
    setShowViewModal(true);
    fetchConsumableCounts(services);
  };

  // Refresh bill services after an embedded consumable save (keeps popup open).
  // Accepts an optional savedInfo payload from the embedded editor so the caller
  // can pass context (billId, serviceId, billServiceId) if needed for targeted updates.
  // Wrapped in useCallback so the BillDetailsModal can memoise its onSaveComplete handler.
  const refreshBillServices = useCallback(async (savedInfo) => {
    if (!viewData?.bill?.id) return;
    try {
      // Re-fetch latest service status (consumable_completed, service_status) from DB
      const { data: services, error } = await supabase
        .from('bill_services')
        .select('id, service_id, service_name, consumable_completed, service_status')
        .eq('bill_id', viewData.bill.id);

      if (error) {
        console.error('Error refreshing bill services:', error);
        return;
      }

      const updatedServices = services || [];
      // Update local state — this drives the table and the progress summary in the modal.
      setBillServices(updatedServices);
      // Re-fetch consumable counts for the refreshed services.
      fetchConsumableCounts(updatedServices);
    } catch (error) {
      console.error('Error refreshing bill services:', error);
    }
  }, [viewData?.bill?.id]);
  const handleViewHistory = (bill) => {
    setViewData({ bill, viewMode: 'history' });
    setShowHistoryModal(true);
  };

  // Navigate straight to the Billable Consumables page for a service.
  // All bill/service context is passed via urlState so BillableConsumables
  // auto-loads the selected bill, UID, service, date and machinery.
  const handleViewConsumables = (bill, bs) => {
    setShowViewModal(false);
    setViewData(null);
    setBillServices([]);
    if (onNavigate) {
      onNavigate('billable', {
        bill_no: bill.bill_no,
        uid: bill.uid || '',
        service_id: bs.service_id,
        service_name: bs.service_name,
        service_date: bill.service_date,
        billing_log_id: bill.id,
        bill_service_id: bs.id,
      });
    } else {
      const url = `/billable-consumables?bill_no=${encodeURIComponent(bill.bill_no)}&uid=${encodeURIComponent(bill.uid || '')}&service_date=${bill.service_date}&billing_log_id=${bill.id}&bill_service_id=${bs.id}&service_id=${bs.service_id}&service_name=${encodeURIComponent(bs.service_name)}`;
      window.history.pushState({}, '', url);
      window.location.reload();
    }
  };

  const fetchConsumableCounts = async (services) => {
    if (!services || services.length === 0) return;
    try {
      const billServiceIds = services.map(s => s.id);
      const { data: counts, error } = await supabase
        .from('bill_service_consumables')
        .select('bill_service_id, id')
        .in('bill_service_id', billServiceIds)
        .eq('status', 'Used');
      
      if (error) {
        console.error('Error fetching consumable counts:', error);
        return;
      }

      const countMap = {};
      (counts || []).forEach(bsc => {
        countMap[bsc.bill_service_id] = (countMap[bsc.bill_service_id] || 0) + 1;
      });

      const result = {};
      services.forEach(s => {
        result[s.id] = countMap[s.id] || 0;
      });
      setConsumableCounts(result);
    } catch (error) {
      console.error('Error in fetchConsumableCounts:', error);
    }
  };

  const handleEditBill = (bill) => {
    setEditingBillId(bill.id);
    setFormData({
      bill_no: bill.bill_no,
      uid: bill.uid || '',
      patient_name: bill.patient_name,
      rendering_doctor_id: bill.doctor_id || '',
      staff_id: bill.staff_id || '',
      service_date: bill.service_date,
    });
    // Load existing services
    if (bill.bill_services && bill.bill_services.length > 0) {
      const rows = bill.bill_services.map((bs, idx) => ({
        id: bs.id || Date.now() + idx,
        service_id: String(bs.service_id),
        service_name: bs.service_name,
      }));
      setServiceRows(rows);
    } else {
      setServiceRows([{ id: Date.now(), service_id: '', service_name: '' }]);
    }
    setFormErrors({});
    showToast('info', 'Edit mode enabled. Make changes and click Save Bill.');
  };

  const cancelEdit = () => {
    setEditingBillId(null);
    resetForm();
  };

  // Edit must happen on the Billing Log entry page, NOT inline here in Detailed Log.
  // Navigate to Billing Log in edit mode for the selected bill.
  const handleEditInBillingLog = (bill) => {
    if (onNavigate) {
      onNavigate('billing-log', { edit_bill_id: String(bill.id) });
    } else {
      // Standalone fallback: full reload directly onto Billing Log with the edit param
      window.location.href = `/billing-log?edit_bill_id=${bill.id}`;
    }
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

    // Check duplicate bill number (skip if editing same bill)
    const duplicate = bills.find(b => b.bill_no === formData.bill_no.trim() && (!editingBillId || b.id !== editingBillId));
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
      const isEdit = !!editingBillId;
      
      if (isEdit) {
        // Update existing bill
        const billPayload = {
          bill_no: formData.bill_no.trim(),
          uid: formData.uid.trim() || null,
          patient_name: formData.patient_name.trim(),
          doctor_id: formData.rendering_doctor_id ? parseInt(formData.rendering_doctor_id) : null,
          staff_id: formData.staff_id ? parseInt(formData.staff_id) : null,
          service_date: formData.service_date,
          branch_id: branchId,
        };

        const { error: updateError } = await supabase
          .from('billing_log')
          .update(billPayload)
          .eq('id', editingBillId);
        if (updateError) throw updateError;

        // Delete existing bill_services and recreate
        // NOTE: The delete must succeed before inserting the new rows, otherwise
        // the removed services would stay in the DB alongside the recreated ones
        // (making each "remove service" edit INCREASE the service count).
        // First remove child consumable rows so FK constraints cannot block the delete,
        // then fail hard if either delete/insert fails.
        const { data: existingServices, error: fetchSvcError } = await supabase
          .from('bill_services')
          .select('id')
          .eq('bill_id', editingBillId);
        if (fetchSvcError) throw fetchSvcError;

        const existingServiceIds = (existingServices || []).map(bs => bs.id);
        if (existingServiceIds.length > 0) {
          const { error: bscDeleteError } = await supabase
            .from('bill_service_consumables')
            .delete()
            .in('bill_service_id', existingServiceIds);
          if (bscDeleteError) throw bscDeleteError;

          const { error: servicesDeleteError } = await supabase
            .from('bill_services')
            .delete()
            .in('id', existingServiceIds);
          if (servicesDeleteError) throw servicesDeleteError;
        }

        // Create new bill_services
        const billServicesPayload = serviceRows.map(row => ({
          bill_id: editingBillId,
          service_id: parseInt(row.service_id),
          service_name: row.service_name,
          service_status: 'Pending',
          consumable_completed: false,
        }));

        const { error: servicesError } = await supabase.from('bill_services').insert(billServicesPayload);
        if (servicesError) throw servicesError;

        const username = localStorage.getItem('username') || 'System';
        // Log activity for bill update (production activity_logs: username,
        // branch_name, page_name, action, remarks)
        await auditApi.logActivity({
          userName: username,
          branchName: `Branch ${branchId}`,
          pageName: 'billing_log',
          action: 'edited',
          remarks: `Updated Bill #${formData.bill_no}`
        });
        // Per-bill audit trail (drives the Audit Trail modal)
        await supabase.from('bill_history').insert({
          bill_id: editingBillId,
          username,
          action_type: 'UPDATE',
          field_name: 'bill',
          new_value: `Updated Bill #${formData.bill_no}`
        });
        // Field-level audit log (audit_logs table)
        await auditApi.logAudit({
          username,
          branchName: `Branch ${branchId}`,
          moduleName: 'billing_log',
          actionType: 'UPDATE',
          tableName: 'billing_log',
          recordId: editingBillId,
          oldData: { bill_no: billPayload.bill_no },
          newData: billPayload
        });

        showToast('success', 'Bill updated successfully');
        setEditingBillId(null);
        resetForm();
        fetchAllBills();
      } else {
        // Create new bill
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

        const username = localStorage.getItem('username') || 'System';
        // Log activity for bill creation (production activity_logs schema)
        await auditApi.logActivity({
          userName: username,
          branchName: `Branch ${branchId}`,
          pageName: 'billing_log',
          action: 'created',
          remarks: `Created Bill #${formData.bill_no}`
        });
        // Per-bill audit trail (drives the Audit Trail modal)
        // Real-time lifecycle logging: genuine Created event timestamped NOW().
        await supabase.from('bill_history').insert({
          bill_id: billData.id,
          username,
          action_type: 'CREATE',
          field_name: 'bill',
          new_value: `Created Bill #${formData.bill_no}`,
          created_at: new Date().toISOString()
        });

        // Field-level audit log (audit_logs table)
        await auditApi.logAudit({
          username,
          branchName: `Branch ${branchId}`,
          moduleName: 'billing_log',
          actionType: 'CREATE',
          tableName: 'billing_log',
          recordId: billData.id,
          newData: billPayload
        });

        showToast('success', 'Bill created successfully');
        resetForm();
        fetchAllBills();
      }
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

  const handleDeleteBill = async (bill) => {
    if (!window.confirm(`Delete bill #${bill.bill_no} for ${bill.patient_name}? This action cannot be undone.`)) return;
    
    try {
      // Delete all child records first in the correct order
      // Step 1: Delete activity and audit logs (no FK constraints)
      await supabase.from('activity_logs').delete().eq('page_name', 'billing_log');
      await supabase.from('audit_logs').delete().eq('record_id', bill.id).eq('table_name', 'billing_log');

      // Step 2: Delete bill_service_consumables (child of bill_services)
      const { data: billServices } = await supabase
        .from('bill_services')
        .select('id')
        .eq('bill_id', bill.id);
      
      if (billServices && billServices.length > 0) {
        const bscIds = billServices.map(bs => bs.id);
        await supabase
          .from('bill_service_consumables')
          .delete()
          .in('bill_service_id', bscIds);
      }

      // Step 3: Delete bill_services (child of billing_log)
      await supabase
        .from('bill_services')
        .delete()
        .eq('bill_id', bill.id);

      // Step 4: Delete billable_report (child of billing_log)
      await supabase
        .from('billable_report')
        .delete()
        .eq('billing_log_id', bill.id);

      // Step 5: Delete bill_history (child of billing_log)
      await supabase
        .from('bill_history')
        .delete()
        .eq('bill_id', bill.id);

      // Step 6: Finally delete the main billing_log record
      const { error: billError } = await supabase.from('billing_log').delete().eq('id', bill.id);
      if (billError) {
        console.error('Final delete error:', billError);
        throw new Error(`Failed to delete billing_log: ${billError.message}`);
      }

      showToast('success', `Bill #${bill.bill_no} deleted successfully`);
      fetchAllBills();
    } catch (error) {
      console.error('Error deleting bill:', error);
      showToast('error', `Failed to delete bill: ${error.message}`);
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
      {/* Page Header with Date Filter */}
      <div className="page-header">
        <div className="page-header-left">
          <h1>Detailed Log</h1>
          <p>View all saved billing records with service completion status</p>
        </div>
        <div className="page-header-actions">
          {onNavigate && (
            <button onClick={() => onNavigate('billing-log')} className="btn btn-outline btn-sm">
              ← Back to Billing Log
            </button>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-muted)' }}>Date:</label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="form-input"
              style={{ height: 36, width: 'auto' }}
            />
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button 
              onClick={() => setStatusFilter('All')} 
              className={`btn btn-sm ${statusFilter === 'All' ? 'btn-primary' : 'btn-secondary'}`}
            >
              All
            </button>
            <button 
              onClick={() => setStatusFilter('Complete')} 
              className={`btn btn-sm ${statusFilter === 'Complete' ? 'btn-primary' : 'btn-secondary'}`}
            >
              Complete
            </button>
            <button 
              onClick={() => setStatusFilter('Incomplete')} 
              className={`btn btn-sm ${statusFilter === 'Incomplete' ? 'btn-primary' : 'btn-secondary'}`}
            >
              Incomplete
            </button>
          </div>
          <button onClick={fetchAllBills} className="btn btn-secondary btn-sm">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
            Refresh
          </button>
        </div>
      </div>

      {/* Bill Form - New or Edit Mode */}
      {editingBillId && (
        <div className="card" style={{ background: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 1px 2px rgba(0,0,0,0.05)', marginBottom: 20 }}>
          <div className="card-header" style={{ marginBottom: 16, paddingBottom: 12, borderBottom: '1px solid var(--color-line-2)' }}>
            <div>
              <div className="card-title">Edit Bill</div>
              <div className="card-subtitle">Update bill details below</div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={cancelEdit} className="btn btn-secondary btn-sm">
                Cancel
              </button>
              <button onClick={handleSaveBill} className="btn btn-primary">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><polyline points="20 6 9 17 4 12"/></svg>
                Update Bill
              </button>
            </div>
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
            <label style={{ ...FIELD_LABEL, marginBottom: 8 }}>Services <span style={{ color: '#EF4444' }}>*</span></label>
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
                    {index === serviceRows.length - 1 && (
                      <button 
                        onClick={addServiceRow} 
                        className="btn btn-ghost btn-sm"
                        style={{ fontSize: 12, whiteSpace: 'nowrap' }}
                      >
                        + Add Service
                      </button>
                    )}
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
      )}

      {/* Main Table */}
      <div className="table-container">
        <table>
            <thead>
              <tr>
                <th style={{ width: 80 }}>Bill No</th>
                <th style={{ width: 100 }}>UID</th>
                <th style={{ width: 120 }}>Patient Name</th>
                <th style={{ width: 100 }}>Service Date</th>
                <th style={{ width: 120 }}>Doctor Name</th>
                <th style={{ width: 120 }}>Staff Name</th>
                <th style={{ width: 80, textAlign: 'center' }}>Total Services</th>
                <th style={{ width: 80, textAlign: 'center' }}>Completed</th>
                <th style={{ width: 80, textAlign: 'center' }}>Pending</th>
                <th style={{ width: 100, textAlign: 'center' }}>Status</th>
                <th style={{ width: 240, textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan="11" style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--color-muted)' }}>
                  <div className="animate-pulse">Loading bills...</div>
                </td>
              </tr>
            ) : bills.length === 0 ? (
              <tr>
                <td colSpan="11" style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--color-muted)' }}>
                  No bills found
                </td>
              </tr>
            ) : (
              bills.map((bill) => {
                const counts = bill.serviceCounts || { total: 0, completed: 0, pending: 0, percentage: 0 };
                const status = bill.calculatedStatus;
                
                return (
                  <tr key={bill.id} style={{ cursor: 'pointer' }} onClick={() => handleViewBill(bill)}>
                    <td style={{ fontWeight: 600, color: 'var(--color-primary)', whiteSpace: 'nowrap', verticalAlign: 'middle' }}>
                      {bill.bill_no}
                    </td>
                    <td style={{ whiteSpace: 'nowrap', verticalAlign: 'middle', fontSize: 13 }}>{bill.uid || '-'}</td>
                    <td style={{ whiteSpace: 'nowrap', verticalAlign: 'middle' }}>{bill.patient_name || '-'}</td>
                    <td style={{ fontSize: 13 }}>{bill.service_date || '-'}</td>
                    <td style={{ whiteSpace: 'nowrap', verticalAlign: 'middle', fontSize: 13 }}>{bill.master_doctors?.doctor_name || '-'}</td>
                    <td style={{ whiteSpace: 'nowrap', verticalAlign: 'middle', fontSize: 13 }}>{bill.master_staff?.staff_name || '-'}</td>
                    <td style={{ whiteSpace: 'nowrap', verticalAlign: 'middle', textAlign: 'center', fontSize: 13, fontWeight: 600 }}>
                      {counts.total || 0}
                    </td>
                    <td style={{ whiteSpace: 'nowrap', verticalAlign: 'middle', textAlign: 'center' }}>
                      <span style={{ color: '#065F46', fontWeight: 600 }}>{counts.completed}</span>
                    </td>
                    <td style={{ whiteSpace: 'nowrap', verticalAlign: 'middle', textAlign: 'center' }}>
                      <span style={{ color: '#991B1B', fontWeight: 600 }}>{counts.pending}</span>
                    </td>
                    <td style={{ textAlign: 'center', verticalAlign: 'middle' }}>{getStatusBadge(status)}</td>
                     <td style={{ textAlign: 'center', verticalAlign: 'middle', whiteSpace: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
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
                         
                         {/* Edit Button - navigates to Billing Log edit mode */}
                         <button
                           onClick={() => handleEditInBillingLog(bill)}
                           className="btn btn-ghost btn-sm"
                           title="Edit Bill"
                           style={{ padding: '6px 8px', color: 'var(--color-primary)' }}
                         >
                           <Pencil size={16} />
                         </button>
                         
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

                         {/* Delete Button - MIS only */}
                         {misMode && (
                           <button
                             onClick={() => handleDeleteBill(bill)}
                             className="btn btn-sm"
                             style={{
                               background: '#FEE2E2',
                               color: '#991B1B',
                               border: '1px solid #FECACA',
                               padding: '6px 8px',
                             }}
                             title="Delete bill"
                           >
                             <Trash2 size={16} />
                           </button>
                         )}
                       </div>
                     </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Bill Details Modal - Reuse same component as Billing Log */}
      {showViewModal && viewData && (
        <BillDetailsModal
          bill={viewData.bill}
          billServices={billServices}
          consumableCounts={consumableCounts}
          onClose={() => {
            setShowViewModal(false);
            setViewData(null);
            setBillServices([]);
          }}
          onRefreshServices={refreshBillServices}
          onViewConsumables={handleViewConsumables}
        />
      )}

      {/* Audit Timeline Modal */}
      {showHistoryModal && viewData && (
        <AuditTimelineModal
          isOpen={showHistoryModal}
          onClose={() => {
            setShowHistoryModal(false);
            setViewData(null);
          }}
          recordId={viewData.bill.id}
          tableName="billing_log"
        />
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