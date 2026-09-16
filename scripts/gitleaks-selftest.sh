#!/usr/bin/env bash
#
# gitleaks-selftest.sh — guards against the gitleaks allowlist silently
# degrading into "allow everything".
#
# It plants a canary secret (a syntactically valid AWS access key that is NOT in
# .gitleaks.toml's allowlist) into a throwaway directory, runs gitleaks with the
# repository's own config, and asserts the secret IS detected. If gitleaks
# reports the canary as clean, the config has become too permissive and this
# script exits non-zero.
#
# Usage: ./scripts/gitleaks-selftest.sh
# Requires: docker (or a local `gitleaks` binary on PATH).

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG="${REPO_ROOT}/.gitleaks.toml"
# A non-allowlisted, obviously-canary AWS key. Built at runtime from parts so
# THIS script file contains no contiguous AWS-key literal for gitleaks to flag
# (the whole point of the test is that such a literal IS detected — see below).
CANARY="AKIA$(printf '%s' 'QYLPMN5HHHFPZAM2')"

if [[ ! -f "${CONFIG}" ]]; then
  echo "FAIL: ${CONFIG} not found" >&2
  exit 2
fi

WORKDIR="$(mktemp -d)"
trap 'rm -rf "${WORKDIR}"' EXIT

cp "${CONFIG}" "${WORKDIR}/.gitleaks.toml"
# Plant the canary inside a path that IS heavily used by real fixtures, to prove
# the allowlist is value-scoped, not path-scoped.
mkdir -p "${WORKDIR}/packages/x/src"
printf 'const awsKey = "%s";\n' "${CANARY}" > "${WORKDIR}/packages/x/src/canary.test.ts"

run_gitleaks() {
  if command -v gitleaks >/dev/null 2>&1; then
    gitleaks detect --source="${WORKDIR}" --config="${WORKDIR}/.gitleaks.toml" \
      --no-git --no-banner
  else
    docker run --rm -v "${WORKDIR}":/repo -w /repo zricethezav/gitleaks:latest \
      detect --source=/repo --config=/repo/.gitleaks.toml --no-git --no-banner
  fi
}

# gitleaks exits non-zero when it finds leaks. For this self-test, finding the
# canary is the SUCCESS condition.
if run_gitleaks; then
  echo "FAIL: gitleaks did not detect the canary secret — the allowlist is too broad." >&2
  exit 1
fi

echo "PASS: gitleaks detected the non-allowlisted canary secret; allowlist is value-scoped."
