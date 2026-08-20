import { useState, useEffect, useRef } from 'react';
import { supabase } from '../config/supabase';
import { useBranch } from '../context/BranchContext';
import * as stockApi from '../services/stockApi';

const NotificationBell = ({ userId }) => {
  const { branchId } = useBranch();
  const [branchName, setBranchName] = useState('');
  const [branches, setBranches] = useState([]);
  const [transferNots, setTransferNots] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showDropdown, setShowDropdown] = useState(false);
  const [closing, setClosing] = useState(false);
  const dropdownRef = useRef(null);
  const bellRef = useRef(null);

  useEffect(() => {
    const load = async () => {
      try {
        const { data, error } = await supabase.from('branches').select('id, branch_name').order('branch_name');
        if (!error && data) setBranches(data);
        const nm = localStorage.getItem('branchName') || '';
        setBranchName(nm);
      } catch (e) { console.error('NotificationBell branches:', e); }
    };
    load();
  }, []);

  const branchNameById = (id) => {
    if (id === null || id === undefined || id === '' || Number(id) === 0) return 'Corporate Warehouse';
    const b = branches.find(x => String(x.id) === String(id));
    return b ? b.branch_name : `Branch ${id}`;
  };

  useEffect(() => {
    if (!userId) return;
    const checkSessionConflicts = async () => {
      const sessionToken = localStorage.getItem('sessionToken');
      if (!sessionToken) return;
      // MIS direct login tokens start with 'mis_' - these are NOT stored in the DB,
      // they are direct/offline tokens that are always valid until logout.
      if (sessionToken.startsWith('mis_')) return;
      const { data: session, error } = await supabase
        .from('user_sessions')
        .select('is_active, logout_time')
        .eq('session_token', sessionToken)
        .maybeSingle();
      if (session && !session.is_active) {
        // Dispatch event so AppContent can show the conflict modal
        window.dispatchEvent(new Event('session-conflict'));
      }
    };
    const interval = setInterval(checkSessionConflicts, 30000);
    const handleFocus = () => checkSessionConflicts();
    window.addEventListener('focus', handleFocus);
    checkSessionConflicts();
    return () => { clearInterval(interval); window.removeEventListener('focus', handleFocus); };
  }, [userId]);

  useEffect(() => {
    if (!branchId) return;
    const load = async () => {
      const incoming = await stockApi.getIncomingTransfers(branchId);
      setTransferNots(incoming || []);
      setUnreadCount(await stockApi.getUnreadTransferNotificationCount(branchId));
    };
    load();
    const interval = setInterval(load, 30000);
    const handleFocus = () => load();
    window.addEventListener('focus', handleFocus);
    return () => { clearInterval(interval); window.removeEventListener('focus', handleFocus); };
  }, [branchId]);

  const hasTransferNot = unreadCount > 0 || transferNots.length > 0;

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        if (bellRef.current && bellRef.current.contains(event.target)) return;
        closeDropdown();
      }
    };
    if (showDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showDropdown]);

  const closeDropdown = () => {
    setClosing(true);
    setTimeout(() => {
      setShowDropdown(false);
      setClosing(false);
    }, 200);
  };

  const handleConfirmReceive = async (transfer) => {
    const result = await stockApi.receiveTransfer(transfer.id, branchName || 'Branch User');
    if (result.success) {
      const incoming = await stockApi.getIncomingTransfers(branchId);
      setTransferNots(incoming || []);
      setUnreadCount(await stockApi.getUnreadTransferNotificationCount(branchId));
      alert('Transfer received successfully!');
    } else {
      alert(result.message || 'Failed to receive transfer');
    }
  };

  const markAllRead = async () => {
    await stockApi.markTransferNotificationsRead(branchId);
    setUnreadCount(0);
    setTransferNots(await stockApi.getIncomingTransfers(branchId));
  };

  const getPositionStyle = () => {
    if (!bellRef.current) return { top: '60px', left: '12px' };
    const rect = bellRef.current.getBoundingClientRect();
    return {
      top: `${rect.bottom + 8}px`,
      left: `${rect.left}px`,
    };
  };

  return (
    <div className="sidebar-notification-area" ref={bellRef}>
      <div className="notif-bell-wrapper" onClick={() => setShowDropdown(!showDropdown)}>
        <button className="notif-bell-btn" title="Notifications">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
          {hasTransferNot && (
            <span className="notif-badge">
              {unreadCount > 0 ? unreadCount : transferNots.length}
            </span>
          )}
        </button>
      </div>

      {showDropdown && (
        <div
          ref={dropdownRef}
          className={`notif-panel ${closing ? 'closing' : ''}`}
          style={getPositionStyle()}
        >
          <div className="notif-panel-header">
            <h3 className="notif-panel-title">Stock Transfer Notifications</h3>
            {transferNots.length > 0 && (
              <button onClick={markAllRead} className="notif-panel-mark-read">
                Mark All Read
              </button>
            )}
          </div>

          <div className="notif-panel-body">
            {transferNots.length > 0 ? (
              transferNots.map((t) => (
                <div key={t.id} className="notif-card">
                  <div className="notif-card-title">Stock Transfer Request</div>
                  <div className="notif-card-details">
                    <div className="notif-card-row">
                      <span className="notif-card-row-label">Product</span>
                      <span className="notif-card-row-value">{t.product_name}</span>
                    </div>
                    <div className="notif-card-row">
                      <span className="notif-card-row-label">Qty</span>
                      <span className="notif-card-row-value">{t.quantity} Units</span>
                    </div>
                    <div className="notif-card-row">
                      <span className="notif-card-row-label">From</span>
                      <span className="notif-card-row-value">{branchNameById(t.from_branch_id)}</span>
                    </div>
                    <div className="notif-card-row">
                      <span className="notif-card-row-label">To</span>
                      <span className="notif-card-row-value">{branchNameById(t.to_branch_id)}</span>
                    </div>
                    <div className="notif-card-row">
                      <span className="notif-card-row-label">Status</span>
                      <span className={`status-chip ${t.status === 'Received' ? 'received' : 'pending'}`}>
                        {t.status || 'Pending'}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleConfirmReceive(t)}
                    className="notif-confirm-btn"
                  >
                    Confirm Receipt
                  </button>
                </div>
              ))
            ) : (
              <div className="notif-empty">
                <div className="notif-empty-icon">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                  </svg>
                </div>
                <div className="notif-empty-title">No pending stock transfers</div>
                <div className="notif-empty-sub">All transfer requests have been handled</div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationBell;