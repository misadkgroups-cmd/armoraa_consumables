const Patients = () => {
  return (
    <div className="animate-fade-in">
      <div className="control-panel">
        <div className="control-breadcrumb">
          <span className="control-crumb">Contacts</span>
          <span className="control-separator">/</span>
          <span>Patients</span>
        </div>
        <div className="control-spacer"></div>
        <button className="btn">New</button>
      </div>
      <div className="card" style={{ margin: '16px 16px 0', background: 'linear-gradient(100deg, #564fa0, #8E5ADA)', color: '#fff', borderRadius: '6px', padding: '12px 16px', fontSize: '12.5px' }}>
        📊 <div><b>Patients</b> · Every patient, with appointments, loyalty, packages and lifetime value at a glance.</div>
      </div>
      <div className="content-area" style={{ padding: '16px' }}>
        <div className="card">
          <h3 className="text-lg font-semibold text-ink mb-4">Patients</h3>
          <p className="text-muted">Patient management with complete history and records.</p>
        </div>
      </div>
    </div>
  );
};

export default Patients;