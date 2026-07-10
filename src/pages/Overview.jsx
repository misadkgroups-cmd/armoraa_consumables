import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../config/supabase';
import { useBranch } from '../context/BranchContext';
import Chart from 'react-apexcharts';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Calendar, Activity, FileText, DollarSign, TrendingUp, TrendingDown,
  Box, Package, Server, Building2, ChevronDown, RefreshCw
} from 'lucide-react';

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

      // Previous period for growth
      const periodStart = new Date(start);
      const periodDays = Math.ceil((new Date(end).getTime() - periodStart.getTime()) / 86400000);
      const prevStart = new Date(periodStart.getTime() - periodDays * 86400000).toISOString().split('T')[0];
      const { data: prevBills } = await supabase.from('billable_report').select('id').gte('report_date', prevStart).lt('report_date', start);
      const prevCount = prevBills?.length || 1;
      const growth = ((overallCount - prevCount) / prevCount * 100).toFixed(1);

      // Consumable map for costs
      const consumableIds = new Set();
      billsArray.forEach(row => { for (let i = 1; i <= 14; i++) if (row[`consumable_${i}_id`]) consumableIds.add(row[`consumable_${i}_id`]); });
      let consumableMap = {};
      if (consumableIds.size > 0) {
        const { data: c } = await supabase.from('master_consumables').select('id, consumable_name, cost_unit').in('id', Array.from(consumableIds));
        if (c) c.forEach(x => consumableMap[x.id] = { name: x.consumable_name, cost: x.cost_unit || 0 });
      }

      let totalCost = 0;
      billsArray.forEach(bill => {
        for (let i = 1; i <= 14; i++) {
          const cId = bill[`consumable_${i}_id`], units = bill[`consumable_${i}_units`], batchId = bill[`consumable_${i}_batch_id`];
          if (cId && units && !batchId) totalCost += Number(units) * Number(consumableMap[cId]?.cost || 0);
        }
      });

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

      // Daily trend
      const dailyRevenue = {}, dailyBills = {};
      billsArray.forEach(bill => {
        const date = bill.report_date;
        dailyBills[date] = (dailyBills[date] || 0) + 1;
        let rev = 0;
        for (let i = 1; i <= 14; i++) {
          const cId = bill[`consumable_${i}_id`], units = bill[`consumable_${i}_units`], batchId = bill[`consumable_${i}_batch_id`];
          if (cId && units && !batchId) rev += Number(units) * Number(consumableMap[cId]?.cost || 0);
        }
        dailyRevenue[date] = (dailyRevenue[date] || 0) + rev;
      });

      const sortedDates = Object.keys(dailyBills).sort();
      const revenueTrend = sortedDates.map(d => ({ x: d, y: Math.round(dailyRevenue[d] * 100) / 100 }));
      const billsTrend = sortedDates.map(d => ({ x: d, y: dailyBills[d] }));

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
        .sort((a, b) => b.units - a.units).slice(0, 10);

      const { data: bulkData } = await supabase.from('bulk_consumables_registry').select('product_name').gte('open_date', start).lte('open_date', end);
      if (bulkData) bulkData.forEach(b => { nonBillableCounts[b.product_name] = (nonBillableCounts[b.product_name] || 0) + 1; });
      const nonBillableTop = Object.entries(nonBillableCounts).map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count).slice(0, 10);

      // Most used service & machine
      const topService = serviceChart[0] || null;
      const topMachine = machineryChart[0] || null;

      // Branch performance
      const branchIds = [...new Set(billsArray.map(b => b.branch_id).filter(Boolean))];
      let branchMap = {};
      if (branchIds.length > 0) {
        const { data: br } = await supabase.from('branches').select('id, branch_name').in('id', branchIds);
        if (br) br.forEach(x => branchMap[x.id] = x.branch_name);
      }
      const branchPerf = {};
      billsArray.forEach(b => {
        if (b.branch_id) {
          const name = branchMap[b.branch_id] || 'Unknown';
          if (!branchPerf[name]) branchPerf[name] = { bills: 0, revenue: 0 };
          branchPerf[name].bills++;
          let rev = 0;
          for (let i = 1; i <= 14; i++) {
            const cId = b[`consumable_${i}_id`], units = b[`consumable_${i}_units`], batchId = b[`consumable_${i}_batch_id`];
            if (cId && units && !batchId) rev += Number(units) * Number(consumableMap[cId]?.cost || 0);
          }
          branchPerf[name].revenue += rev;
        }
      });
      const branchTop = Object.entries(branchPerf).map(([name, d]) => ({ name, ...d }))
        .sort((a, b) => b.bills - a.bills)[0] || null;

      setData({
        stats: { lastWeek: lastWeekCount, thisMonth: thisMonthCount, overall: overallCount, totalCost, growth, prevCount },
        serviceChart,
        machineryChart,
        revenueTrend,
        billsTrend,
        billableTop,
        nonBillableTop,
        topService,
        topMachine,
        branchTop,
        totalMachines: Object.keys(machineryCounts).length,
        totalServices: serviceChart.length,
      });
    } catch (e) { console.error('Error:', e); }
    finally { setLoading(false); }
  };

  const chartTheme = {
    chart: {
      foreColor: '#64748B', fontFamily: 'Inter, sans-serif',
      toolbar: { show: false }, zoom: { enabled: false },
      animations: { enabled: true, dynamicAnimation: { speed: 500 } }
    },
    grid: { borderColor: '#F1F5F9', strokeDashArray: 3 },
    tooltip: { theme: 'light', style: { fontSize: '12px', fontFamily: 'Inter' } },
  };

  // Skeleton Loading
  if (loading) {
    return (
      <div className="animate-pulse space-y-6 p-2">
        <div className="h-8 bg-slate-200 rounded-lg w-64 mb-6" />
        <div className="grid grid-cols-4 gap-4">
          {[1,2,3,4].map(i => <div key={i} className="h-32 bg-slate-200 rounded-2xl" />)}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="h-80 bg-slate-200 rounded-2xl" />
          <div className="h-80 bg-slate-200 rounded-2xl" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="h-64 bg-slate-200 rounded-2xl" />
          <div className="h-64 bg-slate-200 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { stats, serviceChart, machineryChart, revenueTrend, billsTrend, billableTop, nonBillableTop, topService, topMachine, branchTop } = data;

  // ApexCharts configs
  const columnChart = {
    ...chartTheme,
    series: [{ name: 'Bills', data: serviceChart.map(s => s.count) }],
    options: {
      ...chartTheme,
      chart: { ...chartTheme.chart, type: 'bar', height: 360 },
      plotOptions: { bar: { borderRadius: 4, horizontal: false, columnWidth: '55%', dataLabels: { position: 'top' } } },
      colors: ['#6D5EF5'],
      fill: { type: 'gradient', gradient: { shade: 'dark', type: 'vertical', shadeIntensity: 0.3, gradientToColors: ['#8B7FFF'], inverseColors: false, opacityFrom: 0.9, opacityTo: 0.6 } },
      xaxis: { categories: serviceChart.map(s => s.name), labels: { rotate: -45, style: { fontSize: '11px' } } },
      yaxis: { labels: { style: { fontSize: '11px' } } },
      dataLabels: { enabled: true, offsetY: -20, style: { colors: ['#0F172A'], fontSize: '11px', fontWeight: 600 } },
      tooltip: { ...chartTheme.tooltip, y: { formatter: v => `${v} Bills` } },
    }
  };

  const horizontalBar = {
    series: [{ name: 'Usage', data: machineryChart.map(m => m.count) }],
    options: {
      chart: { type: 'bar', height: 360, foreColor: '#64748B', fontFamily: 'Inter, sans-serif', toolbar: { show: false }, animations: { enabled: true, dynamicAnimation: { speed: 500 } } },
      plotOptions: { bar: { borderRadius: 4, horizontal: true, barHeight: '50%', dataLabels: { position: 'right' } } },
      colors: ['#6D5EF5'],
      fill: { type: 'gradient', gradient: { shade: 'dark', type: 'horizontal', shadeIntensity: 0.3, gradientToColors: ['#8B7FFF'], inverseColors: true, opacityFrom: 0.9, opacityTo: 0.6 } },
      xaxis: { categories: machineryChart.map(m => m.name), labels: { style: { fontSize: '11px' } } },
      yaxis: { labels: { style: { fontSize: '11px' } } },
      dataLabels: { enabled: true, style: { colors: ['#0F172A'], fontSize: '11px', fontWeight: 600 }, formatter: v => `${v}` },
      grid: { borderColor: '#F1F5F9', strokeDashArray: 3 },
      tooltip: { theme: 'light', style: { fontSize: '12px', fontFamily: 'Inter' }, y: { formatter: v => `${v} Uses` } },
    }
  };

  const areaChart = (data, color, name, formatter) => ({
    series: [{ name, data: data.map(d => ({ x: d.x, y: d.y })) }],
    options: {
      chart: { type: 'area', height: 300, foreColor: '#64748B', fontFamily: 'Inter, sans-serif', toolbar: { show: false }, zoom: { enabled: false }, animations: { enabled: true, dynamicAnimation: { speed: 500 } } },
      colors: [color],
      fill: { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.3, opacityTo: 0, stops: [0, 90, 100] } },
      stroke: { curve: 'smooth', width: 2 },
      dataLabels: { enabled: false },
      xaxis: { type: 'datetime', labels: { style: { fontSize: '11px' } } },
      yaxis: { labels: { style: { fontSize: '11px' }, formatter } },
      grid: { borderColor: '#F1F5F9', strokeDashArray: 3 },
      tooltip: { theme: 'light', style: { fontSize: '12px', fontFamily: 'Inter' }, x: { format: 'dd MMM' }, y: { formatter: v => formatter(v) } },
    }
  });

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-ink)] tracking-tight">Dashboard Overview</h1>
          <p className="text-sm text-[var(--color-muted)] mt-1">Real-time analytics for your clinic operations</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex bg-[var(--color-surface)] border border-[var(--color-line)] rounded-xl p-1 gap-1 shadow-sm">
            {[
              { key: 'last7', label: '7D' },
              { key: 'last30', label: '30D' },
              { key: 'thisMonth', label: 'Month' },
              { key: 'custom', label: 'Custom' },
            ].map(opt => (
              <button key={opt.key} onClick={() => setDateRange(opt.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${dateRange === opt.key ? 'bg-[var(--color-primary)] text-white shadow-sm' : 'text-[var(--color-muted)] hover:text-[var(--color-text)]'}`}>
                {opt.label}
              </button>
            ))}
          </div>
          {dateRange === 'custom' && (
            <div className="flex gap-2">
              <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)}
                className="h-9 px-3 border border-[var(--color-line)] rounded-lg text-xs focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/10 outline-none" />
              <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)}
                className="h-9 px-3 border border-[var(--color-line)] rounded-lg text-xs focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/10 outline-none" />
            </div>
          )}
          <button onClick={fetchDashboard} className="p-2 rounded-xl border border-[var(--color-line)] hover:bg-[var(--color-tint)] transition-all">
            <RefreshCw size={16} className="text-[var(--color-muted)]" />
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <motion.div className="grid grid-cols-4 gap-4 mb-6"
        initial="hidden" animate="visible" variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.05 } } }}>
        {[
          { label: 'This Week', value: stats.lastWeek, icon: Calendar, color: '#6D5EF5', bg: '#EEF2FF', change: `${stats.growth}%` },
          { label: 'This Month', value: stats.thisMonth, icon: Activity, color: '#10B981', bg: '#D1FAE5', change: `${stats.growth}%` },
          { label: 'Total Bills', value: stats.overall, icon: FileText, color: '#3B82F6', bg: '#DBEAFE', change: 'All time' },
          { label: 'Revenue', value: `₹${stats.totalCost.toFixed(0)}`, icon: DollarSign, color: '#F59E0B', bg: '#FEF3C7', change: '+' },
        ].map((card, i) => (
          <motion.div key={i} variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }}
            className="bg-[var(--color-surface)] border border-[var(--color-line)] rounded-2xl p-5 hover:shadow-lg hover:shadow-[var(--color-primary)]/5 hover:border-[var(--color-primary)]/20 transition-all cursor-default group">
            <div className="flex items-start justify-between mb-3">
              <span className="text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider">{card.label}</span>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center transition-all group-hover:scale-110"
                style={{ background: card.bg, color: card.color }}>
                <card.icon size={20} />
              </div>
            </div>
            <div className="text-3xl font-bold text-[var(--color-ink)] tracking-tight">{card.value}</div>
            <div className="flex items-center gap-1 mt-2 text-xs font-medium" style={{ color: card.color }}>
              <TrendingUp size={14} />
              <span>{card.change}</span>
            </div>
          </motion.div>
        ))}
      </motion.div>

      {/* Row 1: Service Column Chart + Machinery Horizontal Bar */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="bg-[var(--color-surface)] border border-[var(--color-line)] rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-[var(--color-ink)]">Service-wise Bills</h3>
              <p className="text-xs text-[var(--color-muted)] mt-0.5">Top services by bill count</p>
            </div>
            {topService && <span className="text-xs font-semibold text-[var(--color-primary)] bg-[#EEF2FF] px-3 py-1 rounded-full">Top: {topService.name}</span>}
          </div>
          <Chart options={columnChart.options} series={columnChart.series} type="bar" height={340} />
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
          className="bg-[var(--color-surface)] border border-[var(--color-line)] rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-[var(--color-ink)]">Machinery Utilization</h3>
              <p className="text-xs text-[var(--color-muted)] mt-0.5">Top machines by usage count</p>
            </div>
            {topMachine && <span className="text-xs font-semibold text-[var(--color-primary)] bg-[#EEF2FF] px-3 py-1 rounded-full">Top: {topMachine.name}</span>}
          </div>
          <Chart options={horizontalBar.options} series={horizontalBar.series} type="bar" height={340} />
        </motion.div>
      </div>

      {/* Row 2: Revenue Trend + Bills Trend */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
          className="bg-[var(--color-surface)] border border-[var(--color-line)] rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-[var(--color-ink)]">Revenue Trend</h3>
              <p className="text-xs text-[var(--color-muted)] mt-0.5">Daily revenue over selected period</p>
            </div>
            <span className="text-sm font-bold text-[var(--color-success)]">₹{stats.totalCost.toFixed(0)}</span>
          </div>
          {revenueTrend.length > 0 && (
            <Chart {...areaChart(revenueTrend, '#10B981', 'Revenue', v => `₹${v}`)} type="area" height={280} />
          )}
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
          className="bg-[var(--color-surface)] border border-[var(--color-line)] rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-[var(--color-ink)]">Bills Trend</h3>
              <p className="text-xs text-[var(--color-muted)] mt-0.5">Daily bill count over selected period</p>
            </div>
            <span className="text-sm font-bold text-[var(--color-primary)]">{stats.overall} Total</span>
          </div>
          {billsTrend.length > 0 && (
            <Chart {...areaChart(billsTrend, '#6D5EF5', 'Bills', v => `${v}`)} type="area" height={280} />
          )}
        </motion.div>
      </div>

      {/* Row 3: Consumables Tables */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
          className="bg-[var(--color-surface)] border border-[var(--color-line)] rounded-2xl overflow-hidden">
          <div className="p-5 border-b border-[var(--color-line-2)]">
            <h3 className="text-sm font-semibold text-[var(--color-ink)]">Top Billable Consumables</h3>
            <p className="text-xs text-[var(--color-muted)] mt-0.5">Most used consumables by unit count</p>
          </div>
          <div className="overflow-y-auto max-h-72">
            <table className="w-full">
              <thead className="bg-[var(--color-tint)] sticky top-0">
                <tr><th className="text-left px-5 py-3 text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider">Consumable</th><th className="text-right px-5 py-3 text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider">Units</th></tr>
              </thead>
              <tbody>
                {billableTop.map((item, i) => (
                  <tr key={i} className="border-b border-[var(--color-line-2)] hover:bg-[var(--color-tint)] transition-colors">
                    <td className="px-5 py-3 text-sm text-[var(--color-text)]">{item.name}</td>
                    <td className="px-5 py-3 text-sm font-semibold text-right" style={{ color: 'var(--color-primary)' }}>{item.units}</td>
                  </tr>
                ))}
                {billableTop.length === 0 && <tr><td colSpan={2} className="px-5 py-8 text-center text-sm text-[var(--color-muted)]">No data</td></tr>}
              </tbody>
            </table>
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}
          className="bg-[var(--color-surface)] border border-[var(--color-line)] rounded-2xl overflow-hidden">
          <div className="p-5 border-b border-[var(--color-line-2)]">
            <h3 className="text-sm font-semibold text-[var(--color-ink)]">Top Non-Billable Consumables</h3>
            <p className="text-xs text-[var(--color-muted)] mt-0.5">Most used products by batch count</p>
          </div>
          <div className="overflow-y-auto max-h-72">
            <table className="w-full">
              <thead className="bg-[var(--color-tint)] sticky top-0">
                <tr><th className="text-left px-5 py-3 text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider">Product</th><th className="text-right px-5 py-3 text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider">Count</th></tr>
              </thead>
              <tbody>
                {nonBillableTop.map((item, i) => (
                  <tr key={i} className="border-b border-[var(--color-line-2)] hover:bg-[var(--color-tint)] transition-colors">
                    <td className="px-5 py-3 text-sm text-[var(--color-text)]">{item.name}</td>
                    <td className="px-5 py-3 text-sm font-semibold text-right" style={{ color: 'var(--color-success)' }}>{item.count}</td>
                  </tr>
                ))}
                {nonBillableTop.length === 0 && <tr><td colSpan={2} className="px-5 py-8 text-center text-sm text-[var(--color-muted)]">No data</td></tr>}
              </tbody>
            </table>
          </div>
        </motion.div>
      </div>

      {/* Row 4: Executive Summary Cards */}
      <motion.div className="grid grid-cols-4 gap-4 mb-6"
        initial="hidden" animate="visible" variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.05 } } }}>
        <motion.div variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }}
          className="bg-[var(--color-surface)] border border-[var(--color-line)] rounded-2xl p-5 hover:shadow-lg hover:border-[var(--color-primary)]/20 transition-all">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-[#EEF2FF] flex items-center justify-center" style={{ color: '#6D5EF5' }}>
              <Activity size={20} />
            </div>
            <div>
              <div className="text-xs font-semibold text-[var(--color-muted)]">Most Used Service</div>
              <div className="text-sm font-bold text-[var(--color-ink)]">{topService?.name || 'N/A'}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold text-[var(--color-ink)]">{topService?.count || 0}</span>
            <span className="text-xs font-medium text-[var(--color-success)] flex items-center gap-0.5">
              <TrendingUp size={12} /> {stats.growth}%
            </span>
          </div>
          <div className="text-xs text-[var(--color-muted)] mt-1">Total procedures</div>
        </motion.div>

        <motion.div variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }}
          className="bg-[var(--color-surface)] border border-[var(--color-line)] rounded-2xl p-5 hover:shadow-lg hover:border-[var(--color-success)]/20 transition-all">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-[#D1FAE5] flex items-center justify-center" style={{ color: '#10B981' }}>
              <Server size={20} />
            </div>
            <div>
              <div className="text-xs font-semibold text-[var(--color-muted)]">Most Used Machine</div>
              <div className="text-sm font-bold text-[var(--color-ink)]">{topMachine?.name || 'N/A'}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold text-[var(--color-ink)]">{topMachine?.count || 0}</span>
            <span className="text-xs font-medium text-[var(--color-success)] flex items-center gap-0.5">
              <TrendingUp size={12} /> {stats.growth}%
            </span>
          </div>
          <div className="text-xs text-[var(--color-muted)] mt-1">Total sessions</div>
        </motion.div>

        <motion.div variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }}
          className="bg-[var(--color-surface)] border border-[var(--color-line)] rounded-2xl p-5 hover:shadow-lg hover:border-[var(--color-warning)]/20 transition-all">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-[#FEF3C7] flex items-center justify-center" style={{ color: '#F59E0B' }}>
              <Box size={20} />
            </div>
            <div>
              <div className="text-xs font-semibold text-[var(--color-muted)]">Inventory Health</div>
              <div className="text-sm font-bold text-[var(--color-ink)]">Consumables</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold text-[var(--color-ink)]">{billableTop.length}</span>
            <span className="text-xs font-medium text-[var(--color-muted)]">active items</span>
          </div>
          <div className="mt-2 w-full bg-[var(--color-line-2)] rounded-full h-2 overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${Math.min(billableTop.length * 10, 100)}%`, background: 'linear-gradient(90deg, #10B981, #6D5EF5)' }} />
          </div>
        </motion.div>

        <motion.div variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }}
          className="bg-[var(--color-surface)] border border-[var(--color-line)] rounded-2xl p-5 hover:shadow-lg hover:border-[var(--color-info)]/20 transition-all">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-[#DBEAFE] flex items-center justify-center" style={{ color: '#3B82F6' }}>
              <Building2 size={20} />
            </div>
            <div>
              <div className="text-xs font-semibold text-[var(--color-muted)]">Top Branch</div>
              <div className="text-sm font-bold text-[var(--color-ink)]">{branchTop?.name || 'N/A'}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold text-[var(--color-ink)]">{branchTop?.bills || 0}</span>
            <span className="text-xs font-medium text-[var(--color-muted)]">bills</span>
          </div>
          <div className="text-xs text-[var(--color-muted)] mt-1">Revenue: ₹{branchTop?.revenue?.toFixed(0) || 0}</div>
        </motion.div>
      </motion.div>
    </motion.div>
  );
};

export default Overview;