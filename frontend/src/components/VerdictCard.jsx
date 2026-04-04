import React from 'react';

export default function VerdictCard({ data }) {
  if (!data) return null;

  return (
    <div className={`card verdict-card ${data.suitable ? 'suitable' : 'unsuitable'}`}>
      <div className="verdict-title">{data.verdict}</div>

      <div className="verdict-details">
        {!data.suitable ? (
          <>
            {data.issues && data.issues.length > 0 && (
              <div className="detail-section">
                <h3 className="section-title">Issues Detected</h3>
                <ul className="list-items issues">
                  {data.issues.map((i, idx) => <li key={idx}>{i}</li>)}
                </ul>
              </div>
            )}
            {data.suggestions && data.suggestions.length > 0 && (
              <div className="detail-section">
                <h3 className="section-title">Organic Treatments</h3>
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
              Proceed with planting.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
