#!/usr/bin/env bash
# Mirror the canonical workflow package (workflows/) into the runner's resource
# directory (src/main/resources/).
#
# The Kogito/SonataFlow codegen discovers workflow definitions ONLY under
# <module>/src/main/resources (AppPaths hardcodes that path - the Maven
# <resources> model is not consulted). The canonical specs therefore live in
# workflows/ (the main deliverable) and this script keeps the runner's copy
# byte-identical to them.
#
# Usage:
#   ./deploy/sync-runner-resources.sh          # copy workflows/ -> src/main/resources/
#   ./deploy/sync-runner-resources.sh --check  # fail if the mirror drifted
#
# Run it after editing anything under workflows/ and commit both trees.
# CI enforces this with `--check`.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
src_dir="$repo_root/workflows"
dst_dir="$repo_root/src/main/resources"
check_mode="${1:-}"

fail=0
while IFS= read -r -d '' src_file; do
    rel="${src_file#"$src_dir"/}"
    dst_file="$dst_dir/$rel"
    if [ "$check_mode" = "--check" ]; then
        if ! diff --strip-trailing-cr -q "$src_file" "$dst_file" >/dev/null 2>&1; then
            echo "DRIFT: $rel differs between workflows/ and src/main/resources/" >&2
            fail=1
        fi
    else
        mkdir -p "$(dirname "$dst_file")"
        cp "$src_file" "$dst_file"
    fi
done < <(find "$src_dir" -type f -print0)

if [ "$check_mode" = "--check" ]; then
    if [ "$fail" -eq 0 ]; then
        echo "OK: src/main/resources mirrors workflows/ byte-for-byte"
    else
        echo "Run ./deploy/sync-runner-resources.sh and commit the mirror." >&2
        exit 1
    fi
else
    echo "Synced workflows/ -> src/main/resources/"
fi
