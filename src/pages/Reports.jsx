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
import { Search, Download, FileText, FileSpreadsheet, Trash2, RotateCcw } from 'lucide-react';

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
    if (ctxBranch && !nbBranch) setNbBranch(ctxBranch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        // Group machines by name: the same machine name (e.g. "CHEMICAL PEEL")
        // can exist as many master_machinery rows (one per service variant).
        // The dropdown shows one entry per name, and the filter must match ALL ids.
        const seen = new Map();
        data.forEach((m) => {
          const k = String(m.machine_name || '').toLowerCase().trim();
          if (!k) return;
          if (!seen.has(k)) {
            seen.set(k, { id: m.machine_name, machine_name: m.machine_name, ids: [] });
          }
          seen.get(k).ids.push(m.id);
        });
        setMachines(Array.from(seen.values()));
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

    // ============ SERVICE WISE DETAILED (original) ============
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

    // ============ SERVICE WISE SUMMARY / MACHINERY WISE SUMMARY ============
    if (viewMode === 'service-wise-summary' || viewMode === 'machinery-wise') {
      const byService = viewMode === 'service-wise-summary';
      const summaryMap = new Map();

      rows.forEach((row) => {
        const rawKey = byService ? row.service_name : row.machine_name;
        const key = String(rawKey || '').trim() || '-';
        if (!summaryMap.has(key)) {
          summaryMap.set(key, { name: key, serviceCount: 0, totalCost: 0 });
        }
        const item = summaryMap.get(key);
        item.serviceCount += 1;
        item.totalCost += Number(row.totalCost || 0);
      });

      const processed = Array.from(summaryMap.values())
        .map((item, idx) =>
          byService
            ? {
                id: `svc-summary-${idx}`,
                serviceName: item.name,
                serviceCount: item.serviceCount,
                totalCost: item.totalCost,
              }
            : {
                id: `mach-summary-${idx}`,
                machineName: item.name,
                serviceCount: item.serviceCount,
                totalCost: item.totalCost,
              }
        )
        .sort((a, b) => (a.serviceName || a.machineName || '').localeCompare(b.serviceName || b.machineName || ''));

      return { processed, maxS: 1, maxC: 1 };
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
          doctor_name: row.doctor_name || '-',
          staff_name: row.staff_name || '-',
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
        doctor_name: group.doctor_name || '-',
        staff_name: group.staff_name || '-',
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
      if (filterMachinery) {
        // filterMachinery holds the machine NAME. One name can map to many
        // master_machinery rows (e.g. "CHEMICAL PEEL" -> 90+ variants), so
        // match all of them, not just a single machinery_id.
        const machineGroup = machines.find(
          (m) => String(m.id) === String(filterMachinery) || String(m.machine_name) === String(filterMachinery)
        );
        const ids = machineGroup?.ids?.length ? machineGroup.ids : [filterMachinery];
        query = query.in('machinery_id', ids);
      }

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

      // 2b. Hydrate Doctor and Staff names via billing_log
      const billingLogIds = [...new Set(data.map((r) => r.billing_log_id).filter(Boolean))];
      let billingInfoMap = {};
      if (billingLogIds.length) {
        const { data: logs } = await supabase
          .from('billing_log')
          .select('id, doctor_id, staff_id')
          .in('id', billingLogIds);

        const doctorIds = [...new Set((logs || []).map((l) => l.doctor_id).filter(Boolean))];
        const staffIds = [...new Set((logs || []).map((l) => l.staff_id).filter(Boolean))];

        let doctorNameLookup = {};
        let staffNameLookup = {};

        if (doctorIds.length) {
          const { data: docs } = await supabase.from('master_doctors').select('id, doctor_name').in('id', doctorIds);
          if (docs) docs.forEach((d) => (doctorNameLookup[d.id] = d.doctor_name));
        }

        if (staffIds.length) {
          const { data: stf } = await supabase.from('master_staff').select('id, staff_name').in('id', staffIds);
          if (stf) stf.forEach((s) => (staffNameLookup[s.id] = s.staff_name));
        }

        (logs || []).forEach((l) => {
          billingInfoMap[l.id] = {
            doctor_name: l.doctor_id ? (doctorNameLookup[l.doctor_id] || 'Unknown') : '-',
            staff_name: l.staff_id ? (staffNameLookup[l.staff_id] || 'Unknown') : '-',
          };
        });
      }

      // 3. Extract all consumable IDs
      const billableConsumableIds = new Set();
      const nonBillableRegistryIds = new Set();

      data.forEach((row) => {
        for (let i = 1; i <= 14; i++) {
          const cId = row[`consumable_${i}_id`];
          const isNB = row[`is_non_billable_${i}`];
          const regId = row[`non_billable_registry_id_${i}`];

          if (isNB) {
            if (regId) {
              nonBillableRegistryIds.add(regId);
            }
          } else if (cId) {
            billableConsumableIds.add(cId);
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

      // Fetch Non-Billable Master Products via the registry table
      let nonBillableProducts = {};
      if (nonBillableRegistryIds.size > 0) {
        const { data: regRows } = await supabase
          .from('non_billable_consumable_registry')
          .select('id, product_id, master_non_billable_consumables ( product_name, cost )')
          .in('id', Array.from(nonBillableRegistryIds));
        if (regRows) {
          regRows.forEach((reg) => {
            nonBillableProducts[reg.id] = {
              name: reg.master_non_billable_consumables?.product_name || `Non-Billable Item #${reg.id}`,
              cost: Number(reg.master_non_billable_consumables?.cost || 0),
            };
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
          const isNB = row[`is_non_billable_${i}`];
          const regId = row[`non_billable_registry_id_${i}`];

          if (isNB) {
            const product = nonBillableProducts[regId] || { name: `Non-Billable Item #${regId || i}`, cost: 0 };
            consumables.push({
              slot: i,
              name: product.name,
              units: 0,
              cost: 0,
            });
          } else if (cId) {
            const product = billableProducts[cId] || { name: `Billable Item #${cId}`, cost: 0 };
            const units = Number(row[`consumable_${i}_units`] || 0);

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
          doctor_name: (row.billing_log_id && billingInfoMap[row.billing_log_id]?.doctor_name) || row.doctor_name || '-',
          staff_name: (row.billing_log_id && billingInfoMap[row.billing_log_id]?.staff_name) || row.staff_name || '-',
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
        headers = [
          'NON-BILLABLE CONSUMABLE',
          'COMPLETED QTY',
          'INCOMPLETE QTY',
          'TOTAL REGISTRY COUNT',
          'SERVICE USAGE COUNT',
          'OPENING STOCK',
          'RECEIVED',
          'USED',
          'CLOSING STOCK',
          'TOTAL COST',
        ];
        rows = nbData.map((r) => [
          r['NON-BILLABLE CONSUMABLE'] || '-',
          r['COMPLETED QTY'] || 0,
          r['INCOMPLETE QTY'] || 0,
          r['TOTAL REGISTRY COUNT'] || 0,
          r['SERVICE USAGE COUNT'] || 0,
          r['OPENING STOCK'] || 0,
          r['RECEIVED'] || 0,
          r['USED'] || 0,
          r['CLOSING STOCK'] || 0,
          r['TOTAL COST'] || 0,
        ]);
      } else {
        headers = [
          'DATE',
          'BRANCH',
          'NON-BILLABLE CONSUMABLE',
          'BATCH',
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
          r.batchId || '-',
          r.openingDate || '-',
          r.closingDate || '-',
          r.serviceUsedBy || '-',
          r.serviceUsedCount || 0,
          r.status || '-',
        ]);
      }
    } else if (billableReportView === 'service-wise-summary' || billableReportView === 'machinery-wise') {
      if (reportData.length === 0) return;
      const isSvcWise = billableReportView === 'service-wise-summary';
      headers = isSvcWise
        ? ['SERVICE NAME', 'SERVICE COUNT', 'TOTAL CONSUMABLE COST']
        : ['MACHINERY NAME', 'SERVICE COUNT', 'TOTAL CONSUMABLE COST'];
      rows = reportData.map((r) => [
        isSvcWise ? r.serviceName || '-' : r.machineName || '-',
        r.serviceCount || 0,
        Number(r.totalCost || 0).toFixed(2),
      ]);
    } else {
      if (reportData.length === 0) return;

      headers = ['BILL ID', 'PATIENT NAME', 'UID', 'DATE', 'BRANCH', 'DOCTOR', 'STAFF'];
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
          row.doctor_name || '-',
          row.staff_name || '-',
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
          'COMPLETED QTY': r['COMPLETED QTY'] || 0,
          'INCOMPLETE QTY': r['INCOMPLETE QTY'] || 0,
          'TOTAL REGISTRY COUNT': r['TOTAL REGISTRY COUNT'] || 0,
          'SERVICE USAGE COUNT': r['SERVICE USAGE COUNT'] || 0,
          'OPENING STOCK': r['OPENING STOCK'] || 0,
          'RECEIVED': r['RECEIVED'] || 0,
          'USED': r['USED'] || 0,
          'CLOSING STOCK': r['CLOSING STOCK'] || 0,
          'TOTAL COST': r['TOTAL COST'] || 0,
        }));
      } else {
        rows = nbData.map((r) => ({
          DATE: r.date || '-',
          BRANCH: r.branch || '-',
          'NON-BILLABLE CONSUMABLE': r.consumableName || '-',
          BATCH: r.batchId || '-',
          'OPENING DATE': r.openingDate || '-',
          'CLOSING DATE': r.closingDate || '-',
          'SERVICE USED BY': r.serviceUsedBy || '-',
          'TIMES USED': r.serviceUsedCount || 0,
          STATUS: r.status || '-',
        }));
      }
    } else if (billableReportView === 'service-wise-summary' || billableReportView === 'machinery-wise') {
      if (reportData.length === 0) return;
      const isSvcWise = billableReportView === 'service-wise-summary';
      rows = reportData.map((r) => ({
        [isSvcWise ? 'SERVICE NAME' : 'MACHINERY NAME']: isSvcWise ? r.serviceName || '-' : r.machineName || '-',
        'SERVICE COUNT': r.serviceCount || 0,
        'TOTAL CONSUMABLE COST': Number(r.totalCost || 0).toFixed(2),
      }));
    } else {
      if (reportData.length === 0) return;

      rows = reportData.map((row) => {
        const rowObj = {
          'BILL ID': row.bill_no || row.bill_id || '-',
          'PATIENT NAME': row.patient_name || '-',
          UID: row.uid || '-',
          DATE: row.report_date || '-',
          BRANCH: row.branch_name || '-',
          DOCTOR: row.doctor_name || '-',
          STAFF: row.staff_name || '-',
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
    <div className="p-6 w-full" style={{ maxWidth: 'none' }}>
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-white text-sm font-medium ${toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'}`}>
          {toast.message}
        </div>
      )}

      {/* Header Row: Title + Description */}
      <div style={{ marginBottom: '8px' }}>
        <h1 className="text-[32px] font-bold text-gray-900 leading-tight">Reports</h1>
        <p className="text-sm mt-2" style={{ color: '#6B7280' }}>Generate, analyze, and export consumable usage reports</p>
      </div>

      {/* Tab Navigation */}
      <div style={{ borderBottom: '1px solid #E5E7EB', marginBottom: '24px' }}>
        <div style={{ display: 'flex', gap: '0', marginBottom: '-1px' }}>
          <button
            onClick={() => {
              setReportType('billable');
              setRawReportData([]);
              setReportData([]);
              setHasReport(false);
            }}
            style={{
              padding: '12px 24px',
              fontSize: '14px',
              fontWeight: reportType === 'billable' ? 600 : 500,
              color: reportType === 'billable' ? '#7C5CFC' : '#6B7280',
              background: 'transparent',
              border: 'none',
              borderBottom: reportType === 'billable' ? '2px solid #7C5CFC' : '2px solid transparent',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              marginBottom: '0',
            }}
            onMouseEnter={(e) => { if (reportType !== 'billable') e.target.style.color = '#374151'; }}
            onMouseLeave={(e) => { if (reportType !== 'billable') e.target.style.color = '#6B7280'; }}
          >
            Billable Report
          </button>
          <button
            onClick={() => {
              setReportType('non-billable');
              setNbHasReport(false);
              setNbData([]);
            }}
            style={{
              padding: '12px 24px',
              fontSize: '14px',
              fontWeight: reportType === 'non-billable' ? 600 : 500,
              color: reportType === 'non-billable' ? '#7C5CFC' : '#6B7280',
              background: 'transparent',
              border: 'none',
              borderBottom: reportType === 'non-billable' ? '2px solid #7C5CFC' : '2px solid transparent',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              marginBottom: '0',
            }}
            onMouseEnter={(e) => { if (reportType !== 'non-billable') e.target.style.color = '#374151'; }}
            onMouseLeave={(e) => { if (reportType !== 'non-billable') e.target.style.color = '#6B7280'; }}
          >
            Non-Billable Report
          </button>
        </div>
      </div>

      {/* ================= BILLABLE VIEW ================= */}
      {reportType === 'billable' ? (
        <>
          {/* Main Filter Card */}
          <div style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: '12px', padding: '24px', width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h2 style={{ fontSize: '14px', fontWeight: 700, color: '#1F2937', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Billable Report</h2>
              <div style={{ display: 'inline-flex', padding: '4px', backgroundColor: '#F3F4F6', borderRadius: '8px' }}>
                <button
                  onClick={() => setBillableReportView('bill-wise')}
                  style={{
                    padding: '4px 12px',
                    fontSize: '12px',
                    fontWeight: billableReportView === 'bill-wise' ? 600 : 500,
                    borderRadius: '6px',
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    background: billableReportView === 'bill-wise' ? '#7C5CFC' : 'transparent',
                    color: billableReportView === 'bill-wise' ? '#FFFFFF' : '#4B5563',
                  }}
                >
                  Bill Wise
                </button>
                <button
                  onClick={() => setBillableReportView('service-wise')}
                  style={{
                    padding: '4px 12px',
                    fontSize: '12px',
                    fontWeight: billableReportView === 'service-wise' ? 600 : 500,
                    borderRadius: '6px',
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    background: billableReportView === 'service-wise' ? '#7C5CFC' : 'transparent',
                    color: billableReportView === 'service-wise' ? '#FFFFFF' : '#4B5563',
                  }}
                >
                  Service Wise Detailed
                </button>
                <button
                  onClick={() => setBillableReportView('service-wise-summary')}
                  style={{
                    padding: '4px 12px',
                    fontSize: '12px',
                    fontWeight: billableReportView === 'service-wise-summary' ? 600 : 500,
                    borderRadius: '6px',
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    background: billableReportView === 'service-wise-summary' ? '#7C5CFC' : 'transparent',
                    color: billableReportView === 'service-wise-summary' ? '#FFFFFF' : '#4B5563',
                  }}
                >
                  Service Wise Summary
                </button>
                <button
                  onClick={() => setBillableReportView('machinery-wise')}
                  style={{
                    padding: '4px 12px',
                    fontSize: '12px',
                    fontWeight: billableReportView === 'machinery-wise' ? 600 : 500,
                    borderRadius: '6px',
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    background: billableReportView === 'machinery-wise' ? '#7C5CFC' : 'transparent',
                    color: billableReportView === 'machinery-wise' ? '#FFFFFF' : '#4B5563',
                  }}
                >
                  Machinery Wise
                </button>
              </div>
            </div>

            {/* Filters */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr auto', gap: '16px', alignItems: 'end' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Start Date</label>
                <input
                  type="date"
                  value={dateRange.start}
                  onChange={(e) => setDateRange((prev) => ({ ...prev, start: e.target.value }))}
                  style={{ width: '100%', height: '42px', padding: '0 12px', fontSize: '14px', border: '1px solid #D1D5DB', borderRadius: '8px', background: '#FFFFFF', color: '#1F2937', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.5px' }}>End Date</label>
                <input
                  type="date"
                  value={dateRange.end}
                  onChange={(e) => setDateRange((prev) => ({ ...prev, end: e.target.value }))}
                  style={{ width: '100%', height: '42px', padding: '0 12px', fontSize: '14px', border: '1px solid #D1D5DB', borderRadius: '8px', background: '#FFFFFF', color: '#1F2937', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Branch</label>
                <SearchableDropdown
                  value={filterBranch}
                  onChange={(val) => setFilterBranch(val)}
                  options={branches.map((b) => ({ value: b.id, label: b.branch_name }))}
                  placeholder="All Branches"
                  displayKey="label"
                  valueKey="value"
                  disabled={loading}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Service</label>
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
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Machinery</label>
                <SearchableDropdown
                  value={filterMachinery}
                  onChange={(val) => setFilterMachinery(val)}
                  options={machines.map((m) => ({ value: m.id, label: m.machine_name }))}
                  placeholder="All Machinery"
                  displayKey="label"
                  valueKey="value"
                  disabled={loading}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ fontSize: '12px', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.5px', visibility: 'hidden' }}>Action</div>
                <button onClick={generateBillableReport} disabled={loading} style={{ width: '160px', height: '42px', padding: '0 16px', background: '#7C5CFC', color: '#FFFFFF', fontSize: '13px', fontWeight: 600, border: 'none', borderRadius: '8px', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.5 : 1, whiteSpace: 'nowrap' }}>
                  {loading ? 'Generating...' : 'Generate Report'}
                </button>
              </div>
            </div>

            {/* Action Links */}
            <div style={{ display: 'flex', gap: '16px', marginTop: '18px' }}>
              <button onClick={downloadCSV} disabled={!reportData.length} style={{ padding: '7px 16px', border: '1px solid #D1D5DB', borderRadius: '8px', background: '#FFFFFF', color: '#374151', fontSize: '13px', fontWeight: 500, cursor: !reportData.length ? 'not-allowed' : 'pointer', opacity: !reportData.length ? 0.4 : 1 }}>
                Export CSV
              </button>
              <button onClick={downloadExcel} disabled={!reportData.length} style={{ padding: '7px 16px', border: '1px solid #D1D5DB', borderRadius: '8px', background: '#FFFFFF', color: '#374151', fontSize: '13px', fontWeight: 500, cursor: !reportData.length ? 'not-allowed' : 'pointer', opacity: !reportData.length ? 0.4 : 1 }}>
                Export Excel
              </button>
              {(filterBranch || filterService || filterMachinery) && (
                <button onClick={clearBillableFilters} style={{ padding: '7px 0', border: 'none', background: 'transparent', color: '#7C5CFC', fontSize: '13px', fontWeight: 600, cursor: 'pointer', marginLeft: 'auto' }}>
                  Clear Filters
                </button>
              )}
            </div>
          </div>

          {/* Table Output */}
          {hasReport && (
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden" style={{ marginTop: '16px' }}>
              <div className="overflow-x-auto w-full">
                <table className="w-full text-left border-collapse" style={{ minWidth: billableReportView === 'bill-wise' || billableReportView === 'service-wise' ? 1200 : 800 }}>
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      {(() => {
                        if (billableReportView === 'service-wise-summary') {
                          return [
                            { label: 'SERVICE NAME', align: 'left', minW: '240px' },
                            { label: 'SERVICE COUNT', align: 'center', minW: '140px' },
                            { label: 'TOTAL CONSUMABLE COST', align: 'right', minW: '200px' },
                          ];
                        }
                        if (billableReportView === 'machinery-wise') {
                          return [
                            { label: 'MACHINERY NAME', align: 'left', minW: '240px' },
                            { label: 'SERVICE COUNT', align: 'center', minW: '140px' },
                            { label: 'TOTAL CONSUMABLE COST', align: 'right', minW: '200px' },
                          ];
                        }
                        const headers = [
                          { label: 'BILL NO / ID', align: 'left', minW: '110px' },
                          { label: 'PATIENT NAME', align: 'left', minW: '160px' },
                          { label: 'UID', align: 'left', minW: '100px' },
                          { label: 'DATE', align: 'left', minW: '120px' },
                          { label: 'BRANCH', align: 'left', minW: '130px' },
                          { label: 'DOCTOR', align: 'left', minW: '130px' },
                          { label: 'STAFF', align: 'left', minW: '130px' },
                        ];
                        for (let s = 1; s <= maxServices; s++) headers.push({ label: `SERVICE ${s}`, align: 'left', minW: '180px' });
                        headers.push({ label: 'MACHINERY', align: 'left', minW: '180px' });
                        for (let i = 1; i <= maxConsumables; i++) {
                          headers.push({ label: `CONSUMABLE ${i}`, align: 'left', minW: '180px' });
                          headers.push({ label: `UNITS ${i}`, align: 'center', minW: '80px' });
                          headers.push({ label: `COST ${i}`, align: 'right', minW: '100px' });
                        }
                        headers.push({ label: 'TOTAL UNITS', align: 'right', minW: '120px' });
                        headers.push({ label: 'TOTAL COST', align: 'right', minW: '120px' });
                        headers.push({ label: 'ACTIONS', align: 'center', minW: '80px' });
                        return headers;
                      })().map((h, i) => (
                        <th key={i} className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap" style={{ textAlign: h.align, minWidth: h.minW }}>
                          {h.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {reportData.length === 0 ? (
                      <tr>
                        <td colSpan={billableReportView === 'bill-wise' || billableReportView === 'service-wise' ? 7 + maxServices + 1 + maxConsumables * 3 + 2 : 3} className="px-4 py-10 text-center text-sm text-gray-400">
                          No billable records found for the selected criteria.
                        </td>
                      </tr>
                    ) : billableReportView === 'service-wise-summary' ? (
                      reportData.map((row) => (
                        <tr key={row.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3 text-sm font-semibold text-gray-900 whitespace-nowrap">{row.serviceName || '-'}</td>
                          <td className="px-4 py-3 text-sm font-semibold text-gray-900 text-center whitespace-nowrap">{row.serviceCount || 0}</td>
                          <td className="px-4 py-3 text-sm font-bold text-gray-900 text-right whitespace-nowrap">{row.totalCost ? `$${Number(row.totalCost).toFixed(2)}` : '$0.00'}</td>
                        </tr>
                      ))
                    ) : billableReportView === 'machinery-wise' ? (
                      reportData.map((row) => (
                        <tr key={row.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3 text-sm font-semibold text-gray-900 whitespace-nowrap">{row.machineName || '-'}</td>
                          <td className="px-4 py-3 text-sm font-semibold text-gray-900 text-center whitespace-nowrap">{row.serviceCount || 0}</td>
                          <td className="px-4 py-3 text-sm font-bold text-gray-900 text-right whitespace-nowrap">{row.totalCost ? `$${Number(row.totalCost).toFixed(2)}` : '$0.00'}</td>
                        </tr>
                      ))
                    ) : (
                      reportData.map((row) => (
                        <tr key={row.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3 text-sm font-semibold text-gray-900 whitespace-nowrap">{row.bill_no || row.bill_id || '-'}</td>
                          <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">{row.patient_name || '-'}</td>
                          <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">{row.uid || '-'}</td>
                          <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">{fmtDate(row.report_date)}</td>
                          <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">{row.branch_name || '-'}</td>
                          <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">{row.doctor_name || '-'}</td>
                          <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">{row.staff_name || '-'}</td>
                          {Array.from({ length: maxServices }).map((_, s) => (
                            <td key={`svc-${s}`} className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">{row.servicesList && row.servicesList[s] ? row.servicesList[s] : '-'}</td>
                          ))}
                          <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">{row.machine_name || '-'}</td>
                          {Array.from({ length: maxConsumables }).map((_, i) => {
                            const c = row.consumables ? row.consumables[i] : null;
                            return (
                              <React.Fragment key={`csm-${i}`}>
                                <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">{c ? c.name : '-'}</td>
                                <td className="px-4 py-3 text-sm text-gray-700 text-center whitespace-nowrap">{c ? c.units : 0}</td>
                                <td className="px-4 py-3 text-sm font-semibold text-gray-700 text-right whitespace-nowrap">{c && c.cost ? `$${c.cost.toFixed(2)}` : '$0.00'}</td>
                              </React.Fragment>
                            );
                          })}
                          <td className="px-4 py-3 text-sm font-semibold text-gray-700 text-right whitespace-nowrap">{row.totalUnits || 0}</td>
                          <td className="px-4 py-3 text-sm font-bold text-gray-900 text-right whitespace-nowrap">{row.totalCost ? `$${row.totalCost.toFixed(2)}` : '$0.00'}</td>
                          <td className="px-4 py-3 text-center whitespace-nowrap">
                            <button onClick={() => deleteBill(row.id)} className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-gray-200 bg-white hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-all text-gray-400" title="Delete">
                              <Trash2 size={14} />
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
          {/* Non-Billable Filter Card */}
          <div style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: '12px', padding: '24px', width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h2 style={{ fontSize: '14px', fontWeight: 700, color: '#1F2937', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Non-Billable Reports</h2>
              <div style={{ display: 'inline-flex', padding: '4px', backgroundColor: '#F3F4F6', borderRadius: '8px' }}>
                <button
                  onClick={() => { setNbReportMode('detailed'); setNbHasReport(false); }}
                  style={{
                    padding: '4px 12px',
                    fontSize: '12px',
                    fontWeight: nbReportMode === 'detailed' ? 600 : 500,
                    borderRadius: '6px',
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    background: nbReportMode === 'detailed' ? '#7C5CFC' : 'transparent',
                    color: nbReportMode === 'detailed' ? '#FFFFFF' : '#4B5563',
                  }}
                >
                  Detailed
                </button>
                <button
                  onClick={() => { setNbReportMode('summary'); setNbHasReport(false); }}
                  style={{
                    padding: '4px 12px',
                    fontSize: '12px',
                    fontWeight: nbReportMode === 'summary' ? 600 : 500,
                    borderRadius: '6px',
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    background: nbReportMode === 'summary' ? '#7C5CFC' : 'transparent',
                    color: nbReportMode === 'summary' ? '#FFFFFF' : '#4B5563',
                  }}
                >
                  Summary
                </button>
              </div>
            </div>

            {/* Filters */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 160px', gap: '16px', alignItems: 'end' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Start Date</label>
                <input
                  type="date"
                  value={nbStart}
                  onChange={(e) => { setNbStart(e.target.value); setNbHasReport(false); }}
                  style={{ width: '100%', height: '42px', padding: '0 12px', fontSize: '14px', border: '1px solid #D1D5DB', borderRadius: '8px', background: '#FFFFFF', color: '#1F2937', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.5px' }}>End Date</label>
                <input
                  type="date"
                  value={nbEnd}
                  onChange={(e) => { setNbEnd(e.target.value); setNbHasReport(false); }}
                  style={{ width: '100%', height: '42px', padding: '0 12px', fontSize: '14px', border: '1px solid #D1D5DB', borderRadius: '8px', background: '#FFFFFF', color: '#1F2937', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Branch</label>
                <SearchableDropdown
                  value={nbBranch}
                  onChange={(val) => { setNbBranch(val); setNbHasReport(false); }}
                  options={branches.map((b) => ({ value: b.id, label: b.branch_name }))}
                  placeholder="All Branches"
                  displayKey="label"
                  valueKey="value"
                  disabled={nbLoading}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ fontSize: '12px', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.5px', visibility: 'hidden' }}>Action</div>
                <button onClick={reloadNonBillable} disabled={nbLoading} style={{ width: '160px', height: '42px', padding: '0 16px', background: '#7C5CFC', color: '#FFFFFF', fontSize: '13px', fontWeight: 600, border: 'none', borderRadius: '8px', cursor: nbLoading ? 'not-allowed' : 'pointer', opacity: nbLoading ? 0.5 : 1, whiteSpace: 'nowrap' }}>
                  {nbLoading ? 'Loading...' : 'Generate Report'}
                </button>
              </div>
            </div>

            {/* Action Links */}
            <div style={{ display: 'flex', gap: '16px', marginTop: '18px' }}>
              <button onClick={downloadCSV} disabled={!nbData.length} style={{ padding: '7px 16px', border: '1px solid #D1D5DB', borderRadius: '8px', background: '#FFFFFF', color: '#374151', fontSize: '13px', fontWeight: 500, cursor: !nbData.length ? 'not-allowed' : 'pointer', opacity: !nbData.length ? 0.4 : 1 }}>
                Export CSV
              </button>
              <button onClick={downloadExcel} disabled={!nbData.length} style={{ padding: '7px 16px', border: '1px solid #D1D5DB', borderRadius: '8px', background: '#FFFFFF', color: '#374151', fontSize: '13px', fontWeight: 500, cursor: !nbData.length ? 'not-allowed' : 'pointer', opacity: !nbData.length ? 0.4 : 1 }}>
                Export Excel
              </button>
              {nbBranch && (
                <button onClick={clearNbFilters} style={{ padding: '7px 0', border: 'none', background: 'transparent', color: '#7C5CFC', fontSize: '13px', fontWeight: 600, cursor: 'pointer', marginLeft: 'auto' }}>
                  Clear Filters
                </button>
              )}
            </div>
          </div>

          {/* Table Output */}
          {nbHasReport && (
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden" style={{ marginTop: '16px' }}>
              <div className="overflow-x-auto w-full">
                <table className="w-full text-left border-collapse" style={{ minWidth: nbReportMode === 'summary' ? 1200 : 1000 }}>
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      {nbReportMode === 'summary' ? (
                        <>
                          <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">Non-Billable Consumable</th>
                          <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap text-center">Completed Qty</th>
                          <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap text-center">Incomplete Qty</th>
                          <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap text-center">Total Registry Count</th>
                          <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap text-center">Service Usage Count</th>
                          <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap text-center">Opening Stock</th>
                          <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap text-center">Received</th>
                          <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap text-center">Used</th>
                          <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap text-center">Closing Stock</th>
                          <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap text-right">Total Cost</th>
                        </>
                      ) : (
                        <>
                          <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap" style={{ minWidth: 110 }}>Date</th>
                          <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap" style={{ minWidth: 130 }}>Branch</th>
                          <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap" style={{ minWidth: 200 }}>Consumable</th>
                          <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap" style={{ minWidth: 130 }}>Batch</th>
                          <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap" style={{ minWidth: 130 }}>Opening Date</th>
                          <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap" style={{ minWidth: 130 }}>Closing Date</th>
                          <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap" style={{ minWidth: 180 }}>Service Used By</th>
                          <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap text-center" style={{ minWidth: 100 }}>Times Used</th>
                          <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap" style={{ minWidth: 100 }}>Status</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {nbData.length === 0 ? (
                      <tr>
                        <td colSpan={nbReportMode === 'summary' ? 10 : 9} className="px-4 py-10 text-center text-sm text-gray-400">
                          No matching records found. Try changing the selected filters.
                        </td>
                      </tr>
                    ) : (
                      nbData.map((row, i) =>
                        nbReportMode === 'summary' ? (
                          <tr key={i} className="hover:bg-gray-50 transition-colors">
                            <td className="px-4 py-3 text-sm text-gray-700">{row['NON-BILLABLE CONSUMABLE'] || '-'}</td>
                            <td className="px-4 py-3 text-sm font-semibold text-gray-700 text-center">{row['COMPLETED QTY'] || 0}</td>
                            <td className="px-4 py-3 text-sm font-semibold text-gray-700 text-center">{row['INCOMPLETE QTY'] || 0}</td>
                            <td className="px-4 py-3 text-sm font-semibold text-gray-700 text-center">{row['TOTAL REGISTRY COUNT'] || 0}</td>
                            <td className="px-4 py-3 text-sm font-semibold text-gray-700 text-center">{row['SERVICE USAGE COUNT'] || 0}</td>
                            <td className="px-4 py-3 text-sm font-semibold text-gray-700 text-center">{row['OPENING STOCK'] || 0}</td>
                            <td className="px-4 py-3 text-sm font-semibold text-gray-700 text-center">{row['RECEIVED'] || 0}</td>
                            <td className="px-4 py-3 text-sm font-semibold text-gray-700 text-center">{row['USED'] || 0}</td>
                            <td className="px-4 py-3 text-sm font-semibold text-gray-700 text-center">{row['CLOSING STOCK'] || 0}</td>
                            <td className="px-4 py-3 text-sm font-bold text-gray-900 text-right whitespace-nowrap">{row['TOTAL COST'] ? `$${row['TOTAL COST']}` : '$0.00'}</td>
                          </tr>
                        ) : (
                          <tr key={i} className="hover:bg-gray-50 transition-colors">
                            <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">{fmtDate(row.date)}</td>
                            <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">{row.branch || '-'}</td>
                            <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap" style={{ maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.consumableName || '-'}</td>
                            <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">{row.batchId || '-'}</td>
                            <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">{fmtDate(row.openingDate)}</td>
                            <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">{fmtDate(row.closingDate)}</td>
                            <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap" style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.serviceUsedBy || '-'}</td>
                            <td className="px-4 py-3 text-sm font-semibold text-gray-700 text-center">{row.serviceUsedCount || 0}</td>
                            <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">{row.status || '-'}</td>
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