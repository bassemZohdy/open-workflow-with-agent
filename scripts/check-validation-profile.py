#!/usr/bin/env python3
"""Check the pinned Studio validation profile using only the standard library."""

import argparse
import json
from pathlib import Path
import sys


class ProfileError(Exception):
    """An input or alignment failure with a diagnostic for the caller."""


def read_source(path: Path, label: str) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except (OSError, UnicodeError) as error:
        raise ProfileError(f"Cannot read {label}: {path}: {error}") from error


def profile_values(manifest: Path) -> tuple[str, str, str]:
    try:
        value = json.loads(read_source(manifest, "validation profile manifest"))
        if (
            not isinstance(value, dict)
            or type(value.get("schemaVersion")) is not int
            or value["schemaVersion"] != 1
        ):
            raise ValueError("schemaVersion must be 1")
        profiles = value["profiles"]
        values = (value["ruleSetVersion"], profiles["workflow"], profiles["catalog"])
        if any(not isinstance(item, str) or not item.strip() for item in values):
            raise ValueError(
                "ruleSetVersion, profiles.workflow and profiles.catalog must be non-empty strings"
            )
        return values
    except (json.JSONDecodeError, KeyError, TypeError, ValueError) as error:
        raise ProfileError(f"Invalid validation profile manifest: {manifest}: {error}") from error


def check_profile(manifest: Path) -> str:
    rule_set, workflow_profile, catalog_profile = profile_values(manifest)
    sources = (
        ("Backend", Path("src/main/java/org/acme/functions/StudioDocumentService.java")),
        ("Browser", Path("frontend/studio/src/validation-profile.ts")),
    )
    for label, path in sources:
        source = read_source(path, f"{label.lower()} validation source")
        for expected in (rule_set, workflow_profile, catalog_profile):
            if expected not in source:
                raise ProfileError(f"{label} validation profile drift: {expected}")

    pom = read_source(Path("pom.xml"), "Maven validation source")
    for property_name, expected, label in (
        ("rule-set", rule_set, "validation rule-set"),
        ("workflow-profile", workflow_profile, "workflow profile"),
        ("catalog-profile", catalog_profile, "catalog profile"),
    ):
        tag = f"studio.validation.{property_name}"
        if f"<{tag}>{expected}</{tag}>" not in pom:
            raise ProfileError(f"Maven {label} drift: {expected}")

    return f"Validation profile is aligned: {rule_set} ({workflow_profile}, {catalog_profile})"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "manifest", nargs="?", type=Path, default=Path("docs/studio/validation-profile.json")
    )
    args = parser.parse_args()
    try:
        print(check_profile(args.manifest))
        return 0
    except ProfileError as error:
        print(error, file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
