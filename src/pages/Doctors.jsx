const Doctors = () => {
  return (
    <div className="animate-fade-in">
      <div className="control-panel">
        <div className="control-breadcrumb">
          <span className="control-crumb">Contacts</span>
          <span className="control-separator">/</span>
          <span>Doctors</span>
        </div>
        <div className="control-spacer"></div>
        <button className="btn">New</button>
      </div>
      <div className="content-area" style={{ padding: '16px' }}>
        <div className="card">
          <h3 className="text-lg font-semibold text-ink mb-4">Doctors</h3>
          <p className="text-muted">Doctor profiles with branches, schedules, and availability.</p>
        </div>
      </div>
    </div>
  );
};

export default Doctors;