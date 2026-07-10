import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { supabase } from '../config/supabase';
import { useBranch } from '../context/BranchContext';

const Reports = () => {
  const { branchId } = useBranch();

  const [dateRange, setDateRange] = useState({
    start: format(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), 'dd-MM-yyyy'),
    end: format(new Date(), 'dd-MM-yyyy'),
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
      let { data } = await supabase
        .from('master_services')
        .select('id, service_name')
        .eq('branch_id', branchId)
        .order('service_name');
      if (!data || data.length === 0) {
        const res = await supabase.from('master_services').select('id, service_name').order('service_name');
        data = res.data;
      }
      if (data) setServices(data);
    } catch (error) { console.error('Error fetching services:', error); }
  };

  const fetchMachines = async (serviceId) => {
    try {
      let query = supabase
        .from('master_machinery')
        .select('id, machine_name')
        .eq('branch_id', branchId)
        .order('machine_name');
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
        const unique = data.filter((m) => {
          const key = m.machine_name.toLowerCase().trim();
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
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
      let query = supabase
        .from('billable_report')
        .select('*')
        .gte('report_date', dateRange.start)
        .lte('report_date', dateRange.end);

      if (filterBranch) query = query.eq('branch_id', filterBranch);
      if (filterService) query = query.eq('service_id', filterService);
      if (filterMachinery) query = query.eq('machinery_id', filterMachinery);

      const { data, error } = await query.order('bill_id', { ascending: true });

      if (!error && data) {
        const { data: bulkItems } = await supabase
          .from('bulk_consumables_registry')
          .select('id, product_name, batch_id');

        const branchIds = [...new Set(data.map((r) => r.branch_id).filter(Boolean))];
        let branchMap = {};
        if (branchIds.length > 0) {
          const { data: branchRows } = await supabase
            .from('branches')
            .select('id, branch_name')
            .in('id', branchIds);
          if (branchRows) branchRows.forEach((b) => { branchMap[b.id] = b.branch_name; });
        }

        const serviceIds = [...new Set(data.map((r) => r.service_id).filter(Boolean))];
        let serviceMap = {};
        if (serviceIds.length > 0) {
          const { data: serviceRows } = await supabase
            .from('master_services')
            .select('id, service_name')
            .in('id', serviceIds);
          if (serviceRows) serviceRows.forEach((s) => { serviceMap[s.id] = s.service_name; });
        }

        const machineryIds = [...new Set(data.map((r) => r.machinery_id).filter(Boolean))];
        let machineryMap = {};
        if (machineryIds.length > 0) {
          const { data: machineRows } = await supabase
            .from('master_machinery')
            .select('id, machine_name')
            .in('id', machineryIds);
          if (machineRows) machineRows.forEach((m) => { machineryMap[m.id] = m.machine_name; });
        }

        const consumableIds = new Set();
        data.forEach(row => {
          for (let i = 1; i <= 14; i++) {
            if (row[`consumable_${i}_id`]) consumableIds.add(row[`consumable_${i}_id`]);
          }
        });
        let consumableMap = {};
        if (consumableIds.size > 0) {
          const { data: consumableRows } = await supabase
            .from('master_consumables')
            .select('id, consumable_name')
            .in('id', Array.from(consumableIds));
          if (consumableRows) consumableRows.forEach((c) => { consumableMap[c.id] = c.consumable_name; });
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
            const cost = row[`consumable_${i}_cost`];
            
            // Process billable items (has consumable_id but no batch_id)
            if (consumableId && !batchId) {
              const name = consumableMap[consumableId] || '-';
              consumables.push({ slot: i, name, units, cost });
              if (units) totalUnits += Number(units);
              if (cost) totalCost += Number(cost);
            }
            
            // Collect non-billable items (has batch_id) for NON-BILLABLE & ACTION column
            if (batchId && bulkItems) {
              const bulkItem = bulkItems.find(b => b.batch_id === batchId);
              if (bulkItem && !nonBillableUsed.find(n => n.batch_id === batchId)) {
                nonBillableUsed.push({
                  name: bulkItem.product_name,
                  batch_id: batchId,
                  units: units
                });
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
    } catch (error) {
      console.error('Error generating report:', error);
      setHasReport(false);
    } finally {
      setLoading(false);
    }
  };

  const generateNonBillableReport = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('bulk_consumables_registry')
        .select('*')
        .gte('open_date', dateRange.start)
        .lte('open_date', dateRange.end)
        .order('open_date', { ascending: false });

      if (filterBranch) query = query.eq('branch_id', filterBranch);

      const { data: bulkData, error: bulkError } = await query;

      if (bulkError) {
        console.error('Bulk items error:', bulkError);
        setLoading(false);
        return;
      }

      console.log('Bulk data fetched:', bulkData?.length || 0);

      if (!bulkData || bulkData.length === 0) {
        setReportData([]);
        setHasReport(true);
        setShowFilters(false);
        return;
      }

      const grouped = {};
      bulkData.forEach(item => {
        if (!grouped[item.product_name]) {
          grouped[item.product_name] = {
            product_name: item.product_name,
            total_batches: 0,
            active_batches: 0,
            completed_batches: 0,
            total_units: 0,
            batch_ids: []
          };
        }
        const group = grouped[item.product_name];
        group.total_batches++;
        group.batch_ids.push(item.batch_id);
        if (item.status === 'Active') {
          group.active_batches++;
        } else {
          group.completed_batches++;
        }
      });

      const { data: billData } = await supabase
        .from('billable_report')
        .select('consumable_1_batch_id, consumable_2_batch_id, consumable_3_batch_id, consumable_4_batch_id, consumable_5_batch_id, consumable_6_batch_id, consumable_7_batch_id, consumable_8_batch_id, consumable_9_batch_id, consumable_10_batch_id, consumable_11_batch_id, consumable_12_batch_id, consumable_13_batch_id, consumable_14_batch_id');

      const usageCounts = {};
      if (billData) {
        billData.forEach(row => {
          for (let i = 1; i <= 14; i++) {
            const batchId = row[`consumable_${i}_batch_id`];
            if (batchId) usageCounts[batchId] = (usageCounts[batchId] || 0) + 1;
          }
        });
      }

      Object.keys(grouped).forEach(productName => {
        const group = grouped[productName];
        group.batch_ids.forEach(batchId => {
          group.total_units += usageCounts[batchId] || 0;
        });
      });

      const processed = Object.values(grouped);
      console.log('Processed non-billable report:', processed.length);
      setReportData(processed);
      setHasReport(true);
      setShowFilters(false);
    } catch (error) {
      console.error('Error generating non-billable report:', error);
      setHasReport(false);
    } finally {
      setLoading(false);
    }
  };

  const generateReport = async () => {
    if (reportType === 'billable') {
      await generateBillableReport();
    } else {
      await generateNonBillableReport();
    }
  };

  const downloadCSV = () => {
    if (reportData.length === 0) return;

    let headers, rows;

    if (reportType === 'non-billable') {
      headers = ['PRODUCT NAME', 'TOTAL BATCHES', 'ACTIVE BATCHES', 'COMPLETED BATCHES', 'TOTAL UNITS USED'];
      rows = reportData.map(row => [
        row.product_name,
        row.total_batches,
        row.active_batches,
        row.completed_batches,
        row.total_units,
      ]);
    } else {
      let maxConsumables = 0;
      reportData.forEach((r) => {
        if (r.consumableCount > maxConsumables) maxConsumables = r.consumableCount;
      });

      headers = ['BILL ID', 'UID', 'DATE', 'BRANCH', 'MACHINERY', 'SERVICE'];
      for (let i = 1; i <= maxConsumables; i++) {
        headers.push(`CONSUMABLE - ${i}`, `UNITS - ${i}`, `COST - ${i}`);
      }
      headers.push('TOTAL UNITS', 'TOTAL COST', 'NON-BILLABLE ITEMS');

      rows = reportData.map((row) => {
        const values = [
          row.bill_id,
          row.uid,
          row.report_date,
          row.branch_name || '',
          row.machine_name || '',
          row.service_name || '',
        ];
        for (let i = 1; i <= maxConsumables; i++) {
          const c = row.consumables.find((x) => x.slot === i);
          values.push(c ? c.name : '');
          values.push(c && c.units ? c.units : '');
          values.push(c && c.cost ? c.cost : '');
        }
        values.push(row.totalUnits || 0);
        values.push(row.totalCost || 0);
        const nonBillStr = row.nonBillableUsed?.length > 0 
          ? row.nonBillableUsed.map(n => `${n.name} (${n.batch_id})`).join(', ')
          : '';
        values.push(nonBillStr);
        return values;
      });
    }

    const csvRows = [headers.join(','), ...rows.map(r => r.join(','))];
    const csv = csvRows.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${reportType}-report-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const [editingBill, setEditingBill] = useState(null);
  const [editRows, setEditRows] = useState([]);

  const openEditBill = async (billId) => {
    try {
      const { data, error } = await supabase
        .from('billable_report')
        .select('*')
        .eq('bill_id', billId)
        .single();

      if (!error && data) {
        setEditingBill(data);
        const rows = [];
        for (let i = 1; i <= 14; i++) {
          if (data[`consumable_${i}_id`]) {
            rows.push({
              id: Date.now() + i,
              consumableId: data[`consumable_${i}_id`],
              units: data[`consumable_${i}_units`] || '',
              batchId: data[`consumable_${i}_batch_id`] || '',
            });
          }
        }
        setEditRows(rows);
      }
    } catch (error) {
      console.error('Error fetching bill for edit:', error);
    }
  };

  const updateBill = async () => {
    try {
      const updatePayload = {
        bill_id: editingBill.bill_id,
        uid: editingBill.uid,
        service_id: editingBill.service_id,
        machinery_id: editingBill.machinery_id,
        report_date: editingBill.report_date,
      };

      const maxSlots = Math.min(editRows.length, 14);
      for (let i = 0; i < maxSlots; i++) {
        const row = editRows[i];
        updatePayload[`consumable_${i + 1}_id`] = row.consumableId ? Number(row.consumableId) : null;
        updatePayload[`consumable_${i + 1}_units`] = row.units ? Number(row.units) : null;
        updatePayload[`consumable_${i + 1}_batch_id`] = row.batchId || null;
      }

      for (let i = maxSlots; i < 14; i++) {
        updatePayload[`consumable_${i + 1}_id`] = null;
        updatePayload[`consumable_${i + 1}_units`] = null;
        updatePayload[`consumable_${i + 1}_batch_id`] = null;
      }

      const { error } = await supabase
        .from('billable_report')
        .update(updatePayload)
        .eq('id', editingBill.id);

      if (!error) {
        setEditingBill(null);
        setEditRows([]);
        generateReport();
        setToast({ type: 'success', message: 'Bill updated successfully' });
        setTimeout(() => setToast(null), 3000);
      } else {
        console.error('Update error:', error);
      }
    } catch (error) {
      console.error('Error updating bill:', error);
    }
  };

  const [toast, setToast] = useState(null);

  return (
    <div className="space-y-6">
      {/* Filter Section */}
      {showFilters && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">
            {reportType === 'billable' ? 'Billable Consumables Report' : 'Non-Billable Summary'}
          </h3>

          <div className="flex gap-3 mb-4">
            <button
              onClick={() => { setReportType('billable'); setReportData([]); setHasReport(false); }}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                reportType === 'billable' ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              Billable Report
            </button>
            <button
              onClick={() => { setReportType('non-billable'); setReportData([]); setHasReport(false); }}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                reportType === 'non-billable' ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              Non-Billable Summary
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div className="space-y-1">
              <label className="block text-[11px] uppercase tracking-wider font-semibold text-slate-500">Start Date</label>
              <input
                type="date"
                value={dateRange.start}
                onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
                className="w-full h-9 px-3 bg-white border border-slate-300 rounded-lg focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 focus:outline-none transition-all duration-200 text-sm text-slate-900"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-[11px] uppercase tracking-wider font-semibold text-slate-500">End Date</label>
              <input
                type="date"
                value={dateRange.end}
                onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
                className="w-full h-9 px-3 bg-white border border-slate-300 rounded-lg focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 focus:outline-none transition-all duration-200 text-sm text-slate-900"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-[11px] uppercase tracking-wider font-semibold text-slate-500">Branch</label>
              <select
                value={filterBranch}
                onChange={(e) => setFilterBranch(e.target.value)}
                className="w-full h-9 px-3 bg-white border border-slate-300 rounded-lg focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 focus:outline-none transition-all duration-200 text-sm text-slate-900"
              >
                <option value="">All Branches</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>{b.branch_name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="block text-[11px] uppercase tracking-wider font-semibold text-slate-500">Service</label>
              <select
                value={filterService}
                onChange={(e) => {
                  setFilterService(e.target.value);
                  setFilterMachinery('');
                }}
                className="w-full h-9 px-3 bg-white border border-slate-300 rounded-lg focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 focus:outline-none transition-all duration-200 text-sm text-slate-900"
              >
                <option value="">All Services</option>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>{s.service_name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1 md:col-span-2">
              <label className="block text-[11px] uppercase tracking-wider font-semibold text-slate-500">Machinery</label>
              <select
                value={filterMachinery}
                onChange={(e) => setFilterMachinery(e.target.value)}
                className="w-full h-9 px-3 bg-white border border-slate-300 rounded-lg focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 focus:outline-none transition-all duration-200 text-sm text-slate-900"
              >
                <option value="">All Machinery</option>
                {machines.map((m) => (
                  <option key={m.id} value={m.id}>{m.machine_name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={generateReport}
              disabled={loading}
              className="bg-sky-600 text-white px-5 py-2 rounded-lg hover:bg-sky-700 transition-all text-sm font-semibold disabled:bg-slate-400 disabled:cursor-not-allowed shadow-sm"
            >
              {loading ? 'Generating...' : 'Generate Report'}
            </button>
            <button
              onClick={downloadCSV}
              disabled={reportData.length === 0}
              className="bg-emerald-600 text-white px-5 py-2 rounded-lg hover:bg-emerald-700 transition-all text-sm font-semibold disabled:bg-slate-400 disabled:cursor-not-allowed shadow-sm"
            >
              Download Report (CSV)
            </button>
          </div>
        </div>
      )}

      {/* Report View Mode */}
      {hasReport && reportData.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="bg-slate-50 border-b border-slate-200 px-6 py-3 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">
                Report Results ({reportData.length} records)
              </h3>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowFilters(!showFilters)}
                className="px-4 py-2 bg-sky-600 text-white rounded-lg hover:bg-sky-700 transition-all text-sm font-semibold shadow-sm"
              >
                {showFilters ? 'Hide Filters' : 'Show Filters'}
              </button>
              <button
                onClick={downloadCSV}
                disabled={reportData.length === 0}
                className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-all text-sm font-semibold shadow-sm disabled:bg-slate-400 disabled:cursor-not-allowed"
              >
                Export Report
              </button>
              <button
                onClick={resetReport}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-all text-sm font-semibold shadow-sm"
              >
                Exit Report
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  {reportType === 'non-billable' ? (
                    <>
                      <th className="text-left px-3 py-2.5 font-semibold text-slate-600 uppercase tracking-wider whitespace-nowrap">PRODUCT NAME</th>
                      <th className="text-left px-3 py-2.5 font-semibold text-slate-600 uppercase tracking-wider whitespace-nowrap">TOTAL BATCHES</th>
                      <th className="text-left px-3 py-2.5 font-semibold text-slate-600 uppercase tracking-wider whitespace-nowrap">ACTIVE</th>
                      <th className="text-left px-3 py-2.5 font-semibold text-slate-600 uppercase tracking-wider whitespace-nowrap">COMPLETED</th>
                      <th className="text-left px-3 py-2.5 font-semibold text-slate-600 uppercase tracking-wider whitespace-nowrap">UNITS USED</th>
                    </>
                  ) : (
                    <>
                      <th className="text-left px-3 py-2.5 font-semibold text-slate-600 uppercase tracking-wider whitespace-nowrap">BILL ID</th>
                      <th className="text-left px-3 py-2.5 font-semibold text-slate-600 uppercase tracking-wider whitespace-nowrap">UID</th>
                      <th className="text-left px-3 py-2.5 font-semibold text-slate-600 uppercase tracking-wider whitespace-nowrap">DATE</th>
                      <th className="text-left px-3 py-2.5 font-semibold text-slate-600 uppercase tracking-wider whitespace-nowrap">BRANCH</th>
                      <th className="text-left px-3 py-2.5 font-semibold text-slate-600 uppercase tracking-wider whitespace-nowrap">MACHINERY</th>
                      <th className="text-left px-3 py-2.5 font-semibold text-slate-600 uppercase tracking-wider whitespace-nowrap">SERVICE</th>
                      {reportType === 'billable' && (() => {
                        let maxC = 0;
                        reportData.forEach((r) => { if (r.consumableCount > maxC) maxC = r.consumableCount; });
                        const cols = [];
                        for (let i = 1; i <= maxC; i++) {
                          cols.push(
                            <th key={`h-${i}`} className="text-left px-3 py-2.5 font-semibold text-slate-600 uppercase tracking-wider whitespace-nowrap bg-purple-50">CONSUMABLE - {i}</th>,
                            <th key={`hu-${i}`} className="text-left px-3 py-2.5 font-semibold text-slate-600 uppercase tracking-wider whitespace-nowrap bg-purple-50">UNITS - {i}</th>,
                            <th key={`hc-${i}`} className="text-left px-3 py-2.5 font-semibold text-slate-600 uppercase tracking-wider whitespace-nowrap bg-purple-50">COST - {i}</th>
                          );
                        }
                        return cols;
                      })()}
                    </>
                  )}
                  {reportType === 'billable' && (
                    <th className="text-left px-3 py-2.5 font-semibold text-slate-600 uppercase tracking-wider whitespace-nowrap bg-yellow-50">TOTAL</th>
                  )}
                  {reportType === 'billable' && (
                    <th className="text-left px-3 py-2.5 font-semibold text-slate-600 uppercase tracking-wider whitespace-nowrap">NON-BILLABLE & ACTION</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {reportData.map((row, index) => (
                  <tr
                    key={index}
                    className={`border-b border-slate-100 hover:bg-slate-50 transition-all ${
                      index % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'
                    }`}
                  >
                    {reportType === 'non-billable' ? (
                      <>
                        <td className="px-3 py-2.5 text-slate-800 font-medium whitespace-nowrap">{row.product_name}</td>
                        <td className="px-3 py-2.5 text-slate-600 text-center whitespace-nowrap">{row.total_batches}</td>
                        <td className="px-3 py-2.5 text-center whitespace-nowrap">
                          <span className="bg-emerald-50 text-emerald-700 px-2 py-1 rounded font-semibold">{row.active_batches}</span>
                        </td>
                        <td className="px-3 py-2.5 text-center whitespace-nowrap">
                          <span className="bg-slate-100 text-slate-600 px-2 py-1 rounded font-semibold">{row.completed_batches}</span>
                        </td>
                        <td className="px-3 py-2.5 text-slate-600 text-center whitespace-nowrap">{row.total_units}</td>
                      </>
                    ) : (
                      <>
                        <td className="px-3 py-2.5 font-medium text-slate-900 whitespace-nowrap">{row.bill_id}</td>
                        <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">{row.uid}</td>
                        <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">{row.report_date}</td>
                        <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">{row.branch_name || '-'}</td>
                        <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">{row.machine_name || '-'}</td>
                        <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">{row.service_name || '-'}</td>
                        {(() => {
                          let maxC = 0;
                          reportData.forEach((r) => { if (r.consumableCount > maxC) maxC = r.consumableCount; });
                          const cells = [];
                          for (let i = 1; i <= maxC; i++) {
                            const c = row.consumables.find((x) => x.slot === i);
                            cells.push(
                              <td key={`d-${i}`} className="px-3 py-2.5 text-slate-800 whitespace-nowrap">{c ? c.name : '-'}</td>,
                              <td key={`du-${i}`} className="px-3 py-2.5 text-slate-600 whitespace-nowrap text-center">{c && c.units ? c.units : '-'}</td>,
                              <td key={`dc-${i}`} className="px-3 py-2.5 text-slate-600 whitespace-nowrap text-right">{c && c.cost ? `$${c.cost}` : '-'}</td>
                            );
                          }
                          return cells;
                        })()}
                      </>
                    )}
                    {reportType === 'billable' && (
                      <td className="px-3 py-2.5 whitespace-nowrap bg-yellow-50">
                        <div className="font-semibold text-slate-900">
                          Units: {row.totalUnits || 0} | Cost: ${row.totalCost || 0}
                        </div>
                      </td>
                    )}
                    {reportType === 'billable' && (
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <div className="flex flex-col gap-1">
                          <button
                            onClick={() => openEditBill(row.bill_id)}
                            className="text-sky-700 hover:text-sky-900 text-xs font-semibold"
                          >
                            Edit
                          </button>
                          {row.nonBillableUsed?.length > 0 && (
                            <div className="text-[10px] text-slate-600">
                              <div className="font-semibold">Non-Billable:</div>
                              {row.nonBillableUsed.map((nb, i) => (
                                <div key={i}>{nb.name} ({nb.batch_id}) - {nb.units} units</div>
                              ))}
                            </div>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editingBill && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full max-h-screen overflow-y-auto">
            <div className="p-6 border-b border-slate-200">
              <h3 className="text-lg font-semibold text-slate-900">Edit Bill - {editingBill.bill_id}</h3>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-5 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">Bill ID</label>
                  <input type="text" value={editingBill.bill_id} disabled className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-slate-100 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">UID</label>
                  <input type="text" value={editingBill.uid} onChange={(e) => setEditingBill({...editingBill, uid: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">Date</label>
                  <input type="date" value={editingBill.report_date} onChange={(e) => setEditingBill({...editingBill, report_date: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">Service</label>
                  <select value={editingBill.service_id || ''} onChange={(e) => setEditingBill({...editingBill, service_id: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm">
                    <option value="">Select</option>
                    {services.map(s => <option key={s.id} value={s.id}>{s.service_name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">Machinery</label>
                  <select value={editingBill.machinery_id || ''} onChange={(e) => setEditingBill({...editingBill, machinery_id: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm">
                    <option value="">Select</option>
                    {machines.map(m => <option key={m.id} value={m.id}>{m.machine_name}</option>)}
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-semibold text-slate-700">Consumables</label>
                {editRows.map((row, idx) => (
                  <div key={row.id} className="grid grid-cols-12 gap-2">
                    <div className="col-span-4">
                      <input type="text" value={row.consumableId} onChange={(e) => {
                        const newRows = [...editRows];
                        newRows[idx].consumableId = e.target.value;
                        setEditRows(newRows);
                      }} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" placeholder="Consumable ID" />
                    </div>
                    <div className="col-span-2">
                      <input type="text" value={row.units} onChange={(e) => {
                        const newRows = [...editRows];
                        newRows[idx].units = e.target.value;
                        setEditRows(newRows);
                      }} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" placeholder="Units" />
                    </div>
                    <div className="col-span-3">
                      <input type="text" value={row.batchId} onChange={(e) => {
                        const newRows = [...editRows];
                        newRows[idx].batchId = e.target.value;
                        setEditRows(newRows);
                      }} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" placeholder="Batch ID" />
                    </div>
                    <div className="col-span-2">
                      <button onClick={() => setEditRows(editRows.filter((_, i) => i !== idx))} className="text-red-600 hover:text-red-800 text-sm">Remove</button>
                    </div>
                  </div>
                ))}
                <button onClick={() => setEditRows([...editRows, { id: Date.now(), consumableId: '', units: '', batchId: '' }])} className="text-sky-700 hover:text-sky-900 text-sm font-semibold">
                  + Add Consumable
                </button>
              </div>
            </div>
            <div className="p-6 border-t border-slate-200 flex justify-end gap-3">
              <button onClick={() => { setEditingBill(null); setEditRows([]); }} className="px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-50 text-sm font-semibold">Cancel</button>
              <button onClick={updateBill} className="px-4 py-2 bg-sky-600 text-white rounded-lg hover:bg-sky-700 text-sm font-semibold">Update Bill</button>
            </div>
          </div>
        </div>
      )}

      {!hasReport && !loading && showFilters && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12 text-center">
          <div className="text-slate-500 text-sm">
            No report data available. Select filters and click "Generate Report".
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed right-4 bottom-4 px-4 py-3 rounded-lg shadow-lg ${
            toast.type === 'success' ? 'bg-emerald-500 text-white' : toast.type === 'warning' ? 'bg-amber-500 text-white' : 'bg-red-500 text-white'
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
};

export default Reports;