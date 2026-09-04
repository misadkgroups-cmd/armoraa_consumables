import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../config/supabase';
import { useBranch } from '../context/BranchContext';
import SearchableDropdown from '../components/SearchableDropdown';
import { Eye, Pencil, Trash2 } from 'lucide-react';
import * as auditApi from '../services/auditApi';
import AuditTimelineModal from '../components/AuditTimelineModal';
import BillDetailsModal from '../components/BillDetailsModal';
import { getTodayLocal, formatDateDisplay } from '../utils/dateUtils';
import { withBase } from '../utils/navigation';

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

export default function BillingLog({ onNavigate, urlState }) {
  const { branchId, misMode } = useBranch();
  const [bills, setBills] = useState([]);
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewData, setViewData] = useState(null);
  const [billServices, setBillServices] = useState([]);
  const [consumableCounts, setConsumableCounts] = useState({});
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
    service_date: getTodayLocal(),
  });
  const [formErrors, setFormErrors] = useState({});
  
  // Multiple services array
  const [serviceRows, setServiceRows] = useState([]);

  // Edit mode
  const [editingBillId, setEditingBillId] = useState(null);

  // Filters
  const [filters, setFilters] = useState({
    bill_no: '',
    uid: '',
    patient_name: '',
    service_date: '',
    status: 'All',
  });

  // History modal state
  const [showHistoryModal, setShowHistoryModal] = useState(false);


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

  // Initialize with one service row
  useEffect(() => {
    if (serviceRows.length === 0) {
      setServiceRows([{ id: Date.now(), service_id: '', service_name: '' }]);
    }
  }, [serviceRows]);

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

  // --- UID auto-fill: when an existing UID is entered, fetch the patient's
  // name and most recent services from billing_log and pre-fill the form. ---
  const lastUidLookupRef = useRef('');
  const uidLookupInProgressRef = useRef(false);

  const handleUidLookup = async (uidRaw) => {
    const uid = (uidRaw || '').trim();
    if (!uid || editingBillId || !branchId) return;
    if (lastUidLookupRef.current === uid || uidLookupInProgressRef.current) return;
    lastUidLookupRef.current = uid;
    uidLookupInProgressRef.current = true;
    try {
      const { data, error } = await supabase
        .from('billing_log')
        .select(`
          id, patient_name,
          bill_services(service_id, service_name)
        `)
        .eq('uid', uid)
        .eq('branch_id', branchId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;

      if (data) {
        setFormData(prev => ({
          ...prev,
          patient_name: data.patient_name || prev.patient_name,
        }));

        if (data.bill_services && data.bill_services.length > 0) {
          setServiceRows(data.bill_services.map((bs, i) => ({
            id: Date.now() + i,
            service_id: String(bs.service_id),
            service_name: bs.service_name || '',
          })));
        }

      }
    } catch (e) {
      console.error('UID lookup failed:', e);
    } finally {
      uidLookupInProgressRef.current = false;
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

        // Sync bill_services with the form WITHOUT wiping existing data.
        // Previously EVERY edit deleted all bill_services (and their child
        // bill_service_consumables) and recreated them — so simply changing
        // the date of service reset the bill to Incomplete and destroyed all
        // saved consumables. Now we diff: reuse matching services (preserving
        // consumables/status), remove deleted ones, insert new ones.
        const { data: existingServices, error: fetchSvcError } = await supabase
          .from('bill_services')
          .select('id, service_id')
          .eq('bill_id', editingBillId);
        if (fetchSvcError) throw fetchSvcError;

        // Match each form row to an existing service with the same service_id
        // (each existing row can only be reused once, to support duplicates).
        const reusable = [...(existingServices || [])];
        const usedExistingIds = new Set();
        const addedRows = [];
        serviceRows.forEach((row) => {
          const match = reusable.find(bs => bs.service_id === parseInt(row.service_id) && !usedExistingIds.has(bs.id));
          if (match) usedExistingIds.add(match.id);
          else addedRows.push(row);
        });

        // Remove services deleted from the form (and their child consumables)
        const removedIds = reusable.filter(bs => !usedExistingIds.has(bs.id)).map(bs => bs.id);
        if (removedIds.length > 0) {
          const { error: bscDeleteError } = await supabase
            .from('bill_service_consumables')
            .delete()
            .in('bill_service_id', removedIds);
          if (bscDeleteError) throw bscDeleteError;

          const { error: servicesDeleteError } = await supabase
            .from('bill_services')
            .delete()
            .in('id', removedIds);
          if (servicesDeleteError) throw servicesDeleteError;
        }

        // Insert only genuinely NEW services
        if (addedRows.length > 0) {
          const billServicesPayload = addedRows.map(row => ({
            bill_id: editingBillId,
            service_id: parseInt(row.service_id),
            service_name: row.service_name,
            service_status: 'Pending',
            consumable_completed: false,
          }));
          const { error: servicesError } = await supabase.from('bill_services').insert(billServicesPayload);
          if (servicesError) throw servicesError;
        }

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
          newData: billPayload
        });

        showToast('success', 'Bill updated successfully');

        // If this edit was started from the Detailed Log page, send the user
        // straight back there. Their date/status filters are persisted in
        // sessionStorage, so the view is exactly as they left it.
        if (editReturnToRef.current === 'all-bills' && onNavigate) {
          editReturnToRef.current = null;
          editRequestHandledRef.current = null;
          onNavigate('all-bills', {});
          return;
        }
        editReturnToRef.current = null;

        setEditingBillId(null);
        resetForm();
        fetchBills();
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
        fetchBills();
        
        // Scroll to Show All Bills button after saving
        setTimeout(() => {
          const btn = document.querySelector('.btn-outline');
          if (btn) btn.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
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
      service_date: getTodayLocal(),
    });
    lastUidLookupRef.current = '';
    setServiceRows([{ id: Date.now(), service_id: '', service_name: '' }]);
    setFormErrors({});
  };

  // Clear button: instantly wipe the bill form (exits edit mode too)
  const handleClearForm = () => {
    setEditingBillId(null);
    resetForm();
    showToast('success', 'Form cleared');
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
      window.history.pushState({}, '', withBase(url));
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
      window.history.pushState({}, '', withBase(url));
      window.location.reload();
    }
  };

  // Fetch consumable counts per bill_service (used for the progress display)
  const fetchConsumableCounts = async (servicesList) => {
    if (!servicesList || servicesList.length === 0) return;
    try {
      const serviceIds = servicesList.map(s => s.id);
      const { data: counts, error } = await supabase
        .from('bill_service_consumables')
        .select('bill_service_id, id')
        .in('bill_service_id', serviceIds)
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
      servicesList.forEach(s => {
        result[s.id] = countMap[s.id] || 0;
      });
      setConsumableCounts(result);
    } catch (error) {
      console.error('Error in fetchConsumableCounts:', error);
    }
  };

  // Refresh bill services after an embedded consumable save (keeps popup open).
  // Accepts an optional savedInfo payload from the embedded editor.
  // Memoised with useCallback so the BillDetailsModal can memoise its onSaveComplete handler.
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
      fetchConsumableCounts(services || []);
    } catch (error) {
      console.error('Error fetching bill services:', error);
      showToast('error', 'Failed to fetch bill details');
    }
  };

  // Edit bill - load bill data into form for editing
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
    const wasFromDetailedLog = editReturnToRef.current === 'all-bills';
    setEditingBillId(null);
    resetForm();
    editReturnToRef.current = null;
    // Returning to the page the edit was started from (Detailed Log)
    if (wasFromDetailedLog && onNavigate) onNavigate('all-bills', {});
  };

  // View history for a bill
  const handleViewHistory = (bill) => {
    setViewData({ bill, viewMode: 'history' });
    setShowHistoryModal(true);
  };

  // Navigate directly to the Billable Consumables page for a service.
  // All bill/service context is passed via urlState so the page auto-loads.
  const handleViewConsumables = (bill, bs) => {
    setViewData(null);
    setBillServices([]);
    setConsumableCounts({});
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
      window.history.pushState({}, '', withBase(url));
      window.location.reload();
    }
  };

  // Delete bill with explicit cascading deletes
  const handleDeleteBill = async (bill) => {
    if (!window.confirm(`Delete bill #${bill.bill_no} for ${bill.patient_name}? This action cannot be undone.`)) return;
    
    try {
      // Step 1: Delete activity and audit logs first (no FK constraints)
      const { error: alError } = await supabase.from('activity_logs').delete().eq('page_name', 'billing_log');
      if (alError) console.warn('Warning deleting activity logs:', alError);

      const { error: auditError } = await supabase.from('audit_logs').delete().eq('record_id', bill.id).eq('table_name', 'billing_log');
      if (auditError) console.warn('Warning deleting audit logs:', auditError);

      // Step 2: Get all bill_services IDs for this bill
      const { data: billServices, error: bsError } = await supabase
        .from('bill_services')
        .select('id')
        .eq('bill_id', bill.id);
      
      if (bsError) console.warn('Warning fetching bill_services:', bsError);

      // Step 3: Delete bill_service_consumables first (child of bill_services)
      if (billServices && billServices.length > 0) {
        const bscIds = billServices.map(bs => bs.id);
        const { error: bscError } = await supabase
          .from('bill_service_consumables')
          .delete()
          .in('bill_service_id', bscIds);
        if (bscError) console.warn('Warning deleting bill_service_consumables:', bscError);
      }

      // Step 4: Delete bill_services
      const { error: deleteBsError } = await supabase
        .from('bill_services')
        .delete()
        .eq('bill_id', bill.id);
      if (deleteBsError) console.warn('Warning deleting bill_services:', deleteBsError);

      // Step 5: Delete billable_report entries linked to this billing_log
      const { error: brError } = await supabase
        .from('billable_report')
        .delete()
        .eq('billing_log_id', bill.id);
      if (brError) console.warn('Warning deleting billable_report:', brError);

      // Step 6: Delete bill_history entries
      const { error: bhError } = await supabase
        .from('bill_history')
        .delete()
        .eq('bill_id', bill.id);
      if (bhError) console.warn('Warning deleting bill_history:', bhError);

      // Step 7: Finally delete the main billing_log record
      const { error: billError } = await supabase.from('billing_log').delete().eq('id', bill.id);
      if (billError) throw billError;

      showToast('success', `Bill #${bill.bill_no} deleted successfully`);
      fetchBills();
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

  // One-shot guard: never re-open edit mode for the same request. Without this,
  // every bills-list refresh (save, filter change) re-fires handleEditBill and
  // resets the form — wiping the user's selected service date back to the
  // stored value while they are mid-edit.
  const editRequestHandledRef = useRef(null);
  // Where to navigate back to after the user updates the edited bill
  // ('all-bills' when the edit was started from the Detailed Log page).
  const editReturnToRef = useRef(null);

  // Check for an incoming "edit this bill" request AFTER handleEditBill is defined.
  // Sources:
  //   (a) SPA navigation from Detailed Log: onNavigate('billing-log', { edit_bill_id })
  //       arrives as the `urlState` prop (window.location.search can lag behind on
  //       client-side navigation, so the prop is checked first),
  //   (b) legacy URL param ?edit=<bill_no> (matched against loaded bills),
  //   (c) URL param ?edit_bill_id=<id> from a full-page load.
  // The request is always cleared after being consumed so revisiting the page
  // never re-opens edit mode unexpectedly.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const stateId = urlState && urlState.edit_bill_id ? Number(urlState.edit_bill_id) : null;
    const paramId = params.get('edit_bill_id') ? Number(params.get('edit_bill_id')) : null;
    const legacyBillNo = params.get('edit'); // legacy: match by bill_no
    const editBillId = stateId || paramId;
    // Where to return after a successful update (e.g. 'all-bills' when the edit
    // was started from the Detailed Log page).
    const returnTo = (urlState && urlState.return_to) || params.get('return_to') || null;

    if (!editBillId && !legacyBillNo) return;
    if (bills.length === 0 && !editBillId) return; // wait until list loads for bill_no lookup

    let cancelled = false;

    const clearRequest = () => {
      window.history.replaceState({}, '', window.location.pathname);
      if (stateId && onNavigate) {
        onNavigate('billing-log', {}); // clear propagated page state
      }
    };

    const openEditor = async () => {
      try {
        const requestKey = String(editBillId || `legacy-${legacyBillNo}`);
        if (editRequestHandledRef.current === requestKey) return;

        let billToEdit = null;

        if (editBillId) {
          // Fetch the exact bill by id — works even when it is not in the
          // currently loaded/filtered bill list.
          const { data, error } = await supabase
            .from('billing_log')
            .select(`
              *,
              master_doctors ( id, doctor_name ),
              master_staff ( id, staff_name ),
              bill_services(id, service_id, service_name, consumable_completed, service_status)
            `)
            .eq('id', editBillId)
            .maybeSingle();
          if (error) throw error;
          if (!data) throw new Error(`Bill #${editBillId} not found`);
          if (cancelled) return; // effect re-ran (e.g. bills loaded) — retry happens there
          billToEdit = data;
        } else {
          billToEdit = bills.find(b => b.bill_no === legacyBillNo);
          if (!billToEdit) {
            showToast('error', `Bill "${legacyBillNo}" not found`);
            clearRequest();
            return;
          }
        }

        handleEditBill(billToEdit);
        // Mark handled ONLY after the form is actually populated, so a run
        // cancelled mid-fetch (bills list refresh racing the navigation) is
        // retried on the next effect run instead of being silently skipped.
        editRequestHandledRef.current = requestKey;
        editReturnToRef.current = returnTo;
        showToast('info', 'Editing in Billing Log. Make changes and click Update Bill.');
        clearRequest();
      } catch (error) {
        console.error('Error opening bill for editing:', error);
        editRequestHandledRef.current = null; // allow retry on a genuine failure
        editReturnToRef.current = null;
        if (!cancelled) {
          showToast('error', error.message || 'Could not open the bill for editing');
          clearRequest();
        }
      }
    };

    openEditor();
    return () => { cancelled = true; };
  }, [bills, urlState]);

  return (
    <div className="page-wrapper animate-fade-in">
      {/* Page Header */}
      <div className="page-header">
        <div className="page-header-left">
          <h1>Billing Log</h1>
          <p>Track all patient bills and service-wise consumable completion status</p>
        </div>
      </div>

      {/* Bill Form - New or Edit Mode */}
      <div className="card" style={{ ...CARD_STYLE, marginBottom: 20 }}>
        <div className="card-header" style={{ marginBottom: 16, paddingBottom: 12, borderBottom: '1px solid var(--color-line-2)' }}>
          <div>
            <div className="card-title">{editingBillId ? 'Edit Bill' : 'New Bill'}</div>
            <div className="card-subtitle">{editingBillId ? 'Update bill details below' : 'Create a new bill record'}</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {editingBillId && (
              <button onClick={cancelEdit} className="btn btn-secondary btn-sm">
                Cancel
              </button>
            )}
            <button onClick={handleClearForm} className="btn btn-secondary">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
              Clear
            </button>
            <button onClick={handleSaveBill} className="btn btn-primary">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><polyline points="20 6 9 17 4 12"/></svg>
              {editingBillId ? 'Update Bill' : 'Save Bill'}
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
              onChange={(e) => {
                const val = e.target.value;
                if (!val.trim()) lastUidLookupRef.current = ''; // allow re-lookup after clearing
                setFormData({ ...formData, uid: val });
              }}
              onBlur={(e) => handleUidLookup(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleUidLookup(e.target.value);
                }
              }}
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

      {/* Recently Added Bills - Shows last 3 bills */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-ink)' }}>Recently Added Bills</div>
          <button onClick={() => onNavigate && onNavigate('all-bills')} className="btn btn-outline btn-sm">
            View All Bills in Detailed Log
          </button>
        </div>
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
                <th style={{ width: 200, textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="11" style={{ textAlign: 'center', padding: '20px', color: 'var(--color-muted)' }}>Loading...</td>
                </tr>
              ) : bills.length === 0 ? (
                <tr>
                  <td colSpan="11" style={{ textAlign: 'center', padding: '20px', color: 'var(--color-muted)' }}>No bills yet. Create your first bill above.</td>
                </tr>
              ) : (
                bills.slice(0, 3).map((bill) => {
                  const counts = bill.serviceCounts || { total: 0, completed: 0, pending: 0 };
                  const status = bill.calculatedStatus;
                  
                   return (
                     <tr key={bill.id} style={{ cursor: 'pointer' }} onClick={() => handleViewBill(bill)}>
                       <td style={{ fontWeight: 600, color: 'var(--color-primary)', whiteSpace: 'nowrap', verticalAlign: 'middle' }}>
                         {bill.bill_no}
                       </td>
                       <td style={{ whiteSpace: 'nowrap', verticalAlign: 'middle', fontSize: 13 }}>{bill.uid || '-'}</td>
                       <td style={{ whiteSpace: 'nowrap', verticalAlign: 'middle' }}>{bill.patient_name || '-'}</td>
                       <td style={{ fontSize: 13 }}>{formatDateDisplay(bill.service_date)}</td>
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
                            
                            {/* Edit Bill Button */}
                            <button 
                              onClick={() => handleEditBill(bill)}
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
      </div>

      {/* View Bill Details Modal — uses the shared BillDetailsModal component
          with embedded mode so consumable saving keeps the popup open. */}
      {viewData && viewData.viewMode === 'details' && (
        <BillDetailsModal
          bill={viewData.bill}
          billServices={billServices}
          consumableCounts={consumableCounts}
          onClose={() => {
            setViewData(null);
            setBillServices([]);
            setConsumableCounts({});
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