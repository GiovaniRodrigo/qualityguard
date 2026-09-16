import type { Finding } from '@qualityguard/domain';
import { verifyGitHubWebhook, type PullRequestEvent, shouldReviewPullRequest } from './webhook.js';
import type { GitHubClient, PullRequestDetails, ReviewComment } from './client.js';
import {
  mapFindingToDiffPosition,
  formatInlineComment,
  formatReviewBody,
} from './diff-mapping.js';
import {
  GitHubWebhookSignatureError,
  GitHubPRValidationError,
} from './errors.js';

export interface GitHubWebhookDeliveryStore {
  recordDelivery(id: string): Promise<boolean>;
}

export interface VerifyWebhookOptions {
  rawBody: string;
  signature?: string | undefined;
  deliveryId?: string | undefined;
  secret: string;
  store?: GitHubWebhookDeliveryStore | undefined;
}

export interface WebhookVerificationResult {
  accepted: boolean;
  deliveryId?: string | undefined;
  duplicate: boolean;
  shouldAnalyze: boolean;
  event?: PullRequestEvent | undefined;
  reason?: string | undefined;
}

export async function verifyAndProcessWebhook(
  options: VerifyWebhookOptions,
): Promise<WebhookVerificationResult> {
  const { rawBody, signature, deliveryId, secret, store } = options;

  if (!signature || typeof signature !== 'string') {
    throw new GitHubWebhookSignatureError('Missing x-hub-signature-256 header in webhook request');
  }

  const isValid = verifyGitHubWebhook(rawBody, signature, secret);
  if (!isValid) {
    throw new GitHubWebhookSignatureError('Invalid GitHub webhook signature');
  }

  if (deliveryId && store) {
    const isFresh = await store.recordDelivery(deliveryId);
    if (!isFresh) {
      return {
        accepted: true,
        deliveryId,
        duplicate: true,
        shouldAnalyze: false,
        reason: 'Webhook delivery already processed (idempotent)',
      };
    }
  }

  let event: PullRequestEvent;
  try {
    event = JSON.parse(rawBody) as PullRequestEvent;
  } catch {
    throw new GitHubPRValidationError('Invalid JSON payload in webhook body');
  }

  const shouldAnalyze = shouldReviewPullRequest(event);

  return {
    accepted: true,
    deliveryId,
    duplicate: false,
    shouldAnalyze,
    event,
    reason: shouldAnalyze ? undefined : `Event action '${event.action}' is not reviewable`,
  };
}

export interface GovernanceReviewOutput {
  score: number;
  decision: string;
  analyzedFiles: number;
  findings: Finding[];
  categoryScores?: {
    architecture?: number | undefined;
    security?: number | undefined;
    testing?: number | null | undefined;
    dependencies?: number | undefined;
  } | undefined;
  aiInsight?: string | undefined;
}

export type GitHubPRGovernanceRunner = (
  diff: string,
  pr: PullRequestDetails,
) => Promise<GovernanceReviewOutput>;

export interface PRGovernanceParams {
  client: GitHubClient;
  owner: string;
  repo: string;
  prNumber: number;
  headSha: string;
  runner: GitHubPRGovernanceRunner;
}

export interface PRGovernanceResult {
  checkRunId: number;
  reviewId: number;
  score: number;
  decision: string;
  conclusion: 'success' | 'failure' | 'neutral';
  inlineCommentsCount: number;
  unmappedFindingsCount: number;
}

export async function handlePullRequestGovernance(
  params: PRGovernanceParams,
): Promise<PRGovernanceResult> {
  const { client, owner, repo, prNumber, headSha, runner } = params;

  // 1. Create Initial Check Run in 'in_progress' state
  const checkRun = await client.createCheckRun(owner, repo, {
    name: 'QualityGuard Governance',
    head_sha: headSha,
    status: 'in_progress',
    output: {
      title: 'QualityGuard Analysis Running...',
      summary: 'Evaluating Pull Request quality gates, architecture integrity, and security policies.',
    },
  });

  try {
    // 2. Fetch Pull Request details and diff
    const [prDetails, diff] = await Promise.all([
      client.getPullRequest(owner, repo, prNumber),
      client.getPullRequestDiff(owner, repo, prNumber),
    ]);

    // 3. Execute Analysis Engine Runner
    const output = await runner(diff, prDetails);

    // 4. Map findings to diff positions
    const comments: ReviewComment[] = [];
    let unmappedFindingsCount = 0;

    for (const finding of output.findings) {
      // Prioritize high and critical findings for inline comments
      const shouldCommentInline = finding.severity === 'critical' || finding.severity === 'high';
      if (shouldCommentInline) {
        const position = mapFindingToDiffPosition(finding, diff);
        if (position) {
          comments.push({
            path: position.path,
            line: position.line,
            side: position.side,
            ...(position.start_line ? { start_line: position.start_line, start_side: position.start_side } : {}),
            body: formatInlineComment(finding),
          });
        } else {
          unmappedFindingsCount++;
        }
      } else {
        unmappedFindingsCount++;
      }
    }

    // 5. Evaluate Gate Conclusion
    const hasCriticalOrHigh = output.findings.some(
      (f) => (f.severity === 'critical' || f.severity === 'high') && f.status === 'open',
    );
    const isGateFailed = output.decision === 'block' || hasCriticalOrHigh || output.score < 80;

    const conclusion: 'success' | 'failure' | 'neutral' = isGateFailed
      ? 'failure'
      : output.decision === 'review_required'
        ? 'neutral'
        : 'success';

    const reasons: string[] = [];
    if (output.score < 80) reasons.push(`Quality score (${output.score}/100) is below required threshold of 80.`);
    if (hasCriticalOrHigh) reasons.push(`Detected open high/critical security or architecture findings.`);
    if (reasons.length === 0) reasons.push('All governance checks and quality thresholds passed successfully.');

    // 6. Format Review Body
    const reviewBody = formatReviewBody({
      score: output.score,
      decision: output.decision,
      passed: conclusion === 'success',
      reasons,
      findingsCount: output.findings.length,
      inlineCommentsCount: comments.length,
      unmappedFindingsCount,
      categoryScores: output.categoryScores,
      aiInsight: output.aiInsight,
    });

    // 7. Update Check Run to 'completed'
    await client.updateCheckRun(owner, repo, checkRun.id, {
      status: 'completed',
      conclusion,
      output: {
        title: conclusion === 'success' ? 'QualityGuard Gate PASSED' : 'QualityGuard Gate FAILED',
        summary: `Quality Score: ${output.score}/100 | Gate Decision: ${output.decision.toUpperCase()}`,
        text: reviewBody,
      },
    });

    // 8. Submit Pull Request Review
    const reviewEvent: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT' =
      conclusion === 'failure'
        ? 'REQUEST_CHANGES'
        : conclusion === 'neutral'
          ? 'COMMENT'
          : 'APPROVE';

    const review = await client.createReview(owner, repo, prNumber, {
      event: reviewEvent,
      body: reviewBody,
      comments: comments.length > 0 ? comments : undefined,
    });

    return {
      checkRunId: checkRun.id,
      reviewId: review.id,
      score: output.score,
      decision: output.decision,
      conclusion,
      inlineCommentsCount: comments.length,
      unmappedFindingsCount,
    };
  } catch (error) {
    // If analysis fails, update Check Run to failure with descriptive reason
    const errorMsg = error instanceof Error ? error.message : String(error);
    await client.updateCheckRun(owner, repo, checkRun.id, {
      status: 'completed',
      conclusion: 'failure',
      output: {
        title: 'QualityGuard Governance Analysis Error',
        summary: `Analysis pipeline encountered an error: ${errorMsg}`,
      },
    }).catch(() => {});
    throw error;
  }
}
