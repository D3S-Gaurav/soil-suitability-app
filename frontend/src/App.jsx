import { useEffect, useState } from 'react';
import './index.css';

const API_HTTP = "http://localhost:8000";

function App() {
  const [crops, setCrops] = useState([]);
  const [selectedCrop, setSelectedCrop] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [loading, setLoading] = useState(false);
  const [recommendationToggle, setRecommendationToggle] = useState(false);
  const [sensorIP, setSensorIP] = useState('');
  const [connectionStatus, setConnectionStatus] = useState(null);

  useEffect(() => {
    // Fetch crops on mount
    fetch(`${API_HTTP}/crops`)
      .then(res => res.json())
      .then(res => {
        if (res.crops && res.crops.length > 0) {
          setCrops(res.crops);
          setSelectedCrop(res.crops[0]);
        }
      })
      .catch(err => {
        console.error("Failed to fetch crops", err);
        // Do not crash fully, just let it load indefinitely or display a silent error
        setError("Could not connect to backend API.");
      });
  }, []);

  const connectToSensor = () => {
    if (!sensorIP) return;
    setLoading(true);
    setConnectionStatus(null);
    setError(null);
    
    fetch(`${API_HTTP}/sensor/connect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ip: sensorIP })
    })
      .then(res => res.json())
      .then(payload => {
        setConnectionStatus({
           status: payload.status,
           message: payload.message
        });
        
        // Try fetching evaluation data if crop is selected
        if (selectedCrop) {
           fetchEvaluation();
        } else {
           setLoading(false);
        }
      })
      .catch(err => {
        console.error("Failed to connect to sensor", err);
        setError("Failed to communicate with API to connect sensor.");
        setLoading(false);
      });
  };

  const handleRecommendationToggle = (e) => {
    const isChecked = e.target.checked;
    setRecommendationToggle(isChecked);
    
    if (isChecked) {
      window.open('https://crop-recommendation-dashboard.example.com', '_blank');
      // Reset the toggle after a short delay so it doesn't stay 'on'
      setTimeout(() => setRecommendationToggle(false), 500);
    }
  };

  const fetchEvaluation = () => {
    if (!selectedCrop) return;
    setLoading(true);
    setError(null);

    fetch(`${API_HTTP}/evaluate/${selectedCrop}`)
      .then(res => res.json())
      .then(payload => {
        if (payload.error) {
          setError(payload.error);
        } else {
          setData(payload);
          setLastUpdated(new Date().toLocaleTimeString());
        }
      })
      .catch(err => {
        console.error("Failed to fetch evaluation", err);
        setError("Failed to fetch data from the sensor.");
      })
      .finally(() => {
        setLoading(false);
      });
  };

  const handleCropChange = (e) => {
    setSelectedCrop(e.target.value);
    setData(null);
  };

  return (
    <>
      <header className="app-header">
        <div className="live-dot" title="Live WebSocket Connection Active"></div>
        <div className="header-content">
          <h1 className="app-title">SoilSense</h1>
          <span className="app-subtitle">Real-Time Soil Suitability</span>
        </div>
        <div className="header-actions">
          <div className="toggle-container">
            <span className="toggle-text">Crop Recommendations</span>
            <label className="toggle-switch">
              <input 
                type="checkbox" 
                checked={recommendationToggle}
                onChange={handleRecommendationToggle} 
              />
              <span className="slider round"></span>
            </label>
          </div>
        </div>
      </header>

      <main className="main-content">
        <div className="controls" style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
          <label htmlFor="sensorIP">Sensor IP:</label>
          <input 
            type="text" 
            id="sensorIP"
            value={sensorIP} 
            onChange={(e) => setSensorIP(e.target.value)}
            placeholder="e.g. 192.168.1.100"
            style={{
              padding: '0.6rem',
              borderRadius: '8px',
              border: '1px solid var(--border)',
              backgroundColor: 'var(--surface)',
              color: 'var(--text)',
              fontFamily: 'inherit',
              width: '200px'
            }}
          />
          <button 
            onClick={connectToSensor} 
            disabled={!sensorIP || loading}
            style={{
              padding: '0.6rem 1rem',
              backgroundColor: 'var(--primary)',
              color: 'var(--bg)',
              border: 'none',
              borderRadius: '8px',
              fontFamily: 'inherit',
              fontWeight: '600',
              cursor: (!sensorIP || loading) ? 'not-allowed' : 'pointer',
              opacity: (!sensorIP || loading) ? 0.7 : 1,
              transition: 'all 0.2s ease'
            }}
          >
            {loading ? 'Connecting...' : 'Connect Sensor'}
          </button>
          
          {connectionStatus && (
            <div style={{
              padding: '0.5rem 1rem', 
              borderRadius: '8px', 
              fontSize: '0.9rem',
              backgroundColor: connectionStatus.status === 'success' 
                ? 'rgba(40,167,69,0.1)' 
                : 'rgba(255,193,7,0.1)',
              border: `1px solid ${connectionStatus.status === 'success' ? '#28a745' : '#ffc107'}`, 
              color: connectionStatus.status === 'success' ? '#28a745' : '#ffc107'
            }}>
              {connectionStatus.message}
            </div>
          )}
        </div>

        <div className="controls" style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <label htmlFor="cropSelect">Target Crop Profile:</label>
          <select 
            id="cropSelect" 
            value={selectedCrop} 
            onChange={handleCropChange}
            disabled={crops.length === 0}
          >
            {crops.length === 0 && <option>Waiting for backend data...</option>}
            {crops.map(crop => (
              <option key={crop} value={crop}>
                {crop.charAt(0).toUpperCase() + crop.slice(1)}
              </option>
            ))}
          </select>
          <button 
            onClick={fetchEvaluation} 
            disabled={crops.length === 0 || loading}
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: 'var(--accent)',
              color: 'var(--bg)',
              border: 'none',
              borderRadius: '8px',
              fontFamily: 'inherit',
              fontWeight: '600',
              fontSize: '1rem',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.7 : 1,
              transition: 'background-color 0.2s',
            }}
          >
            {loading ? 'Fetching...' : 'Fetch Live Data'}
          </button>
        </div>

        {error ? (
          <div className="card" style={{ borderColor: 'var(--danger)', textAlign: 'center' }}>
            <h2>❌ Connection Issue</h2>
            <p>{error}</p>
            <p style={{ marginTop: '1rem', fontSize: '0.9rem', color: 'var(--muted)' }}>
              Make sure the FastAPI backend is running on http://localhost:8000
            </p>
          </div>
        ) : loading ? (
          <div className="spinner"></div>
        ) : !data ? (
          <div className="card" style={{ textAlign: 'center', padding: '3rem 2rem' }}>
            <h2 style={{ justifyContent: 'center', marginBottom: '1rem' }}>Ready to Evaluate</h2>
            <p style={{ color: 'var(--muted)' }}>Select a crop and click "Fetch Live Data" to read from the field sensors.</p>
          </div>
        ) : (
          <div className="dashboard-grid">
            
            {/* Sensor Readings Card */}
            <div className="card">
               <h2>📡 Live Sensor Readings</h2>
               {['N', 'P', 'K', 'pH'].map(param => (
                 <div className="data-row" key={param}>
                    <span className="data-label">
                      {param === 'pH' ? 'pH Level' : `${param} (mg/kg)`}
                    </span>
                    <div className="data-value">
                      {data.params[param]?.value}
                      <span className={`badge status-${data.params[param]?.status}`}>
                        {data.params[param]?.status}
                      </span>
                    </div>
                 </div>
               ))}
               <div className="data-row" style={{ marginTop: '0.8rem', border: 'none' }}>
                 <span className="data-label" style={{ fontSize: '0.85rem' }}>Raw Soil Data Interface via Arduino Serial Port</span>
               </div>
            </div>

            {/* Requirements Card */}
            <div className="card">
              <h2>🌿 {data.crop.charAt(0).toUpperCase() + data.crop.slice(1)} Requirements</h2>
              {['N', 'P', 'K', 'pH'].map(param => {
                 const req = data.params[param];
                 if (!req) return null;
                 return (
                   <div className="data-row" key={'req'+param}>
                     <span className="data-label">{param === "pH" ? "pH" : param} Range</span>
                     <div className="data-value">
                       <span>{req.required_min} &ndash; {req.required_max}</span>
                       <span className="data-sub-value">(avg {req.required_mean})</span>
                     </div>
                   </div>
                 );
              })}
              <div className="data-row" style={{ marginTop: '0.8rem', border: 'none' }}>
                 <span className="data-label" style={{ fontSize: '0.85rem' }}>Target profile based on AI Model Dataset</span>
               </div>
            </div>

            {/* Verdict Card */}
            <div className={`card verdict-card ${data.suitable ? 'suitable' : 'unsuitable'}`}>
              <div className="verdict-title">{data.verdict}</div>
              
              <div className="verdict-details">
                {!data.suitable ? (
                  <>
                    {data.issues.length > 0 && (
                      <div className="detail-section">
                        <h3 className="section-title serif">Issues Detected</h3>
                        <ul className="list-items issues">
                          {data.issues.map((i, idx) => <li key={idx}>{i}</li>)}
                        </ul>
                      </div>
                    )}
                    {data.suggestions.length > 0 && (
                      <div className="detail-section">
                        <h3 className="section-title serif">Organic Treatments</h3>
                        <ul className="list-items suggestions">
                          {data.suggestions.map((s, idx) => <li key={idx}>{s}</li>)}
                        </ul>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="detail-section" style={{ gridColumn: '1 / -1', background: 'transparent', border: 'none' }}>
                    <p className="success-message">
                      Soil conditions are within optimal range for <strong>{data.crop}</strong>. 
                      Proceed with planting!
                    </p>
                  </div>
                )}
              </div>
            </div>

          </div>
        )}

        {lastUpdated && data && (
          <div className="footer-info">
            Live Field Data Feed &bull; Last fetched at {lastUpdated}
          </div>
        )}
      </main>
    </>
  );
}

export default App;
