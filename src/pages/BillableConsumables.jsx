import { useState, useEffect } from 'react';
import { supabase } from '../config/supabase';
import { useBranch } from '../context/BranchContext';

export default function BillableConsumables() {
  const { branchId } = useBranch();
  const [billId, setBillId] = useState('');
  const [uid, setUid] = useState('');
  const [service, setService] = useState('');
  const [machinery, setMachinery] = useState('');
  const [services, setServices] = useState([]);
  const [machines, setMachines] = useState([]);
  const [consumables, setConsumables] = useState([]);
  const [bulkItems, setBulkItems] = useState([]);
  const [allConsumables, setAllConsumables] = useState([]);
  const [rows, setRows] = useState([]);
  const [toast, setToast] = useState(null);
  const [reportDate, setReportDate] = useState(new Date().toISOString().split('T')[0]);

  useEffect(() => {
    if (branchId) {
      fetchServices();
      fetchMachines();
      fetchConsumables();
      fetchBulkItems();
    }
  }, [branchId]);

  useEffect(() => {
    const combined = [
      ...consumables.map(c => ({ id: c.id, name: c.consumable_name, isBulk: false })),
      ...bulkItems.map(b => ({ id: `bulk_${b.id}`, name: b.product_name, isBulk: true, bulkId: b.id }))
    ];
    setAllConsumables(combined);
  }, [consumables, bulkItems]);

  const fetchServices = async () => {
    try {
      let { data, error } = await supabase
        .from('master_services')
        .select('id, service_name')
        .eq('branch_id', branchId)
        .order('service_name');
      
      if (!data || data.length === 0) {
        console.warn('No services for branch_id', branchId, 'fetching all');
        const res = await supabase.from('master_services').select('id, service_name').order('service_name');
        data = res.data;
      }
      
      console.log('Services fetched:', data?.length || 0, error);
      if (data) setServices(data || []);
    } catch (error) { console.error('Error fetching services:', error); }
  };

  const fetchMachines = async (serviceId) => {
    try {
      let query = supabase
        .from('master_machinery')
        .select('id, machine_name')
        .eq('branch_id', branchId)
        .order('machine_name');
      if (serviceId) {
        query = query.eq('service_id', serviceId);
      }
      let { data } = await query;
      
      if (!data || data.length === 0) {
        console.warn('No machinery for branch_id', branchId, 'fetching all');
        let fallbackQuery = supabase.from('master_machinery').select('id, machine_name').order('machine_name');
        if (serviceId) fallbackQuery = fallbackQuery.eq('service_id', serviceId);
        const res = await fallbackQuery;
        data = res.data;
      }
      
      if (data) {
        const seen = new Set();
        const unique = data.filter((m) => {
          const key = m.machine_name.toLowerCase().trim();
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        setMachines(unique);
        if (unique.length === 1) {
          setMachinery(unique[0].id);
        }
      }
    } catch (error) { console.error('Error fetching machinery:', error); }
  };

  const fetchBulkItems = async () => {
    try {
      const { data, error } = await supabase
        .from('bulk_consumables_registry')
        .select('id, product_name, batch_id, open_date, status, closing_date')
        .eq('branch_id', branchId)
        .order('open_date', { ascending: false });
      if (!error && data) setBulkItems(data || []);
    } catch (error) {
      console.error('Error fetching bulk items:', error);
      setBulkItems([]);
    }
  };

  const fetchConsumables = async () => {
    try {
      let { data } = await supabase
        .from('master_consumables')
        .select('id, consumable_name')
        .eq('branch_id', branchId)
        .order('consumable_name');
      
      if (!data || data.length === 0) {
        console.warn('No consumables for branch_id', branchId, 'fetching all');
        const res = await supabase.from('master_consumables').select('id, consumable_name').order('consumable_name');
        data = res.data;
      }
      
      if (data) setConsumables(data || []);
    } catch (error) { console.error('Error fetching consumables:', error); }
  };

  const addConsumableRow = (selectedConsumableId) => {
    if (allConsumables.length === 0) return;
    const newId = Date.now();
    let initialBatch = '';
    if (selectedConsumableId && selectedConsumableId.startsWith('bulk_')) {
      const bulkEntry = bulkItems.find(b => `bulk_${b.id}` === selectedConsumableId);
      if (bulkEntry) initialBatch = bulkEntry.batch_id;
    }
    setRows((prev) => [
      ...prev,
      { id: newId, consumableId: selectedConsumableId || '', units: selectedConsumableId?.startsWith('bulk_') ? 'USED' : '', batchId: initialBatch }
    ]);
    setTimeout(() => {
      if (!selectedConsumableId?.startsWith('bulk_')) {
        const unitsInput = document.querySelector(`input[data-row-id="${newId}"][data-field="units"]`);
        if (unitsInput) unitsInput.focus();
      }
    }, 50);
  };

  const removeConsumableRow = (id) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
  };

  const handleConsumableChange = (id, value) => {
    setRows((prev) => prev.map((r) => {
      if (r.id !== id) return r;
      const isBulk = value.startsWith('bulk_');
      const bulkEntry = isBulk ? bulkItems.find(b => `bulk_${b.id}` === value) : null;
      return {
        ...r,
        consumableId: value,
        units: isBulk ? 'USED' : '',
        batchId: bulkEntry ? bulkEntry.batch_id : ''
      };
    }));
  };

  const handleConsumableKeyDown = (e, id) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const row = rows.find((r) => r.id === id);
      if (!row || !row.consumableId) return;
      
      if (row.consumableId.startsWith('bulk_')) {
        const batchInput = document.querySelector(`select[data-row-id="${id}"][data-field="batch"]`);
        if (batchInput) batchInput.focus();
      } else {
        const unitsInput = document.querySelector(`input[data-row-id="${id}"][data-field="units"]`);
        if (unitsInput) unitsInput.focus();
      }
    }
    if (e.key === 'Backspace' || e.key === 'Delete') {
      e.preventDefault();
      handleConsumableChange(id, '');
    }
  };

  const handleUnitsKeyDown = (e, id) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const row = rows.find((r) => r.id === id);
      if (!row || !row.units) return;
      
      if (row.consumableId?.startsWith('bulk_')) {
        const batchInput = document.querySelector(`select[data-row-id="${id}"][data-field="batch"]`);
        if (batchInput) batchInput.focus();
      } else {
        const currentIndex = rows.findIndex((r) => r.id === id);
        if (currentIndex < rows.length - 1) {
          const nextUnits = document.querySelector(`input[data-row-id="${rows[currentIndex + 1].id}"][data-field="units"]`);
          if (nextUnits) nextUnits.focus();
        } else {
          addConsumableRow();
        }
      }
    }
    if (e.key === 'Backspace' && !e.target.value) {
      e.preventDefault();
      const row = rows.find((r) => r.id === id);
      if (row && !row.consumableId) {
        removeConsumableRow(id);
      } else {
        setRows((prev) => prev.map((r) => (r.id === id ? { ...r, units: '' } : r)));
        const consumableSelect = document.querySelector(`select[data-row-id="${id}"]`);
        if (consumableSelect) consumableSelect.focus();
      }
    }
  };

  const handleBatchKeyDown = (e, id) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const currentIndex = rows.findIndex((r) => r.id === id);
      if (e.key === 'ArrowDown' && currentIndex < rows.length - 1) {
        const nextBatch = document.querySelector(`select[data-row-id="${rows[currentIndex + 1].id}"][data-field="batch"], input[data-row-id="${rows[currentIndex + 1].id}"][data-field="batch"]`);
        if (nextBatch) nextBatch.focus();
      } else if (e.key === 'ArrowUp' && currentIndex > 0) {
        const prevBatch = document.querySelector(`select[data-row-id="${rows[currentIndex - 1].id}"][data-field="batch"], input[data-row-id="${rows[currentIndex - 1].id}"][data-field="batch"]`);
        if (prevBatch) prevBatch.focus();
      }
      return;
    }
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      const row = rows.find((r) => r.id === id);
      if (!row) return;
      if (!row.consumableId || !row.units) {
        setToast({ type: 'warning', message: 'Please select consumable before proceeding' });
        setTimeout(() => setToast(null), 3000);
        return;
      }
      const currentIndex = rows.findIndex((r) => r.id === id);
      if (currentIndex < rows.length - 1) {
        const nextBatch = document.querySelector(`select[data-row-id="${rows[currentIndex + 1].id}"][data-field="batch"], input[data-row-id="${rows[currentIndex + 1].id}"][data-field="batch"]`);
        if (nextBatch) nextBatch.focus();
      } else {
        addConsumableRow();
      }
    }
    if (e.key === 'Backspace' && !e.target.value) {
      e.preventDefault();
      const row = rows.find((r) => r.id === id);
      if (row && !row.units) {
        const unitsInput = document.querySelector(`input[data-row-id="${id}"][data-field="units"]`);
        if (unitsInput) unitsInput.focus();
      }
    }
  };

  const handleSave = async () => {
    try {
      const reportPayload = {
        branch_id: branchId,
        bill_id: billId,
        uid: uid,
        service_id: service || null,
        machinery_id: machinery || null,
        report_date: reportDate,
      };

      const maxSlots = Math.min(rows.length, 14);
      for (let i = 0; i < maxSlots; i++) {
        const row = rows[i];
        reportPayload[`consumable_${i + 1}_id`] = row.consumableId && !row.consumableId.startsWith('bulk_') ? Number(row.consumableId) : null;
        reportPayload[`consumable_${i + 1}_units`] = row.units === 'USED' ? 1 : (row.units ? Number(row.units) : null);
        reportPayload[`consumable_${i + 1}_batch_id`] = row.batchId || null;
      }

      for (let i = maxSlots; i < 14; i++) {
        reportPayload[`consumable_${i + 1}_id`] = null;
        reportPayload[`consumable_${i + 1}_units`] = null;
      }

      const { error } = await supabase.from('billable_report').insert(reportPayload);
      if (!error) {
        setBillId('');
        setUid('');
        setService('');
        setMachinery('');
        setRows([]); // Clear all rows after save
        setToast({ type: 'success', message: 'Record saved successfully' });
        setTimeout(() => setToast(null), 3000);
      } else {
        console.error('Save error:', error);
        setToast({ type: 'error', message: error.message || 'Failed to save record' });
        setTimeout(() => setToast(null), 3000);
      }
    } catch (e) {
      console.error('Save exception:', e);
      setToast({ type: 'error', message: 'Failed to save record' });
      setTimeout(() => setToast(null), 3000);
    }
  };

  const handleUnitsChange = (id, value) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, units: value } : r)));
  };

  const handleBatchIdChange = (id, value) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, batchId: value } : r)));
  };

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Page Header */}
      <div className="page-header">
        <div className="page-header-left">
          <h1>Billable Consumables</h1>
          <p>Record consumables used per patient bill</p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleSave} className="btn btn-primary">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><polyline points="20 6 9 17 4 12"/></svg>
            Save Record
          </button>
          <button onClick={() => window.history.back()} className="btn btn-secondary">Close</button>
        </div>
      </div>

      {/* Top Filter Row */}
      <div className="section-card" style={{ padding: 0 }}>
        <div className="grid grid-cols-5 gap-0" style={{ borderBottom: '1px solid var(--color-line)' }}>
          {[
            { label: 'Bill ID', field: 'billId', type: 'text', placeholder: 'Enter Bill ID' },
            { label: 'Date', field: 'date', type: 'date', value: reportDate, onChange: setReportDate },
            { label: 'UID', field: 'uid', type: 'text', placeholder: 'Enter UID' },
            { label: 'Service', field: 'service', type: 'select', options: services.map(s => ({ value: s.id, label: s.service_name })), onChange: (v) => { setService(v); setMachinery(''); if (v) fetchMachines(v); } },
            { label: 'Machinery', field: 'machinery', type: 'select', options: machines.map(m => ({ value: m.id, label: m.machine_name })) },
          ].map((item) => (
            <div key={item.field} className="p-4 space-y-1.5" style={{ borderRight: '1px solid var(--color-line-2)' }}>
              <label className="text-[10px] font-semibold uppercase tracking-wider text-muted">{item.label}</label>
              {item.type === 'select' ? (
                <select value={item.field === 'service' ? service : machinery} onChange={(e) => item.onChange ? item.onChange(e.target.value) : setMachinery(e.target.value)} className="form-input">
                  <option value="">Select {item.label}</option>
                  {item.options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              ) : (
                <input type={item.type} value={item.field === 'billId' ? billId : uid} onChange={(e) => item.field === 'billId' ? setBillId(e.target.value) : setUid(e.target.value)} placeholder={item.placeholder} className="form-input" />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Consumables Entry Matrix */}
      <div className="section-card">
        <div className="section-card-header">
          <div>
            <div className="section-title">Consumables</div>
            <div className="section-subtitle">Add consumable items used in this bill</div>
          </div>
        </div>
        <div className="space-y-3">
          {/* Header Row */}
          <div className="grid grid-cols-12 gap-2 px-1">
            <div className="col-span-4">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted">Select Consumable</span>
            </div>
            <div className="col-span-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted">Unit</span>
            </div>
            <div className="col-span-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted">Batch ID</span>
            </div>
            <div className="col-span-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted">Actions</span>
            </div>
          </div>

          {/* Added rows */}
          {rows.map((row, index) => {
            const isBulk = row.consumableId?.startsWith('bulk_');
            return (
              <div key={row.id} className={`grid grid-cols-12 gap-2 items-center p-2 rounded-lg ${row.units || row.batchId ? 'bg-[#EEF2FF]' : ''}`}>
                <div className="col-span-4">
                  <select value={row.consumableId} onChange={(e) => handleConsumableChange(row.id, e.target.value === '__clear__' ? '' : e.target.value)} onKeyDown={(e) => handleConsumableKeyDown(e, row.id)} data-row-id={row.id} className="form-input">
                    <option value="">Select consumable...</option>
                    {allConsumables.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  {isBulk ? (
                    <div className="h-9 px-3 border border-[#A7F3D0] rounded-lg text-sm text-[#065F46] font-semibold bg-[#D1FAE5] flex items-center">USED</div>
                  ) : (
                    <input type="text" inputMode="decimal" value={row.units} onChange={(e) => handleUnitsChange(row.id, e.target.value)} onKeyDown={(e) => handleUnitsKeyDown(e, row.id)} data-row-id={row.id} data-field="units" className="form-input" placeholder="Units" />
                  )}
                </div>
                <div className="col-span-3">
                  {isBulk ? (
                    <select value={row.batchId} onChange={(e) => handleBatchIdChange(row.id, e.target.value)} onKeyDown={(e) => handleBatchKeyDown(e, row.id)} data-row-id={row.id} data-field="batch" className="form-input">
                      <option value="">Select Batch</option>
                      {(() => {
                        const selectedBulk = bulkItems.find(b => `bulk_${b.id}` === row.consumableId);
                        if (!selectedBulk) return null;
                        return bulkItems.filter(b => b.product_name === selectedBulk.product_name && b.status === 'Active').map(b => <option key={b.id} value={b.batch_id}>{b.batch_id}</option>);
                      })()}
                    </select>
                  ) : (
                    <input type="text" value={row.batchId} onChange={(e) => handleBatchIdChange(row.id, e.target.value)} onKeyDown={(e) => handleBatchKeyDown(e, row.id)} data-row-id={row.id} data-field="batch" className="form-input" placeholder="Batch ID" />
                  )}
                </div>
                <div className="col-span-3 flex items-center gap-2">
                  <span className="text-xs text-muted">{index + 1}.</span>
                  {row.units && !isBulk && <span className="tag tag-success">USED</span>}
                  <button onClick={() => addConsumableRow()} className="btn btn-ghost btn-icon" title="Add another">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  </button>
                  <button onClick={() => removeConsumableRow(row.id)} className="btn btn-ghost btn-icon" style={{ color: 'var(--color-danger)' }} title="Remove">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                </div>
              </div>
            );
          })}

          {/* Add new row */}
          <div className="grid grid-cols-12 gap-2 items-center pt-3" style={{ borderTop: '1px solid var(--color-line-2)' }}>
            <div className="col-span-4">
              <select id="consumableSelect" className="form-input" value="" onChange={(e) => { if (e.target.value) { addConsumableRow(e.target.value); e.target.value = ''; } }}>
                <option value="">+ Add consumable</option>
                {allConsumables.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
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

      {/* Toast Notification */}
      {toast && (
        <div className={`toast ${toast.type === 'success' ? 'toast-success' : toast.type === 'warning' ? 'toast-warning' : 'toast-error'}`}>
          <span>{toast.message}</span>
          <button onClick={() => setToast(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', opacity: 0.7, fontSize: 16, lineHeight: 1 }}>×</button>
        </div>
      )}
    </div>
  );
}