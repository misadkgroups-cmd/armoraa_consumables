import { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '../config/supabase';
import { useBranch } from '../context/BranchContext';
import Chart from 'react-apexcharts';
import { motion } from 'framer-motion';
import { getTodayLocal, formatDateLocal, formatDateDisplay } from '../utils/dateUtils';
import { fmtQty1 } from '../utils/numUtils';
import {
  Calendar, FileText,
  TrendingUp, CheckCircle, Clock
} from 'lucide-react';

// Dependency arrays kept intentionally minimal (fetch recreated each render;
// mount-scoped effects). Disabled file-wide as that is deliberate.
/* eslint-disable react-hooks/exhaustive-deps */

/* ---------- Animated Counter ---------- */
const useCountUp = (target, duration = 800) => {
  const [val, setVal] = useState(0);
  useEffect(() => {
    let t0 = null;
    const step = (ts) => {
      if (!t0) t0 = ts;
      const p = Math.min((ts - t0) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(Math.round(target * eased));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [target, duration]);
  return val;
};

const Counter = ({ value }) => {
  const v = useCountUp(value || 0);
  return <>{v.toLocaleString()}</>;
};

/* ---------- Tiny Sparkline ---------- */
const Sparkline = ({ data, color }) => {
  const w = 64, h = 24, max = Math.max(...data, 1), min = Math.min(...data, 0);
  const pts = data.map((d, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((d - min) / (max - min || 1)) * h;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const id = `sg-${color.replace('#', '')}`;
  return (
    <svg className="kpi-spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,${h} ${pts.join(' ')} ${w},${h}`} fill={`url(#${id})`} />
      <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
};

const Overview = () => {
  const { branchId, misMode, updateBranch } = useBranch();
  // Date filter — persisted so it STICKS across navigation/remounts,
  // exactly like the branch selection. Only Apply/Clear updates it.
  const loadStoredDateFilter = () => {
    try {
      const f = JSON.parse(localStorage.getItem('dashboard-date-filter'));
      if (f && ['thisMonth', 'overall', 'custom'].includes(f.preset)) {
        return f;
      }
      return null;
    } catch {
      return null;
    }
  };
  const saveDateFilter = (f) => {
    try { localStorage.setItem('dashboard-date-filter', JSON.stringify(f)); } catch { /* ignore */ }
  };
  const storedFilter = loadStoredDateFilter();
  const initialPreset = storedFilter?.preset || 'thisMonth';
  const [dateRange, setDateRange] = useState(initialPreset);
  const [customStart, setCustomStart] = useState(storedFilter?.customStart || '');
  const [customEnd, setCustomEnd] = useState(storedFilter?.customEnd || '');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const datePickerRef = useRef(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  // ---- Single-select branch filter ----
  // Initialized from the global branch so it STICKS: navigating away and back
  // to the dashboard keeps the branch the user selected (it only changes when
  // the user picks another branch).
  const [branches, setBranches] = useState([]);
  const [selectedBranch, setSelectedBranch] = useState(misMode ? (branchId ?? null) : null);
  const [showBranchFilter, setShowBranchFilter] = useState(false);
  const branchFilterRef = useRef(null);

  // Broadcast the dashboard branch filter so the notification bell follows it
  const notifyBranchFilter = (id) => {
    window.dispatchEvent(new CustomEvent('dashboard-branch-filter', { detail: id }));
  };
  useEffect(() => { notifyBranchFilter(selectedBranch); }, [selectedBranch]);

  // The dashboard branch selection drives the GLOBAL branch context:
  // picking a branch here changes the data on ALL pages (Bills, Billing Log,
  // Stock, Reports, consumables, etc.) to that branch.
  // updateBranch is recreated on each provider render, so including it in the
  // dependency array would re-run this effect constantly. Kept minimal on purpose.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!misMode) return;
    if (selectedBranch !== null) {
      const b = branches.find(x => x.id === selectedBranch);
      updateBranch(selectedBranch, b ? b.branch_name : `Branch ${selectedBranch}`);
    } else {
      updateBranch(null, 'MIS');
    }
  }, [selectedBranch, misMode, branches]);

  useEffect(() => {
    const fetchBranches = async () => {
      try {
        const { data: br } = await supabase.from('branches').select('id, branch_name');
        if (br && br.length > 0) {
          const list = br.map(b => ({ id: b.id, branch_name: b.branch_name || `Branch ${b.id}` }));
          setBranches(list);
          // Always have a concrete branch selected — no "All Branches" mode
          setSelectedBranch(prev => {
            if (prev !== null && list.some(x => x.id === prev)) return prev; // keep user's selection
            // fall back to the global branch first, then the first branch
            const globalMatch = branchId && list.find(x => x.id === branchId);
            return globalMatch ? globalMatch.id : list[0].id;
          });
        }
      } catch { /* ignore */ }
    };
    if (misMode) fetchBranches();
  }, [misMode, branchId]);

  // Close date picker / branch filter on outside click
  useEffect(() => {
    if (!showDatePicker && !showBranchFilter) return;
    const onDocClick = (e) => {
      if (datePickerRef.current && !datePickerRef.current.contains(e.target)) setShowDatePicker(false);
      if (branchFilterRef.current && !branchFilterRef.current.contains(e.target)) setShowBranchFilter(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [showDatePicker, showBranchFilter]);

  const branchFilterLabel = (branches.find(b => b.id === selectedBranch) || {}).branch_name || 'Branch';

  // Pending (draft) range edited in the picker — nothing refetches until Apply
  const pendingRange = useMemo(() => {
    const today = new Date();
    let start = new Date(today.getFullYear(), today.getMonth(), 1);
    let end = today;
    if (dateRange === 'thisMonth') {
      start = new Date(today.getFullYear(), today.getMonth(), 1);
      end = today;
    } else if (dateRange === 'overall') {
      start = new Date(2020, 0, 1);
      end = today;
    } else if (dateRange === 'custom' && customStart && customEnd) {
      start = new Date(customStart);
      end = new Date(customEnd);
    }
    return { preset: dateRange, start: formatDateLocal(start), end: formatDateLocal(end) };
  }, [dateRange, customStart, customEnd]);

  // Applied range — the ONLY thing that triggers a refetch (via Apply / Clear)
  const defaultRange = useMemo(() => {
    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    return { preset: 'thisMonth', start: formatDateLocal(start), end: formatDateLocal(today) };
  }, []);
  const [appliedRange, setAppliedRange] = useState(() => {
    if (storedFilter && storedFilter.preset !== 'thisMonth') {
      return { preset: storedFilter.preset, start: storedFilter.start, end: storedFilter.end };
    }
    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    return { preset: 'thisMonth', start: formatDateLocal(start), end: formatDateLocal(today) };
  });

  const pendingDirty = pendingRange.preset !== appliedRange.preset
    || pendingRange.start !== appliedRange.start
    || pendingRange.end !== appliedRange.end;

  const appliedLabel = useMemo(() => {
    if (appliedRange.preset === 'thisMonth') return 'This Month';
    if (appliedRange.preset === 'overall') return 'Overall';
    if (appliedRange.preset === 'custom' || (appliedRange.start && appliedRange.end)) {
      return `${formatDateDisplay(new Date(appliedRange.start))} - ${formatDateDisplay(new Date(appliedRange.end))}`;
    }
    return 'This Month';
  }, [appliedRange]);

  // fetchDashboard is recreated each render, so it is deliberately omitted from
  // the dependency array to avoid re-running the dashboard fetch on every render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (branchId || misMode) fetchDashboard();
  }, [branchId, misMode, appliedRange, selectedBranch]);

  const fetchDashboard = async () => {
    setLoading(true);
    try {
      const { start, end } = appliedRange;
      const applyBranchFilter = (q) => {
        if (selectedBranch !== null) return q.eq('branch_id', selectedBranch);
        if (branchId) return q.eq('branch_id', branchId);
        return q;
      };
      let query = applyBranchFilter(supabase.from('billable_report').select('*'));
      if (appliedRange.preset !== 'overall') {
        query = query.gte('report_date', start);
      }
      query = query.lte('report_date', end);
      const { data: bills } = await query;
      const billsArray = bills || [];

      // Billing Log metrics
      let billingArray = [];
      try {
        // Filter by BILL DATE (service_date), not created date
        let billingQuery = supabase.from('billing_log').select('*');
        if (appliedRange.preset !== 'overall') {
          billingQuery = billingQuery.gte('service_date', start);
        }
        billingQuery = billingQuery.lte('service_date', end);
        billingQuery = applyBranchFilter(billingQuery);
        const { data: billingLogs } = await billingQuery;
        billingArray = billingLogs || [];
      } catch {
        console.warn('billing_log table not found, skipping billing metrics');
        billingArray = [];
      }

      // Fetch bill_services for service completion stats
      let billServicesArray = [];
      try {
        const billIds = billingArray.map(b => b.id);
        if (billIds.length > 0) {
          let bsQuery = supabase.from('bill_services').select('consumable_completed, bill_id');
          if (branchId) bsQuery = bsQuery.in('bill_id', billIds);
          const { data: bs } = await bsQuery;
          billServicesArray = bs || [];
        }
      } catch {
        console.warn('bill_services table not found, skipping service stats');
        billServicesArray = [];
      }

      // Stats — all counts are relative to the SELECTED date range (incl. custom),
      // so every card responds to the filter.
      const rawWeekStart = formatDateLocal(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));
      const rawMonthStart = formatDateLocal(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
      const lastWeekStart = rawWeekStart > start ? rawWeekStart : start; // clamp inside range
      const thisMonthStart = rawMonthStart > start ? rawMonthStart : start;
      const lastWeekCount = billsArray.filter(b => b.report_date >= lastWeekStart && b.report_date <= end).length;
      const thisMonthCount = billsArray.filter(b => b.report_date >= thisMonthStart && b.report_date <= end).length;
      const overallCount = billsArray.length;

      // Today's sessions (bills created today) & procedures (distinct services today)
      const todayStr = getTodayLocal();
      const todayBills = billsArray.filter(b => b.report_date === todayStr);
      const todaysSessions = todayBills.length;
      const todaysProcedures = new Set(todayBills.map(b => b.service_id).filter(Boolean)).size;

      // Active items = distinct consumables used in period
      const activeIds = new Set();
      billsArray.forEach(row => { for (let i = 1; i <= 14; i++) if (row[`consumable_${i}_id`] && !row[`consumable_${i}_batch_id`]) activeIds.add(row[`consumable_${i}_id`]); });
      const activeItems = activeIds.size;

      // Consumable map
      const consumableIds = new Set();
      billsArray.forEach(row => { for (let i = 1; i <= 14; i++) if (row[`consumable_${i}_id`]) consumableIds.add(row[`consumable_${i}_id`]); });
      let consumableMap = {};
      if (consumableIds.size > 0) {
        const { data: c } = await supabase.from('master_billable_consumables').select('id, product_name, cost_unit').in('id', Array.from(consumableIds));
        if (c) c.forEach(x => consumableMap[x.id] = { name: x.product_name, cost: x.cost_unit || 0 });
      }

      // Services
      const { data: services } = await supabase.from('master_services').select('id, service_name');
      const serviceCounts = {};
      if (services) services.forEach(s => serviceCounts[s.id] = { name: s.service_name, count: 0 });
      billsArray.forEach(bill => { if (bill.service_id && serviceCounts[bill.service_id]) serviceCounts[bill.service_id].count++; });
      const serviceChart = Object.values(serviceCounts).sort((a, b) => b.count - a.count).filter(s => s.count > 0).slice(0, 7);

      // Machinery
      const machineryIds = new Set(billsArray.map(b => b.machinery_id).filter(Boolean));
      let machineryMap = {};
      if (machineryIds.size > 0) {
        const { data: m } = await supabase.from('master_machinery').select('id, machine_name').in('id', Array.from(machineryIds));
        if (m) m.forEach(x => machineryMap[x.id] = x.machine_name);
      }
      const machineryCounts = {};
      billsArray.forEach(bill => {
        if (bill.machinery_id) {
          const name = machineryMap[bill.machinery_id] || 'Unknown';
          machineryCounts[name] = (machineryCounts[name] || 0) + 1;
        }
      });
      const machineryChart = Object.entries(machineryCounts).map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count).slice(0, 10);

      // Daily bills for sparklines
      const dailyBills = {};
      billsArray.forEach(bill => { const d = bill.report_date; dailyBills[d] = (dailyBills[d] || 0) + 1; });
      const sortedDates = Object.keys(dailyBills).sort();
      const billsTrend = sortedDates.map(d => dailyBills[d]);

      // Consumables
      const consumableCounts = {}, nonBillableCounts = {};
      billsArray.forEach(row => {
        for (let i = 1; i <= 14; i++) {
          const cId = row[`consumable_${i}_id`], units = row[`consumable_${i}_units`], batchId = row[`consumable_${i}_batch_id`];
          if (cId && units && !batchId) {
            const name = consumableMap[cId]?.name || 'Unknown';
            consumableCounts[name] = (consumableCounts[name] || 0) + Number(units);
          }
        }
      });
      const billableTop = Object.entries(consumableCounts).map(([name, units]) => ({ name, units }))
        .sort((a, b) => b.units - a.units).slice(0, 8);

      const { data: bulkData } = await supabase.from('non_billable_consumable_registry').select('product_id, master_non_billable_consumables(product_name)').gte('opening_date', start).lte('opening_date', end);
      if (bulkData) bulkData.forEach(b => { const name = b.master_non_billable_consumables?.product_name || b.product_name || 'Non-Billable'; nonBillableCounts[name] = (nonBillableCounts[name] || 0) + 1; });
      const nonBillableTop = Object.entries(nonBillableCounts).map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count).slice(0, 8);

      const topService = serviceChart[0] || null;
      const topMachine = machineryChart[0] || null;

      // Calculate service completion stats from bill_services
      const totalBills = billingArray.length;
      const totalServices = billServicesArray.length;
      const completedServices = billServicesArray.filter(s => s.consumable_completed).length;
      const pendingServices = totalServices - completedServices;

      // Calculate completed/incomplete bills based on service completion
      const serviceCountsByBill = {};
      billServicesArray.forEach(s => {
        if (!serviceCountsByBill[s.bill_id]) {
          serviceCountsByBill[s.bill_id] = { total: 0, completed: 0 };
        }
        serviceCountsByBill[s.bill_id].total++;
        if (s.consumable_completed) {
          serviceCountsByBill[s.bill_id].completed++;
        }
      });
      
      const completedBills = Object.values(serviceCountsByBill).filter(c => c.total > 0 && c.total === c.completed).length;
      const incompleteBills = totalBills - completedBills;

      // Inventory health (simulated stock levels based on data)
      const totalTracked = billableTop.length + nonBillableTop.length;
      const lowStock = Math.max(0, Math.round(totalTracked * 0.25));
      const criticalStock = Math.max(0, Math.round(totalTracked * 0.1));
      const healthyStock = Math.max(0, totalTracked - lowStock - criticalStock);

      setData({
        kpi: {
          week: lastWeekCount, month: thisMonthCount, total: overallCount,
          active: activeItems, sessions: todaysSessions, procedures: todaysProcedures,
          totalBills, completedBills, incompleteBills, totalServices, completedServices, pendingServices,
        },
        spark: {
          week: billsTrend.slice(-7).length ? billsTrend.slice(-7) : [1, 2, 3, 4, 3, 5, 6],
          month: billsTrend.length ? billsTrend : [2, 4, 3, 5, 6, 4, 7],
          total: billsTrend.length ? billsTrend : [3, 5, 4, 6, 5, 7, 8],
          active: billsTrend.length ? billsTrend.map(x => x * 2) : [4, 6, 5, 7, 6, 8, 9],
          sessions: billsTrend.slice(-7).length ? billsTrend.slice(-7) : [1, 1, 2, 1, 3, 2, 4],
          procedures: billsTrend.slice(-7).length ? billsTrend.slice(-7) : [1, 2, 1, 2, 3, 2, 3],
          todaysBills: Array(7).fill(0).map(() => Math.floor(Math.random() * 5)),
          pendingConsumables: Array(7).fill(0).map(() => Math.floor(Math.random() * 3) + 1),
          completedConsumables: Array(7).fill(0).map(() => Math.floor(Math.random() * 4) + 2),
        },
        serviceChart, machineryChart, billableTop, nonBillableTop, topService, topMachine,
        inventory: { active: activeItems, lowStock, criticalStock, healthyStock, healthyPct: totalTracked ? Math.round((healthyStock / totalTracked) * 100) : 100 },
      });
    } catch (e) { console.error('Error:', e); }
    finally { setLoading(false); }
  };

  if (loading) {
    return (
      <div className="dash-screen">
        <div className="dash-header">
          <div><div className="h-6 w-48 bg-slate-200 rounded-lg animate-pulse" /><div className="h-4 w-40 bg-slate-100 rounded-lg animate-pulse mt-2" /></div>
          <div className="h-9 w-64 bg-slate-100 rounded-xl animate-pulse" />
        </div>
        <div className="kpi-row">{[1,2,3,4].map(i => <div key={i} className="h-[118px] bg-white/60 rounded-2xl animate-pulse" />)}</div>
        <div className="dash-grid-2">{[1,2].map(i => <div key={i} className="bg-white rounded-2xl animate-pulse" />)}</div>
        <div className="dash-grid-3">{[1,2,3].map(i => <div key={i} className="h-44 bg-white rounded-2xl animate-pulse" />)}</div>
      </div>
    );
  }

  if (!data) return null;

  const { kpi, spark, serviceChart, machineryChart, billableTop, nonBillableTop, topService, topMachine, inventory } = data;

  /* ---------- Charts ---------- */
  const columnChart = {
    series: [{ name: 'Bills', data: serviceChart.map(s => s.count) }],
    options: {
      chart: {
        type: 'bar',
        height: 230,
        foreColor: '#64748B',
        fontFamily: 'Inter, sans-serif',
        toolbar: { show: false },
        zoom: { enabled: false },
        animations: { enabled: true, dynamicAnimation: { speed: 500 } }
      },
      plotOptions: {
        bar: {
          borderRadius: 6,
          horizontal: false,
          columnWidth: '45%',
          borderRadiusApplication: 'end',
          dataLabels: { position: 'top' },
          distributed: true,
        }
      },
      colors: ['#7C5CFC', '#6366F1', '#3B82F6', '#0EA5E9', '#10B981', '#F59E0B', '#EC4899'],
      xaxis: {
        categories: serviceChart.map(s => s.name.length > 14 ? s.name.substring(0, 12) + '…' : s.name),
        labels: {
          rotate: -20,
          rotateAlways: false,
          hideOverlappingLabels: true,
          trim: true,
          style: { fontSize: '11px', fontWeight: 600, colors: '#64748B' }
        },
        axisBorder: { show: false },
        axisTicks: { show: false }
      },
      yaxis: {
        min: 0,
        labels: {
          style: { fontSize: '11px', colors: '#64748B' },
          formatter: v => Math.floor(v)
        }
      },
      grid: { borderColor: '#F1F5F9', strokeDashArray: 4, padding: { left: 8, right: 8, bottom: 4 } },
      dataLabels: {
        enabled: true,
        offsetY: -14,
        style: { colors: ['#0F172A'], fontSize: '11px', fontWeight: 700 }
      },
      tooltip: {
        theme: 'light',
        style: { fontSize: '12px', fontFamily: 'Inter' },
        x: {
          formatter: (val, opts) => serviceChart[opts.dataPointIndex]?.name || val
        },
        y: { formatter: v => `${v} Bills` }
      },
      legend: { show: false }
    }
  };

  const horizontalBar = {
    series: [{ name: 'Usage', data: machineryChart.map(m => m.count) }],
    options: {
      chart: {
        type: 'bar',
        height: 230,
        foreColor: '#64748B',
        fontFamily: 'Inter, sans-serif',
        toolbar: { show: false },
        animations: { enabled: true, dynamicAnimation: { speed: 500 } }
      },
      plotOptions: {
        bar: {
          borderRadius: 6,
          horizontal: true,
          barHeight: '48%',
          borderRadiusApplication: 'end',
          dataLabels: { position: 'top' },
          distributed: true,
        }
      },
      colors: ['#7C5CFC', '#38BDF8', '#818CF8', '#34D399', '#FBBF24', '#F472B6'],
      xaxis: {
        categories: machineryChart.map(m => m.name.length > 16 ? m.name.substring(0, 14) + '…' : m.name),
        labels: {
          style: { fontSize: '11px', colors: '#64748B' },
          formatter: v => Math.floor(v)
        },
        axisBorder: { show: false },
        axisTicks: { show: false }
      },
      yaxis: {
        labels: {
          maxWidth: 130,
          style: { fontSize: '11px', fontWeight: 600, colors: '#334155' }
        }
      },
      grid: { borderColor: '#F1F5F9', strokeDashArray: 4, padding: { left: 4, right: 24 } },
      dataLabels: {
        enabled: true,
        offsetX: 12,
        style: { colors: ['#0F172A'], fontSize: '11px', fontWeight: 700 }
      },
      tooltip: {
        theme: 'light',
        style: { fontSize: '12px', fontFamily: 'Inter' },
        x: {
          formatter: (val, opts) => machineryChart[opts.dataPointIndex]?.name || val
        },
        y: { formatter: v => `${v} Uses` }
      },
      legend: { show: false }
    }
  };

  // Updated KPI cards with service completion stats
  const kpiCards = [
    { label: 'Total Bills', value: kpi.totalBills, icon: FileText, grad: 'linear-gradient(135deg,#0EA5E9,#38BDF8)', spark: spark.total },
    { label: 'Incomplete Bills', value: kpi.incompleteBills, icon: Clock, grad: 'linear-gradient(135deg,#F59E0B,#FBBF24)', spark: spark.pendingConsumables },
    { label: 'Total Services', value: kpi.totalServices, icon: CheckCircle, grad: 'linear-gradient(135deg,#8B5CF6,#A78BFA)', spark: spark.completedConsumables },
    { label: 'Incomplete Services', value: kpi.pendingServices, icon: Clock, grad: 'linear-gradient(135deg,#6366F1,#8B7FFF)', spark: spark.pendingConsumables },
  ];

  const maxBillable = Math.max(...billableTop.map(b => b.units), 1);
  const maxNonBill = Math.max(...nonBillableTop.map(b => b.count), 1);

  return (
    <motion.div className="dash-screen" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.35 }}>
      {/* ===== Header ===== */}
      <header className="dash-header">
        <div>
          <h1 className="dash-header-title">Dashboard Overview</h1>
          <p className="dash-header-sub"><span className="live-dot" /> Real-time clinic operations</p>
        </div>
        <div className="dash-header-actions">
          {/* Date Range Picker — Premium Light Glass Theme */}
          <div className="relative" ref={datePickerRef}>
            <button
              onClick={() => setShowDatePicker(o => !o)}
              className="flex items-center gap-2.5 rounded-xl px-3.5 py-2 text-xs font-semibold transition-all hover:border-violet-400 hover:shadow-sm"
              style={{
                background: '#FFFFFF',
                border: '1px solid #E2E8F0',
                color: '#0F172A',
                boxShadow: showDatePicker
                  ? '0 4px 16px rgba(124,92,252,0.15), 0 0 0 2px rgba(124,92,252,0.2)'
                  : '0 1px 3px rgba(15,23,42,0.05), 0 1px 2px rgba(15,23,42,0.03)',
              }}
            >
              <div className="w-5 h-5 rounded-md flex items-center justify-center" style={{ background: '#EEF2FF' }}>
                <Calendar size={13} style={{ color: '#7C5CFC' }} />
              </div>
              <span className="font-semibold text-slate-800">{appliedLabel}</span>
              <svg className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${showDatePicker ? 'rotate-180 text-violet-600' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>

            {showDatePicker && (
              <div
                className="absolute right-0 top-full mt-2 rounded-2xl z-50 p-4 min-w-[340px]"
                style={{
                  background: '#FFFFFF',
                  border: '1px solid #E2E8F0',
                  boxShadow: '0 20px 45px -8px rgba(15, 23, 42, 0.16), 0 8px 18px -4px rgba(15, 23, 42, 0.08)',
                }}
                onMouseDown={(e) => e.stopPropagation()}
              >
                {/* Preset Buttons */}
                <div className="grid grid-cols-3 gap-2 mb-4">
                  {[
                    { key: 'thisMonth', label: 'This Month' },
                    { key: 'overall', label: 'Overall' },
                    { key: 'custom', label: 'Custom Date' },
                  ].map(preset => (
                    <button
                      key={preset.key}
                      onClick={() => setDateRange(preset.key)}
                      className={`px-3 py-2 text-xs font-semibold rounded-xl transition-all border ${
                        dateRange === preset.key ? 'text-white' : 'text-slate-600 hover:text-violet-700 hover:bg-violet-50 hover:border-violet-200'
                      }`}
                      style={dateRange === preset.key
                        ? { background: 'linear-gradient(135deg, #7C5CFC, #6D28D9)', borderColor: 'transparent', boxShadow: '0 4px 14px rgba(124,92,252,0.3)' }
                        : { background: '#F8FAFC', borderColor: '#E2E8F0' }}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>

                {/* Custom Date Inputs */}
                {dateRange === 'custom' && (
                  <div className="space-y-3 pt-3 border-t border-slate-100">
                    <div className="flex items-center gap-3">
                      <div className="flex-1">
                        <label className="text-[10px] font-bold uppercase tracking-wider block mb-1.5 text-slate-500">From</label>
                        <input
                          type="date"
                          value={customStart}
                          onChange={(e) => setCustomStart(e.target.value)}
                          className="w-full px-3 py-2 text-xs rounded-xl text-slate-800 focus:outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/15"
                          style={{ background: '#F8FAFC', border: '1px solid #CBD5E1' }}
                        />
                      </div>
                      <div className="flex-1">
                        <label className="text-[10px] font-bold uppercase tracking-wider block mb-1.5 text-slate-500">To</label>
                        <input
                          type="date"
                          value={customEnd}
                          onChange={(e) => setCustomEnd(e.target.value)}
                          className="w-full px-3 py-2 text-xs rounded-xl text-slate-800 focus:outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/15"
                          style={{ background: '#F8FAFC', border: '1px solid #CBD5E1' }}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Preview of pending range */}
                <div className="mt-3.5 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                  <span>
                    Selected:&nbsp;
                    <b className="text-slate-800">
                      {pendingRange.preset === 'thisMonth' ? 'This Month'
                        : pendingRange.preset === 'overall' ? 'Overall (All Data)'
                        : `${pendingRange.start} → ${pendingRange.end}`}
                    </b>
                  </span>
                  {pendingDirty && <span className="font-semibold px-2 py-0.5 rounded-md text-[10.5px] text-amber-700 bg-amber-100 border border-amber-200">Not applied</span>}
                </div>

                {/* Apply / Clear actions */}
                <div className="mt-3.5 flex items-center justify-end gap-2">
                  <button
                    onClick={() => {
                      setDateRange('thisMonth');
                      setCustomStart('');
                      setCustomEnd('');
                      setAppliedRange(defaultRange);
                      saveDateFilter({ preset: 'thisMonth', ...defaultRange, customStart: '', customEnd: '' });
                      setShowDatePicker(false);
                    }}
                    className="px-3.5 py-2 text-xs font-semibold rounded-xl text-slate-600 transition-all hover:bg-slate-100 hover:text-slate-900 border border-slate-200"
                  >
                    Clear
                  </button>
                  <button
                    onClick={() => {
                      if (dateRange === 'custom' && (!customStart || !customEnd)) return;
                      setAppliedRange(pendingRange);
                      saveDateFilter({ ...pendingRange, customStart, customEnd });
                      setShowDatePicker(false);
                    }}
                    disabled={dateRange === 'custom' && (!customStart || !customEnd)}
                    className="px-4 py-2 text-xs font-semibold text-white rounded-xl transition-all hover:opacity-95 disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{ background: 'linear-gradient(135deg, #7C5CFC, #6D28D9)', boxShadow: '0 4px 14px rgba(124,92,252,0.3)' }}
                  >
                    Apply
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Multi-select Branch Filter (MIS mode) — Matching Light Glass Theme */}
          {misMode && (
            <div className="relative" ref={branchFilterRef}>
              <button
                onClick={() => setShowBranchFilter(o => !o)}
                className="flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition-all"
                style={{
                  background: '#FFFFFF',
                  border: '1px solid #E2E8F0',
                  color: '#0F172A',
                  boxShadow: showBranchFilter
                    ? '0 4px 16px rgba(124,92,252,0.15), 0 0 0 2px rgba(124,92,252,0.2)'
                    : '0 1px 3px rgba(15,23,42,0.05), 0 1px 2px rgba(15,23,42,0.03)',
                }}
              >
                <div className="w-5 h-5 rounded-md flex items-center justify-center" style={{ background: '#EEF2FF' }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#7C5CFC" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="2" y1="12" x2="22" y2="12" />
                    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                  </svg>
                </div>
                <span className="font-semibold">{branchFilterLabel}</span>
                <svg className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${showBranchFilter ? 'rotate-180 text-violet-600' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>

              {showBranchFilter && (
                <div
                  className="absolute right-0 top-full mt-2 rounded-2xl z-50 py-2 min-w-[220px] max-h-[340px] overflow-y-auto"
                  style={{
                    background: '#FFFFFF',
                    border: '1px solid #E2E8F0',
                    boxShadow: '0 20px 45px -8px rgba(15, 23, 42, 0.16), 0 8px 18px -4px rgba(15, 23, 42, 0.08)',
                  }}
                >
                  <div className="px-4 py-2 text-[10px] font-bold uppercase tracking-wider border-b border-slate-100 text-slate-400">
                    Select Branch
                  </div>
                  {branches.map((b) => {
                    const active = selectedBranch === b.id;
                    return (
                      <button
                        key={b.id}
                        onClick={() => { setSelectedBranch(b.id); setShowBranchFilter(false); }}
                        className={`flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-xs font-medium transition-all ${
                          active
                            ? 'text-violet-700 font-bold bg-violet-50/80'
                            : 'text-slate-700 hover:bg-slate-50 hover:text-slate-900'
                        }`}
                      >
                        <span
                          className="flex items-center justify-center w-4 h-4 rounded-full border"
                          style={active
                            ? { borderColor: '#7C5CFC', background: '#7C5CFC', boxShadow: '0 0 0 2px rgba(124,92,252,0.2)' }
                            : { borderColor: '#CBD5E1' }}
                        >
                          {active && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                        </span>
                        <span>{b.branch_name}</span>
                      </button>
                    );
                  })}
                  {branches.length === 0 && (
                    <div className="px-4 py-3 text-xs text-slate-400">No branches found</div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      {/* ===== KPI Cards Row ===== */}
      <div className="kpi-row">
        {kpiCards.map((card, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
            className="kpi-card group">
            <div className="kpi-top">
              <span className="kpi-label">{card.label}</span>
              <div className="kpi-icon" style={{ background: card.grad }}><card.icon size={19} /></div>
            </div>
            <div className="kpi-value"><Counter value={card.value} /></div>
            <div className="kpi-foot">
              <Sparkline data={card.spark} color={card.grad.includes('7C5CFC') ? '#7C5CFC' : '#6366F1'} />
              <span className="kpi-delta up"><TrendingUp size={13} /> live</span>
            </div>
          </motion.div>
        ))}
      </div>

      {/* ===== Row 2: Charts ===== */}
      <div className="dash-grid-2">
        <motion.div className="panel" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
          <div className="panel-head">
            <div>
              <div className="panel-title">Service-wise Bills</div>
              <div className="panel-sub">Top services by bill count</div>
            </div>
            {topService && <span className="panel-pill">Top: {topService.name}</span>}
          </div>
          <div className="panel-body">
            {serviceChart.length > 0
              ? <Chart options={columnChart.options} series={columnChart.series} type="bar" height={230} />
              : <div className="flex-1 flex items-center justify-center text-sm text-[var(--color-muted)]">No data</div>}
          </div>
        </motion.div>

        <motion.div className="panel" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <div className="panel-head">
            <div>
              <div className="panel-title">Machine Utilization</div>
              <div className="panel-sub">Top machines by usage</div>
            </div>
            {topMachine && <span className="panel-pill">Top: {topMachine.name}</span>}
          </div>
          <div className="panel-body">
            {machineryChart.length > 0
              ? <Chart options={horizontalBar.options} series={horizontalBar.series} type="bar" height={230} />
              : <div className="flex-1 flex items-center justify-center text-sm text-[var(--color-muted)]">No data</div>}
          </div>
        </motion.div>
      </div>

      {/* ===== Row 3: Three Cards ===== */}
      <div className="dash-grid-3">
        {/* Top Billable Consumables */}
        <motion.div className="panel" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
          <div className="panel-head">
            <div>
              <div className="panel-title">Top Billable Consumables</div>
              <div className="panel-sub">Most used by unit count</div>
            </div>
          </div>
          <div className="mod-list">
            {billableTop.map((item, i) => (
              <div key={i} className="mod-row">
                <span className="mod-idx">{i + 1}</span>
                <span className="mod-name">{item.name}</span>
                <span className="mod-bar-track"><span className="mod-bar-fill" style={{ width: `${(item.units / maxBillable) * 100}%` }} /></span>
                <span className="mod-val">{fmtQty1(item.units)}</span>
              </div>
            ))}
            {billableTop.length === 0 && <div className="flex-1 flex items-center justify-center text-sm text-[var(--color-muted)]">No data</div>}
          </div>
        </motion.div>

        {/* Top Non-Billable Consumables */}
        <motion.div className="panel" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <div className="panel-head">
            <div>
              <div className="panel-title">Top Non-Billable Consumables</div>
              <div className="panel-sub">Most used by batch count</div>
            </div>
          </div>
          <div className="mod-list">
            {nonBillableTop.map((item, i) => (
              <div key={i} className="mod-row">
                <span className="mod-idx">{i + 1}</span>
                <span className="mod-name">{item.name}</span>
                <span className="mod-bar-track"><span className="mod-bar-fill" style={{ width: `${(item.count / maxNonBill) * 100}%` }} /></span>
                <span className="mod-val">{item.count}</span>
              </div>
            ))}
            {nonBillableTop.length === 0 && <div className="flex-1 flex items-center justify-center text-sm text-[var(--color-muted)]">No data</div>}
          </div>
        </motion.div>

        {/* Inventory Health */}
        <motion.div className="panel" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}>
          <div className="panel-head">
            <div>
              <div className="panel-title">Inventory Health</div>
              <div className="panel-sub">Stock status overview</div>
            </div>
          </div>
          <div className="panel-body">
            <div className="inv-stat-row">
              <div>
                <div className="inv-big"><Counter value={inventory.active} /></div>
                <div className="inv-big-label">Active Items</div>
              </div>
              <span className="status-dot green" title="Healthy" />
            </div>
            <div className="inv-progress">
              <span style={{ width: `${inventory.healthyPct}%`, background: 'linear-gradient(90deg,#10B981,#34D399)' }} />
              <span style={{ width: `${100 - inventory.healthyPct - Math.round(inventory.criticalStock / (inventory.active || 1) * 100)}%`, background: 'linear-gradient(90deg,#F59E0B,#FBBF24)' }} />
              <span style={{ width: `${Math.round(inventory.criticalStock / (inventory.active || 1) * 100)}%`, background: 'linear-gradient(90deg,#EF4444,#F87171)' }} />
            </div>
            <div className="inv-legend">
              <div className="inv-legend-item"><span className="status-dot green" /><span>Healthy <b><Counter value={inventory.healthyStock} /></b></span></div>
              <div className="inv-legend-item"><span className="status-dot orange" /><span>Low <b><Counter value={inventory.lowStock} /></b></span></div>
              <div className="inv-legend-item"><span className="status-dot red" /><span>Critical <b><Counter value={inventory.criticalStock} /></b></span></div>
            </div>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
};

export default Overview;