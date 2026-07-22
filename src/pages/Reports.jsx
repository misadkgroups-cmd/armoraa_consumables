import React, { useState, useEffect, useCallback } from 'react';
import { format } from 'date-fns';
import * as XLSX from 'xlsx';
import { supabase } from '../config/supabase';
import { useBranch } from '../context/BranchContext';
import SearchableDropdown from '../components/SearchableDropdown';
import {
  getDetailedNonBillableReport,
  getSummaryNonBillableReport,
} from '../services/nonBillableReports';

const Reports = () => {
  const { branchId: ctxBranch } = useBranch();

  // Primary filters
  const [dateRange, setDateRange] = useState({
    start: format(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd'),
    end: format(new Date(), 'yyyy-MM-dd'),
  });
  const [filterBranch, setFilterBranch] = useState('');
  const [filterService, setFilterService] = useState('');
  const [filterMachinery, setFilterMachinery] = useState('');

  // Dropdown master data
  const [branches, setBranches] = useState([]);
  const [services, setServices] = useState([]);
  const [machines, setMachines] = useState([]);

  // Billable state
  const [rawReportData, setRawReportData] = useState([]);
  const [reportData, setReportData] = useState([]);
  const [maxServices, setMaxServices] = useState(1);
  const [maxConsumables, setMaxConsumables] = useState(1);
  const [loading, setLoading] = useState(false);
  const [reportType, setReportType] = useState('billable');
  const [billableReportView, setBillableReportView] = useState('bill-wise');
  const [hasReport, setHasReport] = useState(false);

  // Non-Billable state
  const [nbStart, setNbStart] = useState(
    format(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd')
  );
  const [nbEnd, setNbEnd] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [nbBranch, setNbBranch] = useState('');
  const [nbReportMode, setNbReportMode] = useState('detailed');
  const [nbData, setNbData] = useState([]);
  const [nbLoading, setNbLoading] = useState(false);
  const [nbHasReport, setNbHasReport] = useState(false);

  // UI state
  const [toast, setToast] = useState(null);

  useEffect(() => {
    if (ctxBranch && !filterBranch) setFilterBranch(ctxBranch);
  }, [ctxBranch]);

  useEffect(() => {
    if (ctxBranch) {
      fetchBranches();
      fetchServices();
      fetchMachines();
    }
  }, [ctxBranch]);

  const fetchBranches = async () => {
    try {
      const { data } = await supabase.from('branches').select('id, branch_name').order('branch_name');
      if (data) setBranches(data);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchServices = async () => {
    try {
      let { data } = await supabase
        .from('master_services')
        .select('id, service_name')
        .eq('branch_id', ctxBranch)
        .order('service_name');

      if (!data || data.length === 0) {
        const r = await supabase.from('master_services').select('id, service_name').order('service_name');
        data = r.data;
      }
      if (data) setServices(data);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchMachines = async (serviceId) => {
    try {
      let q = supabase
        .from('master_machinery')
        .select('id, machine_name')
        .eq('branch_id', ctxBranch)
        .order('machine_name');

      if (serviceId) q = q.eq('service_id', serviceId);

      let { data } = await q;
      if (!data || data.length === 0) {
        let fq = supabase.from('master_machinery').select('id, machine_name').order('machine_name');
        if (serviceId) fq = fq.eq('service_id', serviceId);
        const r = await fq;
        data = r.data;
      }
      if (data) {
        const seen = new Set();
        const uniq = data.filter((m) => {
          const k = m.machine_name.toLowerCase().trim();
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        });
        setMachines(uniq);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const showToast = (type, message) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3500);
  };

  // Group raw rows into Service-wise or Bill-wise format
  const processReportData = useCallback((rows, viewMode) => {
    if (!rows || !rows.length) return { processed: [], maxS: 1, maxC: 1 };

    if (viewMode === 'service-wise') {
      let maxC = 1;
      const processed = rows.map((r) => {
        const cList = r.consumables || [];
        if (cList.length > maxC) maxC = cList.length;
        return {
          ...r,
          servicesList: r.service_name && r.service_name !== '-' ? [r.service_name] : ['-'],
        };
      });
      return { processed, maxS: 1, maxC };
    }

    // Bill-wise grouping
    const groupedMap = new Map();
    let globalMaxServices = 1;
    let globalMaxConsumables = 1;

    rows.forEach((row) => {
      const billKey = String(row.bill_no || row.bill_id || row.billing_log_id || row.id);

      if (!groupedMap.has(billKey)) {
        groupedMap.set(billKey, {
          id: row.id,
          bill_no: row.bill_no || row.bill_id || '-',
          bill_id: row.bill_id || '-',
          patient_name: row.patient_name || '-',
          uid: row.uid || '-',
          report_date: row.report_date || '-',
          branch_name: row.branch_name || '-',
          servicesList: row.service_name && row.service_name !== '-' ? [row.service_name] : [],
          machinesList: row.machine_name && row.machine_name !== '-' ? [row.machine_name] : [],
          consumablesMap: new Map(),
          rawIds: [row.id],
        });
      }

      const billGroup = groupedMap.get(billKey);

      if (row.service_name && row.service_name !== '-' && !billGroup.servicesList.includes(row.service_name)) {
        billGroup.servicesList.push(row.service_name);
      }

      if (row.machine_name && row.machine_name !== '-' && !billGroup.machinesList.includes(row.machine_name)) {
        billGroup.machinesList.push(row.machine_name);
      }

      if (!billGroup.rawIds.includes(row.id)) {
        billGroup.rawIds.push(row.id);
      }

      if (Array.isArray(row.consumables)) {
        row.consumables.forEach((c) => {
          if (!c || !c.name) return;
          const key = c.name.toLowerCase().trim();
          const existing = billGroup.consumablesMap.get(key) || { name: c.name, units: 0, cost: c.cost || 0 };
          existing.units += Number(c.units || 0);
          billGroup.consumablesMap.set(key, existing);
        });
      }
    });

    const processed = Array.from(groupedMap.values()).map((group) => {
      const combinedConsumables = Array.from(group.consumablesMap.values()).map((item, idx) => ({
        slot: idx + 1,
        name: item.name,
        units: item.units,
        cost: item.cost,
      }));

      if (group.servicesList.length > globalMaxServices) globalMaxServices = group.servicesList.length;
      if (combinedConsumables.length > globalMaxConsumables) globalMaxConsumables = combinedConsumables.length;

      const groupTotalUnits = combinedConsumables.reduce((acc, cur) => acc + cur.units, 0);
      const groupTotalCost = combinedConsumables.reduce((acc, cur) => acc + cur.units * cur.cost, 0);

      return {
        id: group.id,
        bill_no: group.bill_no,
        bill_id: group.bill_id,
        patient_name: group.patient_name,
        uid: group.uid,
        report_date: group.report_date,
        branch_name: group.branch_name,
        servicesList: group.servicesList.length > 0 ? group.servicesList : ['-'],
        machine_name: group.machinesList.length > 0 ? group.machinesList.join(', ') : '-',
        consumables: combinedConsumables,
        consumableCount: combinedConsumables.length,
        totalUnits: groupTotalUnits,
        totalCost: groupTotalCost,
        rawIds: group.rawIds,
      };
    });

    return { processed, maxS: globalMaxServices, maxC: globalMaxConsumables };
  }, []);

  useEffect(() => {
    if (rawReportData.length > 0) {
      const { processed, maxS, maxC } = processReportData(rawReportData, billableReportView);
      setReportData(processed);
      setMaxServices(maxS);
      setMaxConsumables(maxC);
    } else {
      setReportData([]);
      setMaxServices(1);
      setMaxConsumables(1);
    }
  }, [billableReportView, rawReportData, processReportData]);

  // ============ BILLABLE REPORT FETCH ============
  const generateBillableReport = async () => {
    setLoading(true);
    try {
      // 1. Fetch billable_report records
      let query = supabase
        .from('billable_report')
        .select('*')
        .gte('report_date', dateRange.start)
        .lte('report_date', dateRange.end);

      if (filterBranch) query = query.eq('branch_id', filterBranch);
      if (filterService) query = query.eq('service_id', filterService);
      if (filterMachinery) query = query.eq('machinery_id', filterMachinery);

      const { data, error } = await query.order('id', { ascending: true });

      if (error) {
        console.error('Error querying billable_report:', error);
        throw error;
      }

      if (!data || data.length === 0) {
        setRawReportData([]);
        setHasReport(true);
        setLoading(false);
        return;
      }

      // 2. Hydrate Foreign Key Labels (Branches, Services, Machinery, Billing Log)
      const branchIds = [...new Set(data.map((r) => r.branch_id).filter(Boolean))];
      let branchMap = {};
      if (branchIds.length) {
        const { data: br } = await supabase.from('branches').select('id, branch_name').in('id', branchIds);
        if (br) br.forEach((b) => (branchMap[b.id] = b.branch_name));
      }

      const serviceIds = [...new Set(data.map((r) => r.service_id).filter(Boolean))];
      let serviceMap = {};
      if (serviceIds.length) {
        const { data: sr } = await supabase.from('master_services').select('id, service_name').in('id', serviceIds);
        if (sr) sr.forEach((s) => (serviceMap[s.id] = s.service_name));
      }

      const machineryIds = [...new Set(data.map((r) => r.machinery_id).filter(Boolean))];
      let machineryMap = {};
      if (machineryIds.length) {
        const { data: mr } = await supabase.from('master_machinery').select('id, machine_name').in('id', machineryIds);
        if (mr) mr.forEach((m) => (machineryMap[m.id] = m.machine_name));
      }

      // 3. Extract all consumable IDs from consumable_1_id ... consumable_14_id
      const billableConsumableIds = new Set();
      const nonBillableConsumableIds = new Set();

      data.forEach((row) => {
        for (let i = 1; i <= 14; i++) {
          const cId = row[`consumable_${i}_id`];
          const isNB = row[`is_non_billable_${i}`];
          if (cId) {
            if (isNB) {
              nonBillableConsumableIds.add(cId);
            } else {
              billableConsumableIds.add(cId);
            }
          }
        }
      });

      // Fetch Billable Master Products
      let billableProducts = {};
      if (billableConsumableIds.size > 0) {
        const { data: bp } = await supabase
          .from('master_billable_consumables')
          .select('id, product_name, cost_unit')
          .in('id', Array.from(billableConsumableIds));
        if (bp) {
          bp.forEach((p) => {
            billableProducts[p.id] = { name: p.product_name, cost: Number(p.cost_unit || 0) };
          });
        }
      }

      // Fetch Non-Billable Master Products
      let nonBillableProducts = {};
      if (nonBillableConsumableIds.size > 0) {
        const { data: nbp } = await supabase
          .from('master_non_billable_consumables')
          .select('id, product_name, cost')
          .in('id', Array.from(nonBillableConsumableIds));
        if (nbp) {
          nbp.forEach((p) => {
            nonBillableProducts[p.id] = { name: p.product_name, cost: Number(p.cost || 0) };
          });
        }
      }

      // 4. Transform flat columns into structured consumable list
      const processedRows = data.map((row) => {
        const consumables = [];
        let totalUnits = 0;
        let totalCost = 0;

        for (let i = 1; i <= 14; i++) {
          const cId = row[`consumable_${i}_id`];
          const units = Number(row[`consumable_${i}_units`] || 0);
          const isNB = row[`is_non_billable_${i}`];

          if (cId) {
            const product = isNB
              ? nonBillableProducts[cId] || { name: `Non-Billable Item #${cId}`, cost: 0 }
              : billableProducts[cId] || { name: `Billable Item #${cId}`, cost: 0 };

            consumables.push({
              slot: i,
              name: product.name,
              units,
              cost: product.cost,
            });

            totalUnits += units;
            totalCost += units * product.cost;
          }
        }

        return {
          ...row,
          bill_no: row.bill_no || row.bill_id || '-',
          bill_id: row.bill_id || '-',
          uid: row.uid || '-',
          patient_name: row.patient_name || '-',
          report_date: row.report_date || '-',
          branch_name: (row.branch_id ? branchMap[row.branch_id] : null) || '-',
          service_name: row.service_name || (row.service_id ? serviceMap[row.service_id] : null) || '-',
          machine_name: row.machine_name || (row.machinery_id ? machineryMap[row.machinery_id] : null) || '-',
          consumables,
          consumableCount: consumables.length,
          totalUnits,
          totalCost,
        };
      });

      setRawReportData(processedRows);
      setHasReport(true);
    } catch (e) {
      console.error('Error generating billable report:', e);
      setRawReportData([]);
      setHasReport(true);
    } finally {
      setLoading(false);
    }
  };

  // ============ NON-BILLABLE CASCADING ============
  const reloadNonBillable = useCallback(async () => {
    setNbLoading(true);
    try {
      const filters = { branchId: nbBranch || undefined, startDate: nbStart, endDate: nbEnd };
      const rows =
        nbReportMode === 'summary'
          ? await getSummaryNonBillableReport(filters)
          : await getDetailedNonBillableReport(filters);

      setNbData(rows || []);
      setNbHasReport(true);
    } catch (e) {
      console.error('NB error', e);
      setNbData([]);
      setNbHasReport(true);
    } finally {
      setNbLoading(false);
    }
  }, [nbStart, nbEnd, nbBranch, nbReportMode]);

  useEffect(() => {
    if (reportType === 'non-billable') reloadNonBillable();
  }, [reportType, reloadNonBillable]);

  const clearBillableFilters = () => {
    setDateRange({
      start: format(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd'),
      end: format(new Date(), 'yyyy-MM-dd'),
    });
    setFilterBranch(ctxBranch || '');
    setFilterService('');
    setFilterMachinery('');
    setRawReportData([]);
    setReportData([]);
    setHasReport(false);
  };

  const clearNbFilters = () => {
    setNbBranch('');
  };

  // ============ EXPORTS ============
  const downloadCSV = () => {
    let headers, rows;
    if (reportType === 'non-billable') {
      if (nbReportMode === 'summary') {
        headers = ['NON-BILLABLE CONSUMABLE', 'QUANTITY USED', 'TOTAL COST'];
        rows = nbData.map((r) => [r['NON-BILLABLE CONSUMABLE'] || '-', r['QUANTITY USED'] || 0, r['TOTAL COST'] || 0]);
      } else {
        headers = [
          'DATE',
          'BRANCH',
          'NON-BILLABLE CONSUMABLE',
          'OPENING DATE',
          'CLOSING DATE',
          'SERVICE USED BY',
          'TIMES USED',
          'STATUS',
        ];
        rows = nbData.map((r) => [
          r.date || '-',
          r.branch || '-',
          r.consumableName || '-',
          r.openingDate || '-',
          r.closingDate || '-',
          r.serviceUsedBy || '-',
          r.serviceUsedCount || 0,
          r.status || '-',
        ]);
      }
    } else {
      if (reportData.length === 0) return;

      headers = ['BILL ID', 'PATIENT NAME', 'UID', 'DATE', 'BRANCH'];
      for (let s = 1; s <= maxServices; s++) headers.push(`SERVICE ${s}`);
      headers.push('MACHINERY');
      for (let i = 1; i <= maxConsumables; i++) headers.push(`CONSUMABLE ${i}`, `UNITS ${i}`, `COST ${i}`);
      headers.push('TOTAL UNITS', 'TOTAL COST');

      rows = reportData.map((row) => {
        const v = [
          row.bill_no || row.bill_id || '-',
          row.patient_name || '-',
          row.uid || '-',
          row.report_date || '-',
          row.branch_name || '-',
        ];

        for (let s = 0; s < maxServices; s++) {
          v.push(row.servicesList && row.servicesList[s] ? row.servicesList[s] : '-');
        }

        v.push(row.machine_name || '-');

        for (let i = 0; i < maxConsumables; i++) {
          const c = row.consumables ? row.consumables[i] : null;
          v.push(c ? c.name : '-', c && c.units ? c.units : 0, c && c.cost ? c.cost : 0);
        }

        v.push(row.totalUnits || 0, row.totalCost || 0);
        return v;
      });
    }

    const csv = [
      headers.join(','),
      ...rows.map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${reportType}-${billableReportView}-report-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadExcel = () => {
    let rows;
    if (reportType === 'non-billable') {
      if (nbReportMode === 'summary') {
        rows = nbData.map((r) => ({
          'NON-BILLABLE CONSUMABLE': r['NON-BILLABLE CONSUMABLE'] || '-',
          'QUANTITY USED': r['QUANTITY USED'] || 0,
          'TOTAL COST': r['TOTAL COST'] || 0,
        }));
      } else {
        rows = nbData.map((r) => ({
          DATE: r.date || '-',
          BRANCH: r.branch || '-',
          'NON-BILLABLE CONSUMABLE': r.consumableName || '-',
          'OPENING DATE': r.openingDate || '-',
          'CLOSING DATE': r.closingDate || '-',
          'SERVICE USED BY': r.serviceUsedBy || '-',
          'TIMES USED': r.serviceUsedCount || 0,
          STATUS: r.status || '-',
        }));
      }
    } else {
      if (reportData.length === 0) return;

      rows = reportData.map((row) => {
        const rowObj = {
          'BILL ID': row.bill_no || row.bill_id || '-',
          'PATIENT NAME': row.patient_name || '-',
          UID: row.uid || '-',
          DATE: row.report_date || '-',
          BRANCH: row.branch_name || '-',
        };

        for (let s = 0; s < maxServices; s++) {
          rowObj[`SERVICE ${s + 1}`] = row.servicesList && row.servicesList[s] ? row.servicesList[s] : '-';
        }

        rowObj['MACHINERY'] = row.machine_name || '-';

        for (let i = 0; i < maxConsumables; i++) {
          const c = row.consumables ? row.consumables[i] : null;
          rowObj[`CONSUMABLE ${i + 1}`] = c ? c.name : '-';
          rowObj[`UNITS ${i + 1}`] = c && c.units ? c.units : 0;
          rowObj[`COST ${i + 1}`] = c && c.cost ? c.cost : 0;
        }

        rowObj['TOTAL UNITS'] = row.totalUnits || 0;
        rowObj['TOTAL COST'] = row.totalCost || 0;
        return rowObj;
      });
    }

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      workbook,
      worksheet,
      reportType === 'non-billable' ? 'Non-Billable Report' : 'Billable Report'
    );
    XLSX.writeFile(workbook, `${reportType}-${billableReportView}-report-${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
  };

  const deleteBill = async (id) => {
    if (!window.confirm(`Delete report record #${id}? This action cannot be undone.`)) return;
    try {
      const { error } = await supabase.from('billable_report').delete().eq('id', id);
      if (!error) {
        showToast('success', 'Record deleted successfully');
        generateBillableReport();
      } else {
        console.error(error);
        showToast('error', error.message || 'Failed to delete record');
      }
    } catch (e) {
      console.error(e);
      showToast('error', e?.message || 'Failed to delete record');
    }
  };

  const fmtDate = (d) => {
    if (!d || d === '-') return '-';
    try {
      return format(new Date(d), 'dd MMM yyyy');
    } catch {
      return d;
    }
  };

  return (
    <div className="page-wrapper animate-fade-in">
      {toast && (
        <div className={`toast toast-${toast.type} fixed top-4 right-4 z-50 p-4 rounded shadow-lg text-white ${toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'}`}>
          {toast.message}
        </div>
      )}

      {/* Header */}
      <div className="page-header mb-6">
        <div className="page-header-left">
          <h1 className="text-2xl font-bold">Reports</h1>
          <p className="text-sm text-gray-500">Generate, analyze, and export consumable usage reports</p>
        </div>
      </div>

      {/* Primary Report Type Switcher */}
      <div className="flex gap-3 mb-6">
        <button
          onClick={() => {
            setReportType('billable');
            setRawReportData([]);
            setReportData([]);
            setHasReport(false);
          }}
          className={`btn ${reportType === 'billable' ? 'btn-primary bg-blue-600 text-white px-4 py-2 rounded' : 'btn-ghost bg-gray-200 px-4 py-2 rounded'}`}
        >
          Billable Report
        </button>
        <button
          onClick={() => {
            setReportType('non-billable');
            setNbHasReport(false);
            setNbData([]);
          }}
          className={`btn ${reportType === 'non-billable' ? 'btn-primary bg-blue-600 text-white px-4 py-2 rounded' : 'btn-ghost bg-gray-200 px-4 py-2 rounded'}`}
        >
          Non-Billable Report
        </button>
      </div>

      {/* ================= BILLABLE VIEW ================= */}
      {reportType === 'billable' ? (
        <>
          <div className="card p-4 mb-6 bg-white shadow rounded-lg">
            <div className="flex items-center gap-3 mb-4 border-b pb-3">
              <span className="text-sm font-semibold text-gray-700">View Mode:</span>
              <button
                onClick={() => setBillableReportView('bill-wise')}
                className={`px-3 py-1 text-xs font-medium rounded ${
                  billableReportView === 'bill-wise'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Bill Wise (Grouped)
              </button>
              <button
                onClick={() => setBillableReportView('service-wise')}
                className={`px-3 py-1 text-xs font-medium rounded ${
                  billableReportView === 'service-wise'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Service Wise (Detailed)
              </button>
            </div>

            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <label className="text-xs font-semibold text-gray-600">Start Date</label>
                <input
                  type="date"
                  value={dateRange.start}
                  onChange={(e) => setDateRange((prev) => ({ ...prev, start: e.target.value }))}
                  className="form-input border rounded p-2"
                  style={{ width: 150 }}
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs font-semibold text-gray-600">End Date</label>
                <input
                  type="date"
                  value={dateRange.end}
                  onChange={(e) => setDateRange((prev) => ({ ...prev, end: e.target.value }))}
                  className="form-input border rounded p-2"
                  style={{ width: 150 }}
                />
              </div>

              <SearchableDropdown
                value={filterBranch}
                onChange={(val) => setFilterBranch(val)}
                options={branches.map((b) => ({ value: b.id, label: b.branch_name }))}
                placeholder="All Branches"
                displayKey="label"
                valueKey="value"
                disabled={loading}
              />

              <SearchableDropdown
                value={filterService}
                onChange={(val) => {
                  setFilterService(val);
                  setFilterMachinery('');
                  fetchMachines(val);
                }}
                options={services.map((s) => ({ value: s.id, label: s.service_name }))}
                placeholder="All Services"
                displayKey="label"
                valueKey="value"
                disabled={loading}
              />

              <SearchableDropdown
                value={filterMachinery}
                onChange={(val) => setFilterMachinery(val)}
                options={machines.map((m) => ({ value: m.id, label: m.machine_name }))}
                placeholder="All Machinery"
                displayKey="label"
                valueKey="value"
                disabled={loading}
              />

              <button onClick={generateBillableReport} disabled={loading} className="btn btn-primary bg-blue-600 text-white px-4 py-2 rounded">
                {loading ? 'Generating...' : 'Generate Report'}
              </button>
              <button onClick={clearBillableFilters} className="btn btn-ghost bg-gray-200 px-3 py-2 rounded">
                Clear Filters
              </button>
              <button onClick={downloadCSV} disabled={!reportData.length} className="btn btn-secondary border px-3 py-2 rounded">
                Export CSV
              </button>
              <button onClick={downloadExcel} disabled={!reportData.length} className="btn btn-secondary border px-3 py-2 rounded">
                Export Excel
              </button>
            </div>
          </div>

          {/* Table Output */}
          {hasReport && (
            <div className="table-container bg-white shadow rounded-lg overflow-hidden">
              <div className="table-toolbar p-4 border-b flex justify-between items-center">
                <div>
                  <span className="font-semibold">
                    Billable Report Results ({billableReportView === 'bill-wise' ? 'Bill Wise Grouped' : 'Service Wise Detailed'})
                  </span>
                  <span className="text-gray-500 text-sm ml-2">({reportData.length} records)</span>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="rpt-table w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-50 text-xs font-semibold text-gray-600 border-b">
                      <th className="p-3">BILL NO / ID</th>
                      <th className="p-3">PATIENT NAME</th>
                      <th className="p-3">UID</th>
                      <th className="p-3">DATE</th>
                      <th className="p-3">BRANCH</th>

                      {/* Dynamic Service Columns */}
                      {Array.from({ length: maxServices }).map((_, idx) => (
                        <th key={`svc-hdr-${idx}`} className="p-3 whitespace-nowrap">
                          SERVICE {idx + 1}
                        </th>
                      ))}

                      <th className="p-3">MACHINERY</th>

                      {/* Dynamic Consumable Columns */}
                      {Array.from({ length: maxConsumables }).map((_, idx) => (
                        <React.Fragment key={`csm-hdr-${idx}`}>
                          <th className="p-3 whitespace-nowrap">CONSUMABLE {idx + 1}</th>
                          <th className="p-3 text-right whitespace-nowrap">UNITS {idx + 1}</th>
                          <th className="p-3 text-right whitespace-nowrap">COST {idx + 1}</th>
                        </React.Fragment>
                      ))}

                      <th className="p-3 text-right whitespace-nowrap">TOTAL UNITS</th>
                      <th className="p-3 text-right whitespace-nowrap">TOTAL COST</th>
                      <th className="p-3 text-center">ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y text-sm">
                    {reportData.length === 0 ? (
                      <tr>
                        <td colSpan={7 + maxServices + maxConsumables * 3} className="text-center text-gray-500 p-8">
                          No billable records found for the selected criteria.
                        </td>
                      </tr>
                    ) : (
                      reportData.map((row) => (
                        <tr key={row.id} className="hover:bg-gray-50">
                          <td className="p-3 font-medium">{row.bill_no || row.bill_id || '-'}</td>
                          <td className="p-3">{row.patient_name || '-'}</td>
                          <td className="p-3">{row.uid || '-'}</td>
                          <td className="p-3">{fmtDate(row.report_date)}</td>
                          <td className="p-3">{row.branch_name || '-'}</td>

                          {/* Separate Service Columns */}
                          {Array.from({ length: maxServices }).map((_, idx) => (
                            <td key={`svc-${row.id}-${idx}`} className="p-3 whitespace-nowrap">
                              {row.servicesList && row.servicesList[idx] ? row.servicesList[idx] : '-'}
                            </td>
                          ))}

                          <td className="p-3">{row.machine_name || '-'}</td>

                          {/* Separate Consumable Columns */}
                          {Array.from({ length: maxConsumables }).map((_, idx) => {
                            const c = row.consumables ? row.consumables[idx] : null;
                            return (
                              <React.Fragment key={`csm-${row.id}-${idx}`}>
                                <td className="p-3 whitespace-nowrap">{c ? c.name : '-'}</td>
                                <td className="p-3 text-right">{c ? c.units : 0}</td>
                                <td className="p-3 text-right">{c && c.cost ? `$${c.cost.toFixed(2)}` : '$0.00'}</td>
                              </React.Fragment>
                            );
                          })}

                          <td className="p-3 text-right font-medium">{row.totalUnits || 0}</td>
                          <td className="p-3 text-right font-medium">{row.totalCost ? `$${row.totalCost.toFixed(2)}` : '$0.00'}</td>
                          <td className="p-3 text-center">
                            <button onClick={() => deleteBill(row.id)} className="text-red-600 hover:underline text-xs">
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      ) : (
        /* ================= NON-BILLABLE VIEW ================= */
        <>
          <div className="card p-4 mb-6 bg-white shadow rounded-lg">
            <div className="flex items-center gap-3 flex-wrap mb-4">
              <span className="font-bold text-[15px] text-gray-800">
                NON-BILLABLE REPORTS
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setNbReportMode('detailed');
                    setNbHasReport(false);
                  }}
                  className={`btn ${nbReportMode === 'detailed' ? 'btn-primary bg-blue-600 text-white px-3 py-1 rounded text-xs' : 'btn-ghost bg-gray-200 px-3 py-1 rounded text-xs'}`}
                >
                  Detailed
                </button>
                <button
                  onClick={() => {
                    setNbReportMode('summary');
                    setNbHasReport(false);
                  }}
                  className={`btn ${nbReportMode === 'summary' ? 'btn-primary bg-blue-600 text-white px-3 py-1 rounded text-xs' : 'btn-ghost bg-gray-200 px-3 py-1 rounded text-xs'}`}
                >
                  Summary
                </button>
              </div>
            </div>

            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <label className="text-xs font-semibold text-gray-600">Start</label>
                <input
                  type="date"
                  value={nbStart}
                  onChange={(e) => {
                    setNbStart(e.target.value);
                    setNbHasReport(false);
                  }}
                  className="form-input border rounded p-2"
                  style={{ width: 150 }}
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs font-semibold text-gray-600">End</label>
                <input
                  type="date"
                  value={nbEnd}
                  onChange={(e) => {
                    setNbEnd(e.target.value);
                    setNbHasReport(false);
                  }}
                  className="form-input border rounded p-2"
                  style={{ width: 150 }}
                />
              </div>

              <SearchableDropdown
                value={nbBranch}
                onChange={(val) => {
                  setNbBranch(val);
                  setNbHasReport(false);
                }}
                options={branches.map((b) => ({ value: b.id, label: b.branch_name }))}
                placeholder="All Branches"
                displayKey="label"
                valueKey="value"
                disabled={nbLoading}
              />

              <button onClick={reloadNonBillable} disabled={nbLoading} className="btn btn-primary bg-blue-600 text-white px-4 py-2 rounded">
                {nbLoading ? 'Loading...' : 'Generate Report'}
              </button>
              <button onClick={downloadCSV} disabled={!nbData.length} className="btn btn-secondary border px-3 py-2 rounded">
                Export CSV
              </button>
              <button onClick={downloadExcel} disabled={!nbData.length} className="btn btn-secondary border px-3 py-2 rounded">
                Export Excel
              </button>
            </div>

            {nbBranch && (
              <div className="mt-3 flex items-center gap-3">
                <button onClick={clearNbFilters} className="btn btn-ghost text-xs text-gray-500 hover:underline">
                  Clear Filters
                </button>
              </div>
            )}
          </div>

          {/* Table Output */}
          {nbHasReport && (
            <div className="table-container bg-white shadow rounded-lg overflow-hidden">
              <div className="table-toolbar p-4 border-b flex justify-between items-center">
                <div className="table-toolbar-left">
                  <span className="font-semibold">Report Results </span>
                  <span className="text-gray-500 text-sm">({nbData.length} records)</span>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="rpt-table w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-50 text-xs font-semibold text-gray-600 border-b">
                      {nbReportMode === 'summary' ? (
                        <>
                          <th className="p-3">Non-Billable Consumable</th>
                          <th className="p-3 text-center">Quantity Used</th>
                          <th className="p-3 text-right">Total Cost</th>
                        </>
                      ) : (
                        <>
                          <th className="p-3">Date</th>
                          <th className="p-3">Branch</th>
                          <th className="p-3">Non-Billable Consumable</th>
                          <th className="p-3">Opening Date</th>
                          <th className="p-3">Closing Date</th>
                          <th className="p-3">Service Used By</th>
                          <th className="p-3 text-center">Times Used</th>
                          <th className="p-3">Status</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y text-sm">
                    {nbData.length === 0 ? (
                      <tr>
                        <td
                          colSpan={nbReportMode === 'summary' ? 3 : 8}
                          className="text-center text-gray-500 p-8"
                        >
                          No matching records found. Try changing the selected filters.
                        </td>
                      </tr>
                    ) : (
                      nbData.map((row, i) =>
                        nbReportMode === 'summary' ? (
                          <tr key={i} className="hover:bg-gray-50">
                            <td className="p-3">{row['NON-BILLABLE CONSUMABLE'] || '-'}</td>
                            <td className="p-3 text-center">{row['QUANTITY USED'] || 0}</td>
                            <td className="p-3 text-right">{row['TOTAL COST'] ? `$${row['TOTAL COST']}` : '$0.00'}</td>
                          </tr>
                        ) : (
                          <tr key={i} className="hover:bg-gray-50">
                            <td className="p-3">{fmtDate(row.date)}</td>
                            <td className="p-3">{row.branch || '-'}</td>
                            <td className="p-3">{row.consumableName || '-'}</td>
                            <td className="p-3">{fmtDate(row.openingDate)}</td>
                            <td className="p-3">{fmtDate(row.closingDate)}</td>
                            <td className="p-3">{row.serviceUsedBy || '-'}</td>
                            <td className="p-3 text-center">{row.serviceUsedCount || 0}</td>
                            <td className="p-3">{row.status || '-'}</td>
                          </tr>
                        )
                      )
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default Reports;