'use client';

import React from 'react';
import { AlertOctagon, AlertTriangle, AlertCircle, Info, ChevronRight, Zap, ShieldAlert, ArrowUpRight } from 'lucide-react';
import type { Finding } from '@/lib/api/types';
import { sortFindingsByPriority } from './github-url';

interface FindingsTopPrioritiesProps {
  findings: Finding[];
  onSelectFinding: (finding: Finding) => void;
}

export function FindingsTopPriorities({ findings, onSelectFinding }: FindingsTopPrioritiesProps) {
  const topPriorities = sortFindingsByPriority(findings).slice(0, 5);

  if (topPriorities.length === 0) {
    return null;
  }

  const getSeverityBadgeClass = (severity: string) => {
    switch (severity.toLowerCase()) {
      case 'critical':
        return 'bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/30';
      case 'high':
        return 'bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/30';
      case 'medium':
        return 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30';
      case 'low':
        return 'bg-sky-500/15 text-sky-700 dark:text-sky-400 border-sky-500/30';
      default:
        return 'bg-muted text-muted-foreground border-border';
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity.toLowerCase()) {
      case 'critical':
        return <AlertOctagon className="h-3.5 w-3.5 text-rose-600 dark:text-rose-400" />;
      case 'high':
        return <AlertTriangle className="h-3.5 w-3.5 text-orange-600 dark:text-orange-400" />;
      case 'medium':
        return <AlertCircle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />;
      default:
        return <Info className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" />;
    }
  };

  return (
    <section className="rounded-2xl border bg-card p-5 shadow-sm" data-testid="top-priorities-section">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-bold uppercase tracking-wider text-foreground">
            Top priorities (Highest Technical Impact)
          </h3>
        </div>
        <span className="text-xs font-semibold text-muted-foreground">
          Top {topPriorities.length} of {findings.length}
        </span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Ordered by severity, category risk profile, and file location. Address these items first to unblock Quality Gates.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
        {topPriorities.map((finding, index) => (
          <div
            key={finding.id ? `top-${finding.id}-${finding.file}-${index}` : `top-${index}`}
            onClick={() => onSelectFinding(finding)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelectFinding(finding);
              }
            }}
            className="group flex flex-col justify-between rounded-xl border bg-background/50 p-4 transition-all hover:border-primary/50 hover:bg-muted/30 hover:shadow-sm cursor-pointer"
          >
            <div>
              <div className="flex items-center justify-between gap-2">
                <span
                  className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${getSeverityBadgeClass(
                    finding.severity,
                  )}`}
                >
                  {getSeverityIcon(finding.severity)}
                  {finding.severity.toUpperCase()}
                </span>
                <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground border">
                  {finding.ruleId ?? 'RULE'}
                </span>
              </div>

              <h4 className="mt-2 text-sm font-semibold text-foreground line-clamp-1 group-hover:text-primary">
                {finding.title}
              </h4>

              <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                {finding.description}
              </p>
            </div>

            <div className="mt-3 flex items-center justify-between pt-2 border-t border-border/60 text-[11px]">
              <span className="truncate font-mono text-muted-foreground max-w-[180px]">
                {`${finding.file}${finding.line ? `:${finding.line}` : ''}`}
              </span>
              <span className="inline-flex items-center gap-0.5 font-medium text-primary group-hover:underline">
                Inspect <ChevronRight className="h-3 w-3" />
              </span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
