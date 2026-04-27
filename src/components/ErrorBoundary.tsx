import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-6 text-center">
          <div className="space-y-6 max-w-md">
            <div className="w-20 h-20 bg-red-500/10 rounded-3xl flex items-center justify-center mx-auto border border-red-500/20">
              <span className="text-4xl">⚠️</span>
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl font-light text-zinc-100">Something went wrong</h1>
              <p className="text-zinc-500 text-sm leading-relaxed">
                We encountered an unexpected error. Please try refreshing the application.
              </p>
            </div>
            {this.state.error && (
              <div className="bg-zinc-900 rounded-2xl p-4 text-left overflow-auto max-h-40 border border-zinc-800">
                <pre className="text-[10px] font-mono text-red-400 whitespace-pre-wrap">
                  {this.state.error.message}
                </pre>
              </div>
            )}
            <button
              onClick={() => window.location.reload()}
              className="w-full py-4 rounded-2xl bg-zinc-100 text-zinc-900 font-bold text-sm hover:bg-white transition-all"
            >
              Refresh App
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
