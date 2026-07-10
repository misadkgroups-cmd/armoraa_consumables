import { useState, useEffect } from 'react';
import { supabase } from '../config/supabase';
import { useBranch } from '../context/BranchContext';

const Overview = () => {
  const { branchId } = useBranch();
  const [stats, setStats] = useState({
    totalMasterConsumables: 0,
    activeServices: 0,
    trackedMachinery: 0,
    billsEntered: 0,
    bulkOpenThisWeek: 0,
    bulkCompletedThisWeek: 0,
  });
  const [recentActivity, setRecentActivity] = useState([]);
  const [topConsumables, setTopConsumables] = useState([]);
  const [patientRecords, setPatientRecords] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (branchId) {
      fetchOverviewData();
    }
  }, [branchId]);

  const fetchOverviewData = async () => {
    setLoading(true);
    try {
      const [consumablesRes, servicesRes, machineryRes] = await Promise.all([
        supabase.from('master_consumables').select('*', { count: 'exact' }).eq('branch_id', branchId),
        supabase.from('master_services').select('*', { count: 'exact' }),
        supabase.from('master_machinery').select('*', { count: 'exact' }),
      ]);

      let totalBills = 0;
      
      // Try to fetch patient_records if table exists
      let recordsRes = { data: [] };
      try {
        const result = await supabase.from('patient_records').select('*').eq('branch_id', branchId).order('created_at', { ascending: false }).limit(10);
        if (!result.error) {
          recordsRes = result;
          totalBills = result.data?.length || 0;
        }
      } catch (e) {
        console.log('patient_records table not found');
      }

      // Calculate week boundaries
      const now = new Date();
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - now.getDay());
      weekStart.setHours(0, 0, 0, 0);

      setStats({
        totalMasterConsumables: consumablesRes.count || 0,
        activeServices: servicesRes.count || 0,
        trackedMachinery: machineryRes.count || 0,
        billsEntered: totalBills,
        bulkOpenThisWeek: 0,
        bulkCompletedThisWeek: 0,
      });

      if (recordsRes.data && recordsRes.data.length > 0) {
        setRecentActivity(recordsRes.data.slice(0, 10));
        
        // Build consumable usage map
        const usageMap = {};
        recordsRes.data.forEach(record => {
          const jsonb = record.consumables_jsonb || {};
          Object.entries(jsonb).forEach(([key, value]) => {
            if (value) {
              usageMap[key] = (usageMap[key] || 0) + 1;
            }
          });
        });

        const sortedUsage = Object.entries(usageMap)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 7);
        
        setTopConsumables(sortedUsage.map(([name, count]) => ({ name, count })));
      } else {
        setRecentActivity([]);
        setTopConsumables([]);
      }
    } catch (error) {
      console.error('Error fetching overview data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getActivityText = (record) => {
    const service = record.master_services?.service_name || 'Unknown Service';
    const time = new Date(record.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    return `${service} - ${time}`;
  };

  const getActivityBadge = (record) => {
    const jsonb = record.consumables_jsonb || {};
    const usedCount = Object.values(jsonb).filter(v => v).length;
    if (usedCount > 0) return { text: `${usedCount} items`, color: 'bg-sky-100 text-sky-700' };
    return { text: 'View', color: 'bg-slate-100 text-slate-600' };
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-slate-500">Loading dashboard...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Top Metric Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-5 py-4">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">Bills Entered</div>
          <div className="text-3xl font-bold text-slate-900">{stats.billsEntered}</div>
          <div className="text-xs text-slate-500 mt-1">Total records</div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-5 py-4">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">Non-Billable Opened (This Week)</div>
          <div className="text-3xl font-bold text-sky-600">{stats.bulkOpenThisWeek}</div>
          <div className="text-xs text-slate-500 mt-1">Active bulk items</div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-5 py-4">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">Completed (This Week)</div>
          <div className="text-3xl font-bold text-emerald-600">{stats.bulkCompletedThisWeek}</div>
          <div className="text-xs text-slate-500 mt-1">Marked as done</div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-5 py-4">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">Master Consumables</div>
          <div className="text-3xl font-bold text-slate-900">{stats.totalMasterConsumables}</div>
          <div className="text-xs text-slate-500 mt-1">Configured items</div>
        </div>
      </div>

      {/* Split Chart Metric Groups */}
      <div className="grid grid-cols-12 gap-6">
        {/* Left Panel */}
        <div className="col-span-7 space-y-6">
          {/* Recent Activity */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 hover:shadow-md transition-shadow duration-300">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">Recent Activity</h3>
            <div className="space-y-2">
              {recentActivity.map((record, index) => {
                const badge = getActivityBadge(record);
                return (
                  <div key={index} className="flex items-center justify-between p-3 rounded-lg hover:bg-slate-50 transition-all border border-slate-100">
                    <div className="flex-1">
                      <div className="text-sm font-medium text-slate-900">{getActivityText(record)}</div>
                      <div className="text-xs text-slate-500 mt-0.5">Bill ID: {record.bill_id}</div>
                    </div>
                    <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-full ${badge.color}`}>
                      {badge.text}
                    </span>
                  </div>
                );
              })}
              {recentActivity.length === 0 && (
                <div className="text-center py-8 text-slate-500 text-sm">No recent activity</div>
              )}
            </div>
          </div>
        </div>

        {/* Right Panel */}
        <div className="col-span-5 space-y-6">
          {/* Consumables Used - Units Only (No Cost) */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 hover:shadow-md transition-shadow duration-300">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">Consumables Used (Units)</h3>
            <div className="space-y-3">
              {topConsumables.map((item, index) => {
                const maxCount = topConsumables[0]?.count || 1;
                const percentage = (item.count / maxCount) * 100;
                return (
                  <div key={item.name}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="text-xs font-medium text-slate-700">{item.name}</div>
                      <div className="text-xs font-semibold text-slate-900">{item.count} units</div>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-purple-500 rounded-full transition-all"
                        style={{ width: `${percentage}%` }}
                      ></div>
                    </div>
                  </div>
                );
              })}
              {topConsumables.length === 0 && (
                <div className="text-center py-8 text-slate-500 text-sm">No usage data available</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Overview;