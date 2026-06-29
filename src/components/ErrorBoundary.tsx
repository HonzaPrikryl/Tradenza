'use client'

import { Component, type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import * as Sentry from '@sentry/nextjs'
import { t } from '@/i18n'

interface Props {
  children: ReactNode
  /** Custom fallback. Receives the error and a reset callback. */
  fallback?: (error: Error, reset: () => void) => ReactNode
  /** Optional label shown in the default fallback (e.g. the widget name). */
  label?: string
  /** Called when an error is caught (e.g. to report to monitoring). */
  onError?: (error: Error, info: { componentStack: string }) => void
}

interface State {
  error: Error | null
}

/**
 * Isolates render-time errors in a subtree so one broken client component
 * (chart, widget, editor) does not take down the whole page. Use around
 * self-contained, non-critical UI. Server-rendered errors are handled by
 * the route-level error.tsx instead.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    this.props.onError?.(error, info)
    Sentry.captureException(error, {
      contexts: { react: { componentStack: info.componentStack } },
      tags: { boundary: this.props.label ?? 'component' },
    })
  }

  reset = () => this.setState({ error: null })

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    if (this.props.fallback) return this.props.fallback(error, this.reset)

    return (
      <div className="flex h-full min-h-[8rem] items-center justify-center rounded-lg border border-border bg-card/50 p-6 text-center">
        <div>
          <AlertTriangle className="mx-auto mb-3 h-5 w-5 text-loss" />
          <p className="mb-1 text-sm font-medium">{this.props.label ?? t('error.title')}</p>
          <button onClick={this.reset} className="mt-2 text-xs text-primary hover:underline">
            {t('error.retry')}
          </button>
        </div>
      </div>
    )
  }
}
