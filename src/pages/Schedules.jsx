const Schedules = () => {
  return (
    <div className="animate-fade-in">
      <div className="control-panel">
        <div className="control-breadcrumb">
          <span>Doctor Schedules</span>
        </div>
        <div className="control-spacer"></div>
        <button className="btn">New</button>
      </div>
      <div className="content-area" style={{ padding: '16px' }}>
        <div className="card">
          <h3 className="text-lg font-semibold text-ink mb-4">Doctor Schedules</h3>
          <p className="text-muted">Per-branch weekly availability and time-off management.</p>
        </div>
      </div>
    </div>
  );
};

export default Schedules;