import { useEffect, useState, useRef, useCallback } from 'react';
import '../../index.css';
import './Dashboard.css';

// Modular components
import DisconnectButton from '../../components/DisconnectButton';
import WeatherWidget from '../../components/WeatherWidget';
import LightSensor from '../../components/LightSensor';
import BarometricPressure from '../../components/BarometricPressure';
import DataControls from '../../components/DataControls';
import { safe, hasValue } from '../../utils/sensorHelpers';
import { flattenSensorReading, exportToCSV } from '../../utils/excelExport';

const API_HTTP = import.meta.env.VITE_API_URL || "http://localhost:8000";

function Dashboard() {
  const [crops, setCrops] = useState([]);
  const [selectedCrop, setSelectedCrop] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [loading, setLoading] = useState(false);
  const [recommendationToggle, setRecommendationToggle] = useState(false);
  const [sensorIP, setSensorIP] = useState('');
  const [connectionStatus, setConnectionStatus] = useState(null);
  const [liveMode, setLiveMode] = useState(false);
  const [isConnected, setIsConnected] = useState(false);

  // ── Data Recording States ──
  const [isRecording, setIsRecording] = useState(false);
  const [recordedData, setRecordedData] = useState([]);
  const [sessionInfo, setSessionInfo] = useState({ id: 1, name: 'test1', startTime: null });
  
  // Ref so the polling interval always sees current recording state
  const isRecordingRef = useRef(false);
  const sessionInfoRef = useRef(sessionInfo);
  useEffect(() => { isRecordingRef.current = isRecording; }, [isRecording]);
  useEffect(() => { sessionInfoRef.current = sessionInfo; }, [sessionInfo]);

  const [aiAnalysis, setAiAnalysis] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);

  // ── Gemini Webhook States ──
  const [webhookFile, setWebhookFile] = useState(null);
  const [webhookResult, setWebhookResult] = useState(null);
  const [webhookLoading, setWebhookLoading] = useState(false);

  useEffect(() => {
    let interval = null;
    if (liveMode) {
      interval = setInterval(() => {
        fetch(`${API_HTTP}/sensor`)
          .then(res => res.json())
          .then(res => {
             // ── Recording hook: capture data if recording is ON ──
             if (isRecordingRef.current) {
               const row = flattenSensorReading(res, sessionInfoRef.current.id, sessionInfoRef.current.name);
               setRecordedData(prev => [...prev, row]);
             }

             if (data) {
                setData(prev => {
                   if (!prev) return prev;
                   const updatedParams = { ...prev.params };
                   ['N', 'P', 'K', 'pH'].forEach(p => {
                      if (res[p] !== undefined) updatedParams[p] = { ...updatedParams[p], value: res[p] };
                   });
                   return { ...prev, params: updatedParams, sensor_raw: res };
                });
             } else {
                setData(prev => ({ 
                   crop: prev?.crop || '', 
                   params: prev?.params || {},
                   sensor_raw: res,
                   suitable: prev?.suitable || false,
                   verdict: prev?.verdict || '',
                   issues: prev?.issues || [],
                   suggestions: prev?.suggestions || []
                }));
             }
          })
          .catch(err => console.error("Live fetch error", err));
      }, 500);
    } else {
      clearInterval(interval);
    }
    return () => clearInterval(interval);
  }, [liveMode, data]);

  useEffect(() => {
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
           message: payload.message,
           raw: payload.raw_data
        });
        setIsConnected(payload.status === 'success');
        
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

  const handleDisconnect = (message) => {
    setIsConnected(false);
    setConnectionStatus({ status: 'disconnected', message: message });
    setData(null);
    setLiveMode(false);
    setLastUpdated(null);
  };

  const checkConnection = () => {
    setLoading(true);
    setConnectionStatus(null);
    setError(null);
    
    fetch(`${API_HTTP}/sensor/status`)
      .then(res => res.json())
      .then(payload => {
        setConnectionStatus({
           status: payload.status,
           message: payload.message,
           raw: payload.raw_data
        });
        setIsConnected(payload.status === 'success');
      })
      .catch(err => {
        console.error("Failed to check sensor status", err);
        setError("Error contacting the backend API.");
      })
      .finally(() => setLoading(false));
  };

  const handleRecommendationToggle = (e) => {
    const isChecked = e.target.checked;
    setRecommendationToggle(isChecked);
    // When toggled ON: if we already have sensor data, immediately fire Gemini Webhook
    if (isChecked && data?.sensor_raw) {
      triggerGeminiInsights(data.sensor_raw);
    }
  };

  // Trigger Gemini webhook with current live sensor data (auto-generates a CSV internally)
  const triggerGeminiInsights = (sensorRaw) => {
    setWebhookLoading(true);
    setWebhookResult(null);

    // Build a minimal CSV from live sensor data
    const headers = 'N,P,K,pH,moisture';
    const values = [
      sensorRaw?.N ?? 'NA',
      sensorRaw?.P ?? 'NA',
      sensorRaw?.K ?? 'NA',
      sensorRaw?.pH ?? 'NA',
      sensorRaw?.moisture ?? 'NA'
    ].join(',');
    const csvContent = `${headers}\n${values}`;
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const file = new File([blob], 'live_sensor.csv', { type: 'text/csv' });

    const formData = new FormData();
    formData.append('crop_type', selectedCrop || 'unknown');
    formData.append('file', file);

    fetch(`${API_HTTP}/webhook/analyze-soil`, {
      method: 'POST',
      body: formData,
    })
      .then(res => res.json())
      .then(res => {
        if (res.status === 'success') {
          setWebhookResult(res.ai_verdict);
        } else {
          setWebhookResult(`Gemini Error: ${res.message}`);
        }
      })
      .catch(err => setWebhookResult(`Network Error: ${err.message}`))
      .finally(() => setWebhookLoading(false));
  };

  const fetchAiAnalysis = (params) => {
    setAiLoading(true);
    const sensorData = {
      N: params.N?.value || 0,
      P: params.P?.value || 0,
      K: params.K?.value || 0,
      pH: params.pH?.value || 7,
      moisture: 45
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

  const handleWebhookSubmit = (e) => {
    e.preventDefault();
    if (!webhookFile || !selectedCrop) return;
    setWebhookLoading(true);
    setWebhookResult(null);

    const formData = new FormData();
    formData.append("crop_type", selectedCrop);
    formData.append("file", webhookFile);

    fetch(`${API_HTTP}/webhook/analyze-soil`, {
      method: "POST",
      body: formData,
    })
      .then(res => res.json())
      .then(res => {
        if (res.status === "success") {
          setWebhookResult(res.ai_verdict);
        } else {
          setWebhookResult(`Error: ${res.message}`);
        }
      })
      .catch(err => {
        setWebhookResult(`Error uploading file: ${err.message}`);
      })
      .finally(() => setWebhookLoading(false));
  };

  const fetchSensorData = () => {
    setLoading(true);
    setError(null);
    setAiAnalysis(null);
    setData(null);

    const url = sensorIP 
      ? `${API_HTTP}/connect_sensor?ip=${encodeURIComponent(sensorIP)}`
      : `${API_HTTP}/connect_sensor`;

    fetch(url)
      .then(res => {
        if (!res.ok) {
           return res.json().then(err => { throw new Error(err.error || "Connection Failed") });
        }
        return res.json();
      })
      .then(payload => {
        if (payload.error) {
          setError(payload.error);
        } else {
          setIsConnected(true);
          if (sensorIP) {
             checkConnection();
          }
          
          if (selectedCrop) {
            fetchEvaluation();
          }
        }
      })
      .catch(err => {
        console.error("Failed to connect to sensor", err);
        setError(`Connection Status: ${err.message}. Please check if the sensor IP is correct and accessible.`);
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

  // ── Recording Controls ──
  const handleToggleRecording = useCallback(() => {
    if (!isRecording) {
      // Starting a new recording session
      setSessionInfo(prev => ({
        ...prev,
        id: prev.startTime ? prev.id + 1 : prev.id, // increment only if a previous session existed
        startTime: new Date()
      }));
    }
    setIsRecording(prev => !prev);
  }, [isRecording]);

  const handleDownload = useCallback(() => {
    return exportToCSV(recordedData, sessionInfo.name, sessionInfo.startTime);
  }, [recordedData, sessionInfo]);

  const handleTestNameChange = useCallback((name) => {
    setSessionInfo(prev => ({ ...prev, name: name || 'test' }));
  }, []);

  return (
    <>
      <header className="app-header">
        <div className="live-dot" title="Live WebSocket Connection Active"></div>
        <div className="header-content">
          <h1 className="app-title">SoilSense</h1>
          <span className="app-subtitle">Real-Time Soil Suitability</span>
        </div>
        <div className="header-actions">
           <DisconnectButton 
              isConnected={isConnected} 
              apiBase={API_HTTP} 
              onDisconnect={handleDisconnect}
           />
           
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
           
           <div className="toggle-container" style={{ borderColor: liveMode ? 'var(--accent)' : 'var(--border)' }}>
             <span className="toggle-text" style={{ color: liveMode ? 'var(--accent)' : 'var(--muted)' }}>📡 Live Polling</span>
             <label className="toggle-switch">
               <input 
                 type="checkbox" 
                 checked={liveMode}
                 onChange={(e) => setLiveMode(e.target.checked)} 
               />
               <span className="slider round"></span>
             </label>
           </div>
         </div>
      </header>

      <main className="main-content">
        {/* Connection Hub */}
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
            {loading ? 'Validating...' : 'Connect Sensor'}
          </button>
          
          <button 
            onClick={checkConnection} 
            disabled={loading}
            style={{
              padding: '0.6rem 1rem',
              backgroundColor: 'var(--secondary)',
              color: 'var(--text)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              fontFamily: 'inherit',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.7 : 1,
              transition: 'all 0.2s ease'
            }}
          >
            Check Status
          </button>
          
          {connectionStatus && (
            <div className={`connection-status-badge connection-status-badge--${connectionStatus.status}`}>
              <span className="connection-status-dot" />
              <div className="connection-status-text">
                <strong>
                  {connectionStatus.status === 'success' ? 'Connected' : 
                   connectionStatus.status === 'disconnected' ? 'Disconnected' : 'Connection Hub'}
                </strong>
                <span>{connectionStatus.message}</span>
              </div>
            </div>
          )}
        </div>

        {/* Crop Selection & Fetch */}
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
          
          <label htmlFor="cropSelectPreview">Preview Crop Suitability:</label>
          <select 
            id="cropSelectPreview" 
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

        {/* ── Data Recording Controls ── */}
        <DataControls
          isRecording={isRecording}
          onToggleRecording={handleToggleRecording}
          onDownload={handleDownload}
          recordCount={recordedData.length}
          sessionId={sessionInfo.id}
          testName={sessionInfo.name}
          onTestNameChange={handleTestNameChange}
          sessionStart={sessionInfo.startTime}
        />

        {error ? (
          <div className="card" style={{ borderColor: 'var(--danger)', textAlign: 'center' }}>
            <h2>❌ Connection Issue</h2>
            <p>{error}</p>
            <p style={{ marginTop: '1rem', fontSize: '0.9rem', color: 'var(--muted)' }}>
              Note: The physical sensor must be on the same local network as the backend. For cloud deployments, use the CSV Upload feature below to analyze historical data with Gemini AI.
            </p>
          </div>
        ) : loading ? (
          <div className="spinner"></div>
        ) : !data ? (
          <div className="card" style={{ textAlign: 'center', padding: '3rem 2rem' }}>
            <h2 style={{ justifyContent: 'center', marginBottom: '1rem' }}>Ready to Evaluate</h2>
            <p style={{ color: 'var(--muted)' }}>Enter the sensor IP above, click <strong>"Connect Sensor"</strong> and then <strong>"Connect &amp; Fetch Data"</strong> to read live field data.</p>
            <p style={{ color: 'var(--muted)', marginTop: '0.5rem', fontSize: '0.85rem' }}>All dashboard cards will show <strong>NA</strong> until the sensor is physically connected and returning data.</p>
          </div>
        ) : (
          <div className="dashboard-grid">
            
            {/* ── NEW: Environmental Sensor Cards ── */}
            <WeatherWidget sensorRaw={data.sensor_raw} isConnected={isConnected} />
            <LightSensor sensorRaw={data.sensor_raw} isConnected={isConnected} />
            <BarometricPressure sensorRaw={data.sensor_raw} isConnected={isConnected} />

            {/* Soil NPK Readings Card */}
            <div className="card">
               <h2>🧪 Soil NPK Readings</h2>
                {['N', 'P', 'K', 'pH'].map(param => (
                  <div className="data-row" key={param}>
                     <span className="data-label">
                       {param === 'pH' ? 'pH Level' : `${param} (mg/kg)`}
                     </span>
                     <div className="data-value">
                       <span className={!hasValue(data.params[param]?.value) ? 'na-value' : ''}>
                         {safe(data.params[param]?.value)}
                       </span>
                       {hasValue(data.params[param]?.value) && (
                         <span className={`badge status-${data.params[param]?.status}`}>
                           {data.params[param]?.status}
                         </span>
                       )}
                     </div>
                  </div>
                ))}
               <div className="data-row" style={{ marginTop: '0.8rem', border: 'none', flexDirection: 'column', alignItems: 'flex-start' }}>
                 <span className="data-label" style={{ fontSize: '0.85rem' }}>Raw Soil Data Interface via Wi-Fi</span>
                 <pre style={{ 
                   fontSize: '0.7rem', 
                   background: 'rgba(0,0,0,0.3)', 
                   padding: '0.5rem', 
                   borderRadius: '4px', 
                   width: '100%',
                   marginTop: '0.5rem',
                   maxHeight: '100px',
                   overflow: 'auto',
                   color: 'var(--accent2)'
                 }}>
                   {connectionStatus?.raw ? JSON.stringify(connectionStatus.raw, null, 2) : 'No raw data captured yet.'}
                 </pre>
               </div>
            </div>

            {/* Soil Moisture Card */}
            <div className="card">
              <h2>💧 Soil Moisture</h2>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '1rem 0' }}>
                <div style={{
                  fontSize: '3.5rem',
                  lineHeight: 1,
                  marginBottom: '0.5rem',
                  filter: !hasValue(data?.sensor_raw?.moisture) ? 'grayscale(1) opacity(0.4)' : 'none'
                }}>
                  {(() => {
                    const m = data?.sensor_raw?.moisture;
                    if (!hasValue(m)) return '🌵';
                    if (m < 20) return '🌵';
                    if (m < 40) return '🌱';
                    if (m < 65) return '💧';
                    return '🌊';
                  })()}
                </div>
                <div style={{ fontSize: '2.2rem', fontWeight: '700', color: 'var(--accent)' }}>
                  {hasValue(data?.sensor_raw?.moisture) ? `${safe(data.sensor_raw.moisture)}%` : 'NA'}
                </div>
                <div style={{ fontSize: '0.85rem', color: 'var(--muted)', marginTop: '0.25rem' }}>
                  {(() => {
                    const m = data?.sensor_raw?.moisture;
                    if (!hasValue(m)) return 'Sensor not connected';
                    if (m < 20) return '🔴 Very Dry — Irrigate immediately';
                    if (m < 40) return '🟡 Dry — Irrigation recommended';
                    if (m < 65) return '🟢 Optimal — Good moisture level';
                    return '🔵 Saturated — Drainage may be needed';
                  })()}
                </div>
              </div>
              <div className="data-row" style={{ marginTop: '0.5rem' }}>
                <span className="data-label">Optimal Range</span>
                <span>40% – 65%</span>
              </div>
            </div>

            <div className="card">
              <h2>🌿 {data.crop ? data.crop.charAt(0).toUpperCase() + data.crop.slice(1) : 'Crop'} Requirements</h2>
              {['N', 'P', 'K', 'pH'].map(param => {
                 const req = data.params[param];
                 if (!req) return null;
                 return (
                   <div className="data-row" key={'req'+param}>
                     <span className="data-label">{param === "pH" ? "pH" : param} Range</span>
                     <div className="data-value">
                       <span>{safe(req.required_min)} &ndash; {safe(req.required_max)}</span>
                       <span className="data-sub-value">(avg {safe(req.required_mean)})</span>
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
                    {data.issues && data.issues.length > 0 && (
                      <div className="detail-section">
                        <h3 className="section-title serif">Issues Detected</h3>
                        <ul className="list-items issues">
                          {data.issues.map((i, idx) => <li key={idx}>{i}</li>)}
                        </ul>
                      </div>
                    )}
                    {data.suggestions && data.suggestions.length > 0 && (
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

            {/* AI Insights Card — powered by Gemini Webhook */}
            {recommendationToggle && (
              <div className="card ai-card" style={{ gridColumn: '1 / -1', border: '1px solid var(--accent)' }}>
                <h2 style={{ color: 'var(--accent)' }}>✨ Gemini AI Soil Insights</h2>
                {webhookLoading ? (
                  <p style={{ textAlign: 'center', padding: '1rem' }}>🤖 Gemini is analyzing your live sensor data...</p>
                ) : webhookResult ? (
                  <div style={{ marginTop: '0.5rem', padding: '1rem', background: 'var(--bg)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                    <pre style={{
                      whiteSpace: 'pre-wrap',
                      fontFamily: 'inherit',
                      fontSize: '0.95rem',
                      color: 'var(--text)',
                      lineHeight: 1.7
                    }}>
                      {webhookResult}
                    </pre>
                  </div>
                ) : (
                  <p style={{ textAlign: 'center', padding: '1rem', color: 'var(--muted)' }}>
                    Toggle "Show AI Insights" when sensor data is connected to get a Gemini analysis.
                  </p>
                )}
              </div>
            )}

          </div>
        )}

        {/* ── Advanced AI Webhook Upload ── */}
        <div className="card" style={{ marginTop: '2rem', border: '1px solid var(--accent)' }}>
          <h2 style={{ color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
            ✨ Upload CSV Data (Gemini Webhook)
          </h2>
          <p style={{ color: 'var(--muted)', marginBottom: '1rem', fontSize: '0.9rem' }}>
             Have historical soil data? Select your target crop above, upload a CSV file with NPK levels, pH, etc., and let Gemini analyze it instantly.
          </p>
          <form onSubmit={handleWebhookSubmit} style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <input 
              type="file" 
              accept=".csv"
              onChange={(e) => setWebhookFile(e.target.files[0])}
              style={{
                fontFamily: 'inherit',
                color: 'var(--text)',
                padding: '0.5rem',
                border: '1px dashed var(--border)',
                borderRadius: '8px',
                background: 'var(--surface)'
              }}
            />
            <button 
              type="submit"
              disabled={webhookLoading || !webhookFile || !selectedCrop}
              style={{
                padding: '0.75rem 1.5rem',
                backgroundColor: 'var(--accent)',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: (webhookLoading || !webhookFile || !selectedCrop) ? 'not-allowed' : 'pointer',
                opacity: (webhookLoading || !webhookFile || !selectedCrop) ? 0.7 : 1,
                fontFamily: 'inherit',
                fontWeight: '600'
              }}
            >
              {webhookLoading ? 'Analyzing via Gemini...' : 'Analyze CSV File'}
            </button>
          </form>
          {webhookResult && (
             <div style={{ marginTop: '1.5rem', padding: '1rem', background: 'var(--bg)', borderRadius: '8px', border: '1px solid var(--border)' }}>
               <h4 style={{ marginBottom: '0.5rem', color: 'var(--accent)' }}>Gemini Analysis Result</h4>
               <pre style={{ 
                 whiteSpace: 'pre-wrap', 
                 fontFamily: 'inherit', 
                 fontSize: '0.95rem',
                 color: 'var(--text)',
                 lineHeight: 1.6
               }}>
                 {webhookResult}
               </pre>
             </div>
          )}
        </div>

        {lastUpdated && data && (
          <div className="footer-info">
            Live Field Data Feed &bull; Last fetched at {lastUpdated}
          </div>
        )}
      </main>
    </>
  );
}

export default Dashboard;
