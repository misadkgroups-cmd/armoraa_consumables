import { useState, useEffect } from 'react';
import { supabase } from '../config/supabase';

const ACTIVITY_COLORS = {
  created: '#10B981',      // green
  edited: '#F59E0B',       // yellow
  service_added: '#3B82F6', // blue
  service_removed: '#EF4444', // red
  consumables_completed: '#8B5CF6', // purple
  consumables_updated: '#EC4899', // pink
  status_changed: '#F97316', // orange
  deleted: '#EF4444',      // red
};

const ACTIVITY_ICONS = {
  created: '✓',
  edited: '✎',
  service_added: '+',
  service_removed: '−',
  consumables_completed: '✓',
  consumables_updated: '✎',
  status_changed: '↻',
  deleted: '🗑',
};

export default function AuditTimelineModal({ isOpen, onClose, recordId, tableName = 'billing_log' }) {
  const [auditLogs, setAuditLogs] = useState([]);
  const [activityLogs, setActivityLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [dateRange, setDateRange] = useState({ start: '', end: '' });

  useEffect(() => {
    if (isOpen && recordId) {
      fetchAuditData();
    }
  }, [isOpen, recordId, filter, dateRange]);

  const fetchAuditData = async () => {
    setLoading(true);
    try {
      // Fetch audit logs
      let auditQuery = supabase
        .from('audit_logs')
        .select('*')
        .eq('table_name', tableName)
        .eq('record_id', recordId)
        .order('created_at', { ascending: false });

      // Fetch activity logs
      let activityQuery = supabase
        .from('activity_logs')
        .select('*')
        .eq('module_name', tableName)
        .eq('record_id', recordId)
        .order('created_at', { ascending: false });

      // Apply date filter
      if (dateRange.start) {
        auditQuery = auditQuery.gte('created_at', dateRange.start);
        activityQuery = activityQuery.gte('created_at', dateRange.start);
      }
      if (dateRange.end) {
        auditQuery = auditQuery.lte('created_at', dateRange.end + 'T23:59:59');
        activityQuery = activityQuery.lte('created_at', dateRange.end + 'T23:59:59');
      }

      // Apply activity type filter
      if (filter !== 'all') {
        if (filter === 'created' || filter === 'deleted') {
          auditQuery = auditQuery.eq('action_type', filter);
        } else {
          activityQuery = activityQuery.eq('activity_type', filter);
        }
      }

      const [auditResult, activityResult] = await Promise.all([
        auditQuery,
        activityQuery
      ]);

      if (auditResult.error) throw auditResult.error;
      if (activityResult.error) throw activityResult.error;

      setAuditLogs(auditResult.data || []);
      setActivityLogs(activityResult.data || []);
    } catch (error) {
      console.error('Error fetching audit data:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return {
      date: date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
      time: date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: true })
    };
  };

  const getActivityLabel = (type) => {
    const labels = {
      created: 'Created',
      edited: 'Edited',
      service_added: 'Service Added',
      service_removed: 'Service Removed',
      consumables_completed: 'Consumables Completed',
      consumables_updated: 'Consumables Updated',
      status_changed: 'Status Changed',
      deleted: 'Deleted'
    };
    return labels[type] || type;
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '800px', width: '95%', maxHeight: '90vh', overflow: 'hidden' }}>
        <div className="modal-header">
          <h3>Audit Trail & Activity History</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--color-muted)' }}>×</button>
        </div>
        
        {/* Filters */}
        <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--color-line-2)', display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-muted)', marginRight: 6 }}>Filter:</label>
            <select 
              value={filter} 
              onChange={(e) => setFilter(e.target.value)}
              style={{ padding: '6px 12px', border: '1px solid var(--color-line)', borderRadius: '6px', fontSize: 13 }}
            >
              <option value="all">All Activity</option>
              <option value="created">Created</option>
              <option value="edited">Edited</option>
              <option value="service_added">Service Added</option>
              <option value="service_removed">Service Removed</option>
              <option value="consumables_completed">Consumables Completed</option>
              <option value="consumables_updated">Consumables Updated</option>
              <option value="status_changed">Status Changed</option>
            </select>
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-muted)', marginRight: 6 }}>From:</label>
            <input 
              type="date" 
              value={dateRange.start}
              onChange={(e) => setDateRange({...dateRange, start: e.target.value})}
              style={{ padding: '6px 12px', border: '1px solid var(--color-line)', borderRadius: '6px', fontSize: 13 }}
            />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-muted)', marginRight: 6 }}>To:</label>
            <input 
              type="date" 
              value={dateRange.end}
              onChange={(e) => setDateRange({...dateRange, end: e.target.value})}
              style={{ padding: '6px 12px', border: '1px solid var(--color-line)', borderRadius: '6px', fontSize: 13 }}
            />
          </div>
        </div>

        <div className="modal-body" style={{ overflowY: 'auto', maxHeight: 'calc(90vh - 200px)' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--color-muted)' }}>Loading audit trail...</div>
          ) : auditLogs.length === 0 && activityLogs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--color-muted)' }}>No audit history found</div>
          ) : (
            <div style={{ position: 'relative', paddingLeft: '40px' }}>
              {/* Timeline line */}
              <div style={{ position: 'absolute', left: '15px', top: '20px', bottom: '20px', width: '2px', background: 'var(--color-line-2)' }}></div>
              
              {/* Activity Logs */}
              {activityLogs.map((log, index) => {
                const { date, time } = formatDate(log.created_at);
                const color = ACTIVITY_COLORS[log.activity_type] || '#6B7280';
                const icon = ACTIVITY_ICONS[log.activity_type] || '•';
                
                return (
                  <div key={log.id} style={{ position: 'relative', marginBottom: '24px' }}>
                    {/* Timeline dot */}
                    <div style={{ 
                      position: 'absolute', 
                      left: '-30px', 
                      top: '8px',
                      width: '20px',
                      height: '20px',
                      borderRadius: '50%',
                      background: color,
                      color: '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '11px',
                      fontWeight: 700,
                      zIndex: 1
                    }}>
                      {icon}
                    </div>
                    
                    <div style={{ 
                      background: 'var(--color-tint-2)', 
                      padding: '14px 18px', 
                      borderRadius: '8px',
                      borderLeft: `3px solid ${color}`
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-ink)' }}>
                          {getActivityLabel(log.activity_type)}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--color-muted)', whiteSpace: 'nowrap' }}>
                          {date} {time}
                        </div>
                      </div>
                      
                      <div style={{ fontSize: 13, color: 'var(--color-muted)', marginBottom: '6px' }}>
                        {log.activity_description}
                      </div>
                      
                      <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--color-muted)' }}>
                        {log.user_name && (
                          <div>
                            <span style={{ fontWeight: 600 }}>By:</span> {log.user_name}
                            {log.user_role && <span style={{ marginLeft: '6px', fontSize: 11, background: 'var(--color-line)', padding: '2px 8px', borderRadius: '4px' }}>{log.user_role}</span>}
                          </div>
                        )}
                        {log.branch_id && (
                          <div>
                            <span style={{ fontWeight: 600 }}>Branch:</span> {log.branch_id}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Audit Logs */}
              {auditLogs.map((log, index) => {
                const { date, time } = formatDate(log.created_at);
                const color = log.action_type === 'created' ? ACTIVITY_COLORS.created : 
                             log.action_type === 'deleted' ? ACTIVITY_COLORS.deleted : 
                             ACTIVITY_COLORS.edited;
                const icon = ACTIVITY_ICONS[log.action_type] || '•';
                
                return (
                  <div key={log.id} style={{ position: 'relative', marginBottom: '24px' }}>
                    {/* Timeline dot */}
                    <div style={{ 
                      position: 'absolute', 
                      left: '-30px', 
                      top: '8px',
                      width: '20px',
                      height: '20px',
                      borderRadius: '50%',
                      background: color,
                      color: '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '11px',
                      fontWeight: 700,
                      zIndex: 1
                    }}>
                      {icon}
                    </div>
                    
                    <div style={{ 
                      background: 'var(--color-tint-2)', 
                      padding: '14px 18px', 
                      borderRadius: '8px',
                      borderLeft: `3px solid ${color}`
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-ink)' }}>
                          {log.field_name ? `${log.field_name} ${log.action_type === 'created' ? 'Created' : 'Updated'}` : getActivityLabel(log.action_type)}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--color-muted)', whiteSpace: 'nowrap' }}>
                          {date} {time}
                        </div>
                      </div>
                      
                      {log.old_value && log.new_value && (
                        <div style={{ fontSize: 13, marginBottom: '6px' }}>
                          <div style={{ color: '#EF4444', textDecoration: 'line-through', marginBottom: '2px' }}>
                            {log.old_value}
                          </div>
                          <div style={{ color: '#10B981' }}>
                            {log.new_value}
                          </div>
                        </div>
                      )}
                      
                      <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--color-muted)' }}>
                        {log.performed_by_name && (
                          <div>
                            <span style={{ fontWeight: 600 }}>By:</span> {log.performed_by_name}
                            {log.performed_by_role && <span style={{ marginLeft: '6px', fontSize: 11, background: 'var(--color-line)', padding: '2px 8px', borderRadius: '4px' }}>{log.performed_by_role}</span>}
                          </div>
                        )}
                        {log.branch_id && (
                          <div>
                            <span style={{ fontWeight: 600 }}>Branch:</span> {log.branch_id}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        
        <div className="modal-footer">
          <button onClick={onClose} className="btn btn-secondary">Close</button>
        </div>
      </div>
    </div>
  );
}