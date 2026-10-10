#!/usr/bin/env bash
set -euo pipefail

command -v python3 >/dev/null 2>&1 || {
  echo "Missing required validation runtime: python3" >&2
  exit 127
}

exec python3 "$(dirname "${BASH_SOURCE[0]}")/check-validation-profile.py" "$@"
