/**
 * Deployment-base helpers, shared with App.jsx's routing.
 * window.__APP_BASE__ is captured in index.html (the directory the app is
 * actually served from — '/' for a domain root, '/repo/' for GitHub Pages).
 * Every URL pushed into history or navigated to MUST be wrapped in withBase(),
 * otherwise the URL escapes the deploy folder and a reload shows a blank page.
 */
export const APP_BASE =
  typeof window !== 'undefined' && window.__APP_BASE__ ? window.__APP_BASE__ : '/';

export function withBase(path) {
  const base = APP_BASE.endsWith('/') ? APP_BASE : APP_BASE + '/';
  return base === '/' ? path : base + path.slice(1);
}
