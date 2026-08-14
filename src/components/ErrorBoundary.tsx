import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  /** Shown instead of the default card. */
  fallback?: (error: Error, reset: () => void) => ReactNode
}

interface State {
  error: Error | null
}

/**
 * Guardrail of last resort: a decode failure or a bad media file should never
 * take the whole studio down with it.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[ABCvers] render failed', error, info.componentStack)
  }

  private reset = (): void => {
    this.setState({ error: null })
  }

  render(): ReactNode {
    const { error } = this.state
    if (!error) return this.props.children
    if (this.props.fallback) return this.props.fallback(error, this.reset)
    return (
      <div className="crash" role="alert">
        <h2>Something went wrong</h2>
        <p className="crash__message">{error.message}</p>
        <button type="button" className="btn btn--primary" onClick={this.reset}>
          Try again
        </button>
      </div>
    )
  }
}
