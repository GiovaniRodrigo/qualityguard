# Product Definition

## Problem

AI-assisted development increases the amount of code teams can produce, but engineering controls do not automatically scale with code generation speed.

Teams need to know whether a change:

- violates architectural boundaries;
- introduces security risk;
- weakens testability;
- increases complexity or coupling;
- introduces unwanted dependencies;
- creates maintainability or scalability risk;
- conflicts with explicit engineering policies.

## Target customer

Initial target:

- software teams of roughly 5–30 developers;
- GitHub-based workflows;
- meaningful use of AI coding assistants;
- limited dedicated architecture capacity;
- existing codebase or legacy constraints;
- need for repeatable engineering quality controls.

Primary buyers:

- CTOs;
- Engineering Managers;
- Tech Leads;
- Software Architects.

## Value proposition

**QualityGuard turns software architecture and quality rules into an executable control layer for AI-assisted development.**

Instead of replacing human reviewers, it gives them structured evidence and consistent checks before merge.

## Core output

Every finding must be actionable and structured.

Required fields:

- `id`
- `severity`
- `category`
- `status`
- `decision`
- `file`
- `line`
- `title`
- `description`
- `suggestion`
- `confidence`

Recommended contextual fields:

- `body`
- `rationale`
- `impact`
- `ruleId`
- `source`
- `evidence`

## Categories

- architecture
- security
- performance
- clean_code
- testing
- dependency
- scalability
- maintainability

## Decision model

The product should distinguish findings from the final decision.

Possible decisions:

- `approve`
- `review_required`
- `block`

The decision must be explainable from deterministic checks, validated AI findings, or both.

## Initial commercial wedge

Before building a complete SaaS, the same engine should support a paid **AI-assisted Software Architecture & Quality Audit**. This creates a path to first revenue while validating which rules customers repeatedly need.

## Non-goals for MVP

- Generic chat assistant.
- Full autonomous coding agent.
- Multi-IDE support.
- Large enterprise governance suite.
- Complex dashboard before the analysis workflow works.
- Provider-specific business logic.
