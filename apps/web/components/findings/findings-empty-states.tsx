'use client';

import React from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  Play,
  RotateCw,
  SearchX,
  Lock,
  GitBranch,
  Loader2,
} from 'lucide-react';

interface EmptyStateProps {
  type: 'no-analysis' | 'analysis-running' | 'no-findings' | 'no-filtered-results' | 'api-error' | 'auth-error';
  onRunAnalysis?: () => void;
  onResetFilters?: () => void;
  onRetry?: () => void;
  onSignIn?: () => void;
  analysisStatus?: string | null;
  errorMessage?: string | null;
}

export function FindingsEmptyState({
  type,
  onRunAnalysis,
  onResetFilters,
  onRetry,
  onSignIn,
  analysisStatus,
  errorMessage,
}: EmptyStateProps) {
  switch (type) {
    case 'no-analysis':
      return (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed bg-card/50 p-12 text-center" data-testid="empty-no-analysis">
          <div className="rounded-full bg-primary/10 p-3 text-primary">
            <Play className="h-6 w-6" />
          </div>
          <h3 className="mt-4 text-base font-bold text-foreground">No analysis yet</h3>
          <p className="mt-1 max-w-sm text-xs text-muted-foreground">
            No analysis has been run for this project. Trigger an asynchronous quality and architecture analysis to view findings.
          </p>
          {onRunAnalysis && (
            <button
              type="button"
              onClick={onRunAnalysis}
              className="mt-5 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
            >
              <Play className="h-3.5 w-3.5" />
              Run analysis now
            </button>
          )}
        </div>
      );

    case 'analysis-running':
      return (
        <div className="flex flex-col items-center justify-center rounded-2xl border bg-card p-12 text-center shadow-sm" data-testid="state-analysis-running">
          <div className="relative">
            <div className="rounded-full bg-primary/10 p-4 text-primary animate-pulse">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          </div>
          <h3 className="mt-4 text-base font-bold text-foreground">Analysis in progress</h3>
          <p className="mt-1 max-w-md text-xs font-medium text-primary">
            {analysisStatus || 'Queue worker processing: cloning repository & parsing AST...'}
          </p>
          <p className="mt-2 text-[11px] text-muted-foreground">
            QualityGuard is sandboxing the git repository and running architectural rule checks. Results will update automatically.
          </p>
        </div>
      );

    case 'no-findings':
      return (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-12 text-center" data-testid="empty-no-findings">
          <div className="rounded-full bg-emerald-500/20 p-3 text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-6 w-6" />
          </div>
          <h3 className="mt-4 text-base font-bold text-emerald-800 dark:text-emerald-300">
            Great — no findings detected
          </h3>
          <p className="mt-1 max-w-sm text-xs text-muted-foreground">
            All static AST rules, security checks, and architectural dependency validations passed with 100% compliance.
          </p>
        </div>
      );

    case 'no-filtered-results':
      return (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed bg-card/50 p-12 text-center" data-testid="empty-no-filtered-results">
          <div className="rounded-full bg-muted p-3 text-muted-foreground">
            <SearchX className="h-6 w-6" />
          </div>
          <h3 className="mt-4 text-base font-bold text-foreground">No findings match active filters</h3>
          <p className="mt-1 max-w-sm text-xs text-muted-foreground">
            Try adjusting your search query, severity, category, or file filters to see results.
          </p>
          {onResetFilters && (
            <button
              type="button"
              onClick={onResetFilters}
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg border bg-background px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted transition-colors"
            >
              Reset all filters
            </button>
          )}
        </div>
      );

    case 'api-error':
      return (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-rose-500/30 bg-rose-500/5 p-12 text-center" data-testid="state-api-error">
          <div className="rounded-full bg-rose-500/20 p-3 text-rose-600 dark:text-rose-400">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <h3 className="mt-4 text-base font-bold text-rose-800 dark:text-rose-300">
            Unable to load findings
          </h3>
          <p className="mt-1 max-w-sm text-xs text-muted-foreground">
            {errorMessage || 'A network error occurred while querying the backend API.'}
          </p>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <RotateCw className="h-3.5 w-3.5" />
              Retry request
            </button>
          )}
        </div>
      );

    case 'auth-error':
      return (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-amber-500/30 bg-amber-500/5 p-12 text-center" data-testid="state-auth-error">
          <div className="rounded-full bg-amber-500/20 p-3 text-amber-600 dark:text-amber-400">
            <Lock className="h-6 w-6" />
          </div>
          <h3 className="mt-4 text-base font-bold text-amber-800 dark:text-amber-300">
            Your session has expired
          </h3>
          <p className="mt-1 max-w-sm text-xs text-muted-foreground">
            Please sign in to access project findings and governance reports.
          </p>
          {onSignIn && (
            <button
              type="button"
              onClick={onSignIn}
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Sign in
            </button>
          )}
        </div>
      );

    default:
      return null;
  }
}
