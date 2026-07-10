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
  const [rows, setRows] = useState([]);
  const [toast, setToast] = useState(null);
  const [reportDate, setReportDate] = useState(new Date().toISOString().split('T')[0]);

  useEffect(() => {
    if (branchId) {
      fetchServices();
      fetchMachines();
      fetchConsumables();
    }
  }, [branchId]);

  const fetchServices = async () => {
    try {
      // Try fetching by branch_id first, fallback to all if none found
      let { data, error } = await supabase
        .from('master_services')
        .select('id, service_name')
        .eq('branch_id', branchId)
        .order('service_name');
      
      if (!data || data.length === 0) {
        // No branch-specific services found — fetch all
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
        // Fallback to all machines
        console.warn('No machinery for branch_id', branchId, 'fetching all');
        let fallbackQuery = supabase.from('master_machinery').select('id, machine_name').order('machine_name');
        if (serviceId) {
          fallbackQuery = fallbackQuery.eq('service_id', serviceId);
        }
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
    if (consumables.length === 0) return;
    const newId = Date.now();
    setRows((prev) => [
      ...prev,
      { id: newId, consumableId: selectedConsumableId || '', units: '', batchId: '' }
    ]);
  };

  const removeConsumableRow = (id) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
  };

  const handleConsumableChange = (id, value) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, consumableId: value } : r)));
  };

  const handleSave = async () => {
    try {
      // Build wide-format payload for billable_report (max 14 consumables)
      const reportPayload = {
        branch_id: branchId,
        bill_id: billId,
        uid: uid,
        service_id: service || null,
        machinery_id: machinery || null,
        report_date: reportDate,
      };

      // Map up to 14 consumables to named columns (store consumable ID for FK relationship)
      const maxSlots = Math.min(rows.length, 14);
      for (let i = 0; i < maxSlots; i++) {
        const row = rows[i];
        reportPayload[`consumable_${i + 1}_id`] = row.consumableId ? Number(row.consumableId) : null;
        reportPayload[`consumable_${i + 1}_units`] = row.units ? Number(row.units) : null;
        reportPayload[`consumable_${i + 1}_batch_id`] = row.batchId || null;
      }

      // Fill remaining slots with null
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
        setRows((prev) => prev.map((r) => ({ ...r, units: '', batchId: '' })));
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
    <div className="space-y-4">
      {/* Header Actions */}
      <div className="flex justify-end gap-2">
        <button
          onClick={handleSave}
          className="flex items-center gap-2 px-4 py-2 bg-sky-500 text-white rounded hover:bg-sky-600 transition-all text-sm font-semibold shadow-sm"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          Save Record
        </button>
        <button
          onClick={() => window.history.back()}
          className="px-4 py-2 border border-slate-300 rounded hover:bg-slate-50 transition-all text-sm font-semibold text-slate-700"
        >
          Close
        </button>
      </div>

      {/* Top Filter Row */}
      <div className="bg-white rounded-lg border border-slate-200 shadow-sm">
        <div className="grid grid-cols-5 gap-0 divide-x divide-slate-200">
          <div className="p-3 space-y-2">
            <label className="text-[10px] font-bold tracking-wider text-slate-500 uppercase block">Bill ID</label>
            <input
              type="text"
              value={billId}
              onChange={(e) => setBillId(e.target.value)}
              placeholder="Enter Bill ID"
              className="w-full h-8 px-2.5 border border-slate-300 rounded text-sm focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 focus:outline-none"
            />
          </div>
          <div className="p-3 space-y-2">
            <label className="text-[10px] font-bold tracking-wider text-slate-500 uppercase block">Date</label>
            <input
              type="date"
              value={reportDate}
              onChange={(e) => setReportDate(e.target.value)}
              className="w-full h-8 px-2.5 border border-slate-300 rounded text-sm focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 focus:outline-none"
            />
          </div>
          <div className="p-3 space-y-2">
            <label className="text-[10px] font-bold tracking-wider text-slate-500 uppercase block">UID</label>
            <input
              type="text"
              value={uid}
              onChange={(e) => setUid(e.target.value)}
              placeholder="Enter UID"
              className="w-full h-8 px-2.5 border border-slate-300 rounded text-sm focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 focus:outline-none"
            />
          </div>
          <div className="p-3 space-y-2">
            <label className="text-[10px] font-bold tracking-wider text-slate-500 uppercase block">Service</label>
            <select
              value={service}
              onChange={(e) => {
                const serviceId = e.target.value;
                setService(serviceId);
                setMachinery('');
                if (serviceId) {
                  fetchMachines(serviceId);
                }
              }}
              className="w-full h-8 px-2.5 border border-slate-300 rounded text-sm focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 focus:outline-none bg-white"
            >
              <option value="">Select Service</option>
              {services.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.service_name}
                </option>
              ))}
            </select>
          </div>
          <div className="p-3 space-y-2">
            <label className="text-[10px] font-bold tracking-wider text-slate-500 uppercase block">Machinery</label>
            <select
              value={machinery}
              onChange={(e) => setMachinery(e.target.value)}
              className="w-full h-8 px-2.5 border border-slate-300 rounded text-sm focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 focus:outline-none bg-white"
            >
              <option value="">Select Machinery</option>
              {machines.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.machine_name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Consumables Entry Matrix */}
      <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 space-y-3">
          {/* Header row */}
          <div className="grid grid-cols-12 gap-2">
            <div className="col-span-4">
              <label className="text-[10px] font-bold tracking-wider text-slate-500 uppercase block mb-1">Select Consumable</label>
            </div>
            <div className="col-span-2">
              <label className="text-[10px] font-bold tracking-wider text-slate-500 uppercase block mb-1">Add Unit</label>
            </div>
            <div className="col-span-3">
              <label className="text-[10px] font-bold tracking-wider text-slate-500 uppercase block mb-1">Add Batch ID</label>
            </div>
            <div className="col-span-3">
              <label className="text-[10px] font-bold tracking-wider text-slate-500 uppercase block mb-1">Actions</label>
            </div>
          </div>

          {/* Added rows */}
          {rows.map((row, index) => (
            <div key={row.id} className={`grid grid-cols-12 gap-2 items-center ${row.units || row.batchId ? 'bg-sky-50/40 p-2 rounded' : ''}`}>
              <div className="col-span-4">
                <select
                  value={row.consumableId}
                  onChange={(e) => handleConsumableChange(row.id, e.target.value)}
                  className="w-full h-9 px-3 border border-slate-300 rounded-lg text-sm focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 focus:outline-none bg-white"
                >
                  <option value="">Select</option>
                  {consumables.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.consumable_name || c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-span-2">
                <input
                  type="text"
                  inputMode="decimal"
                  value={row.units}
                  onChange={(e) => handleUnitsChange(row.id, e.target.value)}
                  className="w-full h-9 px-3 border border-slate-300 rounded-lg text-sm focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 focus:outline-none"
                  placeholder="1"
                />
              </div>
              <div className="col-span-3">
                <input
                  type="text"
                  value={row.batchId}
                  onChange={(e) => handleBatchIdChange(row.id, e.target.value)}
                  className="w-full h-9 px-3 border border-slate-300 rounded-lg text-sm focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 focus:outline-none"
                  placeholder="Batch ID"
                />
              </div>
              <div className="col-span-3 flex items-center gap-2">
                <span className="text-xs text-slate-500">{index + 1}.</span>
                <button
                  onClick={() => addConsumableRow()}
                  className="text-sky-700 hover:text-sky-900 text-xs font-semibold"
                  title="Add another consumable"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                </button>
                <button
                  onClick={() => removeConsumableRow(row.id)}
                  className="text-red-600 hover:text-red-800 text-xs font-semibold"
                  title="Remove"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            </div>
          ))}

          {/* Add new row */}
          <div className="grid grid-cols-12 gap-2 items-center pt-2 border-t border-slate-100">
            <div className="col-span-4">
              <select
                id="consumableSelect"
                className="w-full h-9 px-3 border border-slate-300 rounded-lg text-sm focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 focus:outline-none bg-white"
                value=""
                  onChange={(e) => {
                    const selectedId = e.target.value;
                    if (selectedId) {
                      addConsumableRow(selectedId);
                      e.target.value = '';
                    }
                  }}
                >
                  <option value="">+</option>
                  {consumables.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.consumable_name || c.name}
                    </option>
                  ))}
                </select>
            </div>
            <div className="col-span-2">
              <div className="h-9 px-3 border border-slate-200 rounded-lg text-sm text-slate-400 flex items-center bg-slate-50">
                -
              </div>
            </div>
            <div className="col-span-3">
              <div className="h-9 px-3 border border-slate-200 rounded-lg text-sm text-slate-400 flex items-center bg-slate-50">
                -
              </div>
            </div>
            <div className="col-span-3 flex items-center">
              <button
                onClick={() => addConsumableRow()}
                className="text-sky-700 hover:text-sky-900"
                title="Add another consumable row"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed right-4 bottom-4 px-4 py-3 rounded-lg shadow-lg ${
            toast.type === 'success' ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'
          }`}
        >
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{toast.message}</span>
            <button onClick={() => setToast(null)} className="ml-2 hover:opacity-75">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
