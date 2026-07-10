const Appointments = () => {
  return (
    <div className="animate-fade-in">
      {/* Control Panel */}
      <div className="control-panel">
        <div className="control-breadcrumb">
          <span className="control-crumb">Appointments</span>
        </div>
        <div className="control-spacer"></div>
        <button className="btn">New</button>
      </div>

      {/* Info Banner */}
      <div className="card" style={{ margin: '16px 16px 0', background: 'linear-gradient(100deg, #564fa0, #8E5ADA)', color: '#fff', borderRadius: '6px', padding: '12px 16px', fontSize: '12.5px' }}>
        📊 <div><b>Appointments</b> · Calendar and list views with front-desk queue management.</div>
      </div>

      {/* Content */}
      <div className="content-area" style={{ padding: '16px' }}>
        <div className="card">
          <h3 className="text-lg font-semibold text-ink mb-4">Appointments</h3>
          <p className="text-muted">Calendar and list views with front-desk queue management.</p>
        </div>
      </div>
    </div>
  );
};

export default Appointments;