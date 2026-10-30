"use client";

import { Component, type ReactNode } from "react";
import { ErrorState } from "./states";

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
}
interface State {
  error: Error | null;
}

/** Aísla fallos de un panel para que el resto del workspace siga usable. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    if (this.state.error) {
      return <ErrorState error={this.state.error} onRetry={() => this.setState({ error: null })} className="m-4" />;
    }
    return this.props.children;
  }
}
