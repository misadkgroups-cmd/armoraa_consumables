import { useState } from 'react';
import Overview from './Overview';
import Customization from './Customization';
import NonBillableConsumables from './NonBillableConsumables';
import BillableConsumables from './BillableConsumables';
import Reports from './Reports';
import { useBranch } from '../context/BranchContext';

const navSections = [
  {
    group: 'Main',
    items: [
      { id: 'overview', label: 'Dashboard Overview', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
    ]
  },
  {
    group: 'Consumables',
    items: [
      { id: 'billable', label: 'Billable Consumables', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4' },
      { id: 'non-billable', label: 'Non-Billable Consumables', icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4' },
    ]
  },
  {
    group: 'Analytics',
    items: [
      { id: 'reports', label: 'Reports', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
    ]
  },
  {
    group: 'Settings',
    items: [
      { id: 'customization', label: 'Customization', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z' },
    ]
  }
];

const NavIcon = ({ path }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <path d={path} />
  </svg>
);

const Dashboard = ({ currentPage = 'overview', onNavigate, onLogout }) => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { branchName } = useBranch();

  const renderPage = () => {
    switch (currentPage) {
      case 'overview': return <Overview />;
      case 'billable': return <BillableConsumables />;
      case 'non-billable': return <NonBillableConsumables />;
      case 'reports': return <Reports />;
      case 'customization': return <Customization />;
      default: return <Overview />;
    }
  };

  const getPageLabel = () => {
    for (const section of navSections) {
      const found = section.items.find(i => i.id === currentPage);
      if (found) return found.label;
    }
    return 'Dashboard';
  };

  return (
    <div className="app-container">
      {/* Premium Sidebar */}
      <aside className="sidebar" style={{ width: sidebarCollapsed ? '72px' : '240px' }}>
        <div className="sidebar-header">
          <div className="sidebar-logo">A</div>
          {!sidebarCollapsed && <span className="sidebar-brand">ARMORAA</span>}
        </div>
        
        <nav className="sidebar-nav">
          {navSections.map((section) => (
            <div key={section.group}>
              {!sidebarCollapsed && <div className="sidebar-group">{section.group}</div>}
              {section.items.map((item) => {
                const isActive = currentPage === item.id;
                return (
                  <div
                    key={item.id}
                    onClick={() => onNavigate(item.id)}
                    className={`sidebar-item ${isActive ? 'active' : ''}`}
                    title={sidebarCollapsed ? item.label : undefined}
                  >
                    <span className="sidebar-icon">
                      <NavIcon path={item.icon} />
                    </span>
                    {!sidebarCollapsed && (
                      <>
                        <span className="flex-1">{item.label}</span>
                        {item.badge && <span className="sidebar-pill">{item.badge}</span>}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-footer-avatar">AD</div>
          {!sidebarCollapsed && (
            <div className="sidebar-footer-info">
              <div className="sidebar-footer-name">Admin</div>
              <div className="sidebar-footer-role">{branchName}</div>
            </div>
          )}
        </div>
      </aside>

      {/* Main Area */}
      <div className="main-container">
        {/* Premium Top Navbar */}
        <div className="topnav">
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="topnav-btn"
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>

          <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--color-ink)' }}>
            {getPageLabel()}
          </div>

          <div className="topnav-search">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input type="text" placeholder="Search anything..." />
          </div>

          <div className="topnav-branch">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
            <span>{branchName} Branch</span>
          </div>

          <div className="topnav-actions">
            <button className="topnav-btn" title="Notifications">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>
              <span className="badge">3</span>
            </button>
          </div>

          <div className="topnav-user" onClick={onLogout} title="Logout">
            <div className="topnav-user-avatar">AD</div>
            <span className="topnav-user-name">Admin</span>
          </div>
        </div>

        {/* Content Area */}
        <div className="content-area">
          {renderPage()}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;