import { useState, useEffect } from 'react';
import { supabase } from '../config/supabase';
import { useBranch } from '../context/BranchContext';

const CARD_STYLE = {
  background: '#ffffff',
  borderRadius: '12px',
  border: '1px solid #e2e8f0',
  boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
};

const STATUS_BADGE = {
  Complete: { bg: '#D1FAE5', color: '#065F46', border: '#A7F3D0' },
  Incomplete: { bg: '#FEE2E2', color: '#991B1B', border: '#FECACA' },
};

export default function AllBills({ onNavigate }) {
  const { branchId, misMode } = useBranch();
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showViewModal, setShowViewModal] = useState(false);
  const [viewData, setViewData] = useState(null);
  const [toast, setToast] = useState(null);
  const [selectedDate, setSelectedDate] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');

  useEffect(() => {
    if (branchId) {
      fetchAllBills();
    }
  }, [branchId, selectedDate, statusFilter]);

  const fetchAllBills = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('billing_log')
        .select('*, master_doctors(doctor_name), master_staff(staff_name)')
        .order('created_at', { ascending: false });
      if (branchId) query = query.eq('branch_id', branchId);
      if (selectedDate) query = query.eq('service_date', selectedDate);
      if (statusFilter && statusFilter !== 'All') query = query.eq('consumable_status', statusFilter);

      const { data, error } = await query;
      if (error) throw error;
      setBills(data || []);
    } catch (error) {
      console.error('Error fetching all bills:', error);
      showToast('error', 'Failed to fetch bills');
    } finally {
      setLoading(false);
    }
  };

  const showToast = (type, message) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3000);
  };

  const handleEditConsumables = (bill) => {
    // Same as handleAddConsumables - navigate to billable consumables page
    if (onNavigate) {
      onNavigate('billable', {
        bill_no: bill.bill_no,
        uid: bill.uid || '',
        service_id: bill.service_id,
        service_name: bill.service_name,
        service_date: bill.service_date,
        billing_log_id: bill.id,
      });
    } else {
      window.location.href = `/billable-consumables?bill_no=${encodeURIComponent(bill.bill_no)}&uid=${encodeURIComponent(bill.uid || '')}&service_id=${bill.service_id}&service_name=${encodeURIComponent(bill.service_name)}&service_date=${bill.service_date}&billing_log_id=${bill.id}`;
    }
  };

  const handleAddConsumables = (bill) => {
    // Use onNavigate to switch to billable consumables page
    if (onNavigate) {
      onNavigate('billable', {
        bill_no: bill.bill_no,
        uid: bill.uid || '',
        service_id: bill.service_id,
        service_name: bill.service_name,
        service_date: bill.service_date,
        billing_log_id: bill.id,
      });
    } else {
      // Fallback
      window.location.href = `/billable-consumables?bill_no=${encodeURIComponent(bill.bill_no)}&uid=${encodeURIComponent(bill.uid || '')}&service_id=${bill.service_id}&service_name=${encodeURIComponent(bill.service_name)}&service_date=${bill.service_date}&billing_log_id=${bill.id}`;
    }
  };

  const handleViewConsumables = async (bill) => {
    try {
      const { data: reports, error } = await supabase
        .from('billable_report')
        .select('*')
        .eq('bill_id', bill.bill_no)
        .eq('branch_id', branchId)
        .single();

      if (error || !reports) {
        showToast('warning', 'No consumables found for this bill');
        return;
      }

      // Fetch all consumable names for display
      const consumableIds = [];
      for (let i = 1; i <= 14; i++) {
        const cId = reports[`consumable_${i}_id`];
        if (cId) consumableIds.push(cId);
      }

      let nameMap = {};
      if (consumableIds.length > 0) {
        const { data: names } = await supabase
          .from('master_consumables')
          .select('consumable_name')
          .in('consumable_name', consumableIds);
        if (names) {
          names.forEach(n => { nameMap[n.consumable_name] = n.consumable_name; });
        }
      }

      const consumables = [];
      for (let i = 1; i <= 14; i++) {
        const cId = reports[`consumable_${i}_id`];
        const cUnits = reports[`consumable_${i}_units`];
        const cBatch = reports[`consumable_${i}_batch_id`];
        if (cId) {
          consumables.push({
            name: cId,
            units: cUnits,
            batch: cBatch,
          });
        }
      }

      setViewData({ bill, consumables });
      setShowViewModal(true);
    } catch (error) {
      console.error('Error fetching consumables:', error);
      showToast('error', 'Failed to fetch consumables');
    }
  };

  const handleDeleteBill = async (bill) => {
    if (!window.confirm(`Delete bill #${bill.bill_no} for ${bill.patient_name}? This action cannot be undone.`)) return;
    try {
      const { error } = await supabase.from('billing_log').delete().eq('id', bill.id);
      if (error) throw error;
      showToast('success', `Bill #${bill.bill_no} deleted successfully`);
      fetchAllBills();
    } catch (error) {
      console.error('Error deleting bill:', error);
      showToast('error', 'Failed to delete bill');
    }
  };

  const getStatusBadge = (status) => {
    const style = STATUS_BADGE[status] || STATUS_BADGE.Incomplete;
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
    <div className="page-wrapper animate-fade-in">
      {/* Page Header with Date Filter */}
      <div className="page-header">
        <div className="page-header-left">
          <h1>Detailed Log</h1>
          <p>View all saved billing records</p>
        </div>
        <div className="page-header-actions">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-muted)' }}>Date:</label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="form-input"
              style={{ height: 36, width: 'auto' }}
            />
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button 
              onClick={() => setStatusFilter('All')} 
              className={`btn btn-sm ${statusFilter === 'All' ? 'btn-primary' : 'btn-secondary'}`}
            >
              Show All
            </button>
            <button 
              onClick={() => setStatusFilter('Complete')} 
              className={`btn btn-sm ${statusFilter === 'Complete' ? 'btn-primary' : 'btn-secondary'}`}
            >
              Complete
            </button>
            <button 
              onClick={() => setStatusFilter('Incomplete')} 
              className={`btn btn-sm ${statusFilter === 'Incomplete' ? 'btn-primary' : 'btn-secondary'}`}
            >
              Incomplete
            </button>
          </div>
          <button onClick={fetchAllBills} className="btn btn-secondary btn-sm">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
            Refresh
          </button>
        </div>
      </div>

      {/* Main Table */}
      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Bill No</th>
              <th>UID</th>
              <th>Patient Name</th>
              <th>Service</th>
              <th>Service Date</th>
              <th>Rendering Doctor</th>
              <th>Staff</th>
              <th>Consumables</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan="10" style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--color-muted)' }}>
                  <div className="animate-pulse">Loading bills...</div>
                </td>
              </tr>
            ) : bills.length === 0 ? (
              <tr>
                <td colSpan="10" style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--color-muted)' }}>
                  No bills found
                </td>
              </tr>
            ) : (
              bills.map((bill) => {
                const hasConsumables = bill.consumable_status === 'Complete';
                return (
                  <tr key={bill.id}>
                    <td style={{ fontWeight: 600, color: 'var(--color-primary)' }}>{bill.bill_no}</td>
                    <td>{bill.uid || '-'}</td>
                    <td>{bill.patient_name}</td>
                    <td>{bill.service_name}</td>
                    <td>{bill.service_date}</td>
                    <td>{bill.master_doctors?.doctor_name || '-'}</td>
                    <td>{bill.master_staff?.staff_name || '-'}</td>
                    <td>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          padding: '3px 10px',
                          borderRadius: '20px',
                          fontSize: '11.5px',
                          fontWeight: 600,
                          background: hasConsumables ? '#D1FAE5' : '#FEF3C7',
                          color: hasConsumables ? '#065F46' : '#92400E',
                          border: `1px solid ${hasConsumables ? '#A7F3D0' : '#FDE68A'}`,
                        }}
                      >
                        {hasConsumables ? 'Added' : 'Not Added'}
                      </span>
                    </td>
                    <td>{getStatusBadge(bill.consumable_status)}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        {bill.consumable_status === 'Incomplete' ? (
                          <button
                            onClick={() => handleAddConsumables(bill)}
                            className="btn btn-primary btn-sm"
                          >
                            Add Consumables
                          </button>
                        ) : (
                          <button
                            onClick={() => handleEditConsumables(bill)}
                            className="btn btn-outline btn-sm"
                            style={{ border: '1px solid var(--color-primary)', color: 'var(--color-primary)' }}
                          >
                            Edit
                          </button>
                        )}
                        {misMode && (
                          <button
                            onClick={() => handleDeleteBill(bill)}
                            className="btn btn-sm"
                            style={{
                              background: '#FEE2E2',
                              color: '#991B1B',
                              border: '1px solid #FECACA',
                              padding: '6px 10px',
                            }}
                            title="Delete bill"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="3 6 5 6 21 6"/>
                              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                            </svg>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* View Consumables Modal */}
      {showViewModal && viewData && (
        <div className="modal-overlay" onClick={() => setShowViewModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '800px', width: '95%' }}>
            <div className="modal-header">
              <h3>Bill Information</h3>
              <button onClick={() => setShowViewModal(false)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--color-muted)' }}>×</button>
            </div>
            <div className="modal-body">
              <div style={{ background: 'var(--color-tint-2)', padding: 16, borderRadius: 8, marginBottom: 20 }}>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--color-muted)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.05em' }}>Bill No</div>
                    <div style={{ fontWeight: 600, color: 'var(--color-primary)', marginTop: 2 }}>{viewData.bill.bill_no}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--color-muted)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.05em' }}>UID</div>
                    <div style={{ fontWeight: 600, marginTop: 2 }}>{viewData.bill.uid || '-'}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--color-muted)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.05em' }}>Patient Name</div>
                    <div style={{ fontWeight: 600, marginTop: 2 }}>{viewData.bill.patient_name}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--color-muted)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.05em' }}>Service</div>
                    <div style={{ fontWeight: 600, marginTop: 2 }}>{viewData.bill.service_name}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--color-muted)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.05em' }}>Date</div>
                    <div style={{ fontWeight: 600, marginTop: 2 }}>{viewData.bill.service_date}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--color-muted)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.05em' }}>Status</div>
                    <div style={{ marginTop: 4 }}>{getStatusBadge(viewData.bill.consumable_status)}</div>
                  </div>
                </div>
              </div>

              {viewData.consumables.length > 0 && (
                <>
                  <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: 'var(--color-ink)' }}>Consumables Used</div>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--color-muted)', textTransform: 'uppercase', borderBottom: '1px solid var(--color-line)', background: 'var(--color-tint-2)' }}>Consumable Name</th>
                        <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--color-muted)', textTransform: 'uppercase', borderBottom: '1px solid var(--color-line)', background: 'var(--color-tint-2)' }}>Units</th>
                        <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--color-muted)', textTransform: 'uppercase', borderBottom: '1px solid var(--color-line)', background: 'var(--color-tint-2)' }}>Batch</th>
                      </tr>
                    </thead>
                    <tbody>
                      {viewData.consumables.map((c, i) => (
                        <tr key={i}>
                          <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--color-line-2)', fontSize: 13 }}>{c.name}</td>
                          <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--color-line-2)', fontSize: 13 }}>{c.units || '-'}</td>
                          <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--color-line-2)', fontSize: 13 }}>{c.batch || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </div>
            <div className="modal-footer">
              <button onClick={() => setShowViewModal(false)} className="btn btn-secondary">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`toast ${toast.type === 'success' ? 'toast-success' : toast.type === 'warning' ? 'toast-warning' : 'toast-error'}`}>
          <span>{toast.message}</span>
          <button onClick={() => setToast(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', opacity: 0.7, fontSize: 16, lineHeight: 1 }}>×</button>
        </div>
      )}
    </div>
  );
}