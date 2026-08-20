import { useState, useEffect, useCallback } from 'react';
import { getBillTimeline } from '../services/auditApi';

const ACTIVITY_COLORS = {
  created: '#10B981', // green
  edited: '#F59E0B', // yellow
  service_added: '#3B82F6', // blue
  service_removed: '#EF4444', // red
  consumables_completed: '#8B5CF6', // purple
  consumables_updated: '#EC4899', // pink
  status_changed: '#F9731F', // orange
  deleted: '#EF4444', // red
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

const getActivityLabel = (type) => {
  const labels = {
    created: 'Created',
    edited: 'Edited',
    service_added: 'Service Added',
    service_removed: 'Service Removed',
    consumables_completed: 'Consumables Completed',
    consumables_updated: 'Consumables Updated',
    status_changed: 'Status Changed',
    deleted: 'Deleted',
  };
  return labels[type] || type;
};

export default function AuditTimelineModal({ isOpen, onClose, recordId, tableName = 'billing_log' }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all'); // default: All Activity
  const [dateRange, setDateRange] = useState({ start: '', end: '' }); // default: all-time

  const fetchAuditData = useCallback(async () => {
    if (!recordId) return;
    setLoading(true);
    setError('');
    try {
      // Single, authoritative per-bill lifecycle. getBillTimeline merges the
      // genuine per-bill audit rows (bill_history + audit_logs) and applies a
      // safe fallback for historical bills that have no audit rows:
      //   Created  -> billing_log.created_at  (never updated_at / completed_at)
      //   Completed -> billing_log.updated_at  (completion never overrides creation)
      const timeline = await getBillTimeline(recordId);
      setEntries(timeline);
    } catch (e) {
      console.error('Error fetching audit data:', e);
      setError('Failed to load audit history');
    } finally {
      setLoading(false);
    }
  }, [recordId]);

  useEffect(() => {
    if (isOpen && recordId) {
      fetchAuditData();
    }
  }, [isOpen, recordId, fetchAuditData]);

  // Reset filters when a new record is opened (defaults to All Activity / all-time)
  useEffect(() => {
    if (isOpen) {
      setFilter('all');
      setDateRange({ start: '', end: '' });
    }
  }, [isOpen, recordId]);

  // Client-side filtering (All Activity + blank dates = show everything)
  const normalizedFilter = (s) => (s || '').toLowerCase().replace(/[\s-]+/g, '_');

  const filteredEntries = entries.filter((entry) => {
    if (filter !== 'all') {
      const f = normalizedFilter(filter);
      const typeMatch = normalizedFilter(entry.type) === f;
      const rawMatch = normalizedFilter(entry.rawType) === f;
      if (!typeMatch && !rawMatch) return false;
    }
    if (dateRange.start && new Date(entry.createdAt) < new Date(dateRange.start)) return false;
    if (dateRange.end) {
      const end = new Date(dateRange.end + 'T23:59:59');
      if (new Date(entry.createdAt) > end) return false;
    }
    return true;
  });

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return {
      date: date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
      time: date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: true }),
    };
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
              onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
              style={{ padding: '6px 12px', border: '1px solid var(--color-line)', borderRadius: '6px', fontSize: 13 }}
            />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-muted)', marginRight: 6 }}>To:</label>
            <input
              type="date"
              value={dateRange.end}
              onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
              style={{ padding: '6px 12px', border: '1px solid var(--color-line)', borderRadius: '6px', fontSize: 13 }}
            />
          </div>
        </div>

        <div className="modal-body" style={{ overflowY: 'auto', maxHeight: 'calc(90vh - 200px)' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--color-muted)' }}>
              <div className="spinner-border" role="status" style={{ width: 28, height: 28, margin: '0 auto 12px', border: '3px solid var(--color-line)', borderTopColor: 'var(--color-primary)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
              <div>Loading audit trail...</div>
            </div>
          ) : error ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#DC2626' }}>{error}</div>
          ) : filteredEntries.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--color-muted)' }}>
              {entries.length === 0 ? 'No audit history found' : 'No activity matches the current filters'}
            </div>
          ) : (
            <div style={{ position: 'relative', paddingLeft: '40px' }}>
              {/* Timeline line */}
              <div style={{ position: 'absolute', left: '15px', top: '20px', bottom: '20px', width: '2px', background: 'var(--color-line-2)' }}></div>

              {filteredEntries.map((entry) => {
                const { date, time } = formatDate(entry.createdAt);
                const color = ACTIVITY_COLORS[entry.rawType] || ACTIVITY_COLORS[entry.type] || '#6B7280';
                const icon = ACTIVITY_ICONS[entry.rawType] || ACTIVITY_ICONS[entry.type] || '•';

                return (
                  <div key={entry.id} style={{ position: 'relative', marginBottom: '24px' }}>
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
                      zIndex: 1,
                    }}>
                      {icon}
                    </div>

                    <div style={{
                      background: 'var(--color-tint-2)',
                      padding: '14px 18px',
                      borderRadius: '8px',
                      borderLeft: `3px solid ${color}`,
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-ink)' }}>
                          {getActivityLabel(entry.type) || entry.type}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--color-muted)', whiteSpace: 'nowrap' }}>
                          {date} {time}
                          {entry.source === 'fallback' && (
                            <span style={{ marginLeft: 6, fontStyle: 'italic', opacity: 0.7 }}>(from record)</span>
                          )}
                        </div>
                      </div>

                      <div style={{ fontSize: 13, color: 'var(--color-muted)', marginBottom: '6px' }}>
                        {entry.description}
                      </div>

                      {entry.oldValue && entry.newValue && (
                        <div style={{ fontSize: 13, marginBottom: '6px', background: 'var(--color-surface)', borderRadius: 6, padding: '8px 10px' }}>
                          <div style={{ color: '#EF4444', textDecoration: 'line-through', marginBottom: '2px', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                            {entry.oldValue}
                          </div>
                          <div style={{ color: '#10B981', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                            {entry.newValue}
                          </div>
                        </div>
                      )}

                      <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--color-muted)' }}>
                        {entry.userName && (
                          <div>
                            <span style={{ fontWeight: 600 }}>By:</span> {entry.userName}
                          </div>
                        )}
                        {entry.branchName && (
                          <div>
                            <span style={{ fontWeight: 600 }}>Branch:</span> {entry.branchName}
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
