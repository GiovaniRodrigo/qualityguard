'use client';

import React from 'react';
import { ShieldCheck, AlertOctagon, AlertTriangle, AlertCircle, Info, Sparkles, CheckCircle2 } from 'lucide-react';
import type { Review, Finding } from '@/lib/api/types';

interface FindingsSummaryProps {
  review: Review | null;
  findings: Finding[];
  onSelectSeverityFilter?: (severity: string) => void;
  activeSeverityFilter?: string;
}

export function FindingsSummary({
  review,
  findings,
  onSelectSeverityFilter,
  activeSeverityFilter = 'all',
}: FindingsSummaryProps) {
  if (!review) return null;

  const score = review.score;
  const gatePassed = review.gate ? review.gate.passed : score >= 80;
  const gateReasons = review.gate?.reasons ?? [];

  const counts = {
    critical: findings.filter((f) => f.severity === 'critical').length,
    high: findings.filter((f) => f.severity === 'high').length,
    medium: findings.filter((f) => f.severity === 'medium').length,
    low: findings.filter((f) => f.severity === 'low').length,
    total: findings.length,
  };

  const gateDecision = review.gate?.decision?.toUpperCase() ?? (gatePassed ? 'APPROVE' : 'REVIEW_REQUIRED');

  return (
    <div className="space-y-4" data-testid="findings-summary">
      {/* Top Cards Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-6">
        {/* 1. Quality Score */}
        <div className="rounded-2xl border bg-card p-5 shadow-sm lg:col-span-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Quality Score
            </span>
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                score >= 80
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                  : score >= 60
                    ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                    : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
              }`}
            >
              Grade {score >= 80 ? 'A' : score >= 60 ? 'B' : 'F'}
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span
              className={`text-4xl font-extrabold tracking-tight ${
                score >= 80
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : score >= 60
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-rose-600 dark:text-rose-400'
              }`}
            >
              {score}
            </span>
            <span className="text-sm font-medium text-muted-foreground">/ 100</span>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Evaluated across {review.analyzedFiles ?? 0} source files & static AST rules
          </p>
        </div>

        {/* 2. Quality Gate Card */}
        <div
          className={`rounded-2xl border p-5 shadow-sm lg:col-span-2 ${
            gatePassed
              ? 'border-emerald-500/30 bg-emerald-500/5'
              : 'border-rose-500/30 bg-rose-500/5'
          }`}
          data-testid="quality-gate-card"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Quality Gate
            </span>
            {gatePassed ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-bold text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="h-3.5 w-3.5" />
                PASSED
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/15 px-2.5 py-0.5 text-xs font-bold text-rose-700 dark:text-rose-300">
                <AlertOctagon className="h-3.5 w-3.5" />
                FAILED
              </span>
            )}
          </div>
          <div className="mt-3">
            <div className="flex items-center gap-2">
              <span className="text-xl font-bold tracking-tight">
                {gatePassed ? 'Gate Passed' : 'Gate Blocked'}
              </span>
              <span className="rounded bg-background/80 px-2 py-0.5 font-mono text-[10px] font-semibold text-muted-foreground border">
                {gateDecision}
              </span>
            </div>
            <div className="mt-2 text-xs text-foreground/80">
              {gateReasons.length > 0 ? (
                <ul className="list-inside list-disc space-y-0.5">
                  {gateReasons.map((reason, idx) => (
                    <li key={idx} className="truncate">
                      {reason}
                    </li>
                  ))}
                </ul>
              ) : (
                <p>
                  {gatePassed
                    ? 'All architectural and security thresholds satisfied.'
                    : `${counts.critical + counts.high} critical/high findings require resolution.`}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* 3. Severity Breakdown Cards (Interactive filter buttons) */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:col-span-2">
          {/* Critical */}
          <button
            type="button"
            onClick={() => onSelectSeverityFilter?.(activeSeverityFilter === 'critical' ? 'all' : 'critical')}
            className={`flex flex-col justify-between rounded-xl border p-3 text-left transition-all hover:border-rose-500/50 ${
              activeSeverityFilter === 'critical'
                ? 'border-rose-500 bg-rose-500/10 ring-2 ring-rose-500/20'
                : 'bg-card'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase text-rose-600 dark:text-rose-400">
                Critical
              </span>
              <AlertOctagon className="h-3.5 w-3.5 text-rose-500" />
            </div>
            <span className="mt-2 text-2xl font-black text-rose-600 dark:text-rose-400">
              {counts.critical}
            </span>
          </button>

          {/* High */}
          <button
            type="button"
            onClick={() => onSelectSeverityFilter?.(activeSeverityFilter === 'high' ? 'all' : 'high')}
            className={`flex flex-col justify-between rounded-xl border p-3 text-left transition-all hover:border-orange-500/50 ${
              activeSeverityFilter === 'high'
                ? 'border-orange-500 bg-orange-500/10 ring-2 ring-orange-500/20'
                : 'bg-card'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase text-orange-600 dark:text-orange-400">
                High
              </span>
              <AlertTriangle className="h-3.5 w-3.5 text-orange-500" />
            </div>
            <span className="mt-2 text-2xl font-black text-orange-600 dark:text-orange-400">
              {counts.high}
            </span>
          </button>

          {/* Medium */}
          <button
            type="button"
            onClick={() => onSelectSeverityFilter?.(activeSeverityFilter === 'medium' ? 'all' : 'medium')}
            className={`flex flex-col justify-between rounded-xl border p-3 text-left transition-all hover:border-amber-500/50 ${
              activeSeverityFilter === 'medium'
                ? 'border-amber-500 bg-amber-500/10 ring-2 ring-amber-500/20'
                : 'bg-card'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase text-amber-600 dark:text-amber-400">
                Medium
              </span>
              <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
            </div>
            <span className="mt-2 text-2xl font-black text-amber-600 dark:text-amber-400">
              {counts.medium}
            </span>
          </button>

          {/* Low */}
          <button
            type="button"
            onClick={() => onSelectSeverityFilter?.(activeSeverityFilter === 'low' ? 'all' : 'low')}
            className={`flex flex-col justify-between rounded-xl border p-3 text-left transition-all hover:border-sky-500/50 ${
              activeSeverityFilter === 'low'
                ? 'border-sky-500 bg-sky-500/10 ring-2 ring-sky-500/20'
                : 'bg-card'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase text-sky-600 dark:text-sky-400">
                Low
              </span>
              <Info className="h-3.5 w-3.5 text-sky-500" />
            </div>
            <span className="mt-2 text-2xl font-black text-sky-600 dark:text-sky-400">
              {counts.low}
            </span>
          </button>
        </div>
      </div>

      {/* Real AI Insight banner if present in review */}
      {review.aiInsight && (
        <div className="flex items-start gap-3 rounded-2xl border border-primary/20 bg-primary/5 p-4 text-xs">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <div>
            <span className="font-semibold text-foreground">Analysis Synthesis: </span>
            <span className="text-muted-foreground">{review.aiInsight}</span>
          </div>
        </div>
      )}
    </div>
  );
}
