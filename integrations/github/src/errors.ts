export class GitHubWebhookSignatureError extends Error {
  readonly code = 'GITHUB_WEBHOOK_SIGNATURE_INVALID';
  constructor(message = 'Invalid or missing GitHub webhook signature') {
    super(message);
    this.name = 'GitHubWebhookSignatureError';
  }
}

export class GitHubWebhookReplayError extends Error {
  readonly code = 'GITHUB_WEBHOOK_REPLAY_DETECTED';
  constructor(message = 'Duplicate GitHub webhook delivery ID detected') {
    super(message);
    this.name = 'GitHubWebhookReplayError';
  }
}

export class GitHubPRValidationError extends Error {
  readonly code = 'GITHUB_PR_VALIDATION_ERROR';
  constructor(message: string) {
    super(message);
    this.name = 'GitHubPRValidationError';
  }
}

export class GitHubDiffMappingError extends Error {
  readonly code = 'GITHUB_DIFF_MAPPING_ERROR';
  constructor(message: string) {
    super(message);
    this.name = 'GitHubDiffMappingError';
  }
}

export class GitHubApiError extends Error {
  readonly code = 'GITHUB_API_ERROR';
  readonly status: number;
  readonly path: string;

  constructor(status: number, path: string, message?: string) {
    super(message ?? `GitHub API request failed with status ${status}: ${path}`);
    this.name = 'GitHubApiError';
    this.status = status;
    this.path = path;
  }
}

export class GitHubRateLimitError extends Error {
  readonly code = 'GITHUB_RATE_LIMIT_ERROR';
  constructor(message = 'GitHub API Rate Limit exceeded') {
    super(message);
    this.name = 'GitHubRateLimitError';
  }
}

export class GitHubReviewCommentError extends Error {
  readonly code = 'GITHUB_REVIEW_COMMENT_ERROR';
  constructor(message: string) {
    super(message);
    this.name = 'GitHubReviewCommentError';
  }
}
