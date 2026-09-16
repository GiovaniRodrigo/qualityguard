# Security Policy

We take the security of QualityGuard seriously. Thank you for helping keep the
project and its users safe.

## Supported Versions

QualityGuard is pre-1.0 and under active development. Security fixes are applied
to the latest release line only.

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |
| < 0.1   | :x:                |

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues,
discussions, or pull requests.**

Instead, use one of the following private channels:

1. **GitHub Security Advisories (preferred)** — open a private report at
   [Security → Report a vulnerability](https://github.com/GiovaniRodrigo/qualityguard/security/advisories/new).
2. **Email** — send details to **security@qualityguard.dev** with the subject
   line `SECURITY: <short summary>`.

Please include as much of the following as you can:

- A description of the vulnerability and its impact
- Steps to reproduce, or a proof of concept
- Affected version(s), component(s), and configuration
- Any suggested remediation

### What not to include

Do not include real secrets, customer data, production credentials, or personal
data in your report. Redact tokens, keys, and passwords, and use placeholder
values when demonstrating an issue.

## Disclosure Process

1. **Acknowledgement** — we aim to acknowledge your report within **3 business
   days**.
2. **Assessment** — we investigate, confirm the issue, and determine severity
   (CVSS) and affected versions.
3. **Fix** — we develop and test a fix on a private branch.
4. **Coordinated disclosure** — we agree on a disclosure date with you. We aim
   to release a fix within **90 days** of the initial report, sooner for
   high-severity issues.
5. **Credit** — with your permission, we credit you in the release notes and
   advisory.

We ask that you give us a reasonable opportunity to address the issue before any
public disclosure.

## Scope

In scope:

- The QualityGuard source code in this repository (API, web, CLI, analyzer,
  architecture, AI adapters, GitHub integration).
- Default configuration and Docker/Compose deployment manifests in this
  repository.

Out of scope:

- Vulnerabilities in third-party dependencies (please report those upstream; we
  will update once a fix is available).
- Issues that require a compromised host, physical access, or a
  man-in-the-middle position already inside the trust boundary.
- Findings that depend on non-default, insecure configuration explicitly warned
  against in the documentation.

## Security Practices in This Repository

- No secrets are committed. `.env` and key material are ignored via
  `.gitignore`; only `*.example` files with placeholder values are tracked.
- Authentication tokens are signed and verified with constant-time comparisons.
- Webhook payloads (GitHub, Stripe) are verified against their signing secrets.
- Dependency updates are automated via Dependabot and reviewed before merge.

Thank you for contributing to the security of QualityGuard.
