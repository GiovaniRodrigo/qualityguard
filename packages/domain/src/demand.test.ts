import { describe, expect, it } from 'vitest';
import {
  DEMAND_SOURCES,
  DEMAND_PRIORITIES,
  CRITERION_TYPES,
  EVIDENCE_TYPES,
  EVIDENCE_STATUSES,
  VALIDATION_STATUSES,
  MAPPING_SOURCES,
  TEST_FRAMEWORKS,
  isDemandSource,
  isDemandPriority,
  isCriterionType,
  isEvidenceType,
  isValidationStatus,
  type Demand,
  type DemandCriterion,
  type DemandEvidence,
  type DemandCodeMapping,
  type DemandTestMapping,
} from './demand.js';

describe('demand-validation enums', () => {
  it('exposes the spec-defined demand sources (§4)', () => {
    expect([...DEMAND_SOURCES]).toEqual([
      'INTERNAL',
      'GITHUB',
      'GITLAB',
      'JIRA',
      'LINEAR',
      'AZURE_DEVOPS',
      'OTHER',
    ]);
  });

  it('exposes the spec-defined criterion types (§5)', () => {
    expect([...CRITERION_TYPES]).toEqual([
      'FUNCTIONAL',
      'BUSINESS_RULE',
      'SECURITY',
      'PERFORMANCE',
      'DATA',
      'INTEGRATION',
      'OTHER',
    ]);
  });

  it('exposes the spec-defined validation states (§2)', () => {
    expect([...VALIDATION_STATUSES]).toEqual([
      'PENDING',
      'VALIDATED',
      'PARTIAL',
      'FAILED',
      'NO_EVIDENCE',
      'BLOCKED',
    ]);
  });

  it('exposes the spec-defined evidence types (§7)', () => {
    expect([...EVIDENCE_TYPES]).toEqual([
      'SOURCE_CODE',
      'TEST',
      'TEST_RESULT',
      'COVERAGE',
      'STATIC_ANALYSIS',
      'SECURITY_SCAN',
      'PULL_REQUEST',
      'COMMIT',
      'CI_RUN',
      'DOCUMENTATION',
      'MANUAL',
    ]);
  });

  it('defines evidence statuses, mapping sources, priorities and frameworks', () => {
    expect(EVIDENCE_STATUSES.length).toBeGreaterThan(0);
    expect(MAPPING_SOURCES.length).toBeGreaterThan(0);
    expect(DEMAND_PRIORITIES.length).toBeGreaterThan(0);
    expect(TEST_FRAMEWORKS.length).toBeGreaterThan(0);
  });
});

describe('demand-validation type guards', () => {
  it('accepts valid enum members and rejects unknown values', () => {
    expect(isDemandSource('GITHUB')).toBe(true);
    expect(isDemandSource('BITBUCKET')).toBe(false);

    expect(isDemandPriority('HIGH')).toBe(true);
    expect(isDemandPriority('urgent')).toBe(false);

    expect(isCriterionType('SECURITY')).toBe(true);
    expect(isCriterionType('nonsense')).toBe(false);

    expect(isEvidenceType('TEST_RESULT')).toBe(true);
    expect(isEvidenceType('LOG')).toBe(false);

    expect(isValidationStatus('NO_EVIDENCE')).toBe(true);
    expect(isValidationStatus('MAYBE')).toBe(false);
  });
});

describe('demand-validation model shapes', () => {
  it('creates a Demand (§4)', () => {
    const demand: Demand = {
      id: 'd-1',
      projectId: 'p-1',
      organizationId: 'org-1',
      externalId: '123',
      title: 'Password recovery',
      description: 'Allow users to reset their password',
      source: 'GITHUB',
      sourceUrl: 'https://github.com/acme/app/issues/123',
      status: 'PENDING',
      priority: 'HIGH',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    expect(demand.source).toBe('GITHUB');
    expect(demand.status).toBe('PENDING');
  });

  it('creates a DemandCriterion with a blocking flag (§5, §16)', () => {
    const criterion: DemandCriterion = {
      id: 'c-1',
      demandId: 'd-1',
      description: 'Expired token is rejected',
      position: 4,
      type: 'SECURITY',
      status: 'FAILED',
      isBlocking: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    expect(criterion.isBlocking).toBe(true);
    expect(criterion.status).toBe('FAILED');
  });

  it('creates a DemandEvidence (§7)', () => {
    const evidence: DemandEvidence = {
      id: 'e-1',
      criterionId: 'c-1',
      type: 'TEST_RESULT',
      source: 'vitest',
      reference: 'PasswordResetTest::expired_token_is_rejected',
      description: 'Rejects an expired reset token',
      status: 'FAIL',
      metadata: { durationMs: 12 },
      createdAt: new Date().toISOString(),
    };
    expect(evidence.type).toBe('TEST_RESULT');
    expect(evidence.status).toBe('FAIL');
  });

  it('creates a DemandCodeMapping treating confidence as metadata (§8)', () => {
    const mapping: DemandCodeMapping = {
      id: 'm-1',
      criterionId: 'c-1',
      filePath: 'packages/api/src/password-reset.ts',
      symbol: 'resetPassword',
      lineStart: 40,
      lineEnd: 62,
      confidence: 0.94,
      source: 'AI',
      createdAt: new Date().toISOString(),
    };
    expect(mapping.confidence).toBeCloseTo(0.94);
    expect(mapping.source).toBe('AI');
  });

  it('creates a DemandTestMapping (§9)', () => {
    const mapping: DemandTestMapping = {
      id: 't-1',
      criterionId: 'c-1',
      testFile: 'tests/password-reset.test.ts',
      testName: 'expired_token_is_rejected',
      framework: 'vitest',
      confidence: 0.88,
      createdAt: new Date().toISOString(),
    };
    expect(mapping.testName).toBe('expired_token_is_rejected');
    expect(mapping.framework).toBe('vitest');
  });
});
