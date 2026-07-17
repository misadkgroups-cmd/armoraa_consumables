import { useState, useEffect, useCallback } from 'react';
import { format } from 'date-fns';
import * as XLSX from 'xlsx';
import { supabase } from '../config/supabase';
import { useBranch } from '../context/BranchContext';
import SearchableDropdown from '../components/SearchableDropdown';
import { getDetailedNonBillableReport, getSummaryNonBillableReport } from '../services/nonBillableReports';

const Reports = () => {
  const { branchId: ctxBranch } = useBranch();

  const [dateRange, setDateRange] = useState({
    start: format(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd'),
    end: format(new Date(), 'yyyy-MM-dd'),
  });
  const [filterBranch, setFilterBranch] = useState('');
  const [filterService, setFilterService] = useState('');
  const [filterMachinery, setFilterMachinery] = useState('');

  useEffect(() => {
    if (ctxBranch && !filterBranch) setFilterBranch(ctxBranch);
  }, [ctxBranch]);

  const [branches, setBranches] = useState([]);
  const [services, setServices] = useState([]);
  const [machines, setMachines] = useState([]);
  const [reportData, setReportData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [reportType, setReportType] = useState('billable');
  const [showFilters, setShowFilters] = useState(true);
  const [hasReport, setHasReport] = useState(false);

  useEffect(() => {
    if (ctxBranch) { fetchBranches(); fetchServices(); fetchMachines(); }
  }, [ctxBranch]);

  const fetchBranches = async () => {
    try { const { data } = await supabase.from('branches').select('id, branch_name').order('branch_name'); if (data) setBranches(data); } catch (e) { console.error(e); }
  };
  const fetchServices = async () => {
    try {
      let { data } = await supabase.from('master_services').select('id, service_name').eq('branch_id', ctxBranch).order('service_name');
      if (!data || data.length === 0) { const r = await supabase.from('master_services').select('id, service_name').order('service_name'); data = r.data; }
      if (data) setServices(data);
    } catch (e) { console.error(e); }
  };
  const fetchMachines = async (serviceId) => {
    try {
      let q = supabase.from('master_machinery').select('id, machine_name').eq('branch_id', ctxBranch).order('machine_name');
      if (serviceId) q = q.eq('service_id', serviceId);
      let { data } = await q;
      if (!data || data.length === 0) { let fq = supabase.from('master_machinery').select('id, machine_name').order('machine_name'); if (serviceId) fq = fq.eq('service_id', serviceId); const r = await fq; data = r.data; }
      if (data) {
        const seen = new Set();
        const uniq = data.filter(m => { const k = m.machine_name.toLowerCase().trim(); if (seen.has(k)) return false; seen.add(k); return true; });
        setMachines(uniq);
      }
    } catch (e) { console.error(e); }
  };

  const resetReport = () => { setReportData([]); setHasReport(false); setShowFilters(true); };

  // ============ BILLABLE REPORT ============
  const generateBillableReport = async () => {
    setLoading(true);
    try {
      const slotFields = [];
      for (let i = 1; i <= 14; i++) {
        slotFields.push(`consumable_${i}_id ( consumable_name, cost_unit )`);
        slotFields.push(`non_billable_registry_id_${i} ( id, batch_id, master_non_billable_consumables ( product_name ) )`);
        slotFields.push(`consumable_${i}_units`);
        slotFields.push(`consumable_${i}_batch_id`);
        slotFields.push(`is_non_billable_${i}`);
      }
      const selectStr = `id, branch_id, bill_id, uid, report_date, service_id, machinery_id, ${slotFields.join(', ')}`;

      let query = supabase.from('billable_report').select(selectStr).gte('report_date', dateRange.start).lte('report_date', dateRange.end);
      if (filterBranch) query = query.eq('branch_id', filterBranch);
      if (filterService) query = query.eq('service_id', filterService);
      if (filterMachinery) query = query.eq('machinery_id', filterMachinery);
      const { data, error } = await query.order('bill_id', { ascending: true });
      if (!error && data) {
        const branchIds = [...new Set(data.map(r => r.branch_id).filter(Boolean))];
        let branchMap = {};
        if (branchIds.length) { const { data: br } = await supabase.from('branches').select('id, branch_name').in('id', branchIds); if (br) br.forEach(b => branchMap[b.id] = b.branch_name); }
        const serviceIds = [...new Set(data.map(r => r.service_id).filter(Boolean))];
        let serviceMap = {};
        if (serviceIds.length) { const { data: sr } = await supabase.from('master_services').select('id, service_name').in('id', serviceIds); if (sr) sr.forEach(s => serviceMap[s.id] = s.service_name); }
        const machineryIds = [...new Set(data.map(r => r.machinery_id).filter(Boolean))];
        let machineryMap = {};
        if (machineryIds.length) { const { data: mr } = await supabase.from('master_machinery').select('id, machine_name').in('id', machineryIds); if (mr) mr.forEach(m => machineryMap[m.id] = m.machine_name); }

        const processed = data.map(row => {
          const consumables = []; const nonBillableUsed = []; let totalUnits = 0; let totalCost = 0;
          for (let i = 1; i <= 14; i++) {
            const cid = row[`consumable_${i}_id`];
            const nb = row[`non_billable_registry_id_${i}`];
            const units = row[`consumable_${i}_units`];
            if (cid && cid.consumable_name) {
              const cost = Number(cid.cost_unit || 0);
              consumables.push({ slot: i, name: cid.consumable_name, units, cost });
              if (units) totalUnits += Number(units); totalCost += Number(units || 0) * cost;
            }
            if (nb && nb.master_non_billable_consumables) {
              const name = nb.master_non_billable_consumables.product_name || '-';
              if (!nonBillableUsed.find(n => n.name === name)) nonBillableUsed.push({ name });
            }
          }
          return { ...row, bill_id: row.bill_id, uid: row.uid, report_date: row.report_date, branch_name: branchMap[row.branch_id] || '-', machine_name: machineryMap[row.machinery_id] || '-', service_name: serviceMap[row.service_id] || '-', consumableCount: consumables.length, consumables, nonBillableUsed, nonBillableCount: nonBillableUsed.length, totalUnits, totalCost };
        });
        setReportData(processed); setHasReport(true); setShowFilters(false);
      } else { console.error(error); setHasReport(false); }
    } catch (e) { console.error(e); setHasReport(false); }
    finally { setLoading(false); }
  };

  const generateReport = async () => {
    if (reportType === 'billable') await generateBillableReport();
    else await reloadNonBillable();
  };

  // ============ NON-BILLABLE CASCADING ============
  const [nbStart, setNbStart] = useState(format(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd'));
  const [nbEnd, setNbEnd] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [nbBranch, setNbBranch] = useState('');
  const [nbReportMode, setNbReportMode] = useState('detailed'); // 'detailed' | 'summary'
  const [nbData, setNbData] = useState([]);
  const [nbLoading, setNbLoading] = useState(false);
  const [nbHasReport, setNbHasReport] = useState(false);

  const reloadNonBillable = useCallback(async () => {
    setNbLoading(true);
    try {
      const filters = { branchId: nbBranch || undefined, startDate: nbStart, endDate: nbEnd };
      const rows = nbReportMode === 'summary'
        ? await getSummaryNonBillableReport(filters)
        : await getDetailedNonBillableReport(filters);
      setNbData(rows || []);
      setNbHasReport(true);
    } catch (e) { console.error('NB error', e); setNbData([]); setNbHasReport(false); }
    finally { setNbLoading(false); }
  }, [nbStart, nbEnd, nbBranch, nbReportMode]);

  useEffect(() => { if (reportType === 'non-billable') reloadNonBillable(); }, [reportType, reloadNonBillable]);

  const clearNbFilters = () => { setNbBranch(''); };

  // ============ EXPORT FUNCTIONS ============
  const downloadCSV = () => {
    let headers, rows;
    if (reportType === 'non-billable') {
      if (nbReportMode === 'summary') {
        headers = ['NON-BILLABLE CONSUMABLE', 'QUANTITY USED', 'TOTAL COST'];
        rows = nbData.map(r => [r['NON-BILLABLE CONSUMABLE'], r['QUANTITY USED'], r['TOTAL COST']]);
      } else {
        headers = ['DATE', 'BRANCH', 'NON-BILLABLE CONSUMABLE', 'OPENING DATE', 'CLOSING DATE', 'SERVICE USED BY', 'TIMES USED', 'STATUS'];
        rows = nbData.map(r => [r.date, r.branch, r.consumableName, r.openingDate, r.closingDate, r.serviceUsedBy, r.serviceUsedCount, r.status]);
      }
    } else {
      if (reportData.length === 0) return;
      let maxC = 0; reportData.forEach(r => { if (r.consumableCount > maxC) maxC = r.consumableCount; });
      headers = ['BILL ID', 'UID', 'DATE', 'BRANCH', 'MACHINERY', 'SERVICE'];
      for (let i = 1; i <= maxC; i++) headers.push(`CONSUMABLE - ${i}`, `UNITS - ${i}`, `COST - ${i}`);
      headers.push('TOTAL UNITS', 'TOTAL COST', 'NON-BILLABLE ITEMS');
      rows = reportData.map(row => {
        const v = [row.bill_id, row.uid, row.report_date, row.branch_name || '', row.machine_name || '', row.service_name || ''];
        for (let i = 1; i <= maxC; i++) { const c = row.consumables.find(x => x.slot === i); v.push(c ? c.name : '', c && c.units ? c.units : '', c && c.cost ? c.cost : ''); }
        v.push(row.totalUnits || 0, row.totalCost || 0, row.nonBillableUsed?.length ? row.nonBillableUsed.map(n => n.name).join(', ') : '');
        return v;
      });
    }
    const csv = [headers.join(','), ...rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `${reportType}-report-${format(new Date(), 'yyyy-MM-dd')}.csv`; a.click(); URL.revokeObjectURL(url);
  };

  const downloadExcel = () => {
    let rows;
    if (reportType === 'non-billable') {
      if (nbReportMode === 'summary') {
        rows = nbData.map(r => ({
          'NON-BILLABLE CONSUMABLE': r['NON-BILLABLE CONSUMABLE'],
          'QUANTITY USED': r['QUANTITY USED'],
          'TOTAL COST': r['TOTAL COST']
        }));
      } else {
        rows = nbData.map(r => ({
          'DATE': r.date,
          'BRANCH': r.branch,
          'NON-BILLABLE CONSUMABLE': r.consumableName,
          'OPENING DATE': r.openingDate,
          'CLOSING DATE': r.closingDate,
          'SERVICE USED BY': r.serviceUsedBy,
          'TIMES USED': r.serviceUsedCount,
          'STATUS': r.status
        }));
      }
    } else {
      if (reportData.length === 0) return;
      let maxC = 0; reportData.forEach(r => { if (r.consumableCount > maxC) maxC = r.consumableCount; });
      rows = reportData.map(row => {
        const rowObj = {
          'BILL ID': row.bill_id,
          'UID': row.uid,
          'DATE': row.report_date,
          'BRANCH': row.branch_name || '',
          'MACHINERY': row.machine_name || '',
          'SERVICE': row.service_name || ''
        };
        for (let i = 1; i <= maxC; i++) {
          const c = row.consumables.find(x => x.slot === i);
          rowObj[`CONSUMABLE - ${i}`] = c ? c.name : '';
          rowObj[`UNITS - ${i}`] = c && c.units ? c.units : '';
          rowObj[`COST - ${i}`] = c && c.cost ? c.cost : '';
        }
        rowObj['TOTAL UNITS'] = row.totalUnits || 0;
        rowObj['TOTAL COST'] = row.totalCost || 0;
        rowObj['NON-BILLABLE ITEMS'] = row.nonBillableUsed?.length ? row.nonBillableUsed.map(n => n.name).join(', ') : '';
        return rowObj;
      });
    }
    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, reportType === 'non-billable' ? 'Non-Billable Report' : 'Billable Report');
    XLSX.writeFile(workbook, `${reportType}-report-${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
  };

  const [toast, setToast] = useState(null);
  const showToast = (type, message) => { setToast({ type, message }); setTimeout(() => setToast(null), 3500); };
  const [editingBill, setEditingBill] = useState(null);
  const [editRows, setEditRows] = useState([]);

  const openEditBill = async (billId) => {
    try {
      const { data, error } = await supabase.from('billable_report').select('*').eq('bill_id', billId).single();
      if (!error && data) {
        setEditingBill(data);
        const rows = [];
        for (let i = 1; i <= 14; i++) if (data[`consumable_${i}_id`] || data[`consumable_${i}_batch_id`]) rows.push({ id: Date.now() + i, consumableId: data[`consumable_${i}_id`] || '', units: data[`consumable_${i}_units`] || '', batchId: data[`consumable_${i}_batch_id`] || '' });
        if (!rows.length) rows.push({ id: Date.now(), consumableId: '', units: '', batchId: '' });
        setEditRows(rows);
      }
    } catch (e) { console.error(e); }
  };
  const logAudit = async (prev, upd, fields) => { try { await supabase.from('report_audit_log').insert({ report_id: editingBill?.id, bill_id: editingBill?.bill_id, updated_by: editingBill?.updated_by || 'Admin', updated_at: new Date().toISOString(), previous_value: prev, new_value: upd, changed_fields: fields }); } catch (e) { console.warn('Audit skipped', e?.message || e); } };
  const updateBill = async () => {
    if (!editingBill) return;
    try {
      const prev = { bill_id: editingBill.bill_id, uid: editingBill.uid, report_date: editingBill.report_date, service_id: editingBill.service_id, machinery_id: editingBill.machinery_id };
      const payload = { bill_id: editingBill.bill_id, uid: editingBill.uid, service_id: editingBill.service_id || null, machinery_id: editingBill.machinery_id || null, report_date: editingBill.report_date, updated_at: new Date().toISOString() };
      const max = Math.min(editRows.length, 14);
      for (let i = 0; i < max; i++) {
        const r = editRows[i];
        const slot = i + 1;
        const cid = r.consumableId ? Number(r.consumableId) : null;
        if (cid) {
          payload[`consumable_${slot}_id`] = cid;
          payload[`is_non_billable_${slot}`] = false;
          payload[`non_billable_registry_id_${slot}`] = null;
          payload[`consumable_${slot}_units`] = r.units ? Number(r.units) : null;
          payload[`consumable_${slot}_batch_id`] = null;
        } else {
          payload[`consumable_${slot}_id`] = null;
          payload[`is_non_billable_${slot}`] = editingBill[`is_non_billable_${slot}`] || false;
          payload[`non_billable_registry_id_${slot}`] = editingBill[`non_billable_registry_id_${slot}`] != null ? editingBill[`non_billable_registry_id_${slot}`] : null;
          payload[`consumable_${slot}_units`] = editingBill[`consumable_${slot}_units`] != null ? editingBill[`consumable_${slot}_units`] : null;
          payload[`consumable_${slot}_batch_id`] = editingBill[`consumable_${slot}_batch_id`] || null;
        }
      }
      for (let i = max; i < 14; i++) {
        const slot = i + 1;
        payload[`consumable_${slot}_id`] = editingBill[`consumable_${slot}_id`] != null ? editingBill[`consumable_${slot}_id`] : null;
        payload[`is_non_billable_${slot}`] = editingBill[`is_non_billable_${slot}`] || false;
        payload[`non_billable_registry_id_${slot}`] = editingBill[`non_billable_registry_id_${slot}`] != null ? editingBill[`non_billable_registry_id_${slot}`] : null;
        payload[`consumable_${slot}_units`] = editingBill[`consumable_${slot}_units`] != null ? editingBill[`consumable_${slot}_units`] : null;
        payload[`consumable_${slot}_batch_id`] = editingBill[`consumable_${slot}_batch_id`] || null;
      }
      const { error } = await supabase.from('billable_report').update(payload).eq('id', editingBill.id);
      if (!error) { await logAudit(prev, { ...payload }, Object.keys(payload)); setEditingBill(null); setEditRows([]); showToast('success', 'Record updated successfully'); generateReport(); }
      else { console.error(error); showToast('error', error.message || 'Failed to update record'); }
    } catch (e) { console.error(e); showToast('error', e?.message || 'Failed to update record'); }
  };
  const deleteBill = async (billId) => {
    if (!window.confirm(`Delete bill ${billId}? This cannot be undone.`)) return;
    try { const { error } = await supabase.from('billable_report').delete().eq('bill_id', billId); if (!error) { showToast('success', 'Record deleted successfully'); generateReport(); } else { console.error(error); showToast('error', error.message || 'Failed to delete record'); } }
    catch (e) { console.error(e); showToast('error', e?.message || 'Failed to delete record'); }
  };
  const fmtDate = (d) => { if (!d) return '-'; try { return format(new Date(d), 'dd MMM yyyy'); } catch { return d; } };

  return (
    <div className="page-wrapper animate-fade-in">
      <div className="page-header">
        <div className="page-header-left">
          <h1>Reports</h1>
          <p>Generate and export consumables reports</p>
        </div>
      </div>

      {/* Type toggle */}
      <div className="flex gap-3 mb-4">
        <button onClick={() => { setReportType('billable'); setReportData([]); setHasReport(false); }} className={`btn ${reportType === 'billable' ? 'btn-primary' : 'btn-ghost'}`}>Billable Report</button>
        <button onClick={() => { setReportType('non-billable'); setNbHasReport(false); setNbData([]); }} className={`btn ${reportType === 'non-billable' ? 'btn-primary' : 'btn-ghost'}`}>Non-Billable Summary</button>
      </div>

      {reportType === 'non-billable' ? (
        <>
          {/* Non-billable report controls */}
          <div className="card">
            <div className="flex items-center gap-3 flex-wrap mb-3">
              <span className="font-bold text-[15px]" style={{ color: 'var(--color-ink)' }}>NON-BILLABLE REPORTS</span>
              <div className="flex gap-2">
                <button onClick={() => { setNbReportMode('detailed'); setNbHasReport(false); }} className={`btn ${nbReportMode === 'detailed' ? 'btn-primary' : 'btn-ghost'}`}>Detailed</button>
                <button onClick={() => { setNbReportMode('summary'); setNbHasReport(false); }} className={`btn ${nbReportMode === 'summary' ? 'btn-primary' : 'btn-ghost'}`}>Summary</button>
              </div>
            </div>
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <label className="text-xs font-semibold text-muted">Start</label>
                <input type="date" value={nbStart} onChange={(e) => { setNbStart(e.target.value); setNbHasReport(false); }} className="form-input" style={{ width: 150 }} />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs font-semibold text-muted">End</label>
                <input type="date" value={nbEnd} onChange={(e) => { setNbEnd(e.target.value); setNbHasReport(false); }} className="form-input" style={{ width: 150 }} />
              </div>
              <SearchableDropdown value={nbBranch} onChange={(val) => { setNbBranch(val); setNbHasReport(false); }} options={branches.map(b => ({value: b.id, label: b.branch_name}))} placeholder="All Branches" displayKey="label" valueKey="value" disabled={nbLoading} />
              <button onClick={reloadNonBillable} disabled={nbLoading} className="btn btn-primary">{nbLoading ? 'Loading...' : 'Generate Report'}</button>
              <button onClick={downloadCSV} disabled={!nbData.length} className="btn btn-secondary">Export CSV</button>
              <button onClick={downloadExcel} disabled={!nbData.length} className="btn btn-secondary">Export Excel</button>
            </div>
            <div className="mt-3 flex items-center gap-3">
              {nbBranch && (
                <button onClick={clearNbFilters} className="btn btn-ghost btn-sm">Clear Filters</button>
              )}
              {nbLoading && <span className="text-xs text-muted flex items-center gap-2"><span className="loading-spinner" style={{ width: 14, height: 14 }} /> Updating…</span>}
            </div>
          </div>

          {/* Table */}
          {nbHasReport && (
            <div className="table-container">
              <div className="table-toolbar"><div className="table-toolbar-left"><span className="font-semibold">Report Results</span><span className="text-muted text-sm">({nbData.length} records)</span></div></div>
              <div className="overflow-x-auto">
                <table className="rpt-table">
                  <thead><tr>
                    {nbReportMode === 'summary' ? (
                      <>
                        <th className="rpt-c-nonbill">Non-Billable Consumable</th>
                        <th className="rpt-c-units">Quantity Used</th>
                        <th className="rpt-c-cost">Total Cost</th>
                      </>
                    ) : (
                      <>
                        <th className="rpt-c-date">Date</th>
                        <th className="rpt-c-branch">Branch</th>
                        <th className="rpt-c-nonbill">Non-Billable Consumable</th>
                        <th className="rpt-c-date">Opening Date</th>
                        <th className="rpt-c-date">Closing Date</th>
                        <th className="rpt-c-service">Service Used By</th>
                        <th className="rpt-c-units">Times Used</th>
                        <th className="rpt-c-cost">Status</th>
                      </>
                    )}
                  </tr></thead>
                  <tbody>
                    {nbData.length === 0 && (
                      <tr><td colSpan={nbReportMode === 'summary' ? 3 : 9} className="text-center text-muted" style={{ padding: 40 }}>No matching records found. Try changing the selected filters.</td></tr>
                    )}
                    {nbData.map((row, i) => (
                      nbReportMode === 'summary' ? (
                        <tr key={i}>
                          <td className="rpt-wrap">{row['NON-BILLABLE CONSUMABLE']}</td>
                          <td className="rpt-nowrap" style={{ textAlign: 'center' }}>{row['QUANTITY USED']}</td>
                          <td className="rpt-nowrap" style={{ textAlign: 'right' }}>{row['TOTAL COST']}</td>
                        </tr>
                      ) : (
                        <tr key={i}>
                          <td className="rpt-nowrap"><span className="rpt-date">{fmtDate(row.date)}</span></td>
                          <td className="rpt-nowrap">{row.branch || '-'}</td>
                          <td className="rpt-wrap">{row.consumableName}</td>
                          <td className="rpt-nowrap">{row.openingDate || '-'}</td>
                          <td className="rpt-nowrap">{row.closingDate || '-'}</td>
                          <td className="rpt-wrap">{row.serviceUsedBy || '-'}</td>
                          <td className="rpt-nowrap" style={{ textAlign: 'center' }}>{row.serviceUsedCount}</td>
                          <td className="rpt-nowrap"><span className={`tag ${row.status === 'Active' || row.status === 'active' ? 'tag-success' : 'tag-neutral'}`}>{row.status}</span></td>
                        </tr>
                      )
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {!nbHasReport && (
            <div className="empty-state">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
              <h3>No report data</h3><p>Select a date range and click "Generate Report"</p>
            </div>
          )}
        </>
      ) : (
        <>
          {/* Billable filter section */}
          <div className="card">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-4">
              <div className="space-y-1"><label className="text-xs font-semibold text-muted block">Start Date</label><input type="date" value={dateRange.start} onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })} className="form-input" /></div>
              <div className="space-y-1"><label className="text-xs font-semibold text-muted block">End Date</label><input type="date" value={dateRange.end} onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })} className="form-input" /></div>
              <div className="space-y-1"><label className="text-xs font-semibold text-muted block">Branch</label><SearchableDropdown value={filterBranch} onChange={(val) => setFilterBranch(val)} options={branches.map(b => ({value: b.id, label: b.branch_name}))} placeholder="All Branches" displayKey="label" valueKey="value" /></div>
              <div className="space-y-1"><label className="text-xs font-semibold text-muted block">Service</label><SearchableDropdown value={filterService} onChange={(val) => { setFilterService(val); setFilterMachinery(''); }} options={services.map(s => ({value: s.id, label: s.service_name}))} placeholder="All Services" displayKey="label" valueKey="value" /></div>
              <div className="space-y-1"><label className="text-xs font-semibold text-muted block">Machinery</label><SearchableDropdown value={filterMachinery} onChange={(val) => setFilterMachinery(val)} options={machines.map(m => ({value: m.id, label: m.machine_name}))} placeholder="All Machinery" displayKey="label" valueKey="value" /></div>
            </div>
            <div className="flex gap-3">
              <button onClick={generateReport} disabled={loading} className="btn btn-primary">{loading ? 'Generating...' : 'Generate Report'}</button>
              <button onClick={downloadCSV} disabled={reportData.length === 0} className="btn btn-secondary">Export CSV</button>
              <button onClick={downloadExcel} disabled={reportData.length === 0} className="btn btn-secondary">Export Excel</button>
            </div>
          </div>

          {hasReport && reportData.length > 0 && (
            <div className="table-container">
              <div className="table-toolbar">
                <div className="table-toolbar-left"><span className="font-semibold text-text">Report Results</span><span className="text-muted text-sm">({reportData.length} records)</span></div>
                <div className="table-toolbar-right">
                  <button onClick={() => setShowFilters(!showFilters)} className="btn btn-ghost btn-sm">{showFilters ? 'Hide Filters' : 'Show Filters'}</button>
                  <button onClick={downloadCSV} disabled={reportData.length === 0} className="btn btn-primary btn-sm">Export CSV</button>
                  <button onClick={downloadExcel} disabled={reportData.length === 0} className="btn btn-primary btn-sm">Export Excel</button>
                  <button onClick={resetReport} style={{ color: 'var(--color-danger)' }} className="btn btn-ghost btn-sm">Exit Report</button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="rpt-table">
                  <thead><tr>
                    <th className="rpt-c-billid">Bill ID</th><th className="rpt-c-uid">UID</th><th className="rpt-c-date">Date</th><th className="rpt-c-branch">Branch</th><th className="rpt-c-machinery">Machinery</th><th className="rpt-c-service">Service</th>
                    {(() => {
                      const maxC = reportData.reduce((m, r) => Math.max(m, r.consumableCount), 0);
                      const maxN = reportData.reduce((m, r) => Math.max(m, r.nonBillableCount || 0), 0);
                      const cols = [];
                      for (let i = 1; i <= maxC; i++) { cols.push(<th key={`h-${i}`} className="rpt-c-consumable" style={{ background: 'var(--color-tint-2)' }}>CONSUMABLE - {i}</th>); cols.push(<th key={`hu-${i}`} className="rpt-c-units" style={{ background: 'var(--color-tint-2)' }}>UNITS - {i}</th>); cols.push(<th key={`hc-${i}`} className="rpt-c-cost" style={{ background: 'var(--color-tint-2)' }}>COST - {i}</th>); }
                      for (let i = 1; i <= maxN; i++) { cols.push(<th key={`nh-${i}`} className="rpt-c-nonbill" style={{ background: '#F0FDF4' }}>NON-BILLABLE - {i}</th>); }
                      return cols;
                    })()}
                    <th className="rpt-c-total" style={{ background: 'var(--color-warnb)' }}>Total Cost</th>
                    <th className="rpt-c-actions sticky" style={{ background: 'var(--color-tint-2)' }}>Actions</th>
                  </tr></thead>
                  <tbody>
                    {reportData.map((row, index) => (
                      <tr key={index}>
                        <td className="rpt-nowrap">{row.bill_id}</td><td className="rpt-nowrap">{row.uid}</td><td className="rpt-nowrap"><span className="rpt-date">{fmtDate(row.report_date)}</span></td><td className="rpt-nowrap">{row.branch_name || '-'}</td><td className="rpt-nowrap">{row.machine_name || '-'}</td><td className="rpt-wrap">{row.service_name || '-'}</td>
                        {(() => {
                          const maxC = reportData.reduce((m, r) => Math.max(m, r.consumableCount), 0);
                          const maxN = reportData.reduce((m, r) => Math.max(m, r.nonBillableCount || 0), 0);
                          const cells = [];
                          for (let i = 1; i <= maxC; i++) { const c = row.consumables.find(x => x.slot === i); cells.push(<td key={`d-${i}`} className="rpt-wrap">{c ? c.name : '-'}</td>); cells.push(<td key={`du-${i}`} className="rpt-nowrap" style={{ textAlign: 'center' }}>{c && c.units ? c.units : '-'}</td>); cells.push(<td key={`dc-${i}`} className="rpt-nowrap" style={{ textAlign: 'right' }}>{c && c.cost ? `${c.cost}` : '-'}</td>); }
                          for (let i = 1; i <= maxN; i++) { const nb = row.nonBillableUsed[i - 1]; cells.push(<td key={`n-${i}`} className="rpt-wrap">{nb ? nb.name : '-'}</td>); }
                          return cells;
                        })()}
                        <td className="rpt-nowrap rpt-total-cost" style={{ background: 'var(--color-warnb)' }}>{row.totalCost || 0}</td>
                        <td className="rpt-actions-cell">
                          <div className="flex items-center justify-center gap-1.5">
                            <button onClick={() => openEditBill(row.bill_id)} className="rpt-act-icon edit" title="Edit Record" aria-label="Edit Record"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M11 4H4a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
                            <button onClick={() => deleteBill(row.bill_id)} className="rpt-act-icon del" title="Delete Record" aria-label="Delete Record"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {!hasReport && !loading && (
            <div className="empty-state">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
              <h3>No report data</h3><p>Select filters and click "Generate Report"</p>
            </div>
          )}
        </>
      )}

      {editingBill && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 820 }}>
            <div className="modal-header"><h3>Edit Bill - {editingBill.bill_id}</h3><button onClick={() => { setEditingBill(null); setEditRows([]); }} className="btn btn-ghost btn-icon">×</button></div>
            <div className="modal-body space-y-4">
              <div className="grid grid-cols-5 gap-4">
                <div><label className="text-xs font-semibold text-muted block mb-1">Bill ID</label><input type="text" value={editingBill.bill_id} disabled className="form-input" style={{ background: 'var(--color-tint-2)' }} /></div>
                <div><label className="text-xs font-semibold text-muted block mb-1">UID</label><input type="text" value={editingBill.uid || ''} onChange={(e) => setEditingBill({ ...editingBill, uid: e.target.value })} className="form-input" /></div>
                <div><label className="text-xs font-semibold text-muted block mb-1">Date</label><input type="date" value={editingBill.report_date} onChange={(e) => setEditingBill({ ...editingBill, report_date: e.target.value })} className="form-input" /></div>
                <div><label className="text-xs font-semibold text-muted block mb-1">Service</label><SearchableDropdown value={editingBill.service_id || ''} onChange={(val) => setEditingBill({ ...editingBill, service_id: val })} options={services.map(s => ({value: s.id, label: s.service_name}))} placeholder="Select" displayKey="label" valueKey="value" /></div>
                <div><label className="text-xs font-semibold text-muted block mb-1">Machinery</label><SearchableDropdown value={editingBill.machinery_id || ''} onChange={(val) => setEditingBill({ ...editingBill, machinery_id: val })} options={machines.map(m => ({value: m.id, label: m.machine_name}))} placeholder="Select" displayKey="label" valueKey="value" /></div>
              </div>
              <div>
                <label className="text-xs font-semibold text-muted block mb-1">Consumables</label>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {editRows.map((row, idx) => (
                    <div key={row.id} className="grid grid-cols-12 gap-2">
                      <div className="col-span-4"><input type="text" value={row.consumableId} onChange={(e) => { const n = [...editRows]; n[idx].consumableId = e.target.value; setEditRows(n); }} className="form-input" placeholder="Consumable ID" /></div>
                      <div className="col-span-2"><input type="text" value={row.units} onChange={(e) => { const n = [...editRows]; n[idx].units = e.target.value; setEditRows(n); }} className="form-input" placeholder="Units" /></div>
                      <div className="col-span-3"><input type="text" value={row.batchId} onChange={(e) => { const n = [...editRows]; n[idx].batchId = e.target.value; setEditRows(n); }} className="form-input" placeholder="Batch ID" /></div>
                      <div className="col-span-2 flex items-end"><button onClick={() => setEditRows(editRows.filter((_, i) => i !== idx))} className="btn btn-ghost btn-sm" style={{ color: 'var(--color-danger)' }}>Remove</button></div>
                    </div>
                  ))}
                </div>
                <button onClick={() => setEditRows([...editRows, { id: Date.now(), consumableId: '', units: '', batchId: '' }])} className="btn btn-ghost btn-sm" style={{ marginTop: 8 }}>+ Add Consumable</button>
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => { setEditingBill(null); setEditRows([]); }} className="btn btn-secondary">Cancel</button>
              <button onClick={updateBill} className="btn btn-primary">Update Record</button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className={`toast ${toast.type === 'success' ? 'toast-success' : toast.type === 'warning' ? 'toast-warning' : 'toast-error'}`}>
          <span>{toast.message}</span>
          <button onClick={() => setToast(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', opacity: 0.7, fontSize: 16, lineHeight: 1 }}>×</button>
        </div>
      )}
    </div>
  );
};

export default Reports;