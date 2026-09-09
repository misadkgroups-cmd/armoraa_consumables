import { useState, useEffect } from 'react';

/**
 * UpdatePrompt — "New version available, please refresh" banner.
 *
 * How it works (the standard approach used by large web apps):
 * 1. Every build stamps a unique BUILD_ID into the JS bundle (vite `define`)
 *    and writes the same ID into /version.json served alongside the deploy.
 * 2. The app polls /version.json (bypassing cache) every 30s, whenever the
 *    tab becomes visible again, and whenever the window regains focus.
 * 3. If the server reports a DIFFERENT build than the one the user is running,
 *    a new deploy has been rolled out — show a persistent banner with a
 *    "Refresh now" button. This covers BOTH cases:
 *      - a user who had the app open while the new version was deployed, AND
 *      - a user who is still on the older version (their old bundle compares
 *        its own old BUILD_ID against the server's new one and matches).
 *    The user clicks Refresh (a full page reload) to pick up the new code.
 *
 * Deliberately non-intrusive: no forced reload, so in-flight work is never lost.
 * The banner stays visible until the page is refreshed.
 */
const POLL_INTERVAL_MS = 30 * 1000;

export default function UpdatePrompt() {
  const [updateReady, setUpdateReady] = useState(false);
  const [builtAt, setBuiltAt] = useState(null);

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
          if (data.builtAt) {
            try { setBuiltAt(new Date(data.builtAt).toLocaleString()); } catch { /* ignore */ }
          }
        }
      } catch {
        // Network/file missing — never nag the user because of this.
      }
    };

    checkForUpdate();
    const timer = setInterval(checkForUpdate, POLL_INTERVAL_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') checkForUpdate(); };
    const onFocus = () => checkForUpdate();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onFocus);

    return () => {
      disposed = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  if (!updateReady) return null;

  return (
    <div
      role="alert"
      style={{
        position: 'fixed',
        top: 16,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 99999,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 6,
        padding: '14px 22px',
        borderRadius: 12,
        background: '#111827',
        color: '#F9FAFB',
        border: '1px solid #3B82F6',
        boxShadow: '0 12px 32px rgba(0,0,0,0.35)',
        fontSize: 14,
        maxWidth: '92vw',
        textAlign: 'center',
      }}
    >
      <span style={{ fontWeight: 700, fontSize: 15 }}>🔄 New version available</span>
      <span style={{ fontSize: 13, color: '#D1D5DB' }}>
        A newer version of the app has been deployed. Please refresh the page
        {builtAt ? ` (deployed ${builtAt})` : ''} to get the latest updates.
      </span>
      <button
        onClick={() => window.location.reload()}
        style={{
          marginTop: 4,
          padding: '8px 20px',
          borderRadius: 8,
          border: 'none',
          background: '#3B82F6',
          color: '#fff',
          fontWeight: 700,
          cursor: 'pointer',
          fontSize: 13,
        }}
      >
        Refresh now
      </button>
    </div>
  );
}
