import { useState, useEffect } from 'react';
import { supabase } from '../config/supabase';
import { useBranch } from '../context/BranchContext';

const Overview = () => {
  const { branchId } = useBranch();
  const [dateRange, setDateRange] = useState('last7');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [stats, setStats] = useState({
    lastWeek: 0,
    thisMonth: 0,
    overall: 0,
    totalCost: 0,
  });
  const [serviceData, setServiceData] = useState([]);
  const [billableConsumables, setBillableConsumables] = useState([]);
  const [nonBillableConsumables, setNonBillableConsumables] = useState([]);
  const [loading, setLoading] = useState(true);

  const getDateRange = () => {
    const today = new Date();
    let start = new Date();
    let end = today;

    if (dateRange === 'last7') {
      start = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else if (dateRange === 'last30') {
      start = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
    } else if (dateRange === 'thisMonth') {
      start = new Date(today.getFullYear(), today.getMonth(), 1);
    } else if (dateRange === 'custom' && customStart && customEnd) {
      start = new Date(customStart);
      end = new Date(customEnd);
    }

    return {
      start: start.toISOString().split('T')[0],
      end: end.toISOString().split('T')[0],
    };
  };

  useEffect(() => {
    if (branchId) {
      fetchOverviewData();
    }
  }, [branchId, dateRange, customStart, customEnd]);

  const fetchOverviewData = async () => {
    setLoading(true);
    try {
      const { start, end } = getDateRange();
      let query = supabase
        .from('billable_report')
        .select('*')
        .gte('report_date', start)
        .lte('report_date', end);
      if (branchId) query = query.eq('branch_id', branchId);
      const { data: bills } = await query;
      const billsArray = bills || [];

      const lastWeekStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const thisMonthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
      const lastWeekCount = billsArray.filter(b => b.report_date >= lastWeekStart).length;
      const thisMonthCount = billsArray.filter(b => b.report_date >= thisMonthStart).length;
      const overallCount = billsArray.length;

      const consumableIds = new Set();
      billsArray.forEach(row => {
        for (let i = 1; i <= 14; i++) {
          if (row[`consumable_${i}_id`]) consumableIds.add(row[`consumable_${i}_id`]);
        }
      });

      let consumableMap = {};
      if (consumableIds.size > 0) {
        const { data: consumables } = await supabase
          .from('master_consumables')
          .select('id, consumable_name, cost_unit')
          .in('id', Array.from(consumableIds));
        if (consumables) {
          consumables.forEach(c => {
            consumableMap[c.id] = { name: c.consumable_name, cost: c.cost_unit || 0 };
          });
        }
      }

      let totalCost = 0;
      let totalUnits = 0;
      billsArray.forEach(bill => {
        for (let i = 1; i <= 14; i++) {
          const cId = bill[`consumable_${i}_id`];
          const units = bill[`consumable_${i}_units`];
          const batchId = bill[`consumable_${i}_batch_id`];
          if (cId && units && !batchId) {
            const itemData = consumableMap[cId] || { name: '-', cost: 0 };
            totalCost += Number(units) * Number(itemData.cost);
            totalUnits += Number(units);
          }
        }
      });

      setStats({
        lastWeek: lastWeekCount,
        thisMonth: thisMonthCount,
        overall: overallCount,
        totalCost,
        totalUnits,
      });

      // Service data
      const { data: services } = await supabase.from('master_services').select('id, service_name');
      const serviceCounts = {};
      if (services) {
        services.forEach(s => { serviceCounts[s.id] = { name: s.service_name, count: 0 }; });
      }
      billsArray.forEach(bill => {
        if (bill.service_id && serviceCounts[bill.service_id]) {
          serviceCounts[bill.service_id].count++;
        }
      });
      setServiceData(Object.values(serviceCounts).sort((a, b) => a.count - b.count).filter(s => s.count > 0));

      // Billable consumables usage
      const consumableCounts = {};
      billsArray.forEach(row => {
        for (let i = 1; i <= 14; i++) {
          const cId = row[`consumable_${i}_id`];
          const units = row[`consumable_${i}_units`];
          const batchId = row[`consumable_${i}_batch_id`];
          if (cId && units && !batchId) {
            const itemData = consumableMap[cId] || { name: 'Unknown', cost: 0 };
            if (!consumableCounts[itemData.name]) consumableCounts[itemData.name] = { name: itemData.name, totalUnits: 0 };
            consumableCounts[itemData.name].totalUnits += Number(units);
          }
        }
      });
      setBillableConsumables(Object.values(consumableCounts).sort((a, b) => b.totalUnits - a.totalUnits).slice(0, 10));

      // Non-billable
      const bulkQuery = supabase.from('bulk_consumables_registry').select('*').gte('open_date', start).lte('open_date', end);
      if (branchId) bulkQuery.eq('branch_id', branchId);
      const { data: bulkData } = await bulkQuery;
      const nonBillableCounts = {};
      if (bulkData) {
        bulkData.forEach(bulk => {
          if (!nonBillableCounts[bulk.product_name]) nonBillableCounts[bulk.product_name] = { name: bulk.product_name, count: 0 };
          nonBillableCounts[bulk.product_name].count++;
        });
      }
      setNonBillableConsumables(Object.values(nonBillableCounts).sort((a, b) => b.count - a.count).slice(0, 10));
    } catch (error) { console.error('Error fetching overview:', error); }
    finally { setLoading(false); }
  };

  const maxServiceCount = Math.max(...serviceData.map(s => s.count), 1);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="loading-spinner"></div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      {/* Page Header */}
      <div className="page-header">
        <div className="page-header-left">
          <h1>Dashboard Overview</h1>
          <p>Real-time analytics for {dateRange === 'last7' ? 'last 7 days' : dateRange === 'last30' ? 'last 30 days' : dateRange === 'thisMonth' ? 'this month' : 'custom range'}</p>
        </div>
        <div className="filter-chips">
          <span className={`filter-chip ${dateRange === 'last7' ? 'active' : ''}`} onClick={() => setDateRange('last7')}>Last 7 Days</span>
          <span className={`filter-chip ${dateRange === 'last30' ? 'active' : ''}`} onClick={() => setDateRange('last30')}>Last 30 Days</span>
          <span className={`filter-chip ${dateRange === 'thisMonth' ? 'active' : ''}`} onClick={() => setDateRange('thisMonth')}>This Month</span>
          <span className={`filter-chip ${dateRange === 'custom' ? 'active' : ''}`} onClick={() => setDateRange('custom')}>Custom</span>
          {dateRange === 'custom' && (
            <>
              <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="form-input" style={{ width: 140, height: 32, fontSize: 12 }} />
              <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="form-input" style={{ width: 140, height: 32, fontSize: 12 }} />
            </>
          )}
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-card-header">
            <span className="stat-card-label">This Week</span>
            <div className="stat-card-icon primary">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            </div>
          </div>
          <div className="stat-card-value">{stats.lastWeek}</div>
          <div className="stat-card-change up">
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-3 h-3"><polyline points="18 15 12 9 6 15"/></svg>
            Bills this week
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-card-header">
            <span className="stat-card-label">This Month</span>
            <div className="stat-card-icon success">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
            </div>
          </div>
          <div className="stat-card-value">{stats.thisMonth}</div>
          <div className="stat-card-change up">
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-3 h-3"><polyline points="18 15 12 9 6 15"/></svg>
            Bills this month
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-card-header">
            <span className="stat-card-label">Total Bills</span>
            <div className="stat-card-icon info">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
            </div>
          </div>
          <div className="stat-card-value">{stats.overall}</div>
          <div className="stat-card-change">
            Total records in selected period
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-card-header">
            <span className="stat-card-label">Revenue</span>
            <div className="stat-card-icon warning">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>
            </div>
          </div>
          <div className="stat-card-value">₹{stats.totalCost.toFixed(2)}</div>
          <div className="stat-card-change up">
            Total cost from consumables
          </div>
        </div>
      </div>

      {/* Service-wise Chart */}
      <div className="section-card">
        <div className="section-card-header">
          <div>
            <div className="section-title">Service-wise Bills</div>
            <div className="section-subtitle">Distribution by service, sorted low to high</div>
          </div>
        </div>
        {serviceData.length === 0 ? (
          <div className="empty-state">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>
            <h3>No service data</h3>
            <p>No billable records found for the selected period</p>
          </div>
        ) : (
          <div>
            {serviceData.map((service, idx) => (
              <div key={idx} className="service-bar">
                <div className="service-bar-label">{service.name}</div>
                <div className="service-bar-track">
                  <div className="service-bar-fill" style={{ width: `${(service.count / maxServiceCount) * 100}%` }}>
                    <span>{service.count}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Consumables Charts */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        <div className="section-card">
          <div className="section-card-header">
            <div>
              <div className="section-title">Top Billable Consumables</div>
              <div className="section-subtitle">Most used consumables by unit count</div>
            </div>
          </div>
          {billableConsumables.length === 0 ? (
            <div className="empty-state">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>
              <h3>No data available</h3>
              <p>No consumable usage recorded for this period</p>
            </div>
          ) : (
            <div style={{ maxHeight: 360, overflow: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>Consumable</th>
                    <th style={{ textAlign: 'right' }}>Units</th>
                  </tr>
                </thead>
                <tbody>
                  {billableConsumables.map((item, idx) => (
                    <tr key={idx}>
                      <td>{item.name}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--color-primary)' }}>{item.totalUnits}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="section-card">
          <div className="section-card-header">
            <div>
              <div className="section-title">Top Non-Billable Consumables</div>
              <div className="section-subtitle">Most used products by batch count</div>
            </div>
          </div>
          {nonBillableConsumables.length === 0 ? (
            <div className="empty-state">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>
              <h3>No data available</h3>
              <p>No non-billable items used for this period</p>
            </div>
          ) : (
            <div style={{ maxHeight: 360, overflow: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>Product Name</th>
                    <th style={{ textAlign: 'right' }}>Count</th>
                  </tr>
                </thead>
                <tbody>
                  {nonBillableConsumables.map((item, idx) => (
                    <tr key={idx}>
                      <td>{item.name}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--color-success)' }}>{item.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Overview;