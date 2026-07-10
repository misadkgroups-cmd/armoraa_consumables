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
      { id: 'billable', label: 'Billable Consumables', icon: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2 14 8 20 8 M16 13H8 M16 17H8 M10 9 9 9 8 9' },
      { id: 'non-billable', label: 'Non-Billable Consumables', icon: 'M1 3h15v13H1z M16 8l4 0 3 3v5H16V8z M5.5 18.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z M18.5 18.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z' },
    ]
  },
  {
    group: 'Reports',
    items: [
      { id: 'reports', label: 'Reports', icon: 'M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
    ]
  },
  {
    group: 'Settings',
    items: [
      { id: 'customization', label: 'Customization', icon: 'M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.64l-1.92-3.32c-.12-.22-.39-.29-.61-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.49-.41h-3.84c-.24 0-.44.17-.49.41l-.36 2.54c-.59.24-1.12.57-1.62.94l-2.39-.96c-.23-.08-.49 0-.61.22L2.74 8.87c-.12.22-.07.49.12.64l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.64l1.92 3.32c.12.22.39.29.61.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.25.41.49.41h3.84c.24 0 .44-.17.49-.41l.36-2.54c.59-.24 1.12-.57 1.62-.94l2.39.96c.23.08.49 0 .61-.22l1.92-3.32c.12-.22.07-.49-.12-.64l-2.03-1.58zM12 15c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3z' },
    ]
  }
];

const NavIcon = ({ path }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <path d={path} />
  </svg>
);

const Dashboard = ({ currentPage = 'overview', onNavigate, onLogout }) => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { branchName, switchBranch } = useBranch();

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

  return (
    <div className="app-container">
      {/* ===== LEFT SIDEBAR ===== */}
      <aside className={`sidebar ${sidebarCollapsed ? 'w-[72px]' : 'w-[218px]'}`}>
        <div className="sidebar-home">
          <div className="sidebar-logo">A</div>
          {!sidebarCollapsed && <span className="sidebar-brand">ARMORAA</span>}
        </div>
        
        <nav className="sidebar-nav">
          {navSections.map((section) => (
            <div key={section.group}>
              {!sidebarCollapsed && <div className="sidebar-group">{section.group}</div>}
              {section.items.map((item) => {
                const isActive = currentPage === item.id || (currentPage === 'queue' && item.id === 'queue') || (currentPage === 'appointments' && item.id === 'appointments');
                return (
                  <div
                    key={item.id}
                    onClick={() => onNavigate(item.id)}
                    className={`sidebar-item ${isActive ? 'active' : ''}`}
                  >
                    <span className={`sidebar-icon ${isActive ? 'text-white' : ''}`}>
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
          {!sidebarCollapsed && 'ARMORAA CLINIC SUITE · ODOO 18 CE'}
        </div>
      </aside>

      {/* ===== MAIN AREA ===== */}
      <div className="main-container">
        {/* Top Navigation */}
        <div className="topnav">
          <div className="topnav-apps">▦</div>
          <div className="topnav-appname">
            {navSections.find(s => s.items.find(i => i.id === currentPage))?.items.find(i => i.id === currentPage)?.label || 'Dashboard'}
          </div>
          <div className="topnav-menu" style={{marginLeft: '20px', display: 'flex', alignItems: 'center'}}>
            <span style={{fontSize: '12px', opacity: 0.9, color: '#fff'}}>{branchName} Branch</span>
          </div>
          <div className="topnav-menu">
            {currentPage === 'appointments' || currentPage === 'queue' ? (
              <>
                <div className="topnav-menu-item">Appointments
                  <div className="dropdown">
                    <div className="dropdown-header">Operations</div>
                    <div className="dropdown-item" onClick={() => onNavigate('appointments')}>Calendar</div>
                    <div className="dropdown-item" onClick={() => onNavigate('queue')}>Front-Desk Queue</div>
                    <div className="dropdown-item" onClick={() => onNavigate('queue')}>Video Consults</div>
                    <div className="dropdown-divider"></div>
                    <div className="dropdown-header">Schedule</div>
                    <div className="dropdown-item" onClick={() => onNavigate('schedules')}>Doctor Schedules</div>
                  </div>
                </div>
                <div className="topnav-menu-item">Clinical
                  <div className="dropdown">
                    <div className="dropdown-item" onClick={() => onNavigate('prescriptions')}>Prescriptions</div>
                    <div className="dropdown-item" onClick={() => onNavigate('lab_orders')}>Lab Orders</div>
                    <div className="dropdown-item" onClick={() => onNavigate('services')}>Services & Packages</div>
                  </div>
                </div>
              </>
            ) : null}
          </div>
          <div className="topnav-systray">
            <div style={{position: 'relative'}}>
              <div className="topnav-avatar" style={{cursor: 'pointer', fontWeight: 600, background: '#fff', color: '#6F68B6'}} onClick={() => {
                const dd = document.getElementById('userDropdown');
                dd.style.display = dd.style.display === 'none' ? 'block' : 'none';
              }}>FD</div>
              <div className="dropdown" id="userDropdown" style={{top: '36px', right: '0', left: 'auto', minWidth: '180px', display: 'none', position: 'absolute', zIndex: 1000}}>
                <div className="dropdown-item" style={{cursor: 'pointer', fontWeight: 500}} onClick={() => {
                  document.getElementById('userDropdown').style.display = 'none';
                  if (onLogout) onLogout();
                }}>Logout</div>
              </div>
            </div>
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