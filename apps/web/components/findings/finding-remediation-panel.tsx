'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  Sparkles,
  Square,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Copy,
  Check,
  ShieldAlert,
  Sliders,
  Info,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { streamFindingRemediation, type Finding, type Review } from '@/lib/api';

interface FindingRemediationPanelProps {
  finding: Finding;
  review: Review | null;
}

type RemediationState = 'idle' | 'streaming' | 'completed' | 'error' | 'cancelled';

/**
 * Safe markdown renderer for AI remediation without dangerouslySetInnerHTML.
 * Parses headers, bold, bullet lists, numbered lists, and code/diff blocks.
 */
function SafeMarkdown({ content }: { content: string }) {
  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let inCodeBlock = false;
  let codeBlockLanguage = '';
  let codeBlockBuffer: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;

    // Code block toggle
    if (line.startsWith('```')) {
      if (inCodeBlock) {
        // Close code block
        elements.push(
          <div key={`code-${i}`} className="my-3 rounded-xl border bg-slate-950 p-4 font-mono text-xs text-slate-100 dark:bg-slate-900 shadow-sm overflow-x-auto">
            {codeBlockLanguage && (
              <div className="mb-2 border-b border-slate-800 pb-1 text-[10px] uppercase font-bold text-slate-400">
                {codeBlockLanguage}
              </div>
            )}
            <pre className="whitespace-pre overflow-x-auto">{codeBlockBuffer.join('\n')}</pre>
          </div>
        );
        codeBlockBuffer = [];
        inCodeBlock = false;
        codeBlockLanguage = '';
      } else {
        inCodeBlock = true;
        codeBlockLanguage = line.slice(3).trim();
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockBuffer.push(line);
      continue;
    }

    // Headings
    if (line.startsWith('### ')) {
      elements.push(
        <h4 key={`h3-${i}`} className="mt-4 mb-1.5 text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
          {line.slice(4)}
        </h4>
      );
      continue;
    }
    if (line.startsWith('## ')) {
      elements.push(
        <h3 key={`h2-${i}`} className="mt-5 mb-2 text-sm font-bold text-foreground">
          {line.slice(3)}
        </h3>
      );
      continue;
    }
    if (line.startsWith('# ')) {
      elements.push(
        <h2 key={`h1-${i}`} className="mt-6 mb-2 text-base font-bold text-foreground">
          {line.slice(2)}
        </h2>
      );
      continue;
    }

    // Bullet list items
    if (line.startsWith('- ') || line.startsWith('* ')) {
      elements.push(
        <li key={`li-${i}`} className="ml-4 list-disc text-xs leading-relaxed text-foreground/90">
          {renderInlineFormatting(line.slice(2))}
        </li>
      );
      continue;
    }

    // Numbered list items
    const numberedMatch = line.match(/^(\d+)\.\s+(.*)/);
    if (numberedMatch) {
      elements.push(
        <div key={`num-${i}`} className="ml-1 my-1 flex items-start gap-2 text-xs leading-relaxed text-foreground/90">
          <span className="font-bold text-primary shrink-0">{numberedMatch[1]}.</span>
          <span>{renderInlineFormatting(numberedMatch[2]!)}</span>
        </div>
      );
      continue;
    }

    // Empty line
    if (!line.trim()) {
      elements.push(<div key={`space-${i}`} className="h-2" />);
      continue;
    }

    // Standard paragraph
    elements.push(
      <p key={`p-${i}`} className="text-xs leading-relaxed text-foreground/90 my-1">
        {renderInlineFormatting(line)}
      </p>
    );
  }

  // Flush open code block if stream cut off
  if (inCodeBlock && codeBlockBuffer.length > 0) {
    elements.push(
      <div key="code-dangling" className="my-3 rounded-xl border bg-slate-950 p-4 font-mono text-xs text-slate-100 shadow-sm overflow-x-auto">
        <pre className="whitespace-pre overflow-x-auto">{codeBlockBuffer.join('\n')}</pre>
      </div>
    );
  }

  return <div className="space-y-1">{elements}</div>;
}

/**
 * Parses bold text and inline code blocks safely without HTML injection.
 */
function renderInlineFormatting(text: string): React.ReactNode {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g);
  return parts.map((part, index) => {
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code key={index} className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground border">
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={index} className="font-semibold text-foreground">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return part;
  });
}

