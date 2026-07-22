import { useState, useEffect } from 'react';
import Overview from './Overview';
import Customization from './Customization';
import NonBillableConsumables from './NonBillableConsumables';
import BillableConsumables from './BillableConsumables';
import Reports from './Reports';
import BillingLog from './BillingLog';
import AllBills from './AllBills';
import DoctorsMaster from './DoctorsMaster';
import StaffMaster from './StaffMaster';
import StockManagement from './StockManagement';
import NotificationBell from '../components/NotificationBell';
import { useBranch } from '../context/BranchContext';

const navSections = [
  {
    group: 'Main',
    items: [
      { id: 'overview', label: 'Dashboard Overview', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
      { id: 'billing-log', label: 'Billing Log', icon: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8' },
      { id: 'all-bills', label: 'Detailed Log', icon: 'M3 3h18v18H3zM3 9h18M9 21V9' },
    ]
  },
  {
    group: 'Consumables',
    items: [
      { id: 'billable', label: 'Billable Consumables', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4' },
      { id: 'non-billable', label: 'Non-Billable Consumables', icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4' },
      { id: 'stock-management', label: 'Stock Management', icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4' },
    ]
  },
  {
    group: 'Reports',
    items: [
      { id: 'reports', label: 'Branch-wise Reports', icon: 'M18 20V10M12 20V4M6 20v-6' },
    ]
  },
  {
    group: 'Settings',
    items: [
      { id: 'customization', label: 'Customization', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573-1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-1.066-2.573c-1.543.94-3.31-.826-2.37-2.37.996-.608 2.296.07 2.572-1.065z', misOnly: true },
    ]
  },
  {
    group: 'Masters',
    items: [
      { id: 'doctors-master', label: 'Doctors Master', icon: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M22 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75' },
      { id: 'staff-master', label: 'Staff Master', icon: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M23 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75' },
    ]
  }
];

const NavIcon = ({ path }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]">
    <path d={path} />
  </svg>
);

const Dashboard = ({ currentPage = 'overview', urlState, onNavigate, onLogout, onConflictLogin }) => {
  const { branchName, misMode, userId } = useBranch();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [userInfo, setUserInfo] = useState({ username: '', role: '' });

  useEffect(() => {
    const username = localStorage.getItem('username');
    const role = localStorage.getItem('userRole');
    const storedUserId = localStorage.getItem('userId');
    if (username) setUserInfo({ username, role, userId: storedUserId });
  }, []);

  const renderPage = () => {
    switch (currentPage) {
      case 'overview': return <Overview />;
      case 'billing-log': return <BillingLog onNavigate={onNavigate} />;
      case 'all-bills': return <AllBills onNavigate={onNavigate} urlState={urlState} />;
      case 'billable': return <BillableConsumables onNavigate={onNavigate} />;
      case 'non-billable': return <NonBillableConsumables />;
      case 'reports': return <Reports />;
      case 'customization': return <Customization />;
      case 'stock-management': return <StockManagement />;
      case 'doctors-master': return <DoctorsMaster />;
      case 'staff-master': return <StaffMaster />;
      default: return <Overview />;
    }
  };

  const handleConflictLogin = async () => {
    if (onConflictLogin) {
      onConflictLogin();
    }
  };

  return (
    <div className="app-container">
      <aside className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
        <div className="sidebar-header">
          <div className="sidebar-logo">A</div>
          {!sidebarCollapsed && <span className="sidebar-brand">ARMORAA</span>}
        </div>

        <nav className="sidebar-nav">
          <button 
            className="sidebar-toggle"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
              {sidebarCollapsed ? (
                <path d="M13 5l7 7-7 7M5 12h14" />
              ) : (
                <path d="M11 19l-7-7 7-7M19 12H5" />
              )}
            </svg>
          </button>

          {navSections.map((section) => {
            const visibleItems = section.items.filter(item => misMode || !item.misOnly);
            if (visibleItems.length === 0) return null;
            return (
              <div key={section.group}>
                {!sidebarCollapsed && <div className="sidebar-group">{section.group}</div>}
                {visibleItems.map((item) => {
                  const isActive = currentPage === item.id;
                  return (
                    <div
                      key={item.id}
                      onClick={() => onNavigate(item.id)}
                      className={`sidebar-item ${isActive ? 'active' : ''}`}
                      title={sidebarCollapsed ? item.label : ''}
                    >
                      <span className="sidebar-icon">
                        <NavIcon path={item.icon} />
                      </span>
                      {!sidebarCollapsed && <span className="sidebar-label">{item.label}</span>}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-footer-left">
            <NotificationBell userId={userId} onConflictLogin={handleConflictLogin} />
            <div className="sidebar-footer-avatar">AD</div>
            {!sidebarCollapsed && (
              <div className="sidebar-footer-info">
                <div className="sidebar-footer-name">
                  {userInfo.username || (misMode ? 'MIS Admin' : 'Branch User')}
                </div>
                <div className="sidebar-footer-role">
                  {misMode ? 'MIS' : userInfo.role ? `${userInfo.role} • ${branchName}` : branchName}
                </div>
              </div>
            )}
          </div>
          <button
            onClick={onLogout}
            title="Logout"
            className="logout-btn"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18.36 6.64a9 9 0 1 1-12.73 0" />
              <line x1="12" y1="2" x2="12" y2="12" />
            </svg>
          </button>
        </div>
      </aside>

      <div className="main-container">
        <div className="content-area" style={{ padding: 0 }}>
          {renderPage()}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;