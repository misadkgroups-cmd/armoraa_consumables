import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../config/supabase';
import { useBranch } from '../context/BranchContext';
import { Eye, Pencil, FlaskConical, Trash2 } from 'lucide-react';

const CARD_STYLE = {
  background: '#ffffff',
  borderRadius: '12px',
  border: '1px solid #e2e8f0',
  boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
};

const STATUS_BADGE = {
  Complete: { bg: '#D1FAE5', color: '#065F46', border: '#A7F3D0' },
  Incomplete: { bg: '#FEE2E2', color: '#991B1B', border: '#FECACA' },
  Pending: { bg: '#FEF3C7', color: '#92400E', border: '#FDE68A' },
};

export default function AllBills({ onNavigate, urlState }) {
  const { branchId, misMode } = useBranch();
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showViewModal, setShowViewModal] = useState(false);
  const [viewData, setViewData] = useState(null);
  const [billServices, setBillServices] = useState([]);
  const [billConsumables, setBillConsumables] = useState([]);
  const [consumableCounts, setConsumableCounts] = useState({});
  const [toast, setToast] = useState(null);
  const [selectedDate, setSelectedDate] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [expandedBillId, setExpandedBillId] = useState(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const hasAutoExpanded = useRef(false);

  // Auto-expand bill when returning from BillableConsumables
  useEffect(() => {
    if (urlState?.highlightBill && bills.length > 0 && !hasAutoExpanded.current) {
      hasAutoExpanded.current = true;
      setExpandedBillId(Number(urlState.highlightBill));
      setTimeout(() => {
        hasAutoExpanded.current = false;
      }, 3000);
    }
  }, [urlState?.highlightBill, bills]);

  // Listen for refresh flag from BillableConsumables
  useEffect(() => {
    const checkRefresh = () => {
      const flag = localStorage.getItem('forceRefreshBills');
      if (flag) {
        localStorage.removeItem('forceRefreshBills');
        setRefreshToken(Date.now());
      }
    };
    
    const interval = setInterval(checkRefresh, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (branchId) {
      fetchAllBills();
    }
  }, [branchId, selectedDate, statusFilter, refreshToken]);

  const showToast = (type, message) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3000);
  };

  // Calculate bill status based on bill_services consumable_completed
  const calculateBillStatus = (services) => {
    if (!services || services.length === 0) return 'Incomplete';
    const hasPending = services.some(s => !s.consumable_completed);
    return hasPending ? 'Incomplete' : 'Complete';
  };

  // Get service counts for a bill with completion percentage
  const getServiceCounts = (services) => {
    if (!services || services.length === 0) return { total: 0, completed: 0, pending: 0, percentage: 0 };
    const total = services.length;
    const completed = services.filter(s => s.consumable_completed).length;
    return { total, completed, pending: total - completed, percentage: total > 0 ? Math.round((completed / total) * 100) : 0 };
  };

  const fetchAllBills = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('billing_log')
        .select(`
          *,
          master_doctors(doctor_name),
          master_staff(staff_name),
          bill_services(id, service_id, service_name, consumable_completed, service_status)
        `)
        .order('created_at', { ascending: false });
      if (branchId) query = query.eq('branch_id', branchId);
      if (selectedDate) query = query.eq('service_date', selectedDate);

      const { data, error } = await query;
      if (error) throw error;
      
      // Calculate status for each bill based on bill_services
      const billsWithCounts = (data || []).map(bill => {
        const counts = getServiceCounts(bill.bill_services);
        return {
          ...bill,
          serviceCounts: counts,
          calculatedStatus: calculateBillStatus(bill.bill_services),
        };
      });
      
      // Apply status filter after calculation
      let filteredBills = billsWithCounts;
      if (statusFilter && statusFilter !== 'All') {
        filteredBills = billsWithCounts.filter(b => b.calculatedStatus === statusFilter);
      }
      
      setBills(filteredBills);
    } catch (error) {
      console.error('Error fetching all bills:', error);
      showToast('error', 'Failed to fetch bills');
    } finally {
      setLoading(false);
    }
  };

  // Navigate to Add/Edit Consumables for a specific service
  const handleServiceConsumables = (bill, billServiceId, serviceId, serviceName, isCompleted) => {
    const billData = {
      bill_no: bill.bill_no,
      uid: bill.uid || '',
      service_date: bill.service_date,
      billing_log_id: bill.id,
      bill_service_id: billServiceId,
      service_id: serviceId,
      service_name: serviceName,
    };
    if (onNavigate) {
      onNavigate('billable', billData);
    } else {
      window.location.href = `/billable-consumables?bill_no=${encodeURIComponent(bill.bill_no)}&uid=${encodeURIComponent(bill.uid || '')}&service_date=${bill.service_date}&billing_log_id=${bill.id}&bill_service_id=${billServiceId}&service_id=${serviceId}&service_name=${encodeURIComponent(serviceName)}`;
    }
  };

  // View bill details modal - shows all services
  const handleViewBill = (bill) => {
    const services = bill.bill_services || [];
    setBillServices(services);
    setViewData({ bill, viewMode: 'details' });
    setShowViewModal(true);
    // Fetch consumable counts from bill_service_consumables (relational source of truth)
    fetchConsumableCounts(services);
  };

  // Fetch consumable counts from bill_service_consumables (the relational table)
  const fetchConsumableCounts = async (services) => {
    if (!services || services.length === 0) return;
    try {
      const billServiceIds = services.map(s => s.id);
      
      // Count consumables per bill_service_id from bill_service_consumables
      const { data: counts, error } = await supabase
        .from('bill_service_consumables')
        .select('bill_service_id, id')
        .in('bill_service_id', billServiceIds)
        .eq('status', 'Used');
      
      if (error) {
        console.error('Error fetching consumable counts:', error);
        return;
      }

      // Build count map: billServiceId -> count of consumables
      const countMap = {};
      (counts || []).forEach(bsc => {
        countMap[bsc.bill_service_id] = (countMap[bsc.bill_service_id] || 0) + 1;
      });

      // Build final map for all services (default 0 if no consumables found)
      const result = {};
      services.forEach(s => {
        result[s.id] = countMap[s.id] || 0;
      });
      setConsumableCounts(result);
    } catch (error) {
      console.error('Error in fetchConsumableCounts:', error);
    }
  };

  // Fetch consumable details with names from master tables
  const fetchConsumableDetails = async (billServiceId) => {
    try {
      // Get bill_service_consumables entries for this service
      const { data: entries, error } = await supabase
        .from('bill_service_consumables')
        .select(`
          id,
          product_type,
          consumable_id,
          used_quantity,
          status
        `)
        .eq('bill_service_id', billServiceId)
        .eq('status', 'Used');
      
      if (error || !entries || entries.length === 0) return [];

      // Separate billable and non-billable IDs to fetch names
      const billableIds = entries.filter(e => e.product_type === 'Billable').map(e => e.consumable_id);
      const nonBillableIds = entries.filter(e => e.product_type === 'Non-Billable').map(e => e.consumable_id);

      // Fetch names from master tables
      let billableNames = {};
      let nonBillableNames = {};

      if (billableIds.length > 0) {
        const { data: billables } = await supabase
          .from('master_billable_consumables')
          .select('id, product_name')
          .in('id', billableIds);
        if (billables) {
          billables.forEach(b => { billableNames[b.id] = b.product_name; });
        }
      }

      if (nonBillableIds.length > 0) {
        const { data: nonBillables } = await supabase
          .from('master_non_billable_consumables')
          .select('id, product_name')
          .in('id', nonBillableIds);
        if (nonBillables) {
          nonBillables.forEach(nb => { nonBillableNames[nb.id] = nb.product_name; });
        }
      }

      // Build consumable list with names
      const consumables = entries.map(e => {
        const name = e.product_type === 'Billable' 
          ? (billableNames[e.consumable_id] || `Billable #${e.consumable_id}`)
          : (nonBillableNames[e.consumable_id] || `Non-Billable #${e.consumable_id}`);
        return {
          name,
          units: e.used_quantity,
          batch: '-',
        };
      });

      return consumables;
    } catch (error) {
      console.error('Error fetching consumable details:', error);
      return [];
    }
  };

  // Handle viewing consumables for a completed service
  const handleViewConsumables = async (bill, billServiceId, serviceId, serviceName) => {
    try {
      const consumables = await fetchConsumableDetails(billServiceId);
      if (consumables.length === 0) {
        showToast('warning', 'No consumables found for this service');
        return;
      }
      setViewData({ bill, consumables, viewMode: 'consumables' });
      setShowViewModal(true);
    } catch (error) {
      console.error('Error fetching consumables:', error);
      showToast('error', 'Failed to fetch consumables');
    }
  };

  // Edit bill - navigate to BillingLog with bill data
  const handleEditBill = (bill) => {
    if (onNavigate) {
      onNavigate('edit-bill', bill);
    } else {
      window.location.href = `/billing-log?edit=${encodeURIComponent(bill.bill_no)}`;
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

  // Toggle expanded services row
  const toggleExpand = (billId) => {
    setExpandedBillId(expandedBillId === billId ? null : billId);
  };

  // Helper to format service names list
  const formatServiceNames = (services) => {
    if (!services || services.length === 0) return '-';
    return services.map(s => s.service_name).join(', ');
  };

  return (
    <div className="page-wrapper animate-fade-in">
      {/* Page Header with Date Filter */}
      <div className="page-header">
        <div className="page-header-left">
          <h1>Detailed Log</h1>
          <p>View all saved billing records with service completion status</p>
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
              All
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
              <th style={{ width: 80 }}>Bill No</th>
              <th style={{ width: 120 }}>Patient</th>
              <th style={{ width: 100 }}>Date</th>
              <th style={{ width: 180 }}>Services</th>
              <th style={{ width: 80, textAlign: 'center' }}>Completed</th>
              <th style={{ width: 80, textAlign: 'center' }}>Pending</th>
              <th style={{ width: 100, textAlign: 'center' }}>Status</th>
              <th style={{ width: 200, textAlign: 'center' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan="8" style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--color-muted)' }}>
                  <div className="animate-pulse">Loading bills...</div>
                </td>
              </tr>
            ) : bills.length === 0 ? (
              <tr>
                <td colSpan="8" style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--color-muted)' }}>
                  No bills found
                </td>
              </tr>
            ) : (
              bills.map((bill) => {
                const counts = bill.serviceCounts || { total: 0, completed: 0, pending: 0, percentage: 0 };
                const status = bill.calculatedStatus;
                const isExpanded = expandedBillId === bill.id;
                const pendingServices = (bill.bill_services || []).filter(s => !s.consumable_completed);
                
                return (
                  <>
                    <tr key={bill.id}>
                      <td style={{ fontWeight: 600, color: 'var(--color-primary)', cursor: 'pointer' }} onClick={() => toggleExpand(bill.id)}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span>{bill.bill_no}</span>
                          <svg 
                            viewBox="0 0 24 24" 
                            fill="none" 
                            stroke="currentColor" 
                            strokeWidth="2" 
                            strokeLinecap="round" 
                            strokeLinejoin="round" 
                            className="w-3 h-3"
                            style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}
                          >
                            <polyline points="6 9 12 15 18 9" />
                          </svg>
                        </div>
                      </td>
                      <td>{bill.patient_name}</td>
                      <td style={{ fontSize: 13 }}>{bill.service_date || '-'}</td>
                      <td style={{ fontSize: 13 }}>{formatServiceNames(bill.bill_services)}</td>
                      <td style={{ textAlign: 'center' }}>
                        <span style={{ color: '#065F46', fontWeight: 600 }}>{counts.completed}</span>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span style={{ color: '#991B1B', fontWeight: 600 }}>{counts.pending}</span>
                      </td>
                      <td style={{ textAlign: 'center' }}>{getStatusBadge(status)}</td>
                       <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                         <div style={{ display: 'flex', justifyContent: 'center', gap: 6, flexWrap: 'wrap' }}>
                           {/* View Button */}
                           <button 
                             onClick={() => handleViewBill(bill)}
                             className="btn btn-ghost btn-sm"
                             title="View Bill Details"
                             style={{ padding: '6px 8px' }}
                           >
                             <Eye size={16} />
                           </button>
                           
                           {/* Edit Bill Button */}
                           <button 
                             onClick={() => handleEditBill(bill)}
                             className="btn btn-ghost btn-sm"
                             title="Edit Bill"
                             style={{ padding: '6px 8px', color: 'var(--color-primary)' }}
                           >
                             <Pencil size={16} />
                           </button>
                           
                           {/* Add Consumables Button - only for Incomplete bills */}
                           {status === 'Incomplete' && pendingServices.length > 0 && (
                             <button 
                               onClick={() => handleServiceConsumables(bill, pendingServices[0].id, pendingServices[0].service_id, pendingServices[0].service_name, false)}
                               className="btn btn-primary btn-sm"
                               title="Add Consumables"
                               style={{ padding: '6px 10px', fontSize: 12 }}
                             >
                               <FlaskConical size={14} style={{ marginRight: 4 }} />
                               Add Consumables
                             </button>
                           )}
                           
                           {/* Delete Button - MIS only */}
                           {misMode && (
                             <button
                               onClick={() => handleDeleteBill(bill)}
                               className="btn btn-sm"
                               style={{
                                 background: '#FEE2E2',
                                 color: '#991B1B',
                                 border: '1px solid #FECACA',
                                 padding: '6px 8px',
                               }}
                               title="Delete bill"
                             >
                               <Trash2 size={16} />
                             </button>
                           )}
                         </div>
                       </td>
                    </tr>
                    {/* Expanded Services Row */}
                    {isExpanded && (
                      <tr>
                        <td colSpan="8" style={{ padding: 0, borderTop: 'none', borderBottom: '1px solid var(--color-line-2)' }}>
                          <div style={{ padding: '12px 20px', background: 'var(--color-tint-2)' }}>
                            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-muted)', marginBottom: 8, textTransform: 'uppercase' }}>
                              Services List
                            </div>
                            {bill.bill_services && bill.bill_services.length > 0 ? (
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                {bill.bill_services.map((bs, idx) => (
                                  <div key={bs.id} style={{ 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    gap: 6,
                                    padding: '6px 10px',
                                    borderRadius: 6,
                                    fontSize: 13,
                                    background: bs.consumable_completed ? '#D1FAE5' : '#FEF3C7',
                                    border: `1px solid ${bs.consumable_completed ? '#A7F3D0' : '#FDE68A'}`,
                                  }}>
                                    <span>{idx + 1}. {bs.service_name}</span>
                                    {bs.consumable_completed ? (
                                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#065F46" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M22 11.08V12a10 10 0 1 1-5.93-8.17"/>
                                        <polyline points="22 4 22 12 15.5 18.5"/>
                                      </svg>
                                    ) : (
                                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#92400E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <circle cx="12" cy="12" r="10"/>
                                        <line x1="12" y1="8" x2="12.01" y2="8"/>
                                        <line x1="12" y1="12" x2="12.01" y2="12"/>
                                      </svg>
                                    )}
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div style={{ fontSize: 13, color: 'var(--color-muted)' }}>No services recorded</div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Bill Details Modal */}
      {showViewModal && viewData && (
        <div className="modal-overlay" onClick={() => setShowViewModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '900px', width: '95%' }}>
            <div className="modal-header">
              <h3>{viewData.viewMode === 'consumables' ? `Consumables for ${viewData.bill.bill_no}` : 'Bill Details'}</h3>
              <button onClick={() => setShowViewModal(false)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--color-muted)' }}>×</button>
            </div>
            <div className="modal-body">
              {viewData.viewMode !== 'consumables' && (
                <div style={{ background: 'var(--color-tint-2)', padding: 16, borderRadius: 8, marginBottom: 20 }}>
                  <div className="grid grid-cols-3 gap-3">
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
                      <div style={{ fontSize: 11, color: 'var(--color-muted)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.05em' }}>Date</div>
                      <div style={{ fontWeight: 600, marginTop: 2 }}>{viewData.bill.service_date}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--color-muted)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.05em' }}>Doctor</div>
                      <div style={{ fontWeight: 600, marginTop: 2 }}>{viewData.bill.master_doctors?.doctor_name || '-'}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--color-muted)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.05em' }}>Staff</div>
                      <div style={{ fontWeight: 600, marginTop: 2 }}>{viewData.bill.master_staff?.staff_name || '-'}</div>
                    </div>
                  </div>
                </div>
              )}

              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: 'var(--color-ink)' }}>
                {viewData.viewMode === 'consumables' ? 'Consumable Details' : 'Services & Consumable Status'}
              </div>

              {viewData.viewMode === 'consumables' ? (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--color-muted)', textTransform: 'uppercase', borderBottom: '1px solid var(--color-line)', background: 'var(--color-tint-2)' }}>Consumable Name</th>
                      <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--color-muted)', textTransform: 'uppercase', borderBottom: '1px solid var(--color-line)', background: 'var(--color-tint-2)' }}>Units</th>
                      <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--color-muted)', textTransform: 'uppercase', borderBottom: '1px solid var(--color-line)', background: 'var(--color-tint-2)' }}>Type</th>
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
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--color-muted)', textTransform: 'uppercase', borderBottom: '1px solid var(--color-line)', background: 'var(--color-tint-2)' }}>Service</th>
                      <th style={{ padding: '8px 12px', textAlign: 'center', fontSize: 11, fontWeight: 600, color: 'var(--color-muted)', textTransform: 'uppercase', borderBottom: '1px solid var(--color-line)', background: 'var(--color-tint-2)' }}>Consumable Status</th>
                      <th style={{ padding: '8px 12px', textAlign: 'center', fontSize: 11, fontWeight: 600, color: 'var(--color-muted)', textTransform: 'uppercase', borderBottom: '1px solid var(--color-line)', background: 'var(--color-tint-2)' }}>Consumables Added</th>
                      <th style={{ padding: '8px 12px', textAlign: 'center', fontSize: 11, fontWeight: 600, color: 'var(--color-muted)', textTransform: 'uppercase', borderBottom: '1px solid var(--color-line)', background: 'var(--color-tint-2)' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {billServices.map((bs) => (
                      <tr key={bs.id}>
                        <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--color-line-2)', fontSize: 13 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            {bs.consumable_completed ? (
                              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#065F46" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-8.17"/><polyline points="22 4 22 12 15.5 18.5"/></svg>
                            ) : (
                              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                            )}
                            <span>{bs.service_name}</span>
                          </div>
                        </td>
                        <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--color-line-2)', textAlign: 'center' }}>
                          {bs.consumable_completed ? getStatusBadge('Complete') : getStatusBadge('Pending')}
                        </td>
                        <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--color-line-2)', textAlign: 'center' }}>
                          {bs.consumable_completed ? (
                            <span style={{ color: '#065F46', fontWeight: 600, cursor: 'pointer', textDecoration: 'underline' }} onClick={() => handleViewConsumables(viewData.bill, bs.id, bs.service_id, bs.service_name)}>
                              View ({consumableCounts[bs.id] ?? '...'})
                            </span>
                          ) : (
                            <span style={{ color: '#991B1B' }}>0</span>
                          )}
                        </td>
                        <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--color-line-2)', textAlign: 'center' }}>
                          {bs.consumable_completed ? (
                            <button 
                              onClick={() => handleServiceConsumables(viewData.bill, bs.id, bs.service_id, bs.service_name, true)} 
                              className="btn btn-outline btn-sm"
                              style={{ border: '1px solid var(--color-primary)', color: 'var(--color-primary)' }}
                            >
                              Edit
                            </button>
                          ) : (
                            <button 
                              onClick={() => handleServiceConsumables(viewData.bill, bs.id, bs.service_id, bs.service_name, false)} 
                              className="btn btn-primary btn-sm"
                            >
                              Add Consumables
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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