'use client';

import { useState } from 'react';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  GitBranch,
  GitCompare,
  Layers3,
  Network,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { compareReviews } from '@/lib/api';
import type { Review, ReviewComparisonResult, Finding } from '@/lib/api/types';

interface ReviewComparisonViewProps {
  projectId: string;
  projectName: string;
  reviews: Review[];
  onSelectReview?: (reviewId: string) => void;
}

export function ReviewComparisonView({
  projectId,
  projectName,
  reviews,
  onSelectReview,
}: ReviewComparisonViewProps) {
  // Default base = 2nd review or 'main', head = 1st review
  const [baseRef, setBaseRef] = useState<string>(
    reviews.length > 1 ? (reviews[1]?.id ?? 'main') : (reviews[0]?.branch ?? 'main'),
  );
  const [headRef, setHeadRef] = useState<string>(
    reviews.length > 0 ? (reviews[0]?.id ?? 'main') : 'main',
  );

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ReviewComparisonResult | null>(null);
  const [activeFindingTab, setActiveFindingTab] = useState<'introduced' | 'resolved' | 'unchanged'>('introduced');

  const handleCompare = async () => {
    if (!baseRef || !headRef) {
      setError('Selecione uma referência base e uma referência de comparação.');
      return;
    }
    if (baseRef === headRef) {
      setError('A referência base e a de comparação devem ser diferentes para calcular o delta.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const cmp = await compareReviews(projectId, { base: baseRef, head: headRef });
      setResult(cmp);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Falha ao executar comparação.');
    } finally {
      setLoading(false);
    }
  };

  const formatReviewOptionLabel = (rev: Review) => {
    const dateStr = new Date(rev.createdAt).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
    const branch = rev.branch ?? 'main';
    const sha = rev.commitSha ? `(${rev.commitSha.slice(0, 7)})` : '';
    return `${branch} ${sha} — Score: ${rev.score}/100 — ${dateStr}`;
  };

  return (
    <div className="space-y-6" data-testid="review-comparison-view">
      {/* Header & Selector Panel */}
      <div className="rounded-2xl border bg-card p-6 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <GitCompare className="size-4" />
              </div>
              <h2 className="text-lg font-semibold tracking-tight">Analysis Comparison & Architecture Drift</h2>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Compare two review snapshots or branches in <span className="font-semibold text-foreground">{projectName}</span> to detect introduced/resolved findings, quality score deltas, and architecture drift.
            </p>
          </div>

          <Button
            onClick={handleCompare}
            disabled={loading || reviews.length < 2}
            className="flex items-center gap-2"
          >
            {loading ? <RefreshCw className="size-4 animate-spin" /> : <GitCompare className="size-4" />}
            <span>Compare Releases</span>
          </Button>
        </div>

        {/* Selectors Grid */}
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* Base Reference Selector */}
          <div className="rounded-xl border bg-muted/40 p-4">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Baseline (Base Reference)
            </label>
            <div className="mt-2">
              {reviews.length > 0 ? (
                <select
                  value={baseRef}
                  onChange={(e) => setBaseRef(e.target.value)}
                  className="w-full rounded-lg border bg-background px-3 py-2 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-primary/20"
                >
                  {reviews.map((rev) => (
                    <option key={`base-${rev.id}`} value={rev.id}>
                      {formatReviewOptionLabel(rev)}
                    </option>
                  ))}
                </select>
              ) : (
                <p className="text-xs text-muted-foreground italic">No historical analyses recorded yet.</p>
              )}
            </div>
          </div>

          {/* Head Reference Selector */}
          <div className="rounded-xl border bg-muted/40 p-4">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Current / Target (Compare Reference)
            </label>
            <div className="mt-2">
              {reviews.length > 0 ? (
                <select
                  value={headRef}
                  onChange={(e) => setHeadRef(e.target.value)}
                  className="w-full rounded-lg border bg-background px-3 py-2 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-primary/20"
                >
                  {reviews.map((rev) => (
                    <option key={`head-${rev.id}`} value={rev.id}>
                      {formatReviewOptionLabel(rev)}
                    </option>
                  ))}
                </select>
              ) : (
                <p className="text-xs text-muted-foreground italic">No historical analyses recorded yet.</p>
              )}
            </div>
          </div>
        </div>

        {error && (
          <div className="mt-4 flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
            <AlertCircle className="size-4 shrink-0 text-rose-600" />
            <span>{error}</span>
          </div>
        )}

        {reviews.length < 2 && !error && (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            <p>
              At least 2 analysis reviews are required to run a multi-release comparison. Run another analysis from the Dashboard or trigger a repository scan.
            </p>
          </div>
        )}
      </div>

      {/* Comparison Results Area */}
      {result && (
        <div className="space-y-6" data-testid="comparison-results">
          {/* Top Summary Cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* 1. Quality Score Delta */}
            <div className="rounded-xl border bg-card p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Quality Score
                </span>
                {result.score.delta > 0 ? (
                  <span className="flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800">
                    <TrendingUp className="size-3" /> +{result.score.delta}
                  </span>
                ) : result.score.delta < 0 ? (
                  <span className="flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-xs font-bold text-rose-800">
                    <TrendingDown className="size-3" /> {result.score.delta}
                  </span>
                ) : (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-bold text-muted-foreground">
                    0
                  </span>
                )}
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-2xl font-bold">{result.score.baseline}</span>
                <ArrowRight className="size-4 text-muted-foreground" />
                <span className="text-2xl font-bold">{result.score.current}</span>
                <span className="text-xs text-muted-foreground">/ 100</span>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {result.score.delta > 0
                  ? 'Overall codebase quality improved'
                  : result.score.delta < 0
                  ? 'Codebase quality regressed'
                  : 'Score remained unchanged'}
              </p>
            </div>

            {/* 2. Quality Gate Delta */}
            <div className="rounded-xl border bg-card p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Quality Gate
                </span>
                {result.gate.current.passed ? (
                  <span className="flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800">
                    <CheckCircle2 className="size-3" /> PASS
                  </span>
                ) : (
                  <span className="flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-xs font-bold text-rose-800">
                    <XCircle className="size-3" /> BLOCK
                  </span>
                )}
              </div>
              <div className="mt-3 font-mono text-sm font-semibold">
                <span className={result.gate.baseline.passed ? 'text-emerald-600' : 'text-rose-600'}>
                  {result.gate.baseline.decision.toUpperCase()}
                </span>
                <span className="mx-2 text-muted-foreground">&rarr;</span>
                <span className={result.gate.current.passed ? 'text-emerald-600' : 'text-rose-600'}>
                  {result.gate.current.decision.toUpperCase()}
                </span>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {result.gate.statusChanged ? 'Quality gate state changed' : 'Gate status persisted'}
              </p>
            </div>

            {/* 3. Findings Delta */}
            <div className="rounded-xl border bg-card p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Findings Delta
                </span>
                <span className="text-xs font-medium text-muted-foreground">
                  Total: {result.findings.totalCurrent}
                </span>
              </div>
              <div className="mt-3 flex items-center gap-3 text-xs font-semibold">
                <div className="flex items-center gap-1 text-rose-700">
                  <span className="rounded bg-rose-100 px-1.5 py-0.5">+{result.findings.introduced.length}</span>
                  <span className="text-[11px] font-normal text-muted-foreground">new</span>
                </div>
                <div className="flex items-center gap-1 text-emerald-700">
                  <span className="rounded bg-emerald-100 px-1.5 py-0.5">-{result.findings.resolved.length}</span>
                  <span className="text-[11px] font-normal text-muted-foreground">fixed</span>
                </div>
                <div className="flex items-center gap-1 text-muted-foreground">
                  <span className="rounded bg-muted px-1.5 py-0.5">{result.findings.unchanged.length}</span>
                  <span className="text-[11px] font-normal text-muted-foreground">same</span>
                </div>
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                Net change: {result.findings.introduced.length - result.findings.resolved.length >= 0 ? '+' : ''}
                {result.findings.introduced.length - result.findings.resolved.length} findings
              </p>
            </div>

            {/* 4. Architecture Drift Summary */}
            <div className="rounded-xl border bg-card p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Architecture Drift
                </span>
                <Network className="size-4 text-primary" />
              </div>
              <div className="mt-3 flex items-center gap-3 text-xs font-semibold">
                <div className="flex items-center gap-1 text-rose-700">
                  <span className="rounded bg-rose-100 px-1.5 py-0.5">+{result.architecture.introducedDrift.length}</span>
                  <span className="text-[11px] font-normal text-muted-foreground">drift</span>
                </div>
                <div className="flex items-center gap-1 text-emerald-700">
                  <span className="rounded bg-emerald-100 px-1.5 py-0.5">-{result.architecture.resolvedDrift.length}</span>
                  <span className="text-[11px] font-normal text-muted-foreground">fixed</span>
                </div>
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                Cycles: +{result.architecture.introducedCycles.length} / -{result.architecture.resolvedCycles.length}
              </p>
            </div>
          </div>

          {/* Test Coverage Delta Section */}
          <div className="rounded-2xl border bg-card p-6 shadow-sm">
            <div className="flex items-center justify-between border-b pb-4">
              <div>
                <h3 className="text-base font-semibold">Test Coverage Comparison</h3>
                <p className="text-xs text-muted-foreground">
                  Line, function, and branch coverage deltas between baseline and target reviews
                </p>
              </div>
              {result.coverage.delta ? (
                <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800">
                  Coverage Available
                </span>
              ) : (
                <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">
                  Unavailable
                </span>
              )}
            </div>

            {result.coverage.delta && result.coverage.baseline && result.coverage.current ? (
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
                {/* Lines */}
                <div className="rounded-xl border bg-muted/20 p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase text-muted-foreground">Line Coverage</span>
                    {result.coverage.delta.lines.delta !== null && (
                      <span
                        className={`rounded px-1.5 py-0.5 text-xs font-bold ${
                          result.coverage.delta.lines.delta >= 0
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {result.coverage.delta.lines.delta >= 0 ? '+' : ''}
                        {result.coverage.delta.lines.delta}%
                      </span>
                    )}
                  </div>
                  <div className="mt-2 flex items-baseline gap-2 font-mono text-lg font-bold">
                    <span>{result.coverage.baseline.lines.percentage ?? '—'}%</span>
                    <ArrowRight className="size-3 text-muted-foreground" />
                    <span>{result.coverage.current.lines.percentage ?? '—'}%</span>
                  </div>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    {result.coverage.current.lines.covered}/{result.coverage.current.lines.total} lines covered
                  </p>
                </div>

                {/* Functions */}
                <div className="rounded-xl border bg-muted/20 p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase text-muted-foreground">Functions</span>
                    {result.coverage.delta.functions.delta !== null && (
                      <span
                        className={`rounded px-1.5 py-0.5 text-xs font-bold ${
                          result.coverage.delta.functions.delta >= 0
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {result.coverage.delta.functions.delta >= 0 ? '+' : ''}
                        {result.coverage.delta.functions.delta}%
                      </span>
                    )}
                  </div>
                  <div className="mt-2 flex items-baseline gap-2 font-mono text-lg font-bold">
                    <span>{result.coverage.baseline.functions.percentage ?? '—'}%</span>
                    <ArrowRight className="size-3 text-muted-foreground" />
                    <span>{result.coverage.current.functions.percentage ?? '—'}%</span>
                  </div>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    {result.coverage.current.functions.covered}/{result.coverage.current.functions.total} functions hit
                  </p>
                </div>

                {/* Branches */}
                <div className="rounded-xl border bg-muted/20 p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase text-muted-foreground">Branches</span>
                    {result.coverage.delta.branches.delta !== null && (
                      <span
                        className={`rounded px-1.5 py-0.5 text-xs font-bold ${
                          result.coverage.delta.branches.delta >= 0
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {result.coverage.delta.branches.delta >= 0 ? '+' : ''}
                        {result.coverage.delta.branches.delta}%
                      </span>
                    )}
                  </div>
                  <div className="mt-2 flex items-baseline gap-2 font-mono text-lg font-bold">
                    <span>{result.coverage.baseline.branches.percentage ?? '—'}%</span>
                    <ArrowRight className="size-3 text-muted-foreground" />
                    <span>{result.coverage.current.branches.percentage ?? '—'}%</span>
                  </div>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    {result.coverage.current.branches.covered}/{result.coverage.current.branches.total} branches taken
                  </p>
                </div>
              </div>
            ) : (
              <div className="mt-4 rounded-xl border border-dashed p-6 text-center text-xs text-muted-foreground">
                <p>Coverage data unavailable for one or both of the compared reviews.</p>
                <p className="mt-1 text-[11px]">
                  Upload an LCOV or JaCoCo coverage artifact to <code className="font-mono text-foreground">POST /api/projects/:id/coverage</code> to enable coverage diffing.
                </p>
              </div>
            )}
          </div>

          {/* Detailed Findings Diff Section */}
          <div className="rounded-2xl border bg-card p-6 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b pb-4">
              <div>
                <h3 className="text-base font-semibold">Findings Diff</h3>
                <p className="text-xs text-muted-foreground">
                  Detailed inspection of new, fixed, and persistent findings
                </p>
              </div>

              {/* Tabs */}
              <div className="flex items-center gap-1 rounded-lg bg-muted p-1 text-xs">
                <button
                  onClick={() => setActiveFindingTab('introduced')}
                  className={`rounded-md px-3 py-1.5 font-medium transition ${
                    activeFindingTab === 'introduced'
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Introduced ({result.findings.introduced.length})
                </button>
                <button
                  onClick={() => setActiveFindingTab('resolved')}
                  className={`rounded-md px-3 py-1.5 font-medium transition ${
                    activeFindingTab === 'resolved'
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Resolved ({result.findings.resolved.length})
                </button>
                <button
                  onClick={() => setActiveFindingTab('unchanged')}
                  className={`rounded-md px-3 py-1.5 font-medium transition ${
                    activeFindingTab === 'unchanged'
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Unchanged ({result.findings.unchanged.length})
                </button>
              </div>
            </div>

            {/* List */}
            <div className="mt-4 divide-y">
              {activeFindingTab === 'introduced' && (
                <div>
                  {result.findings.introduced.length > 0 ? (
                    result.findings.introduced.map((finding) => (
                      <FindingDiffItem key={`intro-${finding.id}`} finding={finding} type="introduced" />
                    ))
                  ) : (
                    <div className="p-8 text-center text-xs text-muted-foreground">
                      🎉 No new findings introduced in this release!
                    </div>
                  )}
                </div>
              )}

              {activeFindingTab === 'resolved' && (
                <div>
                  {result.findings.resolved.length > 0 ? (
                    result.findings.resolved.map((finding) => (
                      <FindingDiffItem key={`res-${finding.id}`} finding={finding} type="resolved" />
                    ))
                  ) : (
                    <div className="p-8 text-center text-xs text-muted-foreground">
                      No findings were resolved between these releases.
                    </div>
                  )}
                </div>
              )}

              {activeFindingTab === 'unchanged' && (
                <div>
                  {result.findings.unchanged.length > 0 ? (
                    result.findings.unchanged.map((finding) => (
                      <FindingDiffItem key={`unc-${finding.id}`} finding={finding} type="unchanged" />
                    ))
                  ) : (
                    <div className="p-8 text-center text-xs text-muted-foreground">
                      No persistent findings across these releases.
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Dependencies & Architecture Side by Side */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Dependencies Drift */}
            <div className="rounded-2xl border bg-card p-6 shadow-sm">
              <div className="flex items-center gap-2 border-b pb-4">
                <Layers3 className="size-4 text-primary" />
                <h3 className="text-base font-semibold">Dependency Drift</h3>
              </div>

              <div className="mt-4 space-y-4 text-xs">
                {/* Added */}
                <div>
                  <h4 className="font-semibold text-emerald-800">Added ({result.dependencies.added.length})</h4>
                  {result.dependencies.added.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {result.dependencies.added.map((dep) => (
                        <span key={`added-${dep.ecosystem}-${dep.name}`} className="rounded bg-emerald-50 border border-emerald-200 px-2 py-1 font-mono text-[11px] text-emerald-900">
                          +{dep.name} @ {dep.version || 'latest'} ({dep.ecosystem})
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-1 text-[11px] text-muted-foreground italic">None</p>
                  )}
                </div>

                {/* Removed */}
                <div>
                  <h4 className="font-semibold text-rose-800">Removed ({result.dependencies.removed.length})</h4>
                  {result.dependencies.removed.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {result.dependencies.removed.map((dep) => (
                        <span key={`rem-${dep.ecosystem}-${dep.name}`} className="rounded bg-rose-50 border border-rose-200 px-2 py-1 font-mono text-[11px] line-through text-rose-900">
                          -{dep.name} @ {dep.version || 'unknown'} ({dep.ecosystem})
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-1 text-[11px] text-muted-foreground italic">None</p>
                  )}
                </div>

                {/* Changed */}
                <div>
                  <h4 className="font-semibold text-amber-800">Upgraded / Changed ({result.dependencies.changed.length})</h4>
                  {result.dependencies.changed.length > 0 ? (
                    <div className="mt-2 space-y-1.5">
                      {result.dependencies.changed.map((dep) => (
                        <div key={`chg-${dep.ecosystem}-${dep.name}`} className="flex items-center justify-between rounded bg-amber-50/60 border border-amber-200 px-2 py-1 font-mono text-[11px]">
                          <span className="font-semibold">{dep.name}</span>
                          <span className="text-muted-foreground">
                            {dep.previousVersion || 'none'} &rarr; <span className="font-bold text-foreground">{dep.currentVersion}</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-1 text-[11px] text-muted-foreground italic">None</p>
                  )}
                </div>
              </div>
            </div>

            {/* Architecture Violations Drift */}
            <div className="rounded-2xl border bg-card p-6 shadow-sm">
              <div className="flex items-center gap-2 border-b pb-4">
                <Network className="size-4 text-primary" />
                <h3 className="text-base font-semibold">Architecture Governance Drift</h3>
              </div>

              <div className="mt-4 space-y-4 text-xs">
                {/* Introduced Drift */}
                <div>
                  <h4 className="font-semibold text-rose-800">New Architecture Violations ({result.architecture.introducedDrift.length})</h4>
                  {result.architecture.introducedDrift.length > 0 ? (
                    <div className="mt-2 space-y-1.5">
                      {result.architecture.introducedDrift.map((d, idx) => (
                        <div key={`intro-d-${idx}`} className="rounded border border-rose-200 bg-rose-50/60 p-2 text-rose-900">
                          <p className="font-semibold">{d.message}</p>
                          <p className="mt-0.5 font-mono text-[10px] text-rose-700">{d.from} &rarr; {d.to}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-1 text-[11px] text-muted-foreground italic">No new architecture violations introduced.</p>
                  )}
                </div>

                {/* Resolved Drift */}
                <div>
                  <h4 className="font-semibold text-emerald-800">Resolved Violations ({result.architecture.resolvedDrift.length})</h4>
                  {result.architecture.resolvedDrift.length > 0 ? (
                    <div className="mt-2 space-y-1.5">
                      {result.architecture.resolvedDrift.map((d, idx) => (
                        <div key={`res-d-${idx}`} className="rounded border border-emerald-200 bg-emerald-50/60 p-2 text-emerald-900">
                          <p className="font-semibold">{d.message}</p>
                          <p className="mt-0.5 font-mono text-[10px] text-emerald-700">{d.from} &rarr; {d.to}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-1 text-[11px] text-muted-foreground italic">None resolved.</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FindingDiffItem({
  finding,
  type,
}: {
  finding: Finding;
  type: 'introduced' | 'resolved' | 'unchanged';
}) {
  const badgeColor =
    type === 'introduced'
      ? 'bg-rose-100 text-rose-800 border-rose-200'
      : type === 'resolved'
      ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
      : 'bg-muted text-muted-foreground border-transparent';

  const severityColor =
    finding.severity === 'critical'
      ? 'bg-rose-600 text-white'
      : finding.severity === 'high'
      ? 'bg-amber-600 text-white'
      : 'bg-slate-600 text-white';

  return (
    <div className="py-3 flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${severityColor}`}>
          {finding.severity}
        </span>
        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${badgeColor}`}>
          {type.toUpperCase()}
        </span>
        <span className="font-mono text-xs font-semibold text-foreground">{finding.file}</span>
        {finding.line && <span className="font-mono text-xs text-muted-foreground">:{finding.line}</span>}
      </div>

      <p className="text-xs font-semibold">{finding.title}</p>
      <p className="text-xs text-muted-foreground">{finding.description}</p>

      {finding.evidence && finding.evidence.length > 0 && (
        <pre className="mt-1 rounded bg-muted/70 p-2 font-mono text-[11px] text-foreground overflow-x-auto">
          {finding.evidence.join('\n')}
        </pre>
      )}
    </div>
  );
}
