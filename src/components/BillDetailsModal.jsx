import { useState, useEffect } from 'react';

const BillDetailsModal = ({ bill, billServices, consumableCounts, onClose, onAddConsumables, onEditConsumables, onViewConsumables }) => {
  const [showServiceDetails, setShowServiceDetails] = useState({});

  const toggleServiceDetails = (serviceId) => {
    setShowServiceDetails(prev => ({
      ...prev,
      [serviceId]: !prev[serviceId]
    }));
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    try {
      return new Date(dateString).toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });
    } catch {
      return dateString;
    }
  };

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

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '900px', width: '95%' }}>
        <div className="modal-header">
          <h3>Bill Details</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--color-muted)' }}>×</button>
        </div>
        <div className="modal-body">
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
                <div style={{ fontWeight: 600, marginTop: 2 }}>{bill.service_date}</div>
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
                  <>
                    <tr key={bs.id}>
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
                         <button
                           onClick={() => onAddConsumables(bill, bs.id, bs.service_id, bs.service_name)}
                           className="btn btn-sm"
                           style={{ 
                             background: bs.consumable_completed ? '#F0F9FF' : '#D1FAE5', 
                             color: bs.consumable_completed ? '#0369A1' : '#065F46', 
                             border: `1px solid ${bs.consumable_completed ? '#BAE6FD' : '#A7F3D0'}` 
                           }}
                           title="View/Edit consumables"
                         >
                           View Details ({count})
                         </button>
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
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="modal-footer">
          <button onClick={onClose} className="btn btn-secondary">Close</button>
        </div>
      </div>
    </div>
  );
};

export default BillDetailsModal;