import React, { Suspense, ComponentType } from 'react';
import { vscodeTheme } from '../../theme/vscode-theme';

interface LazyWrapperProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  errorFallback?: React.ComponentType<{ error: Error; retry: () => void }>;
}

interface LazyWrapperState {
  hasError: boolean;
  error: Error | null;
}

export class LazyWrapper extends React.Component<LazyWrapperProps, LazyWrapperState> {
  constructor(props: LazyWrapperProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): LazyWrapperState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('LazyWrapper caught an error:', error, errorInfo);
  }

  retry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError && this.state.error) {
      const ErrorFallback = this.props.errorFallback || DefaultErrorFallback;
      return <ErrorFallback error={this.state.error} retry={this.retry} />;
    }

    return (
      <Suspense fallback={this.props.fallback || <DefaultLoadingFallback />}>
        {this.props.children}
      </Suspense>
    );
  }
}

// Default loading fallback
const DefaultLoadingFallback: React.FC = () => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: vscodeTheme.spacing.lg,
      color: vscodeTheme.colors.foreground
    }}
  >
    <div
      style={{
        width: '20px',
        height: '20px',
        border: `2px solid ${vscodeTheme.colors.background}`,
        borderTop: `2px solid ${vscodeTheme.colors.accent}`,
        borderRadius: '50%',
        animation: 'spin 1s linear infinite'
      }}
    />
    <span style={{ marginLeft: vscodeTheme.spacing.md }}>Loading...</span>
  </div>
);

// Default error fallback
const DefaultErrorFallback: React.FC<{ error: Error; retry: () => void }> = ({ error, retry }) => (
  <div
    style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: vscodeTheme.spacing.lg,
      color: vscodeTheme.colors.error,
      backgroundColor: vscodeTheme.colors.background,
      border: `1px solid ${vscodeTheme.colors.error}`,
      borderRadius: vscodeTheme.borderRadius.md
    }}
  >
    <div style={{ fontWeight: 'bold', marginBottom: vscodeTheme.spacing.sm }}>
      Failed to load component
    </div>
    <div style={{ fontSize: '12px', marginBottom: vscodeTheme.spacing.md, color: vscodeTheme.colors.foreground }}>
      {error.message}
    </div>
    <button
      onClick={retry}
      style={{
        padding: `${vscodeTheme.spacing.xs} ${vscodeTheme.spacing.sm}`,
        backgroundColor: vscodeTheme.colors.accent,
        color: vscodeTheme.colors.accentForeground,
        border: 'none',
        borderRadius: vscodeTheme.borderRadius.sm,
        cursor: 'pointer'
      }}
    >
      Retry
    </button>
  </div>
);

// Higher-order component for lazy loading
export function withLazyLoading<P extends object>(
  importFunc: () => Promise<{ default: ComponentType<P> }>,
  fallback?: React.ReactNode,
  errorFallback?: React.ComponentType<{ error: Error; retry: () => void }>
) {
  const LazyComponent = React.lazy(importFunc);

  return React.memo((props: P) => (
    <LazyWrapper fallback={fallback} errorFallback={errorFallback}>
      <LazyComponent {...props} />
    </LazyWrapper>
  ));
}

// Hook for lazy loading with dynamic imports
export function useLazyComponent<T extends ComponentType<any>>(
  importFunc: () => Promise<{ default: T }>
): {
  Component: T | null;
  loading: boolean;
  error: Error | null;
  retry: () => void;
} {
  const [Component, setComponent] = React.useState<T | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<Error | null>(null);

  const loadComponent = React.useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const module = await importFunc();
      setComponent(() => module.default);
    } catch (err) {
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, [importFunc]);

  const retry = React.useCallback(() => {
    loadComponent();
  }, [loadComponent]);

  React.useEffect(() => {
    loadComponent();
  }, [loadComponent]);

  return { Component, loading, error, retry };
}
