'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const API_HTTP = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function GatewayPage() {
  const router = useRouter();
  const [sensorIP, setSensorIP] = useState('');
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState(null);
  const [error, setError] = useState(null);

  const checkStatus = async () => {
    if (!sensorIP) return;
    setChecking(true);
    setError(null);
    setConnectionStatus(null);

    try {
      const res = await fetch(`${API_HTTP}/sensor/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip: sensorIP.trim() }),
      });
      const payload = await res.json();
      setConnectionStatus({
        status: payload.status,
        message: payload.message,
      });
    } catch (err) {
      setError(`Cannot reach API server: ${err.message}`);
    } finally {
      setChecking(false);
    }
  };

  const handleConnect = async () => {
    if (!sensorIP) return;
    const ip = sensorIP.trim();

    // Admin Access Backdoor
    if (ip.toLowerCase() === 'admin') {
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('sensorIP', 'admin');
      }
      router.push('/dashboard');
      return;
    }

    setLoading(true);
    setError(null);
    setConnectionStatus(null);

    try {
      const res = await fetch(`${API_HTTP}/sensor/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip: sensorIP.trim() }),
      });
      const payload = await res.json();

      if (payload.status === 'success') {
        // Store IP for the dashboard page to use
        if (typeof window !== 'undefined') {
          sessionStorage.setItem('sensorIP', sensorIP.trim());
        }
        router.push('/dashboard');
      } else {
        setConnectionStatus({
          status: payload.status,
          message: payload.message,
        });
        setError(payload.message);
      }
    } catch (err) {
      setError(`Connection failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && sensorIP) {
      handleConnect();
    }
  };

  return (
    <div className="gateway">
      <div className="gateway-card">
        <h1 className="gateway-title">SoilSense</h1>
        <p className="gateway-subtitle">Connect to your sensor hardware to begin monitoring.</p>

        <div className="gateway-field">
          <label className="gateway-label" htmlFor="sensorIP">Sensor IP Address</label>
          <input
            id="sensorIP"
            type="text"
            className="gateway-input"
            value={sensorIP}
            onChange={(e) => setSensorIP(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="e.g. 192.168.1.100"
            autoFocus
          />
        </div>

        <div className="gateway-actions">
          <button
            className="gateway-btn gateway-btn--secondary"
            onClick={checkStatus}
            disabled={!sensorIP || checking}
          >
            {checking ? 'Checking...' : 'Check Status'}
          </button>

          <button
            className="gateway-btn gateway-btn--primary"
            onClick={handleConnect}
            disabled={!sensorIP || loading}
          >
            {loading ? 'Connecting...' : 'Connect'}
          </button>
        </div>

        {connectionStatus && (
          <div className="gateway-status">
            <div className={`connection-status-badge connection-status-badge--${connectionStatus.status}`}>
              <span className="connection-status-dot" />
              <div className="connection-status-text">
                <strong>
                  {connectionStatus.status === 'success' ? 'Online' :
                   connectionStatus.status === 'error' ? 'Unreachable' : 'Status'}
                </strong>
                <span>{connectionStatus.message}</span>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="gateway-error">{error}</div>
        )}
      </div>
    </div>
  );
}
