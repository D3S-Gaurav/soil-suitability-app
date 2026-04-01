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

  const [aiAnalysis, setAiAnalysis] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);

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

  const handleRecommendationToggle = (e) => {
    const isChecked = e.target.checked;
    setRecommendationToggle(isChecked);
  };

  const fetchAiAnalysis = (params) => {
    setAiLoading(true);
    const sensorData = {
      N: params.N?.value || 0,
      P: params.P?.value || 0,
      K: params.K?.value || 0,
      pH: params.pH?.value || 7,
      moisture: 45 // Dummy value as not in field
    };

    fetch(`${API_HTTP}/api/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sensorData),
    })
      .then(res => res.json())
      .then(res => {
        if (res.success) {
          setAiAnalysis(res.analysis);
        } else {
          console.error("AI Error:", res.error);
        }
      })
      .catch(err => console.error("Failed to fetch AI analysis", err))
      .finally(() => setAiLoading(false));
  };

  const fetchSensorData = () => {
    setLoading(true);
    setError(null);
    setAiAnalysis(null);
    setData(null);

    fetch(`${API_HTTP}/connect_sensor`)
      .then(res => res.json())
      .then(payload => {
        if (payload.error) {
          setError(payload.error);
        } else {
          // Immediately evaluate the fetched data for the selected crop
          if (selectedCrop) {
            fetchEvaluation();
          }
        }
      })
      .catch(err => {
        console.error("Failed to connect to sensor", err);
        setError("Could not connect to sensor device. Ensure it is plugged into COM3/Serial.");
      })
      .finally(() => setLoading(false));
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
          if (recommendationToggle) {
            fetchAiAnalysis(payload.params);
          }
        }
      })
      .catch(err => {
        console.error("Failed to fetch evaluation", err);
        setError("Evaluation failed after sensor read.");
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
             <span className="toggle-text">Show AI Insights</span>
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
            onClick={fetchSensorData} 
            disabled={loading}
            className="connect-btn"
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: 'var(--accent)',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontFamily: 'inherit',
              fontWeight: '600',
              fontSize: '1rem',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.7 : 1,
              transition: 'background-color 0.2s, transform 0.1s',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}
          >
            {loading ? 'Connecting...' : '🔌 Connect & Fetch Data'}
          </button>
          
          <div className="divider" style={{ width: '1px', height: '24px', background: 'var(--border)', margin: '0 0.5rem' }}></div>
          
          <label htmlFor="cropSelect">Preview Crop Suitability:</label>
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
            disabled={!data || loading}
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: 'var(--text)',
              color: 'var(--bg)',
              border: 'none',
              borderRadius: '8px',
              fontFamily: 'inherit',
              fontWeight: '600',
              fontSize: '1rem',
              cursor: (!data || loading) ? 'not-allowed' : 'pointer',
              opacity: (!data || loading) ? 0.7 : 1,
              transition: 'background-color 0.2s',
            }}
          >
            Evaluate for {selectedCrop}
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

            {/* AI Analysis Card */}
            {recommendationToggle && (
              <div className="card ai-card" style={{ gridColumn: '1 / -1', border: '1px solid var(--accent)' }}>
                <h2 style={{ color: 'var(--accent)' }}>🤖 AI Soil Analysis</h2>
                {aiLoading ? (
                   <p style={{ textAlign: 'center', padding: '1rem' }}>Analyzing soil data with Claude...</p>
                ) : aiAnalysis ? (
                   <div>
                     <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                       <div>
                         <h3 style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>Suitability Score: {aiAnalysis.suitabilityScore} ({aiAnalysis.grade})</h3>
                         <p style={{ marginBottom: '1rem' }}><strong>Confidence:</strong> {aiAnalysis.confidenceLevel}</p>
                         <h4 style={{ marginBottom: '0.5rem' }}>Nutrient Breakdown</h4>
                         <ul className="list-items" style={{ marginBottom: '1rem' }}>
                           <li><strong>Nitrogen:</strong> {aiAnalysis.nutrientAnalysis?.nitrogen}</li>
                           <li><strong>Phosphorus:</strong> {aiAnalysis.nutrientAnalysis?.phosphorus}</li>
                           <li><strong>Potassium:</strong> {aiAnalysis.nutrientAnalysis?.potassium}</li>
                         </ul>
                       </div>
                       <div>
                         <h4 style={{ marginBottom: '0.5rem' }}>Recommended Crops</h4>
                         <ul className="list-items" style={{ marginBottom: '1rem' }}>
                           {aiAnalysis.recommendedCrops?.map((c, i) => (
                             <li key={i}><strong>{c.crop}:</strong> {c.reason} (Yield: {c.expectedYield})</li>
                           ))}
                         </ul>
                       </div>
                     </div>
                     <h4 style={{ marginBottom: '0.5rem', marginTop: '1rem' }}>Summary & Actions</h4>
                     <p style={{ marginBottom: '1rem' }}>{aiAnalysis.summary}</p>
                     
                     <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                       {aiAnalysis.issuesDetected?.length > 0 && (
                         <div>
                           <h4 style={{ color: 'var(--danger)', marginBottom: '0.5rem' }}>Issues Detected</h4>
                           <ul className="list-items issues">
                             {aiAnalysis.issuesDetected.map((issue, i) => <li key={i}>{issue}</li>)}
                           </ul>
                         </div>
                       )}
                       {aiAnalysis.correctiveActions?.length > 0 && (
                         <div>
                           <h4 style={{ color: 'var(--accent)', marginBottom: '0.5rem' }}>Corrective Actions</h4>
                           <ul className="list-items suggestions">
                             {aiAnalysis.correctiveActions.map((action, i) => <li key={i}>{action.action} (Priority: {action.priority})</li>)}
                           </ul>
                         </div>
                       )}
                     </div>
                   </div>
                ) : (
                   <p style={{ textAlign: 'center', padding: '1rem' }}>Waiting for data to analyze...</p>
                )}
              </div>
            )}

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
