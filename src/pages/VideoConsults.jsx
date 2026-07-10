const VideoConsults = () => {
  return (
    <div className="animate-fade-in">
      <div className="control-panel">
        <div className="control-breadcrumb">
          <span>Video Consults</span>
        </div>
        <div className="control-spacer"></div>
        <button className="btn">New</button>
      </div>
      <div className="content-area" style={{ padding: '16px' }}>
        <div className="card">
          <h3 className="text-lg font-semibold text-ink mb-4">Video Consults</h3>
          <p className="text-muted">Secure video consultation rooms and join links.</p>
        </div>
      </div>
    </div>
  );
};

export default VideoConsults;