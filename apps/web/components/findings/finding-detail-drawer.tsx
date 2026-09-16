'use client';

import React, { useEffect } from 'react';
import {
  X,
  AlertOctagon,
  AlertTriangle,
  AlertCircle,
  Info,
  ExternalLink,
  Copy,
  Check,
  FileCode,
  Shield,
  Layers,
  Cpu,
  Sparkles,
} from 'lucide-react';
import type { Finding, Review } from '@/lib/api/types';
import { buildGitHubFileUrl } from './github-url';
import { FindingRemediationPanel } from './finding-remediation-panel';


interface FindingDetailDrawerProps {
  finding: Finding | null;
  review: Review | null;
  onClose: () => void;
}

export function FindingDetailDrawer({ finding, review, onClose }: FindingDetailDrawerProps) {
  const [copied, setCopied] = React.useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!finding) return null;

  const gitHubUrl = buildGitHubFileUrl(
    review?.repository,
    review?.commitSha || review?.branch,
    finding.file,
    finding.line ?? finding.startLine,
  );

  const handleCopy = () => {
    const text = JSON.stringify(finding, null, 2);
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getSeverityBadgeClass = (severity: string) => {
    switch (severity.toLowerCase()) {
      case 'critical':
        return 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30';
      case 'high':
        return 'bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/30';
      case 'medium':
        return 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30';
      case 'low':
        return 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30';
      default:
        return 'bg-muted text-muted-foreground border-border';
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-end bg-background/80 backdrop-blur-xs transition-opacity"
      role="dialog"
      aria-modal="true"
      aria-labelledby="drawer-title"
      data-testid="finding-detail-drawer"
    >
      {/* Backdrop */}
      <div className="fixed inset-0" onClick={onClose} />

      {/* Drawer Body */}
      <div className="relative z-10 flex h-full w-full max-w-2xl flex-col border-l bg-card p-6 shadow-2xl overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between border-b pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-bold uppercase ${getSeverityBadgeClass(
                  finding.severity,
                )}`}
              >
                {finding.severity.toUpperCase()}
              </span>
              <span className="rounded bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground border">
                {finding.ruleId ?? 'RULE'}
              </span>
            </div>
            <h2 id="drawer-title" className="mt-2 text-lg font-bold text-foreground">
              {finding.title}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            aria-label="Close detail panel"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content Section */}
        <div className="mt-6 space-y-6 flex-1 text-sm">
          {/* Location Block */}
          <div className="rounded-xl border bg-muted/30 p-4">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Target Code Location
            </span>
            <div className="mt-2 flex items-center gap-2 font-mono text-xs text-foreground">
              <FileCode className="h-4 w-4 text-primary shrink-0" />
              <span className="select-all font-bold">
                {finding.file}
                {finding.line ? `:${finding.line}` : ''}
              </span>
            </div>
          </div>

          {/* Description */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Finding Overview & Impact
            </h3>
            <p className="mt-2 text-foreground/90 leading-relaxed">{finding.description}</p>
          </div>

          {/* Remediation */}
          {finding.suggestion && (
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-primary">
                Actionable Remediation
              </h3>
              <p className="mt-2 text-foreground leading-relaxed">{finding.suggestion}</p>
            </div>
          )}

          {/* AI Remediation Assistant */}
          <FindingRemediationPanel finding={finding} review={review} />


          {/* Technical Evidence */}
          {finding.evidence && finding.evidence.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Technical AST Evidence
              </h3>
              <pre className="mt-2 rounded-xl border bg-background p-4 font-mono text-xs text-foreground overflow-x-auto whitespace-pre-wrap">
                {finding.evidence.join('\n')}
              </pre>
            </div>
          )}

          {/* Detailed Metadata Grid */}
          <div className="rounded-xl border p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              Detection Metadata
            </h3>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-muted-foreground">Category:</span>
                <p className="font-semibold text-foreground capitalize">{finding.category}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Engine Source:</span>
                <p className="font-semibold text-foreground">
                  {finding.source === 'deterministic'
                    ? 'Deterministic AST Rule Engine'
                    : finding.source === 'correlated'
                      ? 'Architecture Graph Correlation'
                      : 'AI Review Engine'}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Status:</span>
                <p className="font-semibold text-foreground capitalize">{finding.status}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Decision Impact:</span>
                <p className="font-semibold text-foreground uppercase">{finding.decision}</p>
              </div>
              {review?.commitSha && (
                <div className="col-span-2">
                  <span className="text-muted-foreground">Commit SHA:</span>
                  <p className="font-mono text-foreground">{review.commitSha}</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 rounded-lg border bg-background px-3 py-2 text-xs font-semibold text-foreground hover:bg-muted transition-colors"
          >
            {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
            {copied ? 'Copied JSON' : 'Copy Finding JSON'}
          </button>

          <div className="flex items-center gap-2">
            {gitHubUrl && (
              <a
                href={gitHubUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-xs font-semibold text-primary hover:bg-primary/20 transition-colors"
              >
                <ExternalLink className="h-4 w-4" />
                Open in GitHub
              </a>
            )}

            <button
              type="button"
              onClick={onClose}
              className="rounded-lg bg-muted px-4 py-2 text-xs font-semibold text-foreground hover:bg-muted/80 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
