#!/usr/bin/env bash
set -euo pipefail

dist_root="${1:-target/studio-dist}"
packaged_root="${2:-target/classes/META-INF/resources/studio}"

if [[ ! -d "$dist_root" ]]; then
  echo "Studio build output is missing: $dist_root" >&2
  exit 1
fi
if [[ ! -d "$packaged_root" ]]; then
  echo "Packaged Studio resources are missing: $packaged_root" >&2
  exit 1
fi

for required in index.html validation-rules.html; do
  if [[ ! -f "$dist_root/$required" || ! -f "$packaged_root/$required" ]]; then
    echo "Required Studio asset is missing: $required" >&2
    exit 1
  fi
done

dist_manifest="$(mktemp)"
packaged_manifest="$(mktemp)"
trap 'rm -f "$dist_manifest" "$packaged_manifest"' EXIT

(cd "$dist_root" && find . -type f -print | LC_ALL=C sort) > "$dist_manifest"
(cd "$packaged_root" && find . -type f -print | LC_ALL=C sort) > "$packaged_manifest"

if ! cmp -s "$dist_manifest" "$packaged_manifest"; then
  echo "Studio packaged asset manifest drifted from the build output." >&2
  diff -u "$dist_manifest" "$packaged_manifest" >&2 || true
  exit 1
fi

while IFS= read -r relative_path; do
  if ! cmp -s "$dist_root/$relative_path" "$packaged_root/$relative_path"; then
    echo "Studio packaged asset differs from build output: $relative_path" >&2
    exit 1
  fi
done < "$dist_manifest"

if find "$packaged_root" -type f \( \
  -name '*.map' -o -name '*.ts' -o -name '*.tsx' -o -name '*.jsx' \
\) -print -quit | grep -q .; then
  echo "Development sources or source maps must not be packaged with Studio." >&2
  exit 1
fi

if ! grep -q '/studio/assets/' "$packaged_root/index.html"; then
  echo "Studio index.html does not reference the packaged asset base path." >&2
  exit 1
fi

echo "Studio bundle verification passed: $packaged_root"
