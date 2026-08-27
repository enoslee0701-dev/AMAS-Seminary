import React from 'react';
import ReactDOM from 'react-dom/client';
import './i18n';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';

// A lazily-loaded chunk can fail to load when the page still holds a module graph
// from before a dev-server hot update or a production deploy. Reload once so the
// user gets fresh chunks instead of the error boundary.
window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault();
  const key = 'amas_preload_reload_at';
  const last = Number(sessionStorage.getItem(key) || 0);
  if (Date.now() - last > 10_000) {
    sessionStorage.setItem(key, String(Date.now()));
    window.location.reload();
  }
});

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);