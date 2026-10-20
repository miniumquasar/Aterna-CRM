/**
 * Catches a screen that fails while drawing, so the rest of the app keeps
 * working: the screen shows a LoadProblem with Try again instead.
 */
import { Component, type ErrorInfo, type ReactNode } from 'react'
import { LoadProblem } from '../ui'

interface Props {
  /** Changing it (a new route) clears a caught failure. */
  resetKey: string
  children: ReactNode
}

interface State {
  failed: boolean
  key: string
}

export class ScreenBoundary extends Component<Props, State> {
  override state: State = { failed: false, key: this.props.resetKey }

  static getDerivedStateFromError(): Partial<State> {
    return { failed: true }
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    return props.resetKey !== state.key ? { failed: false, key: props.resetKey } : null
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('A screen failed to draw', error, info.componentStack)
  }

  override render(): ReactNode {
    if (this.state.failed) {
      return (
        <LoadProblem
          title="This screen ran into a problem"
          message="Something went wrong while showing this screen. Try again, or go to another screen; if it keeps happening, restart AETERNA CRM."
          onRetry={() => this.setState({ failed: false })}
        />
      )
    }
    return this.props.children
  }
}
