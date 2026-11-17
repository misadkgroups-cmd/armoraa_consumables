import { useState } from 'react';
import { Copy, Check, Package, ArrowRight, MessageSquare, Clock, MapPin, CheckCircle, AlertCircle } from 'lucide-react';
import { formatDateTimeDisplay } from '../utils/dateUtils';
import { fmtQty1 } from '../utils/numUtils';

const TransactionDetailsModal = ({ open, onClose, transaction, onReceive, canReceive, loading }) => {
  const [copied, setCopied] = useState(false);

  if (!open || !transaction) return null;

  const {
    txnId,
    date,
    fromLocation,
    toLocation,
    status,
    user,
    comment,
    items = [],
  } = transaction;

  const isPending = (status || '').toLowerCase() === 'pending';
  const isReceived = (status || '').toLowerCase() === 'received';

  const handleCopy = () => {
    if (!txnId) return;
    navigator.clipboard.writeText(txnId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const totalQty = items.reduce((acc, it) => acc + (Number(it.quantity) || 0), 0);

  return (
    <div className="modal-overlay" style={{ zIndex: 10000 }} onClick={onClose}>
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: '820px',
          width: '95%',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--color-surface)',
          borderRadius: 16,
          boxShadow: '0 20px 40px rgba(0,0,0,0.18)',
        }}
      >
        {/* Header */}
        <div
          className="modal-header"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingBottom: 14,
            borderBottom: '1px solid var(--color-line)',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--color-ink)' }}>
                Transaction Details
              </h3>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '3px 10px',
                    borderRadius: 6,
                    background: '#EEF2FF',
                    color: '#4F46E5',
                    fontSize: 12,
                    fontWeight: 700,
                    fontFamily: 'monospace',
                    border: '1px solid #C7D2FE',
                  }}
                >
                  {txnId}
                </span>
                <button
                  type="button"
                  onClick={handleCopy}
                  title="Copy Transaction ID"
                  style={{
                    border: 'none',
                    background: 'transparent',
                    cursor: 'pointer',
                    padding: 4,
                    color: copied ? '#059669' : 'var(--color-muted)',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                </button>
              </div>

              {/* Status pill */}
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  fontSize: 11,
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: 999,
                  background: isReceived ? '#ECFDF5' : isPending ? '#FEF3C7' : 'var(--color-tint-2)',
                  color: isReceived ? '#047857' : isPending ? '#B45309' : 'var(--color-ink)',
                  border: isReceived ? '1px solid #A7F3D0' : isPending ? '1px solid #FDE68A' : '1px solid var(--color-line)',
                }}
              >
                {isReceived ? <CheckCircle size={12} /> : isPending ? <AlertCircle size={12} /> : null}
                {status || 'Completed'}
              </span>
            </div>
            <p style={{ margin: '4px 0 0 0', fontSize: 12, color: 'var(--color-muted)' }}>
              Complete record of products, route, and comments for this transfer.
            </p>
          </div>
          <button onClick={onClose} className="btn btn-ghost btn-icon">×</button>
        </div>

        {/* Body */}
        <div className="modal-body space-y-4" style={{ overflowY: 'auto', flex: 1, padding: '16px 20px' }}>
          {/* Route & Info Card */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 12,
              background: 'var(--color-tint-2)',
              borderRadius: 12,
              padding: 14,
              border: '1px solid var(--color-line)',
            }}
          >
            <div>
              <div style={{ fontSize: 11, color: 'var(--color-muted)', display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                <Clock size={12} /> Date & Time
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-ink)' }}>
                {formatDateTimeDisplay(date)}
              </div>
            </div>

            <div>
              <div style={{ fontSize: 11, color: 'var(--color-muted)', display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                <Package size={12} /> Transferred By
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-ink)' }}>
                {user || 'Admin'}
              </div>
            </div>

            <div style={{ gridColumn: '1 / -1' }}>
              <div style={{ fontSize: 11, color: 'var(--color-muted)', display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                <MapPin size={12} /> Transfer Route
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600 }}>
                <span style={{ color: 'var(--color-ink)', background: 'var(--color-surface)', padding: '3px 10px', borderRadius: 6, border: '1px solid var(--color-line)' }}>
                  {fromLocation || 'Corporate Warehouse'}
                </span>
                <ArrowRight size={14} style={{ color: 'var(--color-muted)', flexShrink: 0 }} />
                <span style={{ color: '#047857', background: 'var(--color-surface)', padding: '3px 10px', borderRadius: 6, border: '1px solid var(--color-line)' }}>
                  {toLocation || 'Corporate Warehouse'}
                </span>
              </div>
            </div>
          </div>

          {/* Comments / Remarks Card */}
          <div
            style={{
              background: '#F8FAFC',
              borderRadius: 12,
              padding: 14,
              border: '1px solid #E2E8F0',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: '#334155', marginBottom: 6 }}>
              <MessageSquare size={14} style={{ color: '#6366F1' }} />
              <span>Comments & Remarks</span>
            </div>
            <div
              style={{
                fontSize: 13,
                color: comment ? '#1E293B' : '#94A3B8',
                lineHeight: 1.5,
                background: 'var(--color-surface)',
                padding: '10px 14px',
                borderRadius: 8,
                border: '1px solid #E2E8F0',
                fontStyle: comment ? 'normal' : 'italic',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {comment || 'No comments recorded for this transaction.'}
            </div>
          </div>

          {/* Products List Table */}
          <div
            style={{
              background: 'var(--color-surface)',
              borderRadius: 12,
              border: '1px solid var(--color-line)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                padding: '10px 14px',
                borderBottom: '1px solid var(--color-line)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: 'var(--color-tint-2)',
              }}
            >
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-ink)' }}>
                Products in Transaction ({items.length})
              </span>
              <span style={{ fontSize: 12, color: 'var(--color-muted)' }}>
                Total Quantity: <strong>{fmtQty1(totalQty)} units</strong>
              </span>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table className="rpt-table" style={{ fontSize: 12.5, width: '100%', minWidth: 620, margin: 0 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: '8px 12px', width: 45 }}>#</th>
                    <th style={{ textAlign: 'left', padding: '8px 12px', minWidth: 220 }}>Product Name</th>
                    <th style={{ textAlign: 'center', padding: '8px 12px', width: 110 }}>Type</th>
                    <th style={{ textAlign: 'center', padding: '8px 12px', width: 95 }}>Quantity</th>
                    <th style={{ textAlign: 'center', padding: '8px 12px', width: 105 }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, idx) => (
                    <tr key={it.id || idx}>
                      <td style={{ textAlign: 'left', padding: '8px 12px', color: 'var(--color-muted)' }}>{idx + 1}</td>
                      <td style={{ fontWeight: 600, padding: '8px 12px' }}>
                        {it.product_name || `Product #${it.product_id}`}
                      </td>
                      <td style={{ textAlign: 'center', padding: '8px 12px' }}>
                        <span
                          style={{
                            fontSize: 10.5,
                            fontWeight: 700,
                            padding: '1px 6px',
                            borderRadius: 4,
                            background: it.stock_type === 'Non-Billable' ? '#E0E7FF' : '#F3E8FF',
                            color: it.stock_type === 'Non-Billable' ? '#3730A3' : '#7E22CE',
                          }}
                        >
                          {it.stock_type || 'Billable'}
                        </span>
                      </td>
                      <td style={{ textAlign: 'center', padding: '8px 12px', fontWeight: 700 }}>
                        {fmtQty1(it.quantity)}
                      </td>
                      <td style={{ textAlign: 'center', padding: '8px 12px' }}>
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 600,
                            color: isReceived ? '#047857' : isPending ? '#B45309' : 'var(--color-muted)',
                          }}
                        >
                          {it.status || status || '-'}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {items.length === 0 && (
                    <tr>
                      <td colSpan="5" style={{ textAlign: 'center', padding: 20, color: 'var(--color-muted)' }}>
                        No product details found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '12px 20px',
            borderTop: '1px solid var(--color-line)',
          }}
        >
          <button onClick={onClose} className="btn btn-secondary">
            Close
          </button>
          {canReceive && isPending && (
            <button
              onClick={() => onReceive(transaction)}
              disabled={loading}
              className="btn btn-primary"
              style={{ backgroundColor: '#059669' }}
            >
              {loading ? 'Receiving...' : 'Confirm Receipt'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default TransactionDetailsModal;

