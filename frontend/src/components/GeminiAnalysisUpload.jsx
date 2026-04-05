import React, { useState, useEffect } from 'react';

export default function GeminiAnalysisUpload({ selectedCrop, apiBaseUrl }) {
  const [webhookFile, setWebhookFile] = useState(null);
  const [webhookResult, setWebhookResult] = useState(null);
  const [webhookLoading, setWebhookLoading] = useState(false);
  const [apiStatus, setApiStatus] = useState('checking'); // 'checking', 'available', 'rate_limited', 'error', 'not_initialized'

  useEffect(() => {
    let interval;
    const checkHealth = () => {
      fetch(`${apiBaseUrl}/api/gemini-health`)
        .then(res => res.json())
        .then(data => {
          setApiStatus(data.status);
        })
        .catch(err => {
          setApiStatus('error');
        });
    };

    // Initial check
    checkHealth();

    // Poll every 10 seconds to auto-recover from rate limits
    interval = setInterval(checkHealth, 10000);

    return () => clearInterval(interval);
  }, [apiBaseUrl]);

  const handleWebhookSubmit = (e) => {
    e.preventDefault();
    if (!webhookFile || !selectedCrop) return;
    setWebhookLoading(true);
    setWebhookResult(null);

    const formData = new FormData();
    formData.append("crop_type", selectedCrop);
    formData.append("file", webhookFile);

    fetch(`${apiBaseUrl}/webhook/analyze-soil`, {
      method: "POST",
      body: formData,
    })
      .then(res => res.json())
      .then(res => {
        if (res.status === "success") {
          setWebhookResult(res.ai_verdict);
        } else {
          setWebhookResult(`Error: ${res.message}`);
          // If it hits rate limit again during POST, degrade status back
          if (res.message && res.message.includes("429")) {
            setApiStatus('rate_limited');
          }
        }
      })
      .catch(err => {
        setWebhookResult(`Error uploading file: ${err.message}`);
      })
      .finally(() => setWebhookLoading(false));
  };

  return (
    <div className="card" style={{ marginTop: '2rem', border: '1px solid var(--accent)' }}>
      <h2 style={{ color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
        Upload CSV Data (Gemini Webhook)
      </h2>
      <p style={{ color: 'var(--muted)', marginBottom: '1rem', fontSize: '0.9rem' }}>
        Have historical soil data? Select your target crop above, upload a CSV file with NPK levels, pH, etc., and let Gemini analyze it.
      </p>

      {apiStatus === 'checking' && (
        <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--muted)' }}>
          Checking AI Service Availability...
        </div>
      )}

      {apiStatus === 'rate_limited' && (
        <div style={{
          padding: '1.5rem',
          background: 'rgba(234, 179, 78, 0.05)',
          border: '1px solid var(--warn)',
          borderRadius: '8px',
          color: 'var(--warn)',
          textAlign: 'center'
        }}>
          <strong style={{ fontSize: '1.1rem' }}>API Limit Exceeded</strong>
          <p style={{ fontSize: '0.9rem', marginTop: '0.5rem' }}>
            The free-tier Gemini API quota is currently exhausted. Automatically waiting for capacity to free up...
          </p>
          <div className="spinner" style={{ width: '24px', height: '24px', borderWidth: '2px', margin: '1rem auto 0', borderTopColor: 'var(--warn)', borderColor: 'rgba(234, 179, 78, 0.2)' }}></div>
        </div>
      )}

      {(apiStatus === 'error' || apiStatus === 'not_initialized') && (
        <div style={{
          padding: '1.5rem',
          background: 'rgba(209, 73, 59, 0.05)',
          border: '1px solid var(--danger)',
          borderRadius: '8px',
          color: 'var(--danger)',
          textAlign: 'center'
        }}>
          <strong>AI Service Unavailable</strong>
          <p style={{ fontSize: '0.9rem', marginTop: '0.5rem' }}>
            Please ensure you have configured your GOOGLE_API_KEY correctly on the backend.
          </p>
        </div>
      )}

      {apiStatus === 'available' && (
        <>
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
        </>
      )}
    </div>
  );
}
