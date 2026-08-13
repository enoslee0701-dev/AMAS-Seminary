import React from 'react';
import { AlertTriangle, RefreshCw, Mail, ChevronDown, ChevronUp } from 'lucide-react';
import i18n from '../i18n';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  componentStack: string | null;
  showDetails: boolean;
}

/**
 * Top-level ErrorBoundary. A class component because that is the only way
 * React exposes to catch render/lifecycle/constructor errors in the tree below.
 *
 * Caveat: it does NOT catch errors thrown in event handlers, async callbacks
 * (setTimeout / Promise.then), or during server-side rendering. Those must be
 * handled with explicit try/catch by the calling code.
 */
class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null, componentStack: null, showDetails: false };

  constructor(props: ErrorBoundaryProps) {
    super(props);
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // Log to console so devs / Sentry hooks can capture it.
    console.error('[ErrorBoundary] Caught render error:', error);
    console.error('[ErrorBoundary] Component stack:', info.componentStack);
    this.setState({ componentStack: info.componentStack ?? null });
  }

  handleReload = () => {
    try {
      window.location.reload();
    } catch (e) {
      console.error('[ErrorBoundary] reload failed', e);
    }
  };

  handleContact = () => {
    try {
      window.location.href = 'mailto:support@amas.edu?subject=AMAS%20App%20Error';
    } catch (e) {
      console.error('[ErrorBoundary] mailto failed', e);
    }
  };

  toggleDetails = () => {
    this.setState(prev => ({ showDetails: !prev.showDetails }));
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    const { error, componentStack, showDetails } = this.state;
    const t = i18n.t.bind(i18n);
    const message = error?.message || t('errorBoundary.unknownError');

    return (
      <div className="fixed inset-0 z-[9999] bg-gradient-to-b from-slate-900 via-blue-950 to-black flex items-center justify-center p-6">
        <div className="w-full max-w-sm bg-slate-800/90 backdrop-blur-xl border border-slate-700 rounded-2xl shadow-2xl p-6 text-white">
          <div className="flex items-center justify-center mb-4">
            <div className="w-14 h-14 rounded-full bg-red-500/15 border border-red-500/30 flex items-center justify-center">
              <AlertTriangle size={28} className="text-red-400" />
            </div>
          </div>
          <h2 className="text-lg font-bold text-center mb-2">{t('errorBoundary.title')}</h2>
          <p className="text-sm text-slate-300 text-center mb-4 leading-relaxed">
            {t('errorBoundary.description')}
          </p>

          <button
            onClick={this.toggleDetails}
            className="w-full flex items-center justify-center text-xs text-slate-400 hover:text-slate-200 transition-colors mb-2"
          >
            {t('errorBoundary.viewDetails')}
            {showDetails ? <ChevronUp size={14} className="ml-1" /> : <ChevronDown size={14} className="ml-1" />}
          </button>

          {showDetails && (
            <div className="mb-4 p-3 rounded-lg bg-slate-900/70 border border-slate-700 max-h-40 overflow-y-auto">
              <pre className="text-xs text-red-300 whitespace-pre-wrap break-all font-mono">
                {message}
              </pre>
              {componentStack && (
                <pre className="mt-2 text-[10px] text-slate-500 whitespace-pre-wrap break-all font-mono">
                  {componentStack.trim()}
                </pre>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 mt-2">
            <button
              onClick={this.handleReload}
              className="flex items-center justify-center px-3 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 active:bg-blue-700 transition-colors text-sm font-semibold"
            >
              <RefreshCw size={14} className="mr-1.5" />
              {t('errorBoundary.reload')}
            </button>
            <button
              onClick={this.handleContact}
              className="flex items-center justify-center px-3 py-2.5 rounded-xl bg-slate-700 hover:bg-slate-600 active:bg-slate-800 transition-colors text-sm font-semibold"
            >
              <Mail size={14} className="mr-1.5" />
              {t('errorBoundary.contactSupport')}
            </button>
          </div>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
