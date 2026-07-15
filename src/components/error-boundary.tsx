import { Component, ErrorInfo, ReactNode } from "react";
import { Card, CardBody, Button } from "@heroui/react";
import { Icon } from "@iconify/react";

interface ErrorBoundaryProps {
  children: ReactNode;
  /** When this value changes, the boundary clears its error and re-renders children. */
  resetKey?: string;
  /** Heading shown in the fallback UI. */
  title?: string;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Catches runtime errors thrown while rendering its subtree and shows a
 * fallback UI instead of unmounting the whole React tree (which would leave a
 * blank screen). Pass a `resetKey` (e.g. the route path) to recover
 * automatically when the user navigates elsewhere.
 */
class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("ErrorBoundary caught an error:", error, info.componentStack);
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  handleTryAgain = () => {
    this.setState({ error: null });
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    const { error } = this.state;

    if (!error) {
      return this.props.children;
    }

    const { title = "Something went wrong" } = this.props;

    return (
      <div className="flex h-full w-full items-center justify-center p-6">
        <Card className="max-w-lg border-1 border-danger-200 bg-danger-50 shadow-lg">
          <CardBody className="p-6">
            <div className="flex items-start gap-3">
              <Icon
                icon="heroicons:exclamation-triangle-20-solid"
                className="mt-0.5 h-6 w-6 flex-shrink-0 text-danger-500"
              />
              <div className="flex-1 min-w-0">
                <p className="text-base font-semibold text-danger-900">{title}</p>
                <p className="mt-1 text-sm text-danger-900/90">
                  This part of the app hit an unexpected error. You can try again or reload the app.
                </p>
                <pre className="mt-3 max-h-40 overflow-auto rounded-medium bg-danger-100 p-3 text-xs text-danger-900">
                  {error.message}
                </pre>
                <div className="mt-4 flex gap-2">
                  <Button color="danger" variant="flat" size="sm" onPress={this.handleTryAgain}>
                    Try again
                  </Button>
                  <Button color="danger" variant="solid" size="sm" onPress={this.handleReload}>
                    Reload app
                  </Button>
                </div>
              </div>
            </div>
          </CardBody>
        </Card>
      </div>
    );
  }
}

export default ErrorBoundary;
