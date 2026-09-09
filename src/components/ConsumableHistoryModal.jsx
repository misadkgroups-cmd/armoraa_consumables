import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../config/supabase';
import { formatDateTimeDisplay } from '../utils/dateUtils';

/**
 * ConsumableHistoryModal
 *
 * Shows the audit trail for a single service's consumables, plus the overall
 * created / last-updated / updated-by info sourced from billing_log + the
 * latest billable_report row.
 *
 * Props
 *   bill     : the billing_log row (has id, patient_name, bill_no, branch_id)
 *   bs       : the bill_services row (has id, service_id, service_name)
 *   onClose  : close handler
 */
const ConsumableHistoryModal = ({ bill, bs, onClose }) => {
  const [entries, setEntries] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchReady = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const billId = bill?.id;
      const serviceId = bs?.service_id;
      const billServiceId = bs?.id;

      // 1) Audit entries from consumable_history (append-only trail).
      let query = supabase.from('consumable_history').select('*');
      if (billServiceId) {
        query = query.eq('bill_service_id', Number(billServiceId));
      } else {
        query = query.eq('bill_id', Number(billId)).eq('service_id', Number(serviceId));
      }
      const { data: hist, error: histError } = await query.order('created_at', { ascending: true });
      if (!histError) setEntries(hist || []);
      else setError(histError.message || 'Failed to load history');

      // 2) Bill-level metadata (created / updated / branch).
      const metaData = {
        created_at: bill?.created_at || null,
        updated_at: bill?.updated_at || null,
        updated_by: null,
        branch_name: bill?.branch_name || bill?.branch || '-',
        patient_name: bill?.patient_name || '-',
        bill_no: bill?.bill_no || bill?.bill_id || '-',
        service_name: bs?.service_name || '-',
      };

      // 3) Most recent billable_report for this bill + service -> updated_by.
      if (billId && serviceId) {
        const { data: rep } = await supabase
          .from('billable_report')
          .select('updated_by, created_at, updated_at')
          .eq('billing_log_id', Number(billId))
          .eq('service_id', Number(serviceId))
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (rep) {
          metaData.updated_by = rep.updated_by || null;
          metaData.created_at = rep.created_at || metaData.created_at;
          metaData.updated_at = rep.updated_at || metaData.updated_at;
        }
      }

      // 4) Branch name if not already present.
      if (bill?.branch_id && metaData.branch_name === '-') {
        const { data: br } = await supabase
          .from('branches')
          .select('branch_name')
          .eq('id', Number(bill.branch_id))
          .maybeSingle();
        if (br) metaData.branch_name = br.branch_name;
      }

      setMeta(metaData);
    } catch (e) {
      console.error('Failed to build consumable history:', e);
      setError('Failed to load consumable history');
    } finally {
      setLoading(false);
    }
  }, [bill, bs]);

  useEffect(() => {
    fetchReady();
  }, [fetchReady]);

  const formatUnits = (u) => (u == null ? '-' : u);
  const InfoCell = ({ label, value }) => (
    <div>
      <div style={{ fontSize: 11, color: 'var(--color-muted)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontWeight: 600, marginTop: 2, color: 'var(--color-ink)' }}>{value || '-'}</div>
    </div>
  );

  const actionBadge = (action) => {
    const style = {
      Added: { bg: '#D1FAE5', color: '#065F46', border: '#A7F3D0' },
      Updated: { bg: '#FEF3C7', color: '#92400E', border: '#FDE68A' },
      Deleted: { bg: '#FEE2E2', color: '#991B1B', border: '#FECACA' },
    }[action] || { bg: '#F1F5F9', color: '#334155', border: '#E2E8F0' };

    return (
      <span
        style={{
          display: 'inline-block',
          padding: '2px 8px',
          borderRadius: '12px',
          fontSize: 11,
          fontWeight: 600,
          background: style.bg,
          color: style.color,
          border: `1px solid ${style.border}`,
        }}
      >
        {action}
      </span>
    );
  };

  return (
<div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '860px', width: '94%' }}
      >
        <div className="modal-header">
          <h3>Consumable Entry History</h3>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--color-muted)' }}
          >
            ×
          </button>
        </div>
        <div className="modal-body" style={{ paddingBottom: 12 }}>
          {/* Bill / Patient / Service + created/updated header */}
          {meta && (
            <div style={{ background: 'var(--color-tint-2)', padding: 16, borderRadius: 8, marginBottom: 14 }}>
              <div className="grid grid-cols-4 gap-3" style={{ marginBottom: 12 }}>
                <InfoCell label="Bill No" value={meta.bill_no} />
                <InfoCell label="Patient" value={meta.patient_name} />
                <InfoCell label="Service" value={meta.service_name} />
                <InfoCell label="Branch" value={meta.branch_name} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <InfoCell label="Created On" value={formatDateTimeDisplay(meta.created_at)} />
                <InfoCell label="Last Updated" value={formatDateTimeDisplay(meta.updated_at)} />
                <InfoCell label="Updated By" value={meta.updated_by || '-'} />
              </div>
            </div>
          )}

          {loading ? (
            <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--color-muted)', fontSize: 14 }}>
              Loading history…
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Date & Time', 'Consumable', 'Units', 'Batch', 'Action', 'Entered By'].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: '8px 10px',
                        textAlign: 'left',
                        fontSize: 11,
                        fontWeight: 600,
                        color: 'var(--color-muted)',
                        textTransform: 'uppercase',
                        borderBottom: '1px solid var(--color-line)',
                        background: 'var(--color-tint-2)',
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {entries.length === 0 ? (
                  <tr>
                    <td colSpan="6" style={{ padding: '24px', textAlign: 'center', color: 'var(--color-muted)', fontSize: 13 }}>
                      No consumable history recorded for this service yet.
                    </td>
                  </tr>
                ) : (
                  entries.map((e) => (
                    <tr key={e.id}>
                      <td style={{ padding: '10px', borderBottom: '1px solid var(--color-line-2)', fontSize: 12.5, whiteSpace: 'nowrap' }}>
                        {formatDateTimeDisplay(e.created_at)}
                      </td>
                      <td style={{ padding: '10px', borderBottom: '1px solid var(--color-line-2)', fontSize: 13, fontWeight: 500 }}>
                        {e.consumable_name}
                        {e.old_units != null && e.action_type === 'Updated' && (
                          <span style={{ color: 'var(--color-muted)', fontWeight: 400, marginLeft: 6 }}>
                            ({formatUnits(e.old_units)} → {formatUnits(e.units)})
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '10px', borderBottom: '1px solid var(--color-line-2)', fontSize: 12.5, textAlign: 'center' }}>
                        {formatUnits(e.units)}
                      </td>
                      <td style={{ padding: '10px', borderBottom: '1px solid var(--color-line-2)', fontSize: 12.5 }}>
                        {e.batch_id || '-'}
                      </td>
                      <td style={{ padding: '10px', borderBottom: '1px solid var(--color-line-2)' }}>
                        {actionBadge(e.action_type)}
                      </td>
                      <td style={{ padding: '10px', borderBottom: '1px solid var(--color-line-2)', fontSize: 12.5 }}>
                        {e.entered_by || '-'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}

          {error && (
            <div style={{ marginTop: 12, padding: 10, borderRadius: 6, background: '#FEE2E2', color: '#991B1B', fontSize: 13 }}>
              {error}
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button onClick={onClose} className="btn btn-secondary">Close</button>
        </div>
      </div>
    </div>
  );
};

export default ConsumableHistoryModal;