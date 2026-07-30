import { Component, type ReactNode, type ErrorInfo } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Firmware Insight Studio UI Error:", error, errorInfo);
    this.setState({ errorInfo });
  }

  public handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#070a0f] text-[#d8e1ec] font-mono flex items-center justify-center p-6">
          <div className="bg-[#0c1118] border border-[#e0566b] rounded-lg max-w-xl w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 border-b border-[#1b2531] pb-3">
              <span className="text-[#e0566b] text-xl font-bold">⚠️</span>
              <h2 className="font-bold text-white text-sm uppercase tracking-wider">
                Workspace Render Exception
              </h2>
            </div>

            <p className="text-xs text-gray-400 leading-relaxed">
              An unexpected UI error occurred while rendering the workspace data.
            </p>

            <div className="bg-[#070a0f] border border-[#1b2531] rounded p-3 text-[11px] text-[#e0566b] overflow-x-auto">
              <strong>{this.state.error?.name || "Error"}: </strong>
              {this.state.error?.message || "Unknown error"}
            </div>

            {this.state.errorInfo?.componentStack && (
              <details className="text-[10px] text-gray-500 cursor-pointer">
                <summary className="hover:text-gray-300">Component Stack Trace</summary>
                <pre className="mt-2 p-2 bg-[#070a0f] rounded max-h-40 overflow-y-auto whitespace-pre-wrap">
                  {this.state.errorInfo.componentStack}
                </pre>
              </details>
            )}

            <div className="pt-3 flex gap-3">
              <button
                onClick={this.handleReset}
                className="px-4 py-2 rounded bg-[#33d6c2] text-black font-bold text-xs hover:bg-[#28b8a6] transition"
              >
                ↻ Reload Studio
              </button>
              <button
                onClick={() => {
                  localStorage.clear();
                  window.location.reload();
                }}
                className="px-4 py-2 rounded bg-[#10171f] border border-[#1b2531] text-gray-300 hover:text-white text-xs transition"
              >
                Clear State & Reload
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
