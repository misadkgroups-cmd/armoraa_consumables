import { useState, useEffect, useRef, useMemo } from 'react';
import { supabase } from '../config/supabase';
import { useBranch } from '../context/BranchContext';
import SearchableDropdown from '../components/SearchableDropdown';
import * as auditApi from '../services/auditApi';
import { prepareSavePayload } from '../utils/billableReportPayload';

const PARAM_KEYS = [
  'bill_no', 'uid', 'service_id', 'service_name',
  'service_date', 'billing_log_id', 'bill_service_id',
];

// Read URL query params for Billing Log → Billable Consumables flow.
// When initialParams is supplied (embedded mode), those values are used as
// a fallback so the component can operate without URL query parameters.
const useQueryParams = (initialParams = {}) => {
  const mergeParams = (urlParams, baseParams = initialParams) => {
    const result = { ...baseParams };
    PARAM_KEYS.forEach((key) => {
      const val = urlParams.get(key);
      if (val) result[key] = val;
    });
    return result;
  };

  const [params, setParams] = useState(() => {
    if (typeof window === 'undefined') return { ...initialParams };
    const search = new URLSearchParams(window.location.search);
    return mergeParams(search);
  });

  useEffect(() => {
    const updateParams = () => {
      if (typeof window === 'undefined') return;
      const search = new URLSearchParams(window.location.search);
      setParams(prev => mergeParams(search, prev));
    };

    const onPop = () => updateParams();
    
    // Listen for both popstate and pushstate (via custom event)
    window.addEventListener('popstate', onPop);
    window.addEventListener('pushstate', updateParams);
    
    return () => {
      window.removeEventListener('popstate', onPop);
      window.removeEventListener('pushstate', updateParams);
    };
  }, [initialParams]);

  return params;
};


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

export default function BillableConsumables({ onNavigate, onSaveComplete, onCancel, embedded = false, initialParams = {} }) {
  const { branchId } = useBranch();
  const query = useQueryParams(initialParams);
  const [billId, setBillId] = useState(query.bill_no || '');
  const [uid, setUid] = useState(query.uid || '');
  const [service, setService] = useState(query.service_id || '');
  const [machinery, setMachinery] = useState('');
  const [services, setServices] = useState([]);
  const [machines, setMachines] = useState([]);
  const [billingLogId, setBillingLogId] = useState(query.billing_log_id || '');
  const [billServiceId, setBillServiceId] = useState(query.bill_service_id || '');
  // Active (non-completed) batch registry rows
  const [registry, setRegistry] = useState([]);
  // Combined dropdown options
  const [allConsumables, setAllConsumables] = useState([]);
  // Billable stock: consumable_id -> available_stock (only for stock > 0)
  const [billableStockMap, setBillableStockMap] = useState({});
  const [rows, setRows] = useState([]);
  const [toast, setToast] = useState(null);
  const [reportDate, setReportDate] = useState(query.service_date || new Date().toISOString().split('T')[0]);
  const [machineryLocked, setMachineryLocked] = useState(false);
  const [noMachineryMapping, setNoMachineryMapping] = useState(false);
  const billIdRef = useRef(null);

  // Sync state with URL params reactively
  useEffect(() => {
    if (query.bill_no) setBillId(query.bill_no);
  }, [query.bill_no]);

  useEffect(() => {
    if (query.uid) setUid(query.uid);
  }, [query.uid]);

  useEffect(() => {
    if (query.service_id) setService(query.service_id);
  }, [query.service_id]);

  useEffect(() => {
    if (query.service_date) setReportDate(query.service_date);
  }, [query.service_date]);

  useEffect(() => {
    if (query.billing_log_id) setBillingLogId(query.billing_log_id);
  }, [query.billing_log_id]);

  useEffect(() => {
    if (query.bill_service_id) setBillServiceId(query.bill_service_id);
  }, [query.bill_service_id]);

  // If opened from Billing Log, prefill service and lock machinery after fetch
  useEffect(() => {
    if (!query.service_id) return;
    const sid = String(query.service_id);
    setService(sid);
    fetchServicesAndMachinery(sid);
  }, [branchId, query.service_id]);

  useEffect(() => {
    if (branchId) {
      fetchServices();
      fetchMachines();
      fetchAllConsumables();
      fetchBillableStock();
    }
    setTimeout(() => billIdRef.current?.focus(), 100);
  }, [branchId]);

  // Load existing consumables when editing - check by bill_service_id first, then billing_log_id
  useEffect(() => {
    if (!branchId || allConsumables.length === 0) return;
    if (billServiceId) {
      loadExistingConsumablesByBillService();
    } else if (query.billing_log_id && !query.bill_service_id) {
      loadExistingConsumables();
    }
  }, [branchId, billServiceId, query.billing_log_id, allConsumables]);

  // Load consumables for a specific bill_service_id from bill_service_consumables (relational table)
  const loadExistingConsumablesByBillService = async () => {
    try {
      // First get the bill_service record to find service_name
      const { data: billService, error: bsError } = await supabase
        .from('bill_services')
        .select('bill_id, service_id')
        .eq('id', billServiceId)
        .single();

      if (bsError || !billService) return;

      // Load consumables from bill_service_consumables (the relational source of truth)
      const { data: existingConsumables, error: consError } = await supabase
        .from('bill_service_consumables')
        .select('id, product_type, consumable_id, used_quantity, status')
        .eq('bill_service_id', billServiceId)
        .eq('status', 'Used');
      
      if (consError) {
        console.error('Error loading existing consumables:', consError);
        return;
      }

      if (!existingConsumables || existingConsumables.length === 0) return;

      const loadedRows = [];
      
      // Separate billable and non-billable to map registry info
      const nonBillableItems = existingConsumables.filter(c => c.product_type === 'Non-Billable');
      const nonBillableIds = nonBillableItems.map(c => c.consumable_id);
      
      // For non-billable items, find matching registry entries with batch info
      let registryBatchMap = {};
      if (nonBillableIds.length > 0) {
        const { data: registryRows } = await supabase
          .from('non_billable_consumable_registry')
          .select('id, product_id, batch_id')
          .in('product_id', nonBillableIds)
          .eq('status', 'active');
        
        if (registryRows) {
          // Map product_id -> first available batch
          registryRows.forEach(r => {
            if (!registryBatchMap[r.product_id]) {
              registryBatchMap[r.product_id] = { registryId: r.id, batchId: r.batch_id };
            }
          });
        }
      }

      existingConsumables.forEach((item, index) => {
        const isNb = item.product_type === 'Non-Billable';
        const productId = item.consumable_id;
        const compositeId = isNb ? `nbproduct-${productId}` : `billable-${productId}`;
        const batchInfo = registryBatchMap[productId];
        
        loadedRows.push({
          id: Date.now() + index,
          consumableId: compositeId,
          consumableType: isNb ? 'nonbillable' : 'billable',
          units: isNb ? 'USED' : String(item.used_quantity || ''),
          batchId: isNb ? (batchInfo?.batchId || '') : '',
          registryId: isNb ? (batchInfo?.registryId || null) : null,
        });
      });

      if (loadedRows.length > 0) {
        setRows(loadedRows);
      }
    } catch (error) {
      console.error('Error loading existing consumables by bill_service_id:', error);
    }
  };

  const loadExistingConsumables = async () => {
    try {
      const { data: reports, error } = await supabase
        .from('billable_report')
        .select('*')
        .eq('billing_log_id', query.billing_log_id)
        .eq('branch_id', branchId)
        .single();

      if (error || !reports) return;

      // For non-billable items, fetch registry data to map registry_id -> product_id
      const regIds = [];
      for (let i = 1; i <= 14; i++) {
        const isNb = reports[`is_non_billable_${i}`];
        const regId = reports[`non_billable_registry_id_${i}`];
        if (isNb && regId) regIds.push(regId);
      }

      let registryProductMap = {};
      if (regIds.length > 0) {
        const { data: regRows } = await supabase
          .from('non_billable_consumable_registry')
          .select('id, product_id')
          .in('id', regIds);
        if (regRows) {
          regRows.forEach(r => { registryProductMap[r.id] = r.product_id; });
        }
      }

      const loadedRows = [];
      for (let i = 1; i <= 14; i++) {
        const rawId = reports[`consumable_${i}_id`];
        const cUnits = reports[`consumable_${i}_units`];
        const cBatch = reports[`consumable_${i}_batch_id`];
        const isNb = reports[`is_non_billable_${i}`];
        const regId = reports[`non_billable_registry_id_${i}`];
        
        if (isNb && regId) {
          const productId = registryProductMap[regId];
          if (productId) {
            loadedRows.push({
              id: Date.now() + i,
              consumableId: `nbproduct-${productId}`,
              consumableType: 'nonbillable',
              units: 'USED',
              batchId: cBatch || '',
              registryId: regId || null,
            });
          }
        } else if (rawId && !isNb) {
          const compositeId = `billable-${rawId}`;
          loadedRows.push({
            id: Date.now() + i,
            consumableId: compositeId,
            consumableType: 'billable',
            units: String(cUnits || ''),
            batchId: cBatch || '',
            registryId: null,
          });
        }
      }
      if (loadedRows.length > 0) {
        setRows(loadedRows);
      }
    } catch (error) {
      console.error('Error loading existing consumables:', error);
    }
  };

  useEffect(() => {
    const onFocus = () => { if (branchId) { fetchAllConsumables(); fetchBillableStock(); } };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [branchId]);

  useEffect(() => {
    if (service) {
      fetchMachinesForService(service);
    } else {
      setMachinery('');
      setMachines([]);
      setMachineryLocked(false);
      setNoMachineryMapping(false);
    }
  }, [service]);

  const fetchServices = async () => {
    try {
      const { data, error } = await supabase
        .from('master_services')
        .select('id, service_name')
        .order('service_name');
      
      if (error) throw error;
      if (data) setServices(data || []);
    } catch (error) {
      console.error('Error fetching services:', error);
    }
  };

  const fetchServicesAndMachinery = async (serviceId) => {
    await fetchServices();
    setTimeout(() => {
      fetchMachinesForService(serviceId);
    }, 300);
  };

  const fetchMachines = async () => {
    try {
      const { data, error } = await supabase.from('master_machinery').select('id, machine_name').eq('branch_id', branchId).order('machine_name');
      if (data) {
        const seen = new Set();
        const uniq = data.filter(m => { const k = m.machine_name.toLowerCase().trim(); if (seen.has(k)) return false; seen.add(k); return true; });
        setMachines(uniq);
      }
    } catch (error) { console.error('Error fetching machinery:', error); }
  };

  const fetchMachinesForService = async (serviceId) => {
    try {
      const { data: mappings, error: mappingError } = await supabase.from('master_machinery').select('id, machine_name').eq('service_id', serviceId).order('machine_name');
      if (mappingError || !mappings || mappings.length === 0) {
        setMachines([]); setMachinery(''); setMachineryLocked(false); setNoMachineryMapping(true);
        showToast('warning', 'No machinery mapping found for selected service. Please configure the mapping in Customization → Machinery Mapping');
        return;
      }
      setNoMachineryMapping(false);
      const seen = new Set();
      const unique = mappings.filter((m) => { const key = m.machine_name.toLowerCase().trim(); if (seen.has(key)) return false; seen.add(key); return true; });
      setMachines(unique);
      setMachineryLocked(true);
      if (unique.length > 0) setMachinery(unique[0].id);
    } catch (error) { console.error('Error fetching machinery for service:', error); setMachineryLocked(false); setNoMachineryMapping(true); }
  };

  // Unified fetch:
  // 1. Standard Master Consumables (billable items)
  // 2. Active non-billable registry batches, grouped by unique product so the
  //    "Select Consumable" dropdown shows clean product names. Each non-billable
  //    option nests its available batches (each carrying its registry row id).
  const fetchAllConsumables = async () => {
    try {
      const { data: billables } = await supabase
        .from('master_billable_consumables')
        .select('id, product_name, cost_unit, unit')
        .eq('status', 'Active')
        .order('product_name');

      const { data: registryItems } = await supabase
        .from('non_billable_consumable_registry')
        .select('id, batch_id, product_id, status, master_non_billable_consumables ( product_name )')
        .eq('status', 'active')
        .eq('branch_id', branchId)
        .order('batch_id');

      const reg = registryItems || [];
      setRegistry(reg);

      // Group active registry rows by unique product_id, nesting batches inside.
      const productMap = new Map();
      reg.forEach(item => {
        const pid = item.product_id;
        if (!productMap.has(pid)) {
          productMap.set(pid, {
            id: `nbproduct-${pid}`,
            rawId: pid,
            name: item.master_non_billable_consumables?.product_name || 'Unknown',
            type: 'nonbillable',
            cost: 0,
            batches: [],
          });
        }
        productMap.get(pid).batches.push({ registryId: item.id, batchId: item.batch_id });
      });

      const combined = [
        ...(billables || []).map(item => ({
          id: `billable-${item.id}`,
          rawId: item.id,
          name: item.product_name,
          type: 'billable',
          cost: item.cost_unit || 0,
          unit: item.unit || 'piece',
          batches: [],
        })),
        ...Array.from(productMap.values()),
      ];
      setAllConsumables(combined);
    } catch (error) { console.error('Error fetching unified consumables:', error); }
  };

  // Fetch billable stock availability (only entries with available_stock > 0).
  // Used to filter the "Select Consumable" dropdown so out-of-stock billable
  // products are not shown.
  const fetchBillableStock = async () => {
    try {
      const { data } = await supabase
        .from('billable_stock')
        .select('consumable_id, available_stock')
        .eq('branch_id', branchId)
        .gt('available_stock', 0);

      const map = {};
      (data || []).forEach((row) => {
        const stock = Number(row.available_stock) || 0;
        if (stock > 0) map[row.consumable_id] = stock;
      });
      setBillableStockMap(map);
    } catch (error) { console.error('Error fetching billable stock:', error); }
  };

  // Dropdown options: non-billable items always show; billable items show only
  // when they have available stock (available_stock > 0) OR are already selected
  // in the current form (so existing edits remain visible even if stock ran out).
  const availableConsumables = useMemo(() => {
    const selectedIds = new Set(rows.map((r) => r.consumableId));
    return (allConsumables || []).filter((c) => {
      if (c.type === 'nonbillable') return true;
      return (billableStockMap[c.rawId] ?? 0) > 0 || selectedIds.has(c.id);
    });
  }, [allConsumables, billableStockMap, rows]);

  // Label helper: appends available stock for billable consumables.
  const getConsumableLabel = (c) => {
    if (c.type === 'nonbillable') return c.name;
    const stock = billableStockMap[c.rawId] ?? 0;
    return stock > 0 ? `${c.name} (Available: ${stock})` : c.name;
  };


  // Resolve the registry row id for a non-billable product + batch
  const getRegistryIdForProductBatch = (rawId, batchId) => {
    if (!rawId || !batchId) return null;
    const match = (registry || []).find(
      r => r.product_id === Number(rawId) && r.batch_id === batchId
    );
    return match ? match.id : null;
  };

  const addConsumableRow = (selectedOptionId) => {
    if ((allConsumables || []).length === 0) return;
    if (!selectedOptionId) return;
    const opt = allConsumables.find(c => c.id === selectedOptionId);
    if (!opt) return;

    const isNb = opt.type === 'nonbillable';
    const firstBatch = isNb && opt.batches && opt.batches.length ? opt.batches[0] : null;
    const newId = Date.now();
    setRows((prev) => [...prev, {
      id: newId,
      consumableId: selectedOptionId,
      consumableType: opt.type,
      units: isNb ? 'USED' : '',
      batchId: firstBatch ? firstBatch.batchId : '',
      registryId: firstBatch ? firstBatch.registryId : null,
    }]);
  };

  const removeConsumableRow = (id) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
  };

  const handleConsumableChange = (id, value) => {
    setRows((prev) => prev.map((r) => {
      if (r.id !== id) return r;
      const opt = allConsumables.find(c => c.id === value);
      if (!opt) return { ...r, consumableId: value, consumableType: '', units: '', batchId: '', registryId: null };
      const isNb = opt.type === 'nonbillable';
      const firstBatch = isNb && opt.batches && opt.batches.length ? opt.batches[0] : null;
      return {
        ...r,
        consumableId: value,
        consumableType: opt.type,
        units: isNb ? 'USED' : '',
        batchId: firstBatch ? firstBatch.batchId : '',
        registryId: firstBatch ? firstBatch.registryId : null,
      };
    }));
  };

  const handleUnitsKeyDown = (e, id) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const row = rows.find((r) => r.id === id);
      if (!row || !row.units) return;
      const batchInput = document.querySelector(`select[data-row-id="${id}"][data-field="batch"], input[data-row-id="${id}"][data-field="batch"]`);
      if (batchInput) batchInput.focus();
    }
  };

  const handleBatchKeyDown = (e, id) => {
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      const row = rows.find((r) => r.id === id);
      if (!row || !row.consumableId || !row.units) return;
      const currentIndex = rows.findIndex((r) => r.id === id);
      if (currentIndex < rows.length - 1) {
        const nextConsumable = document.querySelector(`select[data-row-id="${rows[currentIndex + 1].id}"][data-field="consumable"]`);
        if (nextConsumable) nextConsumable.focus();
      } else {
        addConsumableRow();
      }
    }
  };

  const handleServiceChange = (value) => {
    setService(value);
    setMachinery(''); setMachineryLocked(false); setNoMachineryMapping(false);
  };

  // Helper to update bill status based on service completion.
  // Records a genuine Status Changed event (with the EXACT completion time)
  // whenever the bill transitions to / away from Complete, so the Audit Trail
  // shows the real completion timestamp instead of falling back to updated_at.
  const updateBillStatus = async (billId) => {
    if (!billId) return;
    try {
      const { data: services, error } = await supabase
        .from('bill_services')
        .select('consumable_completed')
        .eq('bill_id', Number(billId));

      if (error || !services || services.length === 0) {
        console.log('No services found for bill:', billId, error);
        return;
      }

      const allComplete = services.every((s) => s.consumable_completed);
      const newStatus = allComplete ? 'Complete' : 'Incomplete';
      console.log('Bill services completion status:', services, 'All complete:', allComplete);

      // Read the previous status so we only log genuine transitions.
      const { data: billRow, error: billErr } = await supabase
        .from('billing_log')
        .select('bill_status, bill_no')
        .eq('id', Number(billId))
        .maybeSingle();
      if (billErr) console.warn('Could not read current bill status:', billErr);
      const prevStatus = billRow?.bill_status || 'Incomplete';

      // Timestamp the lifecycle transition precisely (completion time).
      const nowIso = new Date().toISOString();
      const username = localStorage.getItem('username') || 'System';

      const { error: updateError } = await supabase
        .from('billing_log')
        .update({
          bill_status: newStatus,
          updated_at: nowIso,
        })
        .eq('id', Number(billId));

      if (updateError) {
        console.error('Failed to update billing_log status:', updateError);
        return;
      }
      console.log('Successfully updated billing_log status to:', newStatus);

      // Real-time lifecycle logging: record the Status Changed event at the
      // exact time of the transition. The bill_history row's created_at is the
      // true completion timestamp; updated_at stays in sync as a fallback.
      if (prevStatus !== newStatus) {
        await supabase.from('bill_history').insert({
          bill_id: Number(billId),
          username,
          action_type: 'STATUS_CHANGE',
          field_name: 'bill_status',
          old_value: prevStatus,
          new_value: newStatus,
          created_at: nowIso,
        });
        await auditApi.logActivity({
          userName: username,
          branchName: `Branch ${branchId}`,
          pageName: 'billing_log',
          action: 'status_changed',
          remarks: `Bill #${billRow?.bill_no || billId} status changed: ${prevStatus} → ${newStatus}`,
        });
      }
    } catch (e) {
      console.error('Failed to update bill status', e);
    }
  };

  // Helper to log service consumable action to bill_history + audit_logs
  const logServiceConsumableAction = async (billId, serviceName, action) => {
    try {
      const username = localStorage.getItem('username') || 'System';
      // Per-bill history row (drives the Audit Trail modal "Consumables Updated")
      await supabase.from('bill_history').insert({
        bill_id: billId,
        username,
        action_type: action,
        field_name: 'consumables',
        old_value: null,
        new_value: serviceName,
        created_at: new Date().toISOString()
      });
      // Field-level audit row (audit_logs table)
      await auditApi.logAudit({
        username,
        branchName: `Branch ${branchId}`,
        moduleName: 'billable_consumables',
        actionType: action === 'CREATE' ? 'CREATE' : 'UPDATE',
        tableName: 'billable_consumables',
        recordId: billId,
        newData: { service: serviceName, action }
      });
    } catch (e) {
      console.error('Failed to log service consumable action', e);
    }
  };

  // Adjust billable_stock by a delta (negative = reduce, positive = add back).
  const adjustBillableStock = async (consumableId, delta) => {
    const { data: currentStock } = await supabase
      .from('billable_stock')
      .select('available_stock')
      .eq('consumable_id', consumableId)
      .eq('branch_id', branchId)
      .maybeSingle();

    const newStock = Math.max(0, (currentStock?.available_stock || 0) + delta);

    await supabase
      .from('billable_stock')
      .upsert(
        {
          consumable_id: consumableId,
          branch_id: branchId,
          available_stock: newStock,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'consumable_id,branch_id' }
      );
  };

  // Log stock movement records and adjust stock on UPDATE.
  // NOTE: On INSERT, billable stock is ALREADY deducted by the DB trigger
  // (trg_deduct_billable_stock) when billable_report is inserted, so we do NOT
  // adjust stock here for new records.
  // On UPDATE, the trigger does NOT fire, so we must adjust stock by the
  // difference between old and new units (and handle consumable changes).
  const deductInventory = async (reportPayload, savedReportId, isUpdate = false, oldReport = null) => {
    try {
      const username = localStorage.getItem('username') || 'System';
      
      for (let i = 1; i <= 14; i++) {
        const newId = reportPayload[`consumable_${i}_id`];
        const newUnits = Number(reportPayload[`consumable_${i}_units`]) || 0;
        const isNonBillable = reportPayload[`is_non_billable_${i}`];
        
        // SKIP non-billable items: stock deduction already happened when
        // the batch was registered/opened in Non-Billable Consumables page.
        if (isNonBillable) continue;
        
        // On UPDATE, adjust stock by the difference between old and new values.
        if (isUpdate && oldReport) {
          const oldId = oldReport[`consumable_${i}_id`];
          const oldUnits = Number(oldReport[`consumable_${i}_units`]) || 0;
          
          if (oldId && oldId !== newId) {
            // Consumable changed: add back old units, reduce new units.
            if (oldUnits > 0) await adjustBillableStock(oldId, oldUnits);
            if (newId && newUnits > 0) await adjustBillableStock(newId, -newUnits);
          } else if (oldId === newId && newId) {
            // Same consumable: adjust by the difference (new - old).
            const difference = newUnits - oldUnits;
            if (difference !== 0) await adjustBillableStock(newId, -difference);
          }
        }
        
        // Log stock movement record (history) for billable items with units.
        if (newId && newUnits > 0) {
          await supabase
            .from('stock_transactions')
            .insert({
              transaction_type: 'Outward',
              product_type: 'Billable',
              consumable_id: newId,
              branch_id: branchId,
              quantity: -newUnits, // Negative for outward
              remarks: `Consumed for bill: ${billId || 'N/A'}`,
              created_by: username
            });
        }
      }
    } catch (e) {
      console.error('Failed to log stock movement:', e);
    }
  };

  const handleSave = async () => {
    if (!service) { showToast('error', 'Please select a service'); return; }
    if (!machinery) { showToast('error', 'No machinery mapped for selected service'); return; }
    if (rows.length === 0) { showToast('error', 'Please add at least one consumable'); return; }

    try {
      // Convert billing_log_id to number (URL params are strings)
      const numericBillingLogId = billingLogId ? Number(billingLogId) : null;
      const numericServiceId = service ? Number(service) : null;
      let validBillingLogId = null;

      if (numericBillingLogId) {
        const { data: logExists } = await supabase
          .from('billing_log')
          .select('id')
          .eq('id', numericBillingLogId)
          .maybeSingle();
        validBillingLogId = logExists ? numericBillingLogId : null;
        console.log('Validated billing log id:', validBillingLogId, 'exists:', !!logExists);
      }

      const { reportPayload, consumableItems } = prepareSavePayload({
        rows,
        allConsumables,
        getRegistryId: getRegistryIdForProductBatch,
        base: {
          branchId,
          billNo: billId, // billId state actually holds the bill number (e.g. "122")
          uid,
          serviceId: service,
          machineryId: machinery,
          reportDate,
        },
      });
      
      // Add validated billing_log_id to establish the foreign key relationship
      const payloadWithRelationship = {
        ...reportPayload,
        billing_log_id: validBillingLogId,
      };
      
      // Store consumable items for later billable_report_consumables insert
      // (must be done after report is saved to have the report_id)
      const pendingConsumableItems = consumableItems;

      let savedReport = null;
      
      // Check if report already exists for this billing_log_id + service_id to prevent duplicates
      let isUpdate = false;
      let oldReport = null;
      if (validBillingLogId && numericServiceId) {
        const { data: existingReport } = await supabase
          .from('billable_report')
          .select('*')
          .eq('billing_log_id', validBillingLogId)
          .eq('service_id', numericServiceId)
          .maybeSingle();
        
        console.log('Existing report check:', existingReport);

        if (existingReport) {
          // UPDATE existing report
          isUpdate = true;
          oldReport = existingReport;
          const { data: updated, error: updateError } = await supabase
            .from('billable_report')
            .update(payloadWithRelationship)
            .eq('id', existingReport.id)
            .select()
            .single();
          savedReport = updated;
          if (updateError) {
            console.error('Update error:', updateError);
            showToast('error', updateError.message || 'Failed to update record');
            return;
          }
          showToast('success', 'Consumables updated successfully');
          await logServiceConsumableAction(validBillingLogId, query.service_name || 'Service', 'UPDATE');
        } else {
          // INSERT new report
          const { data: inserted, error: insertError } = await supabase
            .from('billable_report')
            .insert(payloadWithRelationship)
            .select()
            .single();
          savedReport = inserted;
          if (insertError) {
            console.error('Insert error:', insertError);
            showToast('error', insertError.message || 'Failed to save record');
            return;
          }
          showToast('success', 'Consumables saved successfully');
          await logServiceConsumableAction(validBillingLogId, query.service_name || 'Service', 'CREATE');
        }
      } else {
        // No billing_log_id or service - just insert
        const { data: inserted, error: insertError } = await supabase
          .from('billable_report')
          .insert(payloadWithRelationship)
          .select()
          .single();
        savedReport = inserted;
        if (insertError) {
          console.error('Insert error:', insertError);
          showToast('error', insertError.message || 'Failed to save record');
          return;
        }
        showToast('success', 'Consumables saved successfully');
        if (billServiceId) {
          await logServiceConsumableAction(validBillingLogId, query.service_name || 'Service', 'UPDATE');
        } else {
          await logServiceConsumableAction(validBillingLogId, query.service_name || 'Service', 'CREATE');
        }
      }
      
      // ===== SYNC bill_service_consumables FIRST =====
      // Populate bill_service_consumables with the saved consumable rows
      // ONLY for the specific bill_service being updated, NOT all services in the bill.
      // IMPORTANT: Must run BEFORE updating bill_services.consumable_completed because
      // the DB trigger trg_validate_service_completion requires rows in
      // bill_service_consumables with status='Used' to exist before allowing the update.
      // NOTE: billable_report_id column does NOT exist on bill_services in the actual DB
      // Instead, the relationship is maintained via billing_log_id+service_id on billable_report
      if (savedReport) {
        // Convert billServiceId to number if it exists
        const bsId = billServiceId ? Number(billServiceId) : null;
        
        // Only mark as complete if there are consumables to save.
        // NOTE: non-billable rows have units='USED' — a sentinel value meaning the
        // product was consumed but is non-billable. Number('USED') is NaN, so the
        // numeric check alone ignores these rows. Allow the 'USED' string to count
        // as a valid consumable so a service with ONLY non-billable products can still
        // be marked complete. Billable rows must still have a positive numeric units.
        const hasConsumables = rows.some(row =>
          row.consumableId &&
          (row.units === 'USED' || (row.units && Number(row.units) > 0))
        );
        
        if (!hasConsumables) {
          console.warn('Cannot mark service as complete: No consumables with valid units found');
          showToast('warning', 'Cannot mark service as complete without consumables');
          return; // Don't mark as complete if no consumables
        }
        
        // Track whether the consumables sync succeeded so the update only runs with data in place
        let syncSuccess = !bsId; // No specific bill_service id -> nothing to sync; still try the update
        
        if (bsId) {
          // Only process the specific bill_service being updated
          const targetBillServiceId = bsId;
          
          // Delete ONLY the consumables for this specific bill_service
          const { error: delError } = await supabase
            .from('bill_service_consumables')
            .delete()
            .eq('bill_service_id', targetBillServiceId);
          
          if (delError) {
            console.error('Failed to clear existing bill_service_consumables:', delError);
          }
          
          // Now insert the consumable records for ONLY this bill_service
          const billServiceConsumableInserts = [];
          
          for (const row of rows) {
            if (!row.consumableId) continue;
            
            // Resolve the actual consumable ID and product type
            const opt = allConsumables.find(c => c.id === row.consumableId);
            if (!opt) continue;
            
            const isNb = opt.type === 'nonbillable';
            const actualConsumableId = opt.rawId;
            const productType = isNb ? 'Non-Billable' : 'Billable';
            
            // Create entry ONLY for the target bill_service.
            // NOTE: used_quantity is an INTEGER column in bill_service_consumables,
            // so round any decimal units (e.g. 1.5 -> 2) to avoid Postgres error 22P02.
            const usedQty = isNb ? 1 : Math.round(Number(row.units) || 0);
            billServiceConsumableInserts.push({
              bill_service_id: targetBillServiceId,
              product_type: productType,
              consumable_id: actualConsumableId,
              required_quantity: 1,
              used_quantity: usedQty,
              status: 'Used',
            });
          }
          
          if (billServiceConsumableInserts.length > 0) {
            const { error: bscError } = await supabase
              .from('bill_service_consumables')
              .insert(billServiceConsumableInserts);
            
            if (bscError) {
              console.error('Failed to sync bill_service_consumables:', bscError);
            } else {
              console.log('Successfully synced bill_service_consumables for bill_service_id:', targetBillServiceId, '- Records:', billServiceConsumableInserts.length);
              syncSuccess = true;
            }
          } else {
            console.log('No consumables to sync for bill_service_id:', targetBillServiceId);
          }
        }
        // ===== END bill_service_consumables sync =====
        
        if (!syncSuccess) {
          console.warn('Skipping bill_services update: bill_service_consumables sync did not succeed');
          showToast('error', 'Failed to sync consumables before marking service complete');
          return;
        }
        
        // Update bill_services with consumable_completed = true
        // Update by bill_id + service_id if billServiceId is not available
        let updateQuery = supabase
          .from('bill_services')
          .update({
            consumable_completed: true,
            service_status: 'Complete',
          })
          .eq('bill_id', Number(validBillingLogId))
          .eq('service_id', Number(service));
        
        if (bsId) {
          updateQuery = updateQuery.eq('id', bsId);
        }
        
        const { data: updatedServices, error: updErr } = await updateQuery.select('id, consumable_completed');
        
        if (updErr) {
          console.error('Failed to update bill_services status', updErr);
          showToast('error', updErr.message || 'Failed to update bill_services status');
        } else {
          console.log('Successfully updated bill_services status:', updatedServices);
        }
      }

      // ===== INSERT normalized billable_report_consumables records =====
      if (savedReport && pendingConsumableItems.length > 0) {
        const consumableInserts = pendingConsumableItems.map(item => ({
          ...item,
          report_id: savedReport.id,
          created_by: localStorage.getItem('username') || 'System',
        }));
        
        // Delete existing consumables for this report (in case of update), then insert
        await supabase
          .from('billable_report_consumables')
          .delete()
          .eq('report_id', savedReport.id);
        
        const { error: brcError } = await supabase
          .from('billable_report_consumables')
          .insert(consumableInserts);
        
        if (brcError) {
          console.error('Failed to insert billable_report_consumables:', brcError);
        } else {
          console.log('Inserted', consumableInserts.length, 'billable_report_consumables records');
        }
      }
      // ===== END billable_report_consumables sync =====

      // Update bill status after saving consumables
      if (validBillingLogId) {
        await updateBillStatus(validBillingLogId);
      }
      
      // Auto-deduct inventory after successful save.
      // On UPDATE, pass the old report so stock is adjusted by the difference.
      if (savedReport) {
        await deductInventory(reportPayload, savedReport.id, isUpdate, oldReport);
      }

      // Embedded mode: callback instead of navigating away (keeps popup open).
      // The callback triggers a service-only data refresh in the parent modal.
      // We do NOT set the forceRefreshBills flag or navigate — the popup stays open.
      if (onSaveComplete) {
        onSaveComplete({
          billId: validBillingLogId,
          serviceId: query.service_id,
          billServiceId: query.bill_service_id,
        });
        return;
      }

      // Standalone mode (not embedded): navigate back to Detailed Log and auto-open
      // the bill details popup for the bill that was just saved.
      // NOTE: We intentionally do NOT set the forceRefreshBills flag here — AllBills
      // already re-fetches fresh data on mount, so setting it would cause a redundant
      // second fetch and a visible "Loading..." flash (looks like a hard refresh).
      setTimeout(() => {
        if (onNavigate) {
          // Pass bill ID to show the specific bill details popup
          onNavigate('all-bills', { refresh: true, highlightBill: validBillingLogId, openBillDetails: true, ts: Date.now() });
        } else {
          window.location.href = '/billing-log/all-bills?refresh=' + Date.now() + '&openBill=' + (validBillingLogId || '');
        }
      }, 800);
    } catch (e) {
      console.error('Save exception:', e);
      showToast('error', 'Failed to save record');
    }
  };

  const handleClear = () => {
    // Clear all form state
    setBillId(''); setUid(''); setService(''); setMachinery(''); setMachines([]); 
    setMachineryLocked(false); setNoMachineryMapping(false); setRows([]);
    setReportDate(new Date().toISOString().split('T')[0]);
    // Also clear URL params so they don't re-populate the form
    if (window.location.search) {
      const clean = window.location.pathname;
      window.history.replaceState({}, '', clean);
    }
    showToast('success', 'Form cleared');
  };

  const handleUnitsChange = (id, value) => { setRows((prev) => prev.map((r) => (r.id === id ? { ...r, units: value } : r))); };
  const handleBatchIdChange = (id, value) => { setRows((prev) => prev.map((r) => (r.id === id ? { ...r, batchId: value } : r))); };
  // When a non-billable batch is chosen from the dropdown, keep registryId in sync.
  const handleBatchChange = (id, value) => {
    setRows((prev) => prev.map((r) => {
      if (r.id !== id) return r;
      const opt = allConsumables.find(c => c.id === r.consumableId);
      const batch = (opt?.batches || []).find(b => b.batchId === value);
      return { ...r, batchId: value, registryId: batch ? batch.registryId : null };
    }));
  };

  const showToast = (type, message) => { setToast({ type, message }); setTimeout(() => setToast(null), 3000); };

  const handleCancel = () => {
    if (embedded && onCancel) {
      onCancel();
      return;
    }
    // Non-embedded: navigate back to Detailed Log
    if (window.location.search) {
      const clean = window.location.pathname;
      window.history.replaceState({}, '', clean);
    }
    if (onNavigate) {
      onNavigate('all-bills', { refresh: true });
    } else {
      window.location.href = '/billing-log/all-bills?refresh=' + Date.now();
    }
  };

  const handleExit = async () => {
    if (embedded) {
      // In embedded mode, cancel returns to service list in the modal
      if (onCancel) onCancel();
      return;
    }
    // Clean query params first
    if (window.location.search) {
      const clean = window.location.pathname;
      window.history.replaceState({}, '', clean);
    }
    
    // If we have a billing log ID, update the bill status before leaving
    if (billingLogId) {
      await updateBillStatus(billingLogId);
    }
    
    // Navigate to Detailed Log page and force refresh.
    // When we arrived from a bill (billingLogId known), reopen that bill's
    // "View Services" popup on return — same behaviour as the Save flow —
    // so Exit no longer closes the whole drill-down.
    if (onNavigate) {
      if (billingLogId) {
        // Pass a flag to force refresh + reopen the bill details popup
        onNavigate('all-bills', { refresh: true, highlightBill: billingLogId, openBillDetails: true, ts: Date.now() });
      } else {
        // Pass a flag to force refresh
        onNavigate('all-bills', { refresh: true });
      }
    } else {
      // Force page reload to see updated status
      window.location.href = '/billing-log/all-bills?refresh=' + Date.now() + '&openBill=' + (billingLogId || '');
    }
  };

  const handleClose = () => {
    if (embedded) {
      if (onCancel) onCancel();
      return;
    }
    // Best-effort cleanup: remove query params so returning to this page is clean
    if (window.location.search) {
      const clean = window.location.pathname;
      window.history.replaceState({}, '', clean);
    }
  };

  return (
    <div className={embedded ? "consumables-embed-content" : "page-wrapper animate-fade-in"}>
      {embedded ? (
        <div className="consumables-embed-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--color-line)' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--color-ink)' }}>
              {query.service_name ? `Consumables — ${query.service_name}` : 'Consumables'}
            </h3>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--color-muted)' }}>
              Bill #{query.bill_no} · Date: {query.service_date || '-'}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleCancel} className="btn btn-secondary btn-sm">← Back to Services</button>
            <button onClick={handleSave} className="btn btn-primary" disabled={noMachineryMapping}>
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              Save
            </button>
          </div>
        </div>
      ) : (
        <div className="page-header">
          <div className="page-header-left">
            <h1>Billable Consumables</h1>
            <p>Record consumables used per patient bill</p>
          </div>
          <div className="page-header-actions">
            <button onClick={handleSave} className="btn btn-primary" disabled={noMachineryMapping}>
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              Save Record
            </button>
            <button onClick={handleClear} className="btn btn-secondary">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
              Clear
            </button>
            <button onClick={handleExit} className="btn btn-ghost" title="Exit to Detailed Log">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
              Exit
            </button>
          </div>
        </div>
      )}

      <div className="card" style={{ ...CARD_STYLE, padding: 0, overflow: 'visible' }}>
        <div className="grid grid-cols-5 gap-0" style={{ borderBottom: '1px solid var(--color-line)' }}>
          {[
            { label: 'Bill ID', field: 'billId', type: 'text', placeholder: 'Enter Bill ID' },
            { label: 'UID', field: 'uid', type: 'text', placeholder: 'Enter UID' },
            { label: 'Date', field: 'date', type: 'date', value: reportDate, onChange: setReportDate },
            { label: 'Service', field: 'service', type: 'select', options: (services || []).map(s => ({ value: s.id, label: s.service_name })), onChange: handleServiceChange },
            { label: 'Machinery', field: 'machinery', type: 'select', options: (machines || []).map(m => ({ value: m.id, label: m.machine_name })), disabled: machineryLocked },
          ].map((item) => (
            <div key={item.field} className="p-4 space-y-1.5" style={{ borderRight: '1px solid var(--color-line-2)' }}>
              <label style={FIELD_LABEL}>{item.label}</label>
              {item.type === 'select' ? (
                <SearchableDropdown
                  value={item.field === 'service' ? service : machinery}
                  onChange={(val) => item.onChange ? item.onChange(val) : setMachinery(val)}
                  options={item.options || []}
                  placeholder={`Select ${item.label}...`}
                  displayKey="label" valueKey="value" disabled={item.disabled || false}
                />
              ) : (
                <input
                  ref={item.field === 'billId' ? billIdRef : undefined}
                  type={item.type}
                  value={item.field === 'billId' ? billId : item.field === 'uid' ? uid : reportDate}
                  onChange={(e) => {
                    if (item.field === 'billId') setBillId(e.target.value);
                    else if (item.field === 'uid') setUid(e.target.value);
                    else item.onChange(e.target.value);
                  }}
                  placeholder={item.placeholder} className="form-input"
                />
              )}
              {item.field === 'machinery' && noMachineryMapping && (
                <div style={{ fontSize: 11, color: 'var(--color-danger, #DC2626)', marginTop: 4, lineHeight: 1.4 }}>
                  No machinery mapping found for selected service. Please configure the mapping in: Customization → Machinery Mapping
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="card" style={{ ...CARD_STYLE, marginTop: 20 }}>
        <div className="section-header">
          <h2 style={{ fontWeight: 700, fontSize: 18, color: '#1e293b' }}>Consumables</h2>
          <p>Select a consumable (billable or non-billable) and its batch</p>
        </div>
        <div className="space-y-3">
          <div className="grid grid-cols-12 gap-2 px-1">
            <div className="col-span-4"><span style={FIELD_LABEL}>Select Consumable</span></div>
            <div className="col-span-2"><span style={FIELD_LABEL}>Unit</span></div>
            <div className="col-span-3"><span style={FIELD_LABEL}>Batch ID</span></div>
            <div className="col-span-3"><span style={FIELD_LABEL}>Actions</span></div>
          </div>

          {rows.map((row, index) => {
            const isNb = row.consumableType === 'nonbillable';
            const opt = allConsumables.find(c => c.id === row.consumableId);
            return (
              <div key={row.id} className={`grid grid-cols-12 gap-2 items-center p-2 rounded-lg ${row.units || row.batchId ? 'bg-[#EEF2FF]' : ''}`}>
                <div className="col-span-4">
                  <SearchableDropdown
                    value={row.consumableId}
                    onChange={(val) => handleConsumableChange(row.id, val === '__clear__' ? '' : val)}
                    options={availableConsumables.map(c => ({ value: c.id, label: getConsumableLabel(c) }))}
                    placeholder="Select consumable..."
                    displayKey="label" valueKey="value"
                  />
                </div>
                <div className="col-span-2">
                  {isNb ? (
                    <div className="h-9 px-3 border border-[#A7F3D0] rounded-lg text-sm text-[#065F46] font-semibold bg-[#D1FAE5] flex items-center">USED</div>
                  ) : (
                    <input type="text" inputMode="decimal" value={row.units} onChange={(e) => handleUnitsChange(row.id, e.target.value)} onKeyDown={(e) => handleUnitsKeyDown(e, row.id)} className="form-input" placeholder="Units" />
                  )}
                </div>
                <div className="col-span-3">
                  {isNb ? (
                    <SearchableDropdown
                      value={row.batchId}
                      onChange={(val) => handleBatchChange(row.id, val)}
                      options={(opt?.batches || []).map(b => ({ value: b.batchId, label: b.batchId }))}
                      placeholder={(opt?.batches?.length) ? 'Select Batch' : 'No Batches'}
                      displayKey="label" valueKey="value"
                      disabled={!row.consumableId}
                    />
                  ) : (
                    <input
                      type="text"
                      value=""
                      onChange={(e) => handleBatchIdChange(row.id, e.target.value)}
                      onKeyDown={(e) => handleBatchKeyDown(e, row.id)}
                      disabled
                      className="form-input bg-gray-100 cursor-not-allowed opacity-50"
                      placeholder="— Not Required —"
                    />
                  )}
                </div>
                <div className="col-span-3 flex items-center gap-3" style={{ height: '36px' }}>
                  <span className="text-xs text-muted">{index + 1}.</span>
                  {row.units && !isNb && <span className="tag tag-success">USED</span>}
                  <button onClick={() => addConsumableRow()} style={{ color: '#6366f1', fontWeight: 600, fontSize: 13, background: 'none', border: 'none', cursor: 'pointer' }}>Add Item</button>
                  <button onClick={() => removeConsumableRow(row.id)} style={{ color: '#f43f5e', fontWeight: 600, fontSize: 13, background: 'none', border: 'none', cursor: 'pointer' }}>Remove</button>
                </div>
              </div>
            );
          })}

          <div className="grid grid-cols-12 gap-2 items-center pt-3" style={{ borderTop: '1px solid var(--color-line-2)' }}>
            <div className="col-span-4">
              <SearchableDropdown
                value=""
                onChange={(val) => { if (val) addConsumableRow(val); }}
                options={availableConsumables.map(c => ({ value: c.id, label: getConsumableLabel(c) }))}
                placeholder="+ Add consumable"
                displayKey="label" valueKey="value"
              />
            </div>
            <div className="col-span-2"><div className="h-9 px-3 border border-[var(--color-line)] rounded-lg text-muted flex items-center bg-[var(--color-tint-2)]">-</div></div>
            <div className="col-span-3"><div className="h-9 px-3 border border-[var(--color-line)] rounded-lg text-muted flex items-center bg-[var(--color-tint-2)]">-</div></div>
            <div className="col-span-3 flex items-center">
              <button onClick={() => addConsumableRow()} className="btn btn-ghost btn-icon" title="Add consumable row">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      {toast && (
        <div className={`toast ${toast.type === 'success' ? 'toast-success' : toast.type === 'warning' ? 'toast-warning' : 'toast-error'}`}>
          <span>{toast.message}</span>
          <button onClick={() => setToast(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', opacity: 0.7, fontSize: 16, lineHeight: 1 }}>×</button>
        </div>
      )}
    </div>
  );
}