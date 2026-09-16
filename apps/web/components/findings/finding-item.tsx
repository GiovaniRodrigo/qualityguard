'use client';

import React, { useState } from 'react';
import {
  AlertOctagon,
  AlertTriangle,
  AlertCircle,
  Info,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Copy,
  Check,
  Maximize2,
  FileCode,
  Shield,
  Layers,
  Sparkles,
} from 'lucide-react';
import type { Finding, Review } from '@/lib/api/types';
import { buildGitHubFileUrl } from './github-url';

interface FindingItemProps {
  finding: Finding;
  review?: Review | null;
  onOpenDetail: (finding: Finding) => void;
  defaultExpanded?: boolean;
}

export function FindingItem({
  finding,
  review,
  onOpenDetail,
  defaultExpanded = false,
}: FindingItemProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [copied, setCopied] = useState(false);

  const gitHubUrl = buildGitHubFileUrl(
    review?.repository,
    review?.commitSha || review?.branch,
    finding.file,
    finding.line ?? finding.startLine,
  );

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    const text = `[QualityGuard ${finding.severity.toUpperCase()}] ${finding.title}\nRule: ${finding.ruleId ?? 'N/A'}\nFile: ${finding.file}${finding.line ? `:${finding.line}` : ''}\nCategory: ${finding.category}\n\nDescription: ${finding.description}\nSuggestion: ${finding.suggestion}`;
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getSeverityStyle = (severity: string) => {
    switch (severity.toLowerCase()) {
      case 'critical':
        return {
          badge: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30',
          border: 'border-l-4 border-l-rose-500 hover:border-rose-500/80',
          icon: <AlertOctagon className="h-4 w-4 text-rose-600 dark:text-rose-400 shrink-0" />,
        };
      case 'high':
        return {
          badge: 'bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/30',
          border: 'border-l-4 border-l-orange-500 hover:border-orange-500/80',
          icon: <AlertTriangle className="h-4 w-4 text-orange-600 dark:text-orange-400 shrink-0" />,
        };
      case 'medium':
        return {
          badge: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
          border: 'border-l-4 border-l-amber-500/60 hover:border-amber-500',
          icon: <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />,
        };
      case 'low':
        return {
          badge: 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30',
          border: 'border-l-4 border-l-sky-500/40 hover:border-sky-500',
          icon: <Info className="h-4 w-4 text-sky-600 dark:text-sky-400 shrink-0" />,
        };
      default:
        return {
          badge: 'bg-muted text-muted-foreground border-border',
          border: 'border-l-4 border-l-muted-foreground/30',
          icon: <Info className="h-4 w-4 text-muted-foreground shrink-0" />,
        };
    }
  };

  const style = getSeverityStyle(finding.severity);

  return (
    <div
      className={`group rounded-xl border bg-card transition-all shadow-xs ${style.border}`}
      data-testid="finding-item"
    >
      {/* Header Bar */}
      <div
        onClick={() => setExpanded(!expanded)}
        className="flex cursor-pointer items-start justify-between gap-3 p-4 sm:items-center"
      >
        <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
          {/* Severity Badge */}
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider ${style.badge}`}
            >
              {style.icon}
              {finding.severity.toUpperCase()}
            </span>

            {/* Rule ID */}
            <span className="rounded bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground border">
              {finding.ruleId ?? 'RULE'}
            </span>
          </div>

          {/* Title */}
          <span className="font-semibold text-foreground text-sm flex-1">
            {finding.title}
          </span>
        </div>

        {/* Right Info: File Location & Expand Toggle */}
        <div className="flex items-center gap-2 shrink-0">
          <span className="hidden sm:inline-block rounded bg-muted/60 px-2 py-0.5 font-mono text-xs text-muted-foreground border">
            {`${finding.file}${finding.line ? `:${finding.line}` : ''}`}
          </span>

          <span className="hidden md:inline-block rounded bg-muted/40 px-2 py-0.5 text-[11px] font-medium text-muted-foreground capitalize">
            {finding.category}
          </span>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenDetail(finding);
            }}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            title="Inspect finding detail drawer"
            aria-label="Inspect finding detail"
          >
            <Maximize2 className="h-4 w-4" />
          </button>

          <button
            type="button"
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label={expanded ? 'Collapse finding details' : 'Expand finding details'}
            aria-expanded={expanded}
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Expanded Details Body */}
      {expanded && (
        <div className="border-t border-border/70 bg-muted/15 p-4 space-y-3 text-xs">
          {/* Location on mobile */}
          <div className="sm:hidden flex items-center gap-2 font-mono text-xs text-muted-foreground">
            <FileCode className="h-3.5 w-3.5" />
            <span>
              {`${finding.file}${finding.line ? `:${finding.line}` : ''}`}
            </span>
          </div>

          {/* Description */}
          <div>
            <span className="font-semibold text-foreground">Detection Description: </span>
            <span className="text-foreground/90">{finding.description}</span>
          </div>

          {/* Remediation Suggestion */}
          {finding.suggestion && (
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
              <span className="font-semibold text-primary">Remediation Guidance: </span>
              <span className="text-foreground/90">{finding.suggestion}</span>
            </div>
          )}

          {/* Code Evidence if present */}
          {finding.evidence && finding.evidence.length > 0 && (
            <div>
              <span className="font-semibold text-muted-foreground">Technical Evidence:</span>
              <pre className="mt-1 rounded-lg border bg-background/80 p-3 font-mono text-[11px] text-foreground/90 overflow-x-auto whitespace-pre-wrap">
                {finding.evidence.join('\n')}
              </pre>
            </div>
          )}

          {/* Metadata Bar & Actions */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border/50 text-[11px] text-muted-foreground">
            <div className="flex flex-wrap items-center gap-3">
              <span>
                <strong>Category:</strong> <span className="capitalize">{finding.category}</span>
              </span>
              <span>
                <strong>Source:</strong>{' '}
                {finding.source === 'deterministic'
                  ? 'Deterministic AST Engine'
                  : finding.source === 'correlated'
                    ? 'Architecture Correlation'
                    : 'AI Review'}
              </span>
              {finding.confidence && (
                <span>
                  <strong>Confidence:</strong> {Math.round(finding.confidence * 100)}%
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex items-center gap-1 rounded-md border bg-background px-2.5 py-1 font-medium text-foreground hover:bg-muted transition-colors"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? 'Copied' : 'Copy'}
              </button>

              {gitHubUrl && (
                <a
                  href={gitHubUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-md border bg-background px-2.5 py-1 font-medium text-primary hover:bg-primary/10 transition-colors"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Open in GitHub
                </a>
              )}

              <button
                type="button"
                onClick={() => onOpenDetail(finding)}
                className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1 font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                Full Inspection
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
