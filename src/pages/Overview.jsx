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

      // Fetch billable reports
      let query = supabase
        .from('billable_report')
        .select('*')
        .gte('report_date', start)
        .lte('report_date', end);

      if (branchId) query = query.eq('branch_id', branchId);

      const { data: bills } = await query;
      const billsArray = bills || [];

      // Calculate counts
      const lastWeekStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const thisMonthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];

      const lastWeekCount = billsArray.filter(b => b.report_date >= lastWeekStart).length;
      const thisMonthCount = billsArray.filter(b => b.report_date >= thisMonthStart).length;
      const overallCount = billsArray.length;

      // Get consumable names and costs
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

      // Calculate total cost
      let totalCost = 0;
      billsArray.forEach(bill => {
        for (let i = 1; i <= 14; i++) {
          const cId = bill[`consumable_${i}_id`];
          const units = bill[`consumable_${i}_units`];
          const batchId = bill[`consumable_${i}_batch_id`];
          if (cId && units && !batchId) {
            const itemData = consumableMap[cId] || { name: '-', cost: 0 };
            totalCost += Number(units) * Number(itemData.cost);
          }
        }
      });

      setStats({
        lastWeek: lastWeekCount,
        thisMonth: thisMonthCount,
        overall: overallCount,
        totalCost,
      });

      // Fetch service-wise data (sorted low to high)
      const { data: services } = await supabase
        .from('master_services')
        .select('id, service_name');

      const serviceCounts = {};
      if (services) {
        services.forEach(s => {
          serviceCounts[s.id] = { name: s.service_name, count: 0 };
        });
      }

      if (branchId) {
        billsArray.forEach(bill => {
          if (bill.service_id && serviceCounts[bill.service_id]) {
            serviceCounts[bill.service_id].count++;
          }
        });
      }

      const sortedServices = Object.values(serviceCounts)
        .sort((a, b) => a.count - b.count)
        .filter(s => s.count > 0);

      setServiceData(sortedServices);

      // Fetch billable consumables usage
      const consumableCounts = {};
      billsArray.forEach(row => {
        for (let i = 1; i <= 14; i++) {
          const cId = row[`consumable_${i}_id`];
          const units = row[`consumable_${i}_units`];
          const batchId = row[`consumable_${i}_batch_id`];
          
          if (cId && units && !batchId) {
            const itemData = consumableMap[cId] || { name: 'Unknown', cost: 0 };
            if (!consumableCounts[itemData.name]) {
              consumableCounts[itemData.name] = { name: itemData.name, totalUnits: 0 };
            }
            consumableCounts[itemData.name].totalUnits += Number(units);
          }
        }
      });

      const sortedConsumables = Object.values(consumableCounts)
        .sort((a, b) => b.totalUnits - a.totalUnits)
        .slice(0, 10);

      setBillableConsumables(sortedConsumables);

      // Fetch non-billable usage
      const bulkQuery = supabase
        .from('bulk_consumables_registry')
        .select('*')
        .gte('open_date', start)
        .lte('open_date', end);

      if (branchId) bulkQuery.eq('branch_id', branchId);

      const { data: bulkData } = await bulkQuery;

      const nonBillableCounts = {};
      if (bulkData) {
        bulkData.forEach(bulk => {
          if (!nonBillableCounts[bulk.product_name]) {
            nonBillableCounts[bulk.product_name] = { name: bulk.product_name, count: 0 };
          }
          nonBillableCounts[bulk.product_name].count++;
        });
      }

      const sortedNonBillable = Object.values(nonBillableCounts)
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      setNonBillableConsumables(sortedNonBillable);

    } catch (error) {
      console.error('Error fetching overview data:', error);
    } finally {
      setLoading(false);
    }
  };

  const maxServiceCount = Math.max(...serviceData.map(s => s.count), 1);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-slate-500">Loading dashboard...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Date Filters */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setDateRange('last7')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${dateRange === 'last7' ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>
            Last 7 Days
          </button>
          <button onClick={() => setDateRange('last30')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${dateRange === 'last30' ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>
            Last 30 Days
          </button>
          <button onClick={() => setDateRange('thisMonth')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${dateRange === 'thisMonth' ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>
            This Month
          </button>
          <button onClick={() => setDateRange('custom')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${dateRange === 'custom' ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>
            Custom
          </button>
          {dateRange === 'custom' && (
            <>
              <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="h-9 px-3 border border-slate-300 rounded-lg text-sm" />
              <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="h-9 px-3 border border-slate-300 rounded-lg text-sm" />
            </>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <div className="text-sm font-medium text-slate-500 mb-2">Last Week Bills</div>
          <div className="text-3xl font-bold text-sky-600">{stats.lastWeek}</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <div className="text-sm font-medium text-slate-500 mb-2">This Month Bills</div>
          <div className="text-3xl font-bold text-emerald-600">{stats.thisMonth}</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <div className="text-sm font-medium text-slate-500 mb-2">Overall Bills</div>
          <div className="text-3xl font-bold text-purple-600">{stats.overall}</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <div className="text-sm font-medium text-slate-500 mb-2">Total Cost</div>
          <div className="text-3xl font-bold text-slate-900">₹{stats.totalCost.toFixed(2)}</div>
        </div>
      </div>

      {/* Service-wise Chart */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">Service-wise Bills (Low to High)</h3>
        {serviceData.length === 0 ? (
          <div className="text-center py-8 text-slate-500">No data available</div>
        ) : (
          <div className="space-y-3">
            {serviceData.map((service, idx) => (
              <div key={idx} className="flex items-center gap-3">
                <div className="w-48 text-sm text-slate-700 truncate">{service.name}</div>
                <div className="flex-1 bg-slate-100 rounded-full h-8 overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-sky-400 to-sky-600 h-full rounded-full flex items-center justify-end pr-2 transition-all duration-500"
                    style={{ width: `${(service.count / maxServiceCount) * 100}%` }}
                  >
                    <span className="text-xs font-semibold text-white">{service.count}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Billable Consumables Chart */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">Top Billable Consumables</h3>
          {billableConsumables.length === 0 ? (
            <div className="text-center py-8 text-slate-500">No data available</div>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 sticky top-0">
                  <tr>
                    <th className="text-left px-3 py-2 text-xs font-semibold text-slate-600 uppercase">Consumable</th>
                    <th className="text-right px-3 py-2 text-xs font-semibold text-slate-600 uppercase">Units Used</th>
                  </tr>
                </thead>
                <tbody>
                  {billableConsumables.map((item, idx) => (
                    <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="px-3 py-2.5 text-slate-800">{item.name}</td>
                      <td className="px-3 py-2.5 text-right font-semibold text-slate-900">{item.totalUnits}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Non-Billable Consumables Chart */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">Top Non-Billable Consumables</h3>
          {nonBillableConsumables.length === 0 ? (
            <div className="text-center py-8 text-slate-500">No data available</div>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 sticky top-0">
                  <tr>
                    <th className="text-left px-3 py-2 text-xs font-semibold text-slate-600 uppercase">Product Name</th>
                    <th className="text-right px-3 py-2 text-xs font-semibold text-slate-600 uppercase">Used Count</th>
                  </tr>
                </thead>
                <tbody>
                  {nonBillableConsumables.map((item, idx) => (
                    <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="px-3 py-2.5 text-slate-800">{item.name}</td>
                      <td className="px-3 py-2.5 text-right font-semibold text-slate-900">{item.count}</td>
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