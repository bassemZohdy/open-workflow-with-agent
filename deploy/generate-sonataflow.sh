#!/usr/bin/env bash
# Regenerate deploy/sonataflow.yaml from the canonical workflow specs.
#
# The SonataFlow CR (OpenShift Serverless Logic, GitOps profile) requires the
# primary workflow inline in `spec.flow`, but the canonical definition lives in
# workflows/agent-call.sw.yaml. This script re-embeds the canonical file (bytes,
# comments included) so the CR can never drift from the spec.
#
# Usage:
#   ./deploy/generate-sonataflow.sh          # rewrite deploy/sonataflow.yaml
#   ./deploy/generate-sonataflow.sh --check  # fail if the CR is out of sync
#
# Run it whenever you edit workflows/agent-call.sw.yaml and commit the
# regenerated CR alongside. CI enforces this with `--check`.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
flow_file="$repo_root/workflows/agent-call.sw.yaml"
cr_file="$repo_root/deploy/sonataflow.yaml"
tmp="$(mktemp)"

# Header: everything in the committed CR up to (excluding) the '  flow:' key.
# Footer: everything from the '  podTemplate:' key onward.
awk '/^  flow:/{exit} {print}' "$cr_file" | sed 's/\r$//' > "$tmp"
printf '  flow:\n' >> "$tmp"
sed 's/\r$//' "$flow_file" | awk '{print "    " $0}' >> "$tmp"
awk '/^  podTemplate:/{p=1} p{print}' "$cr_file" | sed 's/\r$//' >> "$tmp"

if diff -q <(sed 's/\r$//' "$cr_file") "$tmp" >/dev/null 2>&1; then
    rm -f "$tmp"
    if [ "${1:-}" = "--check" ]; then
        echo "OK: deploy/sonataflow.yaml is in sync with workflows/agent-call.sw.yaml"
    else
        echo "deploy/sonataflow.yaml is already up to date."
    fi
    exit 0
fi

if [ "${1:-}" = "--check" ]; then
    echo "ERROR: deploy/sonataflow.yaml is out of sync with workflows/agent-call.sw.yaml." >&2
    echo "Run ./deploy/generate-sonataflow.sh and commit the regenerated CR." >&2
    diff <(sed 's/\r$//' "$cr_file") "$tmp" | head -40 || true
    rm -f "$tmp"
    exit 1
fi

cp "$tmp" "$cr_file"
rm -f "$tmp"
echo "Regenerated deploy/sonataflow.yaml from workflows/agent-call.sw.yaml"