export function FindingRemediationPanel({ finding, review }: FindingRemediationPanelProps) {
  const [state, setState] = useState<RemediationState>('idle');
  const [streamedText, setStreamedText] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [providerInfo, setProviderInfo] = useState<{
    provider: string;
    wasLimited?: boolean;
    redacted?: boolean;
    limitReasons?: string[];
  } | null>(null);
  const [copied, setCopied] = useState(false);

  const abortControllerRef = useRef<AbortController | null>(null);
  const streamContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll while streaming
  useEffect(() => {
    if (state === 'streaming' && streamContainerRef.current) {
      streamContainerRef.current.scrollTop = streamContainerRef.current.scrollHeight;
    }
  }, [streamedText, state]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const handleStartRemediation = async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setState('streaming');
    setStreamedText('');
    setErrorMsg(null);
    setProviderInfo(null);

    try {
      await streamFindingRemediation(
        finding.id,
        {
          onStart: (info) => {
            setProviderInfo(info);
          },
          onChunk: (chunk) => {
            setStreamedText((prev) => prev + chunk);
          },
          onComplete: () => {
            setState('completed');
          },
          onError: (err) => {
            setErrorMsg(err.message);
            setState('error');
          },
        },
        { signal: controller.signal },
      );
    } catch (err) {
      if (controller.signal.aborted) {
        setState('cancelled');
      } else {
        setErrorMsg((err as Error).message);
        setState('error');
      }
    }
  };

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setState('cancelled');
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(streamedText).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-2xl border bg-card p-5 shadow-sm space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Sparkles className="size-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold">AI Remediation Assistant</h3>
            <p className="text-[11px] text-muted-foreground">
              Deterministic contextual analysis &amp; step-by-step resolution guide
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {state === 'idle' && (
            <Button size="sm" onClick={handleStartRemediation}>
              <Sparkles className="size-3.5" /> Ask AI for Fix
            </Button>
          )}

          {state === 'streaming' && (
            <Button variant="outline" size="sm" onClick={handleStop} className="text-rose-600 hover:text-rose-700">
              <Square className="size-3.5 fill-current" /> Stop
            </Button>
          )}

          {(state === 'completed' || state === 'cancelled' || state === 'error') && (
            <Button variant="outline" size="sm" onClick={handleStartRemediation}>
              <RefreshCw className="size-3.5" /> Regenerate
            </Button>
          )}
        </div>
      </div>

      {/* Status Badges when active or complete */}
      {providerInfo && (
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          <span className="rounded-full bg-primary/10 px-2.5 py-0.5 font-mono font-medium text-primary">
            Provider: {providerInfo.provider}
          </span>
          {providerInfo.redacted && (
            <span className="rounded-full bg-amber-500/10 px-2.5 py-0.5 text-amber-600 dark:text-amber-400 flex items-center gap-1">
              <ShieldAlert className="size-3" /> Secrets Redacted
            </span>
          )}
          {providerInfo.wasLimited && (
            <span className="rounded-full bg-muted px-2.5 py-0.5 text-muted-foreground flex items-center gap-1">
              <Sliders className="size-3" /> Context Capped
            </span>
          )}
        </div>
      )}

      {/* State: Idle */}
      {state === 'idle' && (
        <div className="rounded-xl border border-dashed bg-muted/20 p-6 text-center">
          <Sparkles className="mx-auto size-7 text-primary/60" />
          <p className="mt-2 text-xs font-semibold">Get automated guidance for this finding</p>
          <p className="mt-1 text-[11px] text-muted-foreground max-w-md mx-auto">
            QualityGuard AI inspects the deterministic AST finding, relevant repository context, and architecture boundaries to suggest a concrete fix.
          </p>
          <Button size="sm" className="mt-4" onClick={handleStartRemediation}>
            <Sparkles className="size-3.5" /> Start AI Remediation
          </Button>
        </div>
      )}

      {/* State: Error */}
      {state === 'error' && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-xs text-destructive">
          <div className="flex items-center gap-2 font-semibold">
            <AlertTriangle className="size-4" /> Falha ao gerar remediation
          </div>
          <p className="mt-1">{errorMsg ?? 'Erro desconhecido ao conectar com o provedor de IA.'}</p>
        </div>
      )}

      {/* State: Cancelled */}
      {state === 'cancelled' && streamedText.length === 0 && (
        <div className="rounded-xl border bg-muted/30 p-4 text-xs text-muted-foreground text-center">
          Generation cancelled by user.
        </div>
      )}

      {/* State: Streaming / Completed Content */}
      {(state === 'streaming' || state === 'completed' || (state === 'cancelled' && streamedText.length > 0)) && (
        <div className="space-y-3">
          <div
            ref={streamContainerRef}
            className="max-h-96 overflow-y-auto rounded-xl border bg-muted/20 p-4"
          >
            <SafeMarkdown content={streamedText} />
            {state === 'streaming' && (
              <div className="mt-2 flex items-center gap-2 text-xs text-primary animate-pulse">
                <span className="size-2 rounded-full bg-primary" /> Generating solution...
              </div>
            )}
          </div>

          <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1">
            <span className="flex items-center gap-1.5">
              {state === 'completed' && (
                <>
                  <CheckCircle2 className="size-3.5 text-emerald-600" />
                  Remediation guide ready
                </>
              )}
              {state === 'streaming' && 'Streaming response in real-time...'}
              {state === 'cancelled' && 'Streaming paused.'}
            </span>

            {streamedText && (
              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex items-center gap-1 rounded px-2 py-1 hover:bg-muted font-medium text-foreground transition-colors"
              >
                {copied ? <Check className="size-3 text-emerald-600" /> : <Copy className="size-3" />}
                {copied ? 'Copied' : 'Copy Guide'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
