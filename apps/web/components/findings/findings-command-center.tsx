'use client';

import React, { useState, useMemo } from 'react';
import {
  Play,
  Network,
  History,
  GitBranch,
  FolderGit2,
  Cpu,
  Layers,
  Sparkles,
  ChevronDown,
  ChevronRight,
  ShieldAlert,
} from 'lucide-react';
import type { Project, Review, Finding } from '@/lib/api/types';
import { FindingsSummary } from './findings-summary';
import { FindingsTopPriorities } from './findings-top-priorities';
import { FindingsFilterBar, type GroupByOption } from './findings-filter-bar';
import { FindingItem } from './finding-item';
import { FindingDetailDrawer } from './finding-detail-drawer';
import { FindingsEmptyState } from './findings-empty-states';
import { sortFindingsByPriority } from './github-url';

interface FindingsCommandCenterProps {
  project: Project | null;
  review: Review | null;
  isAnalyzing: boolean;
  analysisStatus: string | null;
  onRunAnalysis: () => void;
  onViewArchitecture?: () => void;
  onViewHistory?: () => void;
  onSignIn?: () => void;
  error?: string | null;
  onRetry?: () => void;
}

export function FindingsCommandCenter({
  project,
  review,
  isAnalyzing,
  analysisStatus,
  onRunAnalysis,
  onViewArchitecture,
  onViewHistory,
  onSignIn,
  error,
  onRetry,
}: FindingsCommandCenterProps) {
  // State for Filters & Search
  const [search, setSearch] = useState('');
  const [severityFilter, setSeverityFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [ruleFilter, setRuleFilter] = useState('all');
  const [fileFilter, setFileFilter] = useState('all');
  const [groupBy, setGroupBy] = useState<GroupByOption>('none');

  // State for Inspection Drawer
  const [selectedFinding, setSelectedFinding] = useState<Finding | null>(null);

  const rawFindings = useMemo(() => review?.findings ?? [], [review]);

  // Derived filter options from real data
  const availableCategories = useMemo(() => {
    const cats = new Set<string>();
    for (const f of rawFindings) {
      if (f.category) cats.add(f.category);
    }
    return Array.from(cats).sort();
  }, [rawFindings]);

  const availableRules = useMemo(() => {
    const rules = new Set<string>();
    for (const f of rawFindings) {
      if (f.ruleId) rules.add(f.ruleId);
    }
    return Array.from(rules).sort();
  }, [rawFindings]);

  const availableFiles = useMemo(() => {
    const files = new Set<string>();
    for (const f of rawFindings) {
      if (f.file) files.add(f.file);
    }
    return Array.from(files).sort();
  }, [rawFindings]);

  // Filtered Findings calculation
  const filteredFindings = useMemo(() => {
    let result = rawFindings;

    if (severityFilter !== 'all') {
      result = result.filter((f) => f.severity.toLowerCase() === severityFilter.toLowerCase());
    }

    if (categoryFilter !== 'all') {
      result = result.filter((f) => f.category.toLowerCase() === categoryFilter.toLowerCase());
    }

    if (ruleFilter !== 'all') {
      result = result.filter((f) => f.ruleId === ruleFilter);
    }

    if (fileFilter !== 'all') {
      result = result.filter((f) => f.file === fileFilter);
    }

    if (search.trim() !== '') {
      const q = search.toLowerCase();
      result = result.filter(
        (f) =>
          f.title.toLowerCase().includes(q) ||
          f.description.toLowerCase().includes(q) ||
          f.file.toLowerCase().includes(q) ||
          (f.ruleId && f.ruleId.toLowerCase().includes(q)) ||
          f.category.toLowerCase().includes(q) ||
          (f.suggestion && f.suggestion.toLowerCase().includes(q)),
      );
    }

    return sortFindingsByPriority(result);
  }, [rawFindings, severityFilter, categoryFilter, ruleFilter, fileFilter, search]);

  // Grouped findings calculation
  const groupedFindings = useMemo(() => {
    if (groupBy === 'none') return null;

    const groups: Record<string, Finding[]> = {};

    for (const finding of filteredFindings) {
      let key = 'Other';
      if (groupBy === 'severity') {
        key = finding.severity.toUpperCase();
      } else if (groupBy === 'category') {
        key = finding.category.toUpperCase();
      } else if (groupBy === 'rule') {
        key = finding.ruleId ?? 'GENERAL_RULE';
      } else if (groupBy === 'file') {
        key = finding.file;
      }

      if (!groups[key]) groups[key] = [];
      groups[key].push(finding);
    }

    return groups;
  }, [filteredFindings, groupBy]);

  const handleResetFilters = () => {
    setSearch('');
    setSeverityFilter('all');
    setCategoryFilter('all');
    setRuleFilter('all');
    setFileFilter('all');
  };

  // Handle Error States
  if (error) {
    if (error.includes('auth') || error.includes('401') || error.includes('session')) {
      return <FindingsEmptyState type="auth-error" onSignIn={onSignIn} />;
    }
    return <FindingsEmptyState type="api-error" onRetry={onRetry} errorMessage={error} />;
  }

  // Handle Running State
  if (isAnalyzing) {
    return <FindingsEmptyState type="analysis-running" analysisStatus={analysisStatus} />;
  }

  // Handle No Analysis State
  if (!review) {
    return <FindingsEmptyState type="no-analysis" onRunAnalysis={onRunAnalysis} />;
  }

  return (
    <div className="space-y-6" data-testid="findings-command-center">
      {/* 1. HEADER */}
      <header className="rounded-2xl border bg-card p-5 shadow-sm">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-primary">
                Quality Review
              </span>
              {review.commitSha && (
                <span className="rounded bg-muted px-2 py-0.5 font-mono text-[10px] text-muted-foreground border">
                  SHA: {review.commitSha.slice(0, 7)}
                </span>
              )}
            </div>

            <h1 className="mt-1 text-2xl font-black tracking-tight text-foreground">
              {project?.name ?? 'Repository Governance'}
            </h1>

            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              {project?.repository && (
                <span className="inline-flex items-center gap-1 font-mono">
                  <FolderGit2 className="h-3.5 w-3.5" />
                  {project.repository.replace(/^https?:\/\//, '')}
                </span>
              )}
              {(review.branch || project?.branch) && (
                <span className="inline-flex items-center gap-1 font-mono">
                  <GitBranch className="h-3.5 w-3.5" />
                  {review.branch || project?.branch}
                </span>
              )}
              <span>Analyzed {new Date(review.createdAt).toLocaleString()}</span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onRunAnalysis}
              className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
            >
              <Play className="h-3.5 w-3.5" />
              Run analysis
            </button>

            {onViewArchitecture && (
              <button
                type="button"
                onClick={onViewArchitecture}
                className="inline-flex items-center gap-1.5 rounded-xl border bg-background px-3.5 py-2 text-xs font-semibold text-foreground hover:bg-muted transition-colors"
              >
                <Network className="h-3.5 w-3.5 text-muted-foreground" />
                View architecture
              </button>
            )}

            {onViewHistory && (
              <button
                type="button"
                onClick={onViewHistory}
                className="inline-flex items-center gap-1.5 rounded-xl border bg-background px-3.5 py-2 text-xs font-semibold text-foreground hover:bg-muted transition-colors"
              >
                <History className="h-3.5 w-3.5 text-muted-foreground" />
                View history
              </button>
            )}
          </div>
        </div>
      </header>

      {/* 2. QUALITY SUMMARY & QUALITY GATE */}
      <FindingsSummary
        review={review}
        findings={rawFindings}
        activeSeverityFilter={severityFilter}
        onSelectSeverityFilter={(sev) => setSeverityFilter(sev)}
      />

      {/* 3. TOP PRIORITIES SECTION (Only when findings exist) */}
      {rawFindings.length > 0 && (
        <FindingsTopPriorities
          findings={rawFindings}
          onSelectFinding={(f) => setSelectedFinding(f)}
        />
      )}

      {/* 4. FILTER BAR */}
      {rawFindings.length > 0 && (
        <FindingsFilterBar
          search={search}
          onSearchChange={setSearch}
          severityFilter={severityFilter}
          onSeverityChange={setSeverityFilter}
          categoryFilter={categoryFilter}
          onCategoryChange={setCategoryFilter}
          ruleFilter={ruleFilter}
          onRuleChange={setRuleFilter}
          fileFilter={fileFilter}
          onFileChange={setFileFilter}
          groupBy={groupBy}
          onGroupByChange={setGroupBy}
          availableCategories={availableCategories}
          availableRules={availableRules}
          availableFiles={availableFiles}
          totalCount={rawFindings.length}
          filteredCount={filteredFindings.length}
          onResetFilters={handleResetFilters}
        />
      )}

      {/* 5. FINDINGS LIST / GROUPED SECTIONS */}
      {rawFindings.length === 0 ? (
        <FindingsEmptyState type="no-findings" />
      ) : filteredFindings.length === 0 ? (
        <FindingsEmptyState type="no-filtered-results" onResetFilters={handleResetFilters} />
      ) : groupBy === 'none' ? (
        /* Flat Findings List */
        <div className="space-y-2.5" data-testid="findings-list-flat">
          {filteredFindings.map((finding, index) => (
            <FindingItem
              key={finding.id ? `${finding.id}-${finding.file}-${index}` : `finding-${index}`}
              finding={finding}
              review={review}
              onOpenDetail={(f) => setSelectedFinding(f)}
            />
          ))}
        </div>
      ) : (
        /* Grouped Findings Sections */
        <div className="space-y-6" data-testid="findings-list-grouped">
          {groupedFindings &&
            Object.entries(groupedFindings).map(([groupTitle, items]) => (
              <div key={groupTitle} className="space-y-3">
                <div className="flex items-center gap-2 border-b pb-2">
                  <Layers className="h-4 w-4 text-primary" />
                  <h3 className="text-sm font-bold uppercase tracking-wider text-foreground">
                    {groupTitle}
                  </h3>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground border">
                    {items.length}
                  </span>
                </div>
                <div className="space-y-2.5 pl-1">
                  {items.map((finding, index) => (
                    <FindingItem
                      key={finding.id ? `${finding.id}-${finding.file}-${groupTitle}-${index}` : `finding-${groupTitle}-${index}`}
                      finding={finding}
                      review={review}
                      onOpenDetail={(f) => setSelectedFinding(f)}
                    />
                  ))}
                </div>
              </div>
            ))}
        </div>
      )}

      {/* 6. FINDING DETAIL DRAWER / INSPECTION MODAL */}
      <FindingDetailDrawer
        finding={selectedFinding}
        review={review}
        onClose={() => setSelectedFinding(null)}
      />
    </div>
  );
}
