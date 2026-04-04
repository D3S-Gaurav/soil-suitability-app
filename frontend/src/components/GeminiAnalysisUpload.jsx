import React, { useState } from 'react';

export default function GeminiAnalysisUpload({ selectedCrop, apiBaseUrl }) {
  const [webhookFile, setWebhookFile] = useState(null);
  const [webhookResult, setWebhookResult] = useState(null);
  const [webhookLoading, setWebhookLoading] = useState(false);

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
  );
}
