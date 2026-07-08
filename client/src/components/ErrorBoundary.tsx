import { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
  fallbackLabel?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[ErrorBoundary] 렌더링 오류:", error, errorInfo.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          className="flex flex-col items-center justify-center gap-3 py-16 px-4 text-center"
          data-testid="error-boundary-fallback"
        >
          <div className="w-14 h-14 rounded-full bg-red-50 dark:bg-red-950/40 flex items-center justify-center">
            <AlertTriangle className="w-7 h-7 text-red-500" />
          </div>
          <div>
            <h2 className="text-base font-bold text-foreground">
              {this.props.fallbackLabel ?? "화면을 표시하는 중 오류가 발생했습니다"}
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              잠시 후 다시 시도해주세요. 문제가 계속되면 관리자에게 문의하세요.
            </p>
            {this.state.error?.message && (
              <p className="text-xs text-muted-foreground/70 mt-2 font-mono break-all max-w-md">
                {this.state.error.message}
              </p>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={this.handleReset} data-testid="button-error-retry">
            다시 시도
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}
