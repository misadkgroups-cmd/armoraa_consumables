import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { supabase } from '../config/supabase';
import { useBranch } from '../context/BranchContext';

const Reports = () => {
  const { branchId } = useBranch();

  const [dateRange, setDateRange] = useState({
    start: format(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd'),
    end: format(new Date(), 'yyyy-MM-dd'),
  });
  const [filterBranch, setFilterBranch] = useState('');
  const [filterService, setFilterService] = useState('');
  const [filterMachinery, setFilterMachinery] = useState('');

  useEffect(() => {
    if (branchId && !filterBranch) {
      setFilterBranch(branchId);
    }
  }, [branchId]);

  const [branches, setBranches] = useState([]);
  const [services, setServices] = useState([]);
  const [machines, setMachines] = useState([]);
  const [reportData, setReportData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [reportType, setReportType] = useState('billable');
  const [showFilters, setShowFilters] = useState(true);
  const [hasReport, setHasReport] = useState(false);

  useEffect(() => {
    if (branchId) {
      fetchBranches();
      fetchServices();
      fetchMachines();
    }
  }, [branchId]);

  const fetchBranches = async () => {
    try {
      const { data } = await supabase.from('branches').select('id, branch_name').order('branch_name');
      if (data) setBranches(data);
    } catch (error) { console.error('Error fetching branches:', error); }
  };

  const fetchServices = async () => {
    try {
      let { data } = await supabase.from('master_services').select('id, service_name').eq('branch_id', branchId).order('service_name');
      if (!data || data.length === 0) {
        const res = await supabase.from('master_services').select('id, service_name').order('service_name');
        data = res.data;
      }
      if (data) setServices(data);
    } catch (error) { console.error('Error fetching services:', error); }
  };

  const fetchMachines = async (serviceId) => {
    try {
      let query = supabase.from('master_machinery').select('id, machine_name').eq('branch_id', branchId).order('machine_name');
      if (serviceId) query = query.eq('service_id', serviceId);
      let { data } = await query;
      if (!data || data.length === 0) {
        let fallbackQuery = supabase.from('master_machinery').select('id, machine_name').order('machine_name');
        if (serviceId) fallbackQuery = fallbackQuery.eq('service_id', serviceId);
        const res = await fallbackQuery;
        data = res.data;
      }
      if (data) {
        const seen = new Set();
        const unique = data.filter((m) => { const key = m.machine_name.toLowerCase().trim(); if (seen.has(key)) return false; seen.add(key); return true; });
        setMachines(unique);
      }
    } catch (error) { console.error('Error fetching machinery:', error); }
  };

  const resetReport = () => {
    setReportData([]);
    setHasReport(false);
    setShowFilters(true);
  };

  const generateBillableReport = async () => {
    setLoading(true);
    try {
      let query = supabase.from('billable_report').select('*').gte('report_date', dateRange.start).lte('report_date', dateRange.end);
      if (filterBranch) query = query.eq('branch_id', filterBranch);
      if (filterService) query = query.eq('service_id', filterService);
      if (filterMachinery) query = query.eq('machinery_id', filterMachinery);
      const { data, error } = await query.order('bill_id', { ascending: true });

      if (!error && data) {
        const { data: bulkItems } = await supabase.from('bulk_consumables_registry').select('id, product_name, batch_id');

        const branchIds = [...new Set(data.map((r) => r.branch_id).filter(Boolean))];
        let branchMap = {};
        if (branchIds.length > 0) {
          const { data: branchRows } = await supabase.from('branches').select('id, branch_name').in('id', branchIds);
          if (branchRows) branchRows.forEach((b) => { branchMap[b.id] = b.branch_name; });
        }

        const serviceIds = [...new Set(data.map((r) => r.service_id).filter(Boolean))];
        let serviceMap = {};
        if (serviceIds.length > 0) {
          const { data: serviceRows } = await supabase.from('master_services').select('id, service_name').in('id', serviceIds);
          if (serviceRows) serviceRows.forEach((s) => { serviceMap[s.id] = s.service_name; });
        }

        const machineryIds = [...new Set(data.map((r) => r.machinery_id).filter(Boolean))];
        let machineryMap = {};
        if (machineryIds.length > 0) {
          const { data: machineRows } = await supabase.from('master_machinery').select('id, machine_name').in('id', machineryIds);
          if (machineRows) machineRows.forEach((m) => { machineryMap[m.id] = m.machine_name; });
        }

        const consumableIds = new Set();
        data.forEach(row => { for (let i = 1; i <= 14; i++) { if (row[`consumable_${i}_id`]) consumableIds.add(row[`consumable_${i}_id`]); } });
        let consumableMap = {};
        if (consumableIds.size > 0) {
          const { data: consumableRows } = await supabase.from('master_consumables').select('id, consumable_name, cost_unit').in('id', Array.from(consumableIds));
          if (consumableRows) consumableRows.forEach((c) => { consumableMap[c.id] = { name: c.consumable_name, cost: c.cost_unit || 0 }; });
        }

        const processed = data.map((row) => {
          const consumables = [];
          const nonBillableUsed = [];
          let totalUnits = 0;
          let totalCost = 0;

          for (let i = 1; i <= 14; i++) {
            const consumableId = row[`consumable_${i}_id`];
            const units = row[`consumable_${i}_units`];
            const batchId = row[`consumable_${i}_batch_id`];

            if (consumableId && !batchId) {
              const itemData = consumableMap[consumableId] || { name: '-', cost: 0 };
              const name = typeof itemData === 'string' ? itemData : itemData.name;
              const cost = typeof itemData === 'object' ? (itemData.cost || 0) : 0;
              consumables.push({ slot: i, name, units, cost });
              if (units) totalUnits += Number(units);
              totalCost += Number(units || 0) * Number(cost);
            }

            if (batchId && bulkItems) {
              const bulkItem = bulkItems.find(b => b.batch_id === batchId);
              if (bulkItem && !nonBillableUsed.find(n => n.batch_id === batchId)) {
                nonBillableUsed.push({ name: bulkItem.product_name, batch_id: batchId, units });
              }
            }
          }

          return {
            ...row,
            bill_id: row.bill_id,
            uid: row.uid,
            report_date: row.report_date,
            branch_name: branchMap[row.branch_id] || '-',
            machine_name: machineryMap[row.machinery_id] || '-',
            service_name: serviceMap[row.service_id] || '-',
            consumableCount: consumables.length,
            consumables,
            nonBillableUsed,
            nonBillableCount: nonBillableUsed.length,
            totalUnits,
            totalCost
          };
        });

        setReportData(processed);
        setHasReport(true);
        setShowFilters(false);
      } else {
        console.error('Report error:', error);
        setHasReport(false);
      }
    } catch (error) { console.error('Error generating report:', error); setHasReport(false); }
    finally { setLoading(false); }
  };

  const generateNonBillableReport = async () => {
    setLoading(true);
    try {
      let query = supabase.from('bulk_consumables_registry').select('*').gte('open_date', dateRange.start).lte('open_date', dateRange.end).order('open_date', { ascending: false });
      if (filterBranch) query = query.eq('branch_id', filterBranch);
      const { data: bulkData, error: bulkError } = await query;
      if (bulkError) { console.error('Bulk items error:', bulkError); setLoading(false); return; }
      if (!bulkData || bulkData.length === 0) { setReportData([]); setHasReport(true); setShowFilters(false); setLoading(false); return; }

      const grouped = {};
      bulkData.forEach(item => {
        if (!grouped[item.product_name]) {
          grouped[item.product_name] = { product_name: item.product_name, total_batches: 0, active_batches: 0, completed_batches: 0, total_units: 0, batch_ids: [] };
        }
        const group = grouped[item.product_name];
        group.total_batches++;
        group.batch_ids.push(item.batch_id);
        if (item.status === 'Active') group.active_batches++;
        else group.completed_batches++;
      });

      const { data: billData } = await supabase
        .from('billable_report')
        .select('consumable_1_batch_id, consumable_2_batch_id, consumable_3_batch_id, consumable_4_batch_id, consumable_5_batch_id, consumable_6_batch_id, consumable_7_batch_id, consumable_8_batch_id, consumable_9_batch_id, consumable_10_batch_id, consumable_11_batch_id, consumable_12_batch_id, consumable_13_batch_id, consumable_14_batch_id');

      const usageCounts = {};
      if (billData) {
        billData.forEach(row => { for (let i = 1; i <= 14; i++) { const batchId = row[`consumable_${i}_batch_id`]; if (batchId) usageCounts[batchId] = (usageCounts[batchId] || 0) + 1; } });
      }

      Object.keys(grouped).forEach(productName => {
        const group = grouped[productName];
        group.batch_ids.forEach(batchId => { group.total_units += usageCounts[batchId] || 0; });
      });

      setReportData(Object.values(grouped));
      setHasReport(true);
      setShowFilters(false);
    } catch (error) { console.error('Error generating non-billable report:', error); setHasReport(false); }
    finally { setLoading(false); }
  };

  const generateReport = async () => {
    if (reportType === 'billable') await generateBillableReport();
    else await generateNonBillableReport();
  };

  const downloadCSV = () => {
    if (reportData.length === 0) return;
    let headers, rows;
    if (reportType === 'non-billable') {
      headers = ['PRODUCT NAME', 'TOTAL BATCHES', 'ACTIVE BATCHES', 'COMPLETED BATCHES', 'TOTAL UNITS USED'];
      rows = reportData.map(row => [row.product_name, row.total_batches, row.active_batches, row.completed_batches, row.total_units]);
    } else {
      let maxConsumables = 0;
      reportData.forEach((r) => { if (r.consumableCount > maxConsumables) maxConsumables = r.consumableCount; });
      headers = ['BILL ID', 'UID', 'DATE', 'BRANCH', 'MACHINERY', 'SERVICE'];
      for (let i = 1; i <= maxConsumables; i++) headers.push(`CONSUMABLE - ${i}`, `UNITS - ${i}`, `COST - ${i}`);
      headers.push('TOTAL UNITS', 'TOTAL COST', 'NON-BILLABLE ITEMS');
      rows = reportData.map((row) => {
        const values = [row.bill_id, row.uid, row.report_date, row.branch_name || '', row.machine_name || '', row.service_name || ''];
        for (let i = 1; i <= maxConsumables; i++) {
          const c = row.consumables.find((x) => x.slot === i);
          values.push(c ? c.name : '');
          values.push(c && c.units ? c.units : '');
          values.push(c && c.cost ? c.cost : '');
        }
        values.push(row.totalUnits || 0);
        values.push(row.totalCost || 0);
        const nonBillStr = row.nonBillableUsed?.length > 0 ? row.nonBillableUsed.map(n => `${n.name} (${n.batch_id})`).join(', ') : '';
        values.push(nonBillStr);
        return values;
      });
    }
    const csvRows = [headers.join(','), ...rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))];
    const csv = csvRows.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${reportType}-report-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
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
        for (let i = 1; i <= 14; i++) {
          if (data[`consumable_${i}_id`] || data[`consumable_${i}_batch_id`]) {
            rows.push({ id: Date.now() + i, consumableId: data[`consumable_${i}_id`] || '', units: data[`consumable_${i}_units`] || '', batchId: data[`consumable_${i}_batch_id`] || '' });
          }
        }
        if (rows.length === 0) rows.push({ id: Date.now(), consumableId: '', units: '', batchId: '' });
        setEditRows(rows);
      }
    } catch (error) { console.error('Error fetching bill for edit:', error); }
  };

  const logAudit = async (previous, updated, changedFields) => {
    try {
      await supabase.from('report_audit_log').insert({
        report_id: editingBill?.id,
        bill_id: editingBill?.bill_id,
        updated_by: editingBill?.updated_by || 'Admin',
        updated_at: new Date().toISOString(),
        previous_value: previous,
        new_value: updated,
        changed_fields: changedFields,
      });
    } catch (e) { console.warn('Audit log skipped (table may not exist):', e?.message || e); }
  };

  const updateBill = async () => {
    if (!editingBill) return;
    try {
      const previous = {
        bill_id: editingBill.bill_id, uid: editingBill.uid, report_date: editingBill.report_date,
        service_id: editingBill.service_id, machinery_id: editingBill.machinery_id,
      };
      const updatePayload = {
        bill_id: editingBill.bill_id, uid: editingBill.uid,
        service_id: editingBill.service_id || null, machinery_id: editingBill.machinery_id || null,
        report_date: editingBill.report_date,
        updated_at: new Date().toISOString(),
      };
      const maxSlots = Math.min(editRows.length, 14);
      for (let i = 0; i < maxSlots; i++) {
        const row = editRows[i];
        updatePayload[`consumable_${i + 1}_id`] = row.consumableId ? Number(row.consumableId) : null;
        updatePayload[`consumable_${i + 1}_units`] = row.units ? Number(row.units) : null;
        updatePayload[`consumable_${i + 1}_batch_id`] = row.batchId || null;
      }
      for (let i = maxSlots; i < 14; i++) { updatePayload[`consumable_${i + 1}_id`] = null; updatePayload[`consumable_${i + 1}_units`] = null; updatePayload[`consumable_${i + 1}_batch_id`] = null; }

      const { error } = await supabase.from('billable_report').update(updatePayload).eq('id', editingBill.id);
      if (!error) {
        await logAudit(previous, { ...updatePayload }, Object.keys(updatePayload));
        setEditingBill(null); setEditRows([]);
        showToast('success', 'Record updated successfully');
        generateReport();
      } else {
        console.error('Update error:', error);
        showToast('error', error.message || 'Failed to update record');
      }
    } catch (error) {
      console.error('Error updating bill:', error);
      showToast('error', error?.message || 'Failed to update record');
    }
  };

  const deleteBill = async (billId) => {
    if (!window.confirm(`Delete bill ${billId}? This cannot be undone.`)) return;
    try {
      const { error } = await supabase.from('billable_report').delete().eq('bill_id', billId);
      if (!error) {
        showToast('success', 'Record deleted successfully');
        generateReport();
      } else {
        console.error('Delete error:', error);
        showToast('error', error.message || 'Failed to delete record');
      }
    } catch (error) {
      console.error('Error deleting bill:', error);
      showToast('error', error?.message || 'Failed to delete record');
    }
  };

  const fmtDate = (d) => {
    if (!d) return '-';
    try { return format(new Date(d), 'dd MMM yyyy'); } catch { return d; }
  };

  return (
    <div className="animate-fade-in">
      {/* Page Header */}
      <div className="page-header">
        <div className="page-header-left">
          <h1>Reports</h1>
          <p>Generate and export consumables reports</p>
        </div>
      </div>

      {/* Filter Section */}
      {showFilters && (
        <div className="section-card">
          <div className="flex gap-3 mb-4">
            <button onClick={() => { setReportType('billable'); setReportData([]); setHasReport(false); }} className={`btn ${reportType === 'billable' ? 'btn-primary' : 'btn-ghost'}`}>
              Billable Report
            </button>
            <button onClick={() => { setReportType('non-billable'); setReportData([]); setHasReport(false); }} className={`btn ${reportType === 'non-billable' ? 'btn-primary' : 'btn-ghost'}`}>
              Non-Billable Summary
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted block">Start Date</label>
              <input type="date" value={dateRange.start} onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })} className="form-input" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted block">End Date</label>
              <input type="date" value={dateRange.end} onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })} className="form-input" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted block">Branch</label>
              <select value={filterBranch} onChange={(e) => setFilterBranch(e.target.value)} className="form-input">
                <option value="">All Branches</option>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.branch_name}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted block">Service</label>
              <select value={filterService} onChange={(e) => { setFilterService(e.target.value); setFilterMachinery(''); }} className="form-input">
                <option value="">All Services</option>
                {services.map((s) => <option key={s.id} value={s.id}>{s.service_name}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted block">Machinery</label>
              <select value={filterMachinery} onChange={(e) => setFilterMachinery(e.target.value)} className="form-input">
                <option value="">All Machinery</option>
                {machines.map((m) => <option key={m.id} value={m.id}>{m.machine_name}</option>)}
              </select>
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={generateReport} disabled={loading} className="btn btn-primary">
              {loading ? 'Generating...' : 'Generate Report'}
            </button>
            <button onClick={downloadCSV} disabled={reportData.length === 0} className="btn btn-secondary">
              Download Report (CSV)
            </button>
          </div>
        </div>
      )}

      {/* Report View */}
      {hasReport && reportData.length > 0 && (
        <div className="table-container">
          <div className="table-toolbar">
            <div className="table-toolbar-left">
              <span className="font-semibold text-text">Report Results</span>
              <span className="text-muted text-sm">({reportData.length} records)</span>
            </div>
            <div className="table-toolbar-right">
              <button onClick={() => setShowFilters(!showFilters)} className="btn btn-ghost btn-sm">
                {showFilters ? 'Hide Filters' : 'Show Filters'}
              </button>
              <button onClick={downloadCSV} disabled={reportData.length === 0} className="btn btn-primary btn-sm">
                Export Report
              </button>
              <button onClick={resetReport} style={{ color: 'var(--color-danger)' }} className="btn btn-ghost btn-sm">
                Exit Report
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="rpt-table">
              <thead>
                <tr>
                  {reportType === 'non-billable' ? (
                    <>
                      <th className="rpt-c-branch">Product Name</th>
                      <th>Total Batches</th>
                      <th>Active</th>
                      <th>Completed</th>
                      <th>Units Used</th>
                    </>
                  ) : (
                    <>
                      <th className="rpt-c-billid">Bill ID</th>
                      <th className="rpt-c-uid">UID</th>
                      <th className="rpt-c-date">Date</th>
                      <th className="rpt-c-branch">Branch</th>
                      <th className="rpt-c-machinery">Machinery</th>
                      <th className="rpt-c-service">Service</th>
                      {(() => {
                        const maxC = reportData.reduce((m, r) => Math.max(m, r.consumableCount), 0);
                        const maxN = reportData.reduce((m, r) => Math.max(m, r.nonBillableCount || 0), 0);
                        const cols = [];
                        for (let i = 1; i <= maxC; i++) {
                          cols.push(<th key={`h-${i}`} className="rpt-c-consumable" style={{ background: 'var(--color-tint-2)' }}>CONSUMABLE - {i}</th>);
                          cols.push(<th key={`hu-${i}`} className="rpt-c-units" style={{ background: 'var(--color-tint-2)' }}>UNITS - {i}</th>);
                          cols.push(<th key={`hc-${i}`} className="rpt-c-cost" style={{ background: 'var(--color-tint-2)' }}>COST - {i}</th>);
                        }
                        for (let i = 1; i <= maxN; i++) {
                          cols.push(<th key={`nh-${i}`} className="rpt-c-nonbill" style={{ background: '#F0FDF4' }}>NON-BILLABLE - {i}</th>);
                          cols.push(<th key={`nb-${i}`} className="rpt-c-units" style={{ background: '#F0FDF4' }}>BATCH - {i}</th>);
                        }
                        return cols;
                      })()}
                      <th className="rpt-c-total" style={{ background: 'var(--color-warnb)' }}>Total Cost</th>
                      <th className="rpt-c-actions sticky" style={{ background: 'var(--color-tint-2)' }}>Actions</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {reportData.map((row, index) => (
                  <tr key={index}>
                    {reportType === 'non-billable' ? (
                      <>
                        <td className="font-medium rpt-wrap">{row.product_name}</td>
                        <td className="rpt-nowrap">{row.total_batches}</td>
                        <td className="rpt-nowrap"><span className="tag tag-success">{row.active_batches}</span></td>
                        <td className="rpt-nowrap"><span className="tag tag-neutral">{row.completed_batches}</span></td>
                        <td className="font-semibold rpt-nowrap">{row.total_units}</td>
                      </>
                    ) : (
                      <>
                        <td className="rpt-nowrap">{row.bill_id}</td>
                        <td className="rpt-nowrap">{row.uid}</td>
                        <td className="rpt-nowrap"><span className="rpt-date">{fmtDate(row.report_date)}</span></td>
                        <td className="rpt-nowrap">{row.branch_name || '-'}</td>
                        <td className="rpt-nowrap">{row.machine_name || '-'}</td>
                        <td className="rpt-wrap">{row.service_name || '-'}</td>
                        {(() => {
                          const maxC = reportData.reduce((m, r) => Math.max(m, r.consumableCount), 0);
                          const maxN = reportData.reduce((m, r) => Math.max(m, r.nonBillableCount || 0), 0);
                          const cells = [];
                          for (let i = 1; i <= maxC; i++) {
                            const c = row.consumables.find((x) => x.slot === i);
                            cells.push(<td key={`d-${i}`} className="rpt-wrap">{c ? c.name : '-'}</td>);
                            cells.push(<td key={`du-${i}`} className="rpt-nowrap" style={{ textAlign: 'center' }}>{c && c.units ? c.units : '-'}</td>);
                            cells.push(<td key={`dc-${i}`} className="rpt-nowrap" style={{ textAlign: 'right' }}>{c && c.cost ? `${c.cost}` : '-'}</td>);
                          }
                          for (let i = 1; i <= maxN; i++) {
                            const nb = row.nonBillableUsed[i - 1];
                            cells.push(<td key={`n-${i}`} className="rpt-wrap">{nb ? nb.name : '-'}</td>);
                            cells.push(<td key={`nb-${i}`} className="rpt-nowrap" style={{ textAlign: 'center' }}>{nb ? nb.batch_id : '-'}</td>);
                          }
                          return cells;
                        })()}
                        <td className="rpt-nowrap rpt-total-cost" style={{ background: 'var(--color-warnb)' }}>
                          {row.totalCost || 0}
                        </td>
                        <td className="rpt-actions-cell">
                          <div className="flex items-center justify-center gap-1.5">
                            <button onClick={() => openEditBill(row.bill_id)} className="rpt-act-icon edit" title="Edit Record" aria-label="Edit Record">
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                            </button>
                            <button onClick={() => deleteBill(row.bill_id)} className="rpt-act-icon del" title="Delete Record" aria-label="Delete Record">
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                            </button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!hasReport && !loading && showFilters && (
        <div className="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
          <h3>No report data</h3>
          <p>Select filters and click "Generate Report"</p>
        </div>
      )}

      {/* Edit Modal */}
      {editingBill && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 820 }}>
            <div className="modal-header">
              <h3>Edit Bill - {editingBill.bill_id}</h3>
              <button onClick={() => { setEditingBill(null); setEditRows([]); }} className="btn btn-ghost btn-icon">×</button>
            </div>
            <div className="modal-body space-y-4">
              <div className="grid grid-cols-5 gap-4">
                <div>
                  <label className="text-xs font-semibold text-muted block mb-1">Bill ID</label>
                  <input type="text" value={editingBill.bill_id} disabled className="form-input" style={{ background: 'var(--color-tint-2)' }} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted block mb-1">UID</label>
                  <input type="text" value={editingBill.uid || ''} onChange={(e) => setEditingBill({...editingBill, uid: e.target.value})} className="form-input" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted block mb-1">Date</label>
                  <input type="date" value={editingBill.report_date} onChange={(e) => setEditingBill({...editingBill, report_date: e.target.value})} className="form-input" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted block mb-1">Service</label>
                  <select value={editingBill.service_id || ''} onChange={(e) => setEditingBill({...editingBill, service_id: e.target.value})} className="form-input">
                    <option value="">Select</option>
                    {services.map(s => <option key={s.id} value={s.id}>{s.service_name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted block mb-1">Machinery</label>
                  <select value={editingBill.machinery_id || ''} onChange={(e) => setEditingBill({...editingBill, machinery_id: e.target.value})} className="form-input">
                    <option value="">Select</option>
                    {machines.map(m => <option key={m.id} value={m.id}>{m.machine_name}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-muted block mb-1">Consumables</label>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {editRows.map((row, idx) => (
                    <div key={row.id} className="grid grid-cols-12 gap-2">
                      <div className="col-span-4"><input type="text" value={row.consumableId} onChange={(e) => { const newRows = [...editRows]; newRows[idx].consumableId = e.target.value; setEditRows(newRows); }} className="form-input" placeholder="Consumable ID" /></div>
                      <div className="col-span-2"><input type="text" value={row.units} onChange={(e) => { const newRows = [...editRows]; newRows[idx].units = e.target.value; setEditRows(newRows); }} className="form-input" placeholder="Units" /></div>
                      <div className="col-span-3"><input type="text" value={row.batchId} onChange={(e) => { const newRows = [...editRows]; newRows[idx].batchId = e.target.value; setEditRows(newRows); }} className="form-input" placeholder="Batch ID" /></div>
                      <div className="col-span-2 flex items-end">
                        <button onClick={() => setEditRows(editRows.filter((_, i) => i !== idx))} className="btn btn-ghost btn-sm" style={{ color: 'var(--color-danger)' }}>Remove</button>
                      </div>
                    </div>
                  ))}
                </div>
                <button onClick={() => setEditRows([...editRows, { id: Date.now(), consumableId: '', units: '', batchId: '' }])} className="btn btn-ghost btn-sm" style={{ marginTop: 8 }}>
                  + Add Consumable
                </button>
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => { setEditingBill(null); setEditRows([]); }} className="btn btn-secondary">Cancel</button>
              <button onClick={updateBill} className="btn btn-primary">Update Record</button>
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
};

export default Reports;