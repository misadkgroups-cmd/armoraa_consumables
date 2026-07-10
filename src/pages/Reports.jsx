import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { supabase } from '../config/supabase';
import { useBranch } from '../context/BranchContext';

const Reports = () => {
  const { branchId, branchName } = useBranch();
  const connectedBranch = branchName || 'Unknown Branch';

  // Filters
  const [dateRange, setDateRange] = useState({
    start: format(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd'),
    end: format(new Date(), 'yyyy-MM-dd'),
  });
  const [filterBranch, setFilterBranch] = useState('');
  const [filterService, setFilterService] = useState('');
  const [filterMachinery, setFilterMachinery] = useState('');

  // Auto-select connected branch on mount
  useEffect(() => {
    if (branchId && !filterBranch) {
      setFilterBranch(branchId);
    }
  }, [branchId]);

  // Dropdown data
  const [branches, setBranches] = useState([]);
  const [services, setServices] = useState([]);
  const [machines, setMachines] = useState([]);

  // Report state
  const [reportData, setReportData] = useState([]);
  const [loading, setLoading] = useState(false);

  // Load all dropdowns on mount
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
      if (serviceId) {
        query = query.eq('service_id', serviceId);
      }
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

  // Reset all filters and report data
  const resetReport = () => {
    setDateRange({
      start: format(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd'),
      end: format(new Date(), 'yyyy-MM-dd'),
    });
    setFilterBranch('');
    setFilterService('');
    setFilterMachinery('');
    setReportData([]);
  };

  // ============================================
  // REPORT GENERATION
  // ============================================
  const generateReport = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('billable_report_with_names')
        .select('*')
        .gte('report_date', dateRange.start)
        .lte('report_date', dateRange.end);

      // Apply optional filters
      if (filterBranch) {
        query = query.eq('branch_id', filterBranch);
      }
      if (filterService) {
        query = query.eq('service_id', filterService);
      }
      if (filterMachinery) {
        query = query.eq('machinery_id', filterMachinery);
      }

      const { data, error } = await query.order('bill_id', { ascending: true });

      if (!error && data) {
        const processed = data.map((row) => {
          const consumables = [];
          for (let i = 1; i <= 14; i++) {
            const name = row[`consumable_${i}_name`];
            const units = row[`consumable_${i}_units`];
            const cost = row[`consumable_${i}_cost`];
            if (name) {
              consumables.push({ slot: i, name, units, cost });
            }
          }
          return {
            ...row,
            consumableCount: consumables.length,
            consumables,
          };
        });

        setReportData(processed);
      } else {
        console.error('Report error:', error);
      }
    } catch (error) {
      console.error('Error generating report:', error);
    } finally {
      setLoading(false);
    }
  };

  // ============================================
  // CSV DOWNLOAD
  // ============================================
  const downloadCSV = () => {
    if (reportData.length === 0) return;

    let maxConsumables = 0;
    reportData.forEach((r) => {
      if (r.consumableCount > maxConsumables) maxConsumables = r.consumableCount;
    });

    const headers = ['BILL ID', 'UID', 'DATE', 'BRANCH', 'MACHINERY', 'SERVICE'];
    for (let i = 1; i <= maxConsumables; i++) {
      headers.push(`CONSUMABLE - ${i}`, `UNITS - ${i}`, `COST - ${i}`);
    }

    const csvRows = [headers.join(',')];

    reportData.forEach((row) => {
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
      csvRows.push(values.join(','));
    });

    const csv = csvRows.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `billable-report-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  // ============================================
  // RENDER
  // ============================================
  return (
    <div className="space-y-6">
      {/* Connected Branch Indicator */}
      <div className="bg-gradient-to-r from-sky-50 to-blue-50 border border-sky-200 rounded-xl p-4 shadow-sm">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Connected Branch</p>
              <p className="text-base font-bold text-slate-900">{connectedBranch}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">Branch ID:</span>
            <span className="text-xs font-mono font-semibold bg-white px-2 py-1 rounded border border-slate-300">{branchId || '-'}</span>
          </div>
        </div>
      </div>

      {/* Filter Section */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">
          Billable Consumables Report
        </h3>

        {/* 4 filters in 2x2 grid */}
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

        {/* Action buttons */}
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
          <button
            onClick={resetReport}
            className="px-5 py-2 border border-slate-300 rounded-lg hover:bg-slate-50 transition-all text-sm font-semibold text-slate-700 shadow-sm"
          >
            New Report
          </button>
        </div>
      </div>

      {/* Report Results Table */}
      {reportData.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200">
            <h3 className="text-lg font-semibold text-slate-900">
              Report Results ({reportData.length} records)
            </h3>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="text-left px-3 py-2.5 font-semibold text-slate-600 uppercase tracking-wider whitespace-nowrap">BILL ID</th>
                  <th className="text-left px-3 py-2.5 font-semibold text-slate-600 uppercase tracking-wider whitespace-nowrap">UID</th>
                  <th className="text-left px-3 py-2.5 font-semibold text-slate-600 uppercase tracking-wider whitespace-nowrap">DATE</th>
                  <th className="text-left px-3 py-2.5 font-semibold text-slate-600 uppercase tracking-wider whitespace-nowrap">BRANCH</th>
                  <th className="text-left px-3 py-2.5 font-semibold text-slate-600 uppercase tracking-wider whitespace-nowrap">MACHINERY</th>
                  <th className="text-left px-3 py-2.5 font-semibold text-slate-600 uppercase tracking-wider whitespace-nowrap">SERVICE</th>
                  {/* Dynamic consumable columns */}
                  {(() => {
                    let maxC = 0;
                    reportData.forEach((r) => { if (r.consumableCount > maxC) maxC = r.consumableCount; });
                    const cols = [];
                    for (let i = 1; i <= maxC; i++) {
                      cols.push(
                        <th key={`h-${i}`} className="text-left px-3 py-2.5 font-semibold text-slate-600 uppercase tracking-wider whitespace-nowrap bg-purple-50">
                          CONSUMABLE - {i}
                        </th>,
                        <th key={`hu-${i}`} className="text-left px-3 py-2.5 font-semibold text-slate-600 uppercase tracking-wider whitespace-nowrap bg-purple-50">
                          UNITS - {i}
                        </th>,
                        <th key={`hc-${i}`} className="text-left px-3 py-2.5 font-semibold text-slate-600 uppercase tracking-wider whitespace-nowrap bg-purple-50">
                          COST - {i}
                        </th>
                      );
                    }
                    return cols;
                  })()}
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
                    <td className="px-3 py-2.5 font-medium text-slate-900 whitespace-nowrap">{row.bill_id}</td>
                    <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">{row.uid}</td>
                    <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">{row.report_date}</td>
                    <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">{row.branch_name || '-'}</td>
                    <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">{row.machine_name || '-'}</td>
                    <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">{row.service_name || '-'}</td>
                    {/* Dynamic consumable data */}
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {reportData.length === 0 && !loading && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12 text-center">
          <div className="text-slate-500 text-sm">
            No report data available. Select filters and click "Generate Report".
          </div>
        </div>
      )}
    </div>
  );
};

export default Reports;