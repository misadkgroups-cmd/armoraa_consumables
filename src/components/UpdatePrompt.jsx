import { useState, useEffect } from 'react';

/**
 * UpdatePrompt — "New version available" banner.
 *
 * How it works (the standard approach used by large web apps):
 * 1. Every build stamps a unique BUILD_ID into the JS bundle (vite `define`)
 *    and writes the same ID into /version.json served alongside the deploy.
 * 2. The app polls /version.json (bypassing cache) every 60s and whenever the
 *    tab becomes visible again.
 * 3. If the server reports a DIFFERENT build than the one the user is running,
 *    a new deploy has been rolled out — show a non-blocking banner with a
 *    "Refresh now" button. The user finishes what they are doing, then clicks
 *    Refresh (a full page reload) to pick up the new code.
 *
 * Deliberately non-intrusive: no forced reload, so in-flight work is never lost.
 */
const POLL_INTERVAL_MS = 60 * 1000;

export default function UpdatePrompt() {
  const [updateReady, setUpdateReady] = useState(false);

  useEffect(() => {
    if (typeof __BUILD_ID__ === 'undefined') return; // dev mode without define

    let disposed = false;

    const checkForUpdate = async () => {
      try {
        const res = await fetch(`${window.__APP_BASE__ || '/'}version.json?t=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        if (!disposed && data && data.version && data.version !== __BUILD_ID__) {
          setUpdateReady(true);
        }
      } catch {
        // Network/file missing — never nag the user because of this.
      }
    };

    checkForUpdate();
    const timer = setInterval(checkForUpdate, POLL_INTERVAL_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') checkForUpdate(); };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      disposed = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  if (!updateReady) return null;

  return (
    <div
      role="alert"
      style={{
        position: 'fixed',
        bottom: 20,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '10px 16px',
        borderRadius: 10,
        background: '#111827',
        color: '#F9FAFB',
        boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
        fontSize: 14,
      }}
    >
      <span>🔄 A new version of the app is available.</span>
      <button
        onClick={() => window.location.reload()}
        style={{
          padding: '6px 14px',
          borderRadius: 8,
          border: 'none',
          background: '#3B82F6',
          color: '#fff',
          fontWeight: 600,
          cursor: 'pointer',
          fontSize: 13,
        }}
      >
        Refresh now
      </button>
    </div>
  );
}
