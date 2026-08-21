#!/usr/bin/env bash
set -euo pipefail

manifest="${1:-docs/studio/validation-profile.json}"
backend="src/main/java/org/acme/functions/StudioDocumentService.java"
browser="frontend/studio/src/validation-profile.ts"

[[ -f "$manifest" ]] || { echo "Missing validation profile manifest: $manifest" >&2; exit 1; }
[[ -f "$backend" ]] || { echo "Missing backend validation source: $backend" >&2; exit 1; }
[[ -f "$browser" ]] || { echo "Missing browser validation source: $browser" >&2; exit 1; }

values=()
while IFS= read -r value; do
  values+=("$value")
done < <(ruby -rjson -e '
  value = JSON.parse(File.read(ARGV.fetch(0)))
  abort "schemaVersion must be 1" unless value.fetch("schemaVersion") == 1
  puts value.fetch("ruleSetVersion")
  puts value.fetch("profiles").fetch("workflow")
  puts value.fetch("profiles").fetch("catalog")
' "$manifest")

rule_set="${values[0]}"
workflow_profile="${values[1]}"
catalog_profile="${values[2]}"

for expected in "$rule_set" "$workflow_profile" "$catalog_profile"; do
  rg -Fq "$expected" "$backend" || { echo "Backend validation profile drift: $expected" >&2; exit 1; }
  rg -Fq "$expected" "$browser" || { echo "Browser validation profile drift: $expected" >&2; exit 1; }
done

rg -Fq "<studio.validation.rule-set>${rule_set}</studio.validation.rule-set>" pom.xml \
  || { echo "Maven validation rule-set drift: $rule_set" >&2; exit 1; }
rg -Fq "<studio.validation.workflow-profile>${workflow_profile}</studio.validation.workflow-profile>" pom.xml \
  || { echo "Maven workflow profile drift: $workflow_profile" >&2; exit 1; }
rg -Fq "<studio.validation.catalog-profile>${catalog_profile}</studio.validation.catalog-profile>" pom.xml \
  || { echo "Maven catalog profile drift: $catalog_profile" >&2; exit 1; }

echo "Validation profile is aligned: $rule_set ($workflow_profile, $catalog_profile)"
