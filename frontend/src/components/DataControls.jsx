import { useState, useEffect } from 'react';

/**
 * DataControls — Recording toggle, download button, test name input, session info.
 * Renders as a control bar between connection hub and the dashboard grid.
 */
function DataControls({ 
  isRecording, 
  onToggleRecording, 
  onDownload, 
  recordCount, 
  sessionId, 
  testName, 
  onTestNameChange,
  sessionStart 
}) {
  const [elapsed, setElapsed] = useState(0);
  const [downloadFeedback, setDownloadFeedback] = useState(null);

  // Elapsed timer while recording
  useEffect(() => {
    let timer = null;
    if (isRecording && sessionStart) {
      timer = setInterval(() => {
        setElapsed(Math.floor((Date.now() - sessionStart.getTime()) / 1000));
      }, 1000);
    } else {
      setElapsed(0);
    }
    return () => clearInterval(timer);
  }, [isRecording, sessionStart]);

  const formatElapsed = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  const handleDownload = () => {
    const result = onDownload();
    if (result) {
      setDownloadFeedback(result);
      setTimeout(() => setDownloadFeedback(null), 4000);
    }
  };

  return (
    <div className="data-controls">
      <div className="data-controls-row">
        {/* Test Name Input */}
        <div className="data-controls-field">
          <label className="data-controls-label" htmlFor="testName">Test Name</label>
          <input
            type="text"
            id="testName"
            className="data-controls-input"
            value={testName}
            onChange={(e) => onTestNameChange(e.target.value)}
            placeholder="test1"
            disabled={isRecording}
          />
        </div>

        {/* Record Toggle */}
        <button
          className={`record-btn ${isRecording ? 'record-btn--active' : ''}`}
          onClick={onToggleRecording}
          title={isRecording ? 'Stop recording' : 'Start recording'}
        >
          <span className={`record-dot ${isRecording ? 'record-dot--active' : ''}`} />
          <span className="record-btn-text">
            {isRecording ? 'REC' : 'Record'}
          </span>
        </button>

        {/* Divider */}
        <div className="data-controls-divider" />

        {/* Download Button */}
        <button
          className="download-btn"
          onClick={handleDownload}
          disabled={recordCount === 0}
          title={recordCount === 0 ? 'No data recorded yet' : `Download ${recordCount} readings as CSV`}
        >
          <span className="download-btn-icon">📥</span>
          <span className="download-btn-text">Download CSV</span>
        </button>

        {/* Download Feedback */}
        {downloadFeedback && (
          <span className={`download-feedback ${downloadFeedback.success ? 'download-feedback--success' : 'download-feedback--error'}`}>
            {downloadFeedback.success ? `✅ Saved: ${downloadFeedback.filename}` : `❌ ${downloadFeedback.error}`}
          </span>
        )}
      </div>

      {/* Session Info Bar */}
      <div className="data-controls-info">
        <span className="data-controls-info-item">
          Session <strong>#{sessionId}</strong>
        </span>
        <span className="data-controls-info-dot">·</span>
        <span className="data-controls-info-item">
          <strong>{recordCount}</strong> readings captured
        </span>
        {isRecording && (
          <>
            <span className="data-controls-info-dot">·</span>
            <span className="data-controls-info-item data-controls-info-recording">
              ⏱ {formatElapsed(elapsed)}
            </span>
          </>
        )}
      </div>
    </div>
  );
}

export default DataControls;
