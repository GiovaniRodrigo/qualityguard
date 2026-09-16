'use client';

import React from 'react';
import { Search, X, Filter, SlidersHorizontal, Layers } from 'lucide-react';
import type { Finding } from '@/lib/api/types';

export type GroupByOption = 'none' | 'severity' | 'category' | 'rule' | 'file';

interface FindingsFilterBarProps {
  search: string;
  onSearchChange: (query: string) => void;
  severityFilter: string;
  onSeverityChange: (severity: string) => void;
  categoryFilter: string;
  onCategoryChange: (category: string) => void;
  ruleFilter: string;
  onRuleChange: (rule: string) => void;
  fileFilter: string;
  onFileChange: (file: string) => void;
  groupBy: GroupByOption;
  onGroupByChange: (group: GroupByOption) => void;
  availableCategories: string[];
  availableRules: string[];
  availableFiles: string[];
  totalCount: number;
  filteredCount: number;
  onResetFilters: () => void;
}

export function FindingsFilterBar({
  search,
  onSearchChange,
  severityFilter,
  onSeverityChange,
  categoryFilter,
  onCategoryChange,
  ruleFilter,
  onRuleChange,
  fileFilter,
  onFileChange,
  groupBy,
  onGroupByChange,
  availableCategories,
  availableRules,
  availableFiles,
  totalCount,
  filteredCount,
  onResetFilters,
}: FindingsFilterBarProps) {
  const isFiltered =
    search.trim() !== '' ||
    severityFilter !== 'all' ||
    categoryFilter !== 'all' ||
    ruleFilter !== 'all' ||
    fileFilter !== 'all';

  return (
    <div className="space-y-3 rounded-2xl border bg-card p-4 shadow-sm" data-testid="findings-filter-bar">
      {/* Row 1: Search & Filter Summary */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search by rule, message, file, or category..."
            className="w-full rounded-xl border bg-background/70 py-2 pl-9 pr-8 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
          {search && (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Counter indicator */}
        <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
          <span>
            <strong className="text-foreground">{filteredCount}</strong> findings
            {isFiltered && ` (filtered from ${totalCount})`}
          </span>
          {isFiltered && (
            <button
              type="button"
              onClick={onResetFilters}
              className="rounded-lg bg-muted px-2 py-1 text-[11px] font-medium text-foreground hover:bg-muted/80 transition-colors border"
            >
              Reset filters
            </button>
          )}
        </div>
      </div>

      {/* Row 2: Selectable Dropdowns & Severity Quick Pills */}
      <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-border/50 text-xs">
        {/* Severity Filter */}
        <div className="flex items-center gap-1">
          <span className="text-muted-foreground font-medium mr-1">Severity:</span>
          {['all', 'critical', 'high', 'medium', 'low'].map((sev) => (
            <button
              key={sev}
              type="button"
              onClick={() => onSeverityChange(sev)}
              className={`rounded-lg px-2.5 py-1 text-xs font-semibold capitalize transition-all border ${
                severityFilter === sev
                  ? sev === 'critical'
                    ? 'border-rose-500 bg-rose-500/15 text-rose-700 dark:text-rose-300'
                    : sev === 'high'
                      ? 'border-orange-500 bg-orange-500/15 text-orange-700 dark:text-orange-300'
                      : sev === 'medium'
                        ? 'border-amber-500 bg-amber-500/15 text-amber-700 dark:text-amber-300'
                        : sev === 'low'
                          ? 'border-sky-500 bg-sky-500/15 text-sky-700 dark:text-sky-300'
                          : 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-background/50 text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              {sev}
            </button>
          ))}
        </div>

        <div className="h-4 w-[1px] bg-border hidden sm:block mx-1" />

        {/* Category Dropdown */}
        {availableCategories.length > 0 && (
          <select
            value={categoryFilter}
            onChange={(e) => onCategoryChange(e.target.value)}
            className="rounded-lg border bg-background px-2.5 py-1 text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            aria-label="Filter by category"
          >
            <option value="all">All Categories ({availableCategories.length})</option>
            {availableCategories.map((cat) => (
              <option key={cat} value={cat}>
                Category: {cat}
              </option>
            ))}
          </select>
        )}

        {/* Rule Dropdown */}
        {availableRules.length > 0 && (
          <select
            value={ruleFilter}
            onChange={(e) => onRuleChange(e.target.value)}
            className="rounded-lg border bg-background px-2.5 py-1 text-xs font-medium text-foreground max-w-[180px] truncate focus:outline-none focus:ring-1 focus:ring-primary"
            aria-label="Filter by rule"
          >
            <option value="all">All Rules ({availableRules.length})</option>
            {availableRules.map((rule) => (
              <option key={rule} value={rule}>
                {rule}
              </option>
            ))}
          </select>
        )}

        {/* File Dropdown */}
        {availableFiles.length > 0 && (
          <select
            value={fileFilter}
            onChange={(e) => onFileChange(e.target.value)}
            className="rounded-lg border bg-background px-2.5 py-1 text-xs font-medium text-foreground max-w-[180px] truncate focus:outline-none focus:ring-1 focus:ring-primary"
            aria-label="Filter by file"
          >
            <option value="all">All Files ({availableFiles.length})</option>
            {availableFiles.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        )}

        {/* Group By Selector */}
        <div className="ml-auto flex items-center gap-1.5">
          <Layers className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-muted-foreground font-medium">Group by:</span>
          <select
            value={groupBy}
            onChange={(e) => onGroupByChange(e.target.value as GroupByOption)}
            className="rounded-lg border bg-background px-2.5 py-1 text-xs font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            aria-label="Group findings by"
          >
            <option value="none">None (Flat)</option>
            <option value="severity">Severity</option>
            <option value="category">Category</option>
            <option value="rule">Rule ID</option>
            <option value="file">File</option>
          </select>
        </div>
      </div>
    </div>
  );
}
