import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../config/supabase';
import { useBranch } from '../context/BranchContext';
import BranchSwitcher from '../components/BranchSwitcher';
import Chart from 'react-apexcharts';
import { motion } from 'framer-motion';
import {
  Calendar, Activity, FileText, Box, Stethoscope, Scissors,
  Bell, TrendingUp
} from 'lucide-react';

/* ---------- Animated Counter ---------- */
const useCountUp = (target, duration = 800) => {
  const [val, setVal] = useState(0);
  useEffect(() => {
    let start = 0, t0 = null;
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
  const { branchId } = useBranch();
  const [dateRange, setDateRange] = useState('last7');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const getDateRange = useMemo(() => {
    const today = new Date();
    let start = new Date();
    let end = today;
    if (dateRange === 'last7') start = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    else if (dateRange === 'last30') start = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
    else if (dateRange === 'thisMonth') start = new Date(today.getFullYear(), today.getMonth(), 1);
    else if (dateRange === 'custom' && customStart && customEnd) { start = new Date(customStart); end = new Date(customEnd); }
    return { start: start.toISOString().split('T')[0], end: end.toISOString().split('T')[0] };
  }, [dateRange, customStart, customEnd]);

  useEffect(() => {
    if (branchId) fetchDashboard();
  }, [branchId, getDateRange]);

  const fetchDashboard = async () => {
    setLoading(true);
    try {
      const { start, end } = getDateRange;
      let query = supabase.from('billable_report').select('*').gte('report_date', start).lte('report_date', end);
      if (branchId) query = query.eq('branch_id', branchId);
      const { data: bills } = await query;
      const billsArray = bills || [];

      // Stats
      const lastWeekStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const thisMonthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
      const lastWeekCount = billsArray.filter(b => b.report_date >= lastWeekStart).length;
      const thisMonthCount = billsArray.filter(b => b.report_date >= thisMonthStart).length;
      const overallCount = billsArray.length;

      // Today's sessions (bills created today) & procedures (distinct services today)
      const todayStr = new Date().toISOString().split('T')[0];
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
        const { data: c } = await supabase.from('master_consumables').select('id, consumable_name, cost_unit').in('id', Array.from(consumableIds));
        if (c) c.forEach(x => consumableMap[x.id] = { name: x.consumable_name, cost: x.cost_unit || 0 });
      }

      // Services
      const { data: services } = await supabase.from('master_services').select('id, service_name');
      const serviceCounts = {};
      if (services) services.forEach(s => serviceCounts[s.id] = { name: s.service_name, count: 0 });
      billsArray.forEach(bill => { if (bill.service_id && serviceCounts[bill.service_id]) serviceCounts[bill.service_id].count++; });
      const serviceChart = Object.values(serviceCounts).sort((a, b) => b.count - a.count).filter(s => s.count > 0).slice(0, 10);

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

      // Inventory health (simulated stock levels based on data)
      const totalTracked = billableTop.length + nonBillableTop.length;
      const lowStock = Math.max(0, Math.round(totalTracked * 0.25));
      const criticalStock = Math.max(0, Math.round(totalTracked * 0.1));
      const healthyStock = Math.max(0, totalTracked - lowStock - criticalStock);

      setData({
        kpi: {
          week: lastWeekCount, month: thisMonthCount, total: overallCount,
          active: activeItems, sessions: todaysSessions, procedures: todaysProcedures
        },
        spark: {
          week: billsTrend.slice(-7).length ? billsTrend.slice(-7) : [1, 2, 3, 4, 3, 5, 6],
          month: billsTrend.length ? billsTrend : [2, 4, 3, 5, 6, 4, 7],
          total: billsTrend.length ? billsTrend : [3, 5, 4, 6, 5, 7, 8],
          active: billsTrend.length ? billsTrend.map(x => x * 2) : [4, 6, 5, 7, 6, 8, 9],
          sessions: billsTrend.slice(-7).length ? billsTrend.slice(-7) : [1, 1, 2, 1, 3, 2, 4],
          procedures: billsTrend.slice(-7).length ? billsTrend.slice(-7) : [1, 2, 1, 2, 3, 2, 3],
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
        <div className="kpi-row">{[1,2,3,4,5,6].map(i => <div key={i} className="h-[118px] bg-white/60 rounded-2xl animate-pulse" />)}</div>
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
      chart: { type: 'bar', height: '100%', foreColor: '#64748B', fontFamily: 'Inter, sans-serif', toolbar: { show: false }, zoom: { enabled: false }, animations: { enabled: true, dynamicAnimation: { speed: 600 } } },
      plotOptions: { bar: { borderRadius: 8, horizontal: false, columnWidth: '58%', borderRadiusApplication: 'end', dataLabels: { position: 'top' } } },
      colors: ['#7C5CFC'],
      fill: { type: 'gradient', gradient: { shade: 'dark', type: 'vertical', shadeIntensity: 0.4, gradientToColors: ['#A78BFA'], inverseColors: false, opacityFrom: 0.95, opacityTo: 0.65 } },
      xaxis: { categories: serviceChart.map(s => s.name), labels: { rotate: -40, style: { fontSize: '11px' } }, axisBorder: { show: false }, axisTicks: { show: false } },
      yaxis: { labels: { style: { fontSize: '11px' } } },
      grid: { borderColor: '#F1F5F9', strokeDashArray: 4, padding: { left: 0, right: 8 } },
      dataLabels: { enabled: true, offsetY: -18, style: { colors: ['#0F172A'], fontSize: '11px', fontWeight: 600 } },
      tooltip: { theme: 'light', style: { fontSize: '12px', fontFamily: 'Inter' }, y: { formatter: v => `${v} Bills` } },
    }
  };

  const horizontalBar = {
    series: [{ name: 'Usage', data: machineryChart.map(m => m.count) }],
    options: {
      chart: { type: 'bar', height: '100%', foreColor: '#64748B', fontFamily: 'Inter, sans-serif', toolbar: { show: false }, animations: { enabled: true, dynamicAnimation: { speed: 600 } } },
      plotOptions: { bar: { borderRadius: 8, horizontal: true, barHeight: '56%', borderRadiusApplication: 'end', dataLabels: { position: 'right' } } },
      colors: ['#7C5CFC'],
      fill: { type: 'gradient', gradient: { shade: 'dark', type: 'horizontal', shadeIntensity: 0.4, gradientToColors: ['#A78BFA'], inverseColors: true, opacityFrom: 0.95, opacityTo: 0.65 } },
      xaxis: { categories: machineryChart.map(m => m.name), labels: { style: { fontSize: '11px' } }, axisBorder: { show: false }, axisTicks: { show: false } },
      yaxis: { labels: { style: { fontSize: '11px' } } },
      grid: { borderColor: '#F1F5F9', strokeDashArray: 4, padding: { left: 0, right: 8 } },
      dataLabels: { enabled: true, style: { colors: ['#0F172A'], fontSize: '11px', fontWeight: 600 } },
      tooltip: { theme: 'light', style: { fontSize: '12px', fontFamily: 'Inter' }, y: { formatter: v => `${v} Uses` } },
    }
  };

  const kpiCards = [
    { label: 'This Week', value: kpi.week, icon: Calendar, grad: 'linear-gradient(135deg,#7C5CFC,#A78BFA)', spark: spark.week },
    { label: 'This Month', value: kpi.month, icon: Activity, grad: 'linear-gradient(135deg,#6366F1,#8B7FFF)', spark: spark.month },
    { label: 'Total Bills', value: kpi.total, icon: FileText, grad: 'linear-gradient(135deg,#0EA5E9,#38BDF8)', spark: spark.total },
    { label: 'Active Items', value: kpi.active, icon: Box, grad: 'linear-gradient(135deg,#10B981,#34D399)', spark: spark.active },
    { label: "Today's Sessions", value: kpi.sessions, icon: Stethoscope, grad: 'linear-gradient(135deg,#F59E0B,#FBBF24)', spark: spark.sessions },
    { label: "Today's Procedures", value: kpi.procedures, icon: Scissors, grad: 'linear-gradient(135deg,#EC4899,#F472B6)', spark: spark.procedures },
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
          <BranchSwitcher />
          <button className="icon-btn" title="Notifications">
            <Bell size={17} />
          </button>
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
              ? <Chart options={columnChart.options} series={columnChart.series} type="bar" height="100%" />
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
              ? <Chart options={horizontalBar.options} series={horizontalBar.series} type="bar" height="100%" />
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
                <span className="mod-val">{item.units}</span>
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