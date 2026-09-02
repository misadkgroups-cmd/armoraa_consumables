import { useState, useMemo, useCallback, Fragment } from 'react';
import { formatDateDisplay } from '../utils/dateUtils';
import BillableConsumables from '../pages/BillableConsumables';

const BillDetailsModal = ({ bill, billServices, consumableCounts, onClose, onRefreshServices, onViewConsumables }) => {
  const [showServiceDetails, setShowServiceDetails] = useState({});
  const [editingServiceId, setEditingServiceId] = useState(null);
  const [editingServiceData, setEditingServiceData] = useState(null);

  const toggleServiceDetails = (serviceId) => {
    setShowServiceDetails(prev => ({
      ...prev,
      [serviceId]: !prev[serviceId]
    }));
  };

  // Calculate progress summary from billServices
  const progressSummary = useMemo(() => {
    if (!billServices || billServices.length === 0) {
      return { total: 0, completed: 0, pending: 0, overallStatus: 'In Progress' };
    }
    const total = billServices.length;
    const completed = billServices.filter(s => s.consumable_completed).length;
    const pending = total - completed;
    const overallStatus = completed === total && total > 0 ? 'Complete' : 'In Progress';
    return { total, completed, pending, overallStatus };
  }, [billServices]);

  const getStatusBadge = (status) => {
    const style = {
      Complete: { bg: '#D1FAE5', color: '#065F46', border: '#A7F3D0' },
      Incomplete: { bg: '#FEE2E2', color: '#991B1B', border: '#FECACA' },
      Pending: { bg: '#FEF3C7', color: '#92400E', border: '#FDE68A' },
    }[status] || { bg: '#FEF3C7', color: '#92400E', border: '#FDE68A' };

    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          padding: '3px 10px',
          borderRadius: '20px',
          fontSize: '11.5px',
          fontWeight: 600,
          background: style.bg,
          color: style.color,
          border: `1px solid ${style.border}`,
        }}
      >
        {status}
      </span>
    );
  };

  // Switch to the embedded consumables editor for a service,
  // or navigate straight to the Billable Consumables page when
  // an onViewConsumables callback is provided (preferred workflow).
  const handleViewDetails = (bs) => {
    if (onViewConsumables) {
      onViewConsumables(bill, bs);
      return;
    }
    setEditingServiceId(bs.id);
    setEditingServiceData({
      bill_no: bill.bill_no,
      uid: bill.uid || '',
      service_id: bs.service_id,
      service_name: bs.service_name,
      service_date: bill.service_date,
      billing_log_id: bill.id,
      bill_service_id: bs.id,
    });
  };

  // After the embedded editor saves, refresh the service data and return to the list.
  // The popup stays OPEN — we only refresh the bill_services data inside the parent.
  // We await the refresh so the list shows updated statuses instantly (no stale flash).
  const handleSaveComplete = useCallback(async (savedInfo) => {
    try {
      // Re-fetch latest service status, consumable status, and counts.
      // This updates the parent's billServices state which drives the progress summary.
      await onRefreshServices?.(savedInfo);
    } catch (e) {
      console.error('Failed to refresh services after save:', e);
    } finally {
      // Always return to the services list view (collapse the editor).
      // The popup itself is NOT closed.
      setEditingServiceId(null);
      setEditingServiceData(null);
    }
  }, [onRefreshServices]);

  // Cancel (Back to Services) from the embedded editor
  const handleCancelEditor = () => {
    setEditingServiceId(null);
    setEditingServiceData(null);
  };

  const ProgressSummaryRow = ({ label, value, isStatus = false }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: 12, color: 'var(--color-muted)', minWidth: 140, textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.05em' }}>{label}</span>
      {isStatus ? (
        getStatusBadge(value)
      ) : (
        <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-ink)' }}>{value}</span>
      )}
    </div>
  );

  const isEditing = !!editingServiceId;

  return (
    <div className="modal-overlay" onClick={isEditing ? undefined : onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '900px', width: '95%' }}>
        <div className="modal-header">
          <h3>
            {isEditing ? 'Service Consumables' : 'Bill Details'}
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--color-muted)' }}>×</button>
        </div>
        <div className="modal-body" style={{ paddingBottom: 12 }}>
          {isEditing ? (
            // ─── Embedded Consumables Editor ───
            <BillableConsumables
              embedded={true}
              initialParams={editingServiceData}
              onSaveComplete={handleSaveComplete}
              onCancel={handleCancelEditor}
            />
          ) : (
            // ─── Bill Details & Services List ───
            <>
              <div style={{ background: 'var(--color-tint-2)', padding: 16, borderRadius: 8, marginBottom: 20 }}>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--color-muted)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.05em' }}>Bill No</div>
                    <div style={{ fontWeight: 600, color: 'var(--color-primary)', marginTop: 2 }}>{bill.bill_no}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--color-muted)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.05em' }}>UID</div>
                    <div style={{ fontWeight: 600, marginTop: 2 }}>{bill.uid || '-'}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--color-muted)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.05em' }}>Patient Name</div>
                    <div style={{ fontWeight: 600, marginTop: 2 }}>{bill.patient_name}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--color-muted)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.05em' }}>Date</div>
                    <div style={{ fontWeight: 600, marginTop: 2 }}>{formatDateDisplay(bill.service_date)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--color-muted)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.05em' }}>Doctor</div>
                    <div style={{ fontWeight: 600, marginTop: 2 }}>{bill.master_doctors?.doctor_name || '-'}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--color-muted)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.05em' }}>Staff</div>
                    <div style={{ fontWeight: 600, marginTop: 2 }}>{bill.master_staff?.staff_name || '-'}</div>
                  </div>
                </div>
              </div>

              {/* ─── Progress Summary ─── */}
              <div style={{
                background: 'var(--color-tint-2)',
                padding: 16,
                borderRadius: 8,
                marginBottom: 20,
                border: '1px solid var(--color-line)',
              }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
                  Progress Summary
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <ProgressSummaryRow label="Total Services" value={progressSummary.total} />
                  <ProgressSummaryRow label="Completed Services" value={progressSummary.completed} />
                  <ProgressSummaryRow label="Pending Services" value={progressSummary.pending} />
                  <ProgressSummaryRow label="Overall Status" value={progressSummary.overallStatus} isStatus={true} />
                </div>
              </div>

              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: 'var(--color-ink)' }}>
                Services & Consumable Status
              </div>

              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--color-muted)', textTransform: 'uppercase', borderBottom: '1px solid var(--color-line)', background: 'var(--color-tint-2)' }}>Service</th>
                    <th style={{ padding: '8px 12px', textAlign: 'center', fontSize: 11, fontWeight: 600, color: 'var(--color-muted)', textTransform: 'uppercase', borderBottom: '1px solid var(--color-line)', background: 'var(--color-tint-2)' }}>Status</th>
                    <th style={{ padding: '8px 12px', textAlign: 'center', fontSize: 11, fontWeight: 600, color: 'var(--color-muted)', textTransform: 'uppercase', borderBottom: '1px solid var(--color-line)', background: 'var(--color-tint-2)' }}>Consumables</th>
                  </tr>
                </thead>
                <tbody>
                  {billServices.map((bs) => {
                    const count = consumableCounts[bs.id] || 0;
                    const isExpanded = showServiceDetails[bs.id];

                    return (
                      <Fragment key={bs.id}>
                        <tr>
                          <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--color-line-2)', fontSize: 13, cursor: 'pointer' }} onClick={() => toggleServiceDetails(bs.id)}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span>{bs.service_name}</span>
                              <svg
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                style={{
                                  width: 14,
                                  height: 14,
                                  transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                                  transition: 'transform 0.2s',
                                  color: 'var(--color-muted)'
                                }}
                              >
                                <polyline points="6 9 12 15 18 9" />
                              </svg>
                            </div>
                          </td>
                          <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--color-line-2)', textAlign: 'center' }}>
                            {bs.consumable_completed ? getStatusBadge('Complete') : getStatusBadge('Pending')}
                          </td>
                          <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--color-line-2)', textAlign: 'center', fontSize: 12, color: 'var(--color-muted)' }}>
                            {bs.consumable_completed ? (
                              <span
                                style={{ color: 'var(--color-primary)', fontWeight: 600, cursor: 'pointer', textDecoration: 'underline' }}
                                onClick={() => handleViewDetails(bs)}
                                title="View/edit consumables for this service"
                              >
                                View Details
                              </span>
                            ) : (
                              <button
                                onClick={() => handleViewDetails(bs)}
                                className="btn btn-sm"
                                style={{
                                  background: '#D1FAE5',
                                  color: '#065F46',
                                  border: '1px solid #A7F3D0'
                                }}
                                title="Add/View consumables"
                              >
                                View Details ({count})
                              </button>
                            )}
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr key={`${bs.id}-details`}>
                            <td colSpan="3" style={{ padding: '16px 12px', borderBottom: '1px solid var(--color-line-2)', background: '#f8fafc' }}>
                              <div style={{ fontSize: 12, color: 'var(--color-muted)', marginBottom: 8 }}>Service Details</div>
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                                <div>
                                  <div style={{ fontSize: 11, color: 'var(--color-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Status</div>
                                  <div style={{ marginTop: 4 }}>{bs.consumable_completed ? getStatusBadge('Complete') : getStatusBadge('Pending')}</div>
                                </div>
                                <div>
                                  <div style={{ fontSize: 11, color: 'var(--color-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Consumables</div>
                                  <div style={{ marginTop: 4, fontSize: 13 }}>{count} items</div>
                                </div>
                                <div>
                                  <div style={{ fontSize: 11, color: 'var(--color-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Service ID</div>
                                  <div style={{ marginTop: 4, fontSize: 13 }}>{bs.service_id}</div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>

              {/* Auto-close notice when all services are complete */}
              {progressSummary.completed === progressSummary.total && progressSummary.total > 0 && (
                <div style={{
                  marginTop: 16,
                  padding: 12,
                  background: '#D1FAE5',
                  border: '1px solid #A7F3D0',
                  borderRadius: 8,
                  fontSize: 13,
                  color: '#065F46',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}>
                  <span style={{ fontWeight: 600 }}>All services are complete!</span>
                  Click Close to dismiss this bill.
                </div>
              )}
            </>
          )}
        </div>
        <div className="modal-footer">
          <button onClick={onClose} className="btn btn-secondary">
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default BillDetailsModal;
