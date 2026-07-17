import { useState, useEffect, useRef } from 'react';
import { supabase } from '../config/supabase';
import { useBranch } from '../context/BranchContext';
import SearchableDropdown from '../components/SearchableDropdown';
import { prepareSavePayload } from '../utils/billableReportPayload';

// Read URL query params for Billing Log → Billable Consumables flow
const useQueryParams = () => {
  const [params, setParams] = useState(() => {
    if (typeof window === 'undefined') return {};
    const search = new URLSearchParams(window.location.search);
    return {
      bill_no: search.get('bill_no') || '',
      uid: search.get('uid') || '',
      service_id: search.get('service_id') || '',
      service_name: search.get('service_name') || '',
      service_date: search.get('service_date') || '',
      billing_log_id: search.get('billing_log_id') || '',
    };
  });

  useEffect(() => {
    const updateParams = () => {
      const search = new URLSearchParams(window.location.search);
      setParams({
        bill_no: search.get('bill_no') || '',
        uid: search.get('uid') || '',
        service_id: search.get('service_id') || '',
        service_name: search.get('service_name') || '',
        service_date: search.get('service_date') || '',
        billing_log_id: search.get('billing_log_id') || '',
      });
    };

    const onPop = () => updateParams();
    
    // Listen for both popstate and pushstate (via custom event)
    window.addEventListener('popstate', onPop);
    window.addEventListener('pushstate', updateParams);
    
    return () => {
      window.removeEventListener('popstate', onPop);
      window.removeEventListener('pushstate', updateParams);
    };
  }, []);

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

export default function BillableConsumables({ onNavigate }) {
  const { branchId } = useBranch();
  const query = useQueryParams();
  const [billId, setBillId] = useState(query.bill_no || '');
  const [uid, setUid] = useState(query.uid || '');
  const [service, setService] = useState(query.service_id || '');
  const [machinery, setMachinery] = useState('');
  const [services, setServices] = useState([]);
  const [machines, setMachines] = useState([]);
  const [billingLogId, setBillingLogId] = useState(query.billing_log_id || '');
  // Active (non-completed) batch registry rows
  const [registry, setRegistry] = useState([]);
  // Combined dropdown options
  const [allConsumables, setAllConsumables] = useState([]);
  const [rows, setRows] = useState([]);
  const [toast, setToast] = useState(null);
  const [reportDate, setReportDate] = useState(() => new Date().toISOString().split('T')[0]);
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
    }
    setTimeout(() => billIdRef.current?.focus(), 100);
  }, [branchId]);

  // If opened from Edit (Complete status), load existing consumable rows
  // Must run AFTER fetchAllConsumables has populated allConsumables
  useEffect(() => {
    if (!branchId || !query.billing_log_id || allConsumables.length === 0) return;
    loadExistingConsumables();
  }, [branchId, query.billing_log_id, allConsumables]);

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
    const onFocus = () => { if (branchId) { fetchAllConsumables(); } };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [branchId]);

  // allConsumables is built by fetchAllConsumables() (unified billable + active registry batches).

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
        .from('master_consumables')
        .select('id, consumable_name, cost_unit')
        .order('consumable_name');

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
          name: item.consumable_name,
          type: 'billable',
          cost: item.cost_unit || 0,
          batches: [],
        })),
        ...Array.from(productMap.values()),
      ];
      setAllConsumables(combined);
    } catch (error) { console.error('Error fetching unified consumables:', error); }
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

  const handleSave = async () => {
    if (!service) { showToast('error', 'Please select a service'); return; }
    if (!machinery) { showToast('error', 'No machinery mapped for selected service'); return; }
    if (rows.length === 0) { showToast('error', 'Please add at least one consumable'); return; }

    try {
      // Validate that billing_log_id exists in billing_log table before inserting
      let validBillingLogId = null;
      if (billingLogId) {
        const { data: logExists } = await supabase
          .from('billing_log')
          .select('id')
          .eq('id', billingLogId)
          .single();
        validBillingLogId = logExists ? billingLogId : null;
      }

      const reportPayload = prepareSavePayload({
        rows,
        allConsumables,
        getRegistryId: getRegistryIdForProductBatch,
        base: {
          branchId,
          billId,
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
      
      const { error } = await supabase.from('billable_report').insert(payloadWithRelationship);
      if (!error) {
        showToast('success', 'Record saved successfully');
        // Update billing_log status to Complete via foreign key relationship
        if (validBillingLogId) {
          const { error: updErr } = await supabase
            .from('billing_log')
            .update({ 
              consumable_status: 'Complete', 
              consumable_completed_at: new Date() 
            })
            .eq('id', validBillingLogId);
          if (updErr) console.error('Failed to update billing_log status', updErr);
        }
      }
      else { console.error('Save error:', error); showToast('error', error.message || 'Failed to save record'); }
    } catch (e) { console.error('Save exception:', e); showToast('error', 'Failed to save record'); }
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

  const handleExit = () => {
    // Clean query params first
    if (window.location.search) {
      const clean = window.location.pathname;
      window.history.replaceState({}, '', clean);
    }
    // Navigate to Detailed Log page
    if (onNavigate) {
      onNavigate('all-bills');
    } else {
      window.location.href = '/billing-log/all-bills';
    }
  };

  const handleClose = () => {
    // Best-effort cleanup: remove query params so returning to this page is clean
    if (window.location.search) {
      const clean = window.location.pathname;
      window.history.replaceState({}, '', clean);
    }
  };

  return (
    <div className="page-wrapper animate-fade-in">
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
                    options={(allConsumables || []).map(c => ({ value: c.id, label: c.name }))}
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
                    // NEW UPDATED BATCH ID INPUT COLUMN — master (billable) items are auto-locked.
                    // 1. Automatically disable the field since billable items require no batch.
                    // 2. Visual styling class shows users it is locked out.
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
                options={(allConsumables || []).map(c => ({ value: c.id, label: c.name }))}
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