import React from 'react';
import ReactDOM from 'react-dom/client';
import './i18n';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import DemoBuildBadge from './components/DemoBuildBadge';
import { captureDiscoverHandoff } from './services/christianProfile/discoverHandoff';

// 从网页版「信仰成长快速探索」(discover.html) 跳进来时，URL 上带着 5 项初步状态。
// 必须在 render 之前读掉：参数一落盘就从地址栏抹掉，刷新才不会重复带入。
captureDiscoverHandoff();

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
    {/* 挂在 ErrorBoundary 之外：演示构建的标识连应用崩溃时也必须还在。
        正式构建里 DemoBuildBadge 恒为 null，不产生任何 DOM。 */}
    <DemoBuildBadge />
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);