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
    group: 'Reports',
    items: [
      { id: 'reports', label: 'Branch-wise Reports', icon: 'M18 20V10M12 20V4M6 20v-6' },
    ]
  },
  {
    group: 'Settings',
    items: [
      { id: 'customization', label: 'Customization', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z', misOnly: true },
    ]
  }
];

const NavIcon = ({ path }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]">
    <path d={path} />
  </svg>
);

const Dashboard = ({ currentPage = 'overview', onNavigate, onLogout }) => {
  const { branchName, misMode } = useBranch();

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
      {/* Premium Glass Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="sidebar-logo">A</div>
          <span className="sidebar-brand">ARMORAA</span>
        </div>

        <nav className="sidebar-nav">
          {navSections.map((section) => {
            const visibleItems = section.items.filter(item => misMode || !item.misOnly);
            if (visibleItems.length === 0) return null;
            return (
              <div key={section.group}>
                <div className="sidebar-group">{section.group}</div>
                {visibleItems.map((item) => {
                  const isActive = currentPage === item.id;
                  return (
                    <div
                      key={item.id}
                      onClick={() => onNavigate(item.id)}
                      className={`sidebar-item ${isActive ? 'active' : ''}`}
                      title={item.label}
                    >
                      <span className="sidebar-icon">
                        <NavIcon path={item.icon} />
                      </span>
                      <span className="flex-1">{item.label}</span>
                      {item.misOnly && (
                        <span className="text-[10px] text-violet-400/70">🔒</span>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <div className="flex items-center gap-3">
            <div className="sidebar-footer-avatar">AD</div>
            <div className="sidebar-footer-info">
              <div className="sidebar-footer-name">
                {misMode ? 'MIS Admin' : 'Branch User'}
              </div>
              <div className="sidebar-footer-role">{branchName}</div>
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
        </div>
      </aside>

      {/* Main Area */}
      <div className="main-container">
        <div className="content-area" style={{ padding: 0 }}>
          {renderPage()}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;