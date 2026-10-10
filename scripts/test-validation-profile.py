#!/usr/bin/env python3
"""CLI regressions for profile alignment, independent of Ruby and ripgrep."""

import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


CHECKER = Path(__file__).with_name("check-validation-profile.py").resolve()
MANIFEST = "docs/studio/validation-profile.json"
BACKEND = "src/main/java/org/acme/functions/StudioDocumentService.java"
BROWSER = "frontend/studio/src/validation-profile.ts"
VALUES = ("studio-validation-2026-08-20.1", "workflow-0.8-local-1", "openapi-3.x-local-1")
TAGS = ("rule-set", "workflow-profile", "catalog-profile")


class ValidationProfileTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        self.write_manifest()
        self.write(BACKEND, "\n".join(VALUES))
        self.write(BROWSER, "\n".join(VALUES))
        self.write("pom.xml", "\n".join(
            f"<studio.validation.{tag}>{value}</studio.validation.{tag}>"
            for tag, value in zip(TAGS, VALUES)
        ))

    def write(self, path, content):
        target = self.root / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")

    def write_manifest(self, path=MANIFEST, value=None):
        if value is None:
            value = {"schemaVersion": 1, "ruleSetVersion": VALUES[0],
                     "profiles": {"workflow": VALUES[1], "catalog": VALUES[2]}}
        self.write(path, json.dumps(value))

    def run_checker(self, *args):
        # Use the absolute interpreter, with no tools available through PATH.
        # An aligned profile must pass even when rg and Ruby are unavailable.
        env = os.environ.copy()
        env["PATH"] = str(self.root / "empty-path")
        return subprocess.run([sys.executable, str(CHECKER), *args], cwd=self.root,
                              env=env, capture_output=True, text=True, timeout=10)

    def assert_failure(self, result, diagnostic):
        self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
        self.assertIn(diagnostic, result.stderr)
        self.assertNotIn("Traceback", result.stderr)
        self.assertNotIn("is aligned", result.stdout)

    def test_aligned_profile_without_external_tools(self):
        result = self.run_checker()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("Validation profile is aligned", result.stdout)

    def test_each_backend_and_browser_value_is_checked(self):
        for path, label in ((BACKEND, "Backend"), (BROWSER, "Browser")):
            original = (self.root / path).read_text(encoding="utf-8")
            for value in VALUES:
                with self.subTest(path=path, value=value):
                    self.write(path, original.replace(value, "different-profile"))
                    self.assert_failure(self.run_checker(), f"{label} validation profile drift: {value}")
                    self.write(path, original)

    def test_each_maven_property_is_checked(self):
        original = (self.root / "pom.xml").read_text(encoding="utf-8")
        for tag, value, label in zip(TAGS, VALUES, ("validation rule-set", "workflow profile", "catalog profile")):
            with self.subTest(tag=tag):
                self.write("pom.xml", original.replace(f">{value}<", ">different-profile<"))
                self.assert_failure(self.run_checker(), f"Maven {label} drift: {value}")
                self.write("pom.xml", original)

    def test_missing_inputs_are_not_reported_as_drift(self):
        for path in (MANIFEST, BACKEND, BROWSER, "pom.xml"):
            with self.subTest(path=path):
                target = self.root / path
                original = target.read_bytes()
                target.unlink()
                result = self.run_checker()
                self.assert_failure(result, "Cannot read")
                self.assertNotIn("drift", result.stderr)
                target.write_bytes(original)

    def test_malformed_manifest_is_not_reported_as_drift(self):
        for value in ("{", "null", "[]", '{"schemaVersion": 2}', '{"schemaVersion": true}',
                      '{"schemaVersion": 1}', '{"schemaVersion": 1, "ruleSetVersion": "x", "profiles": null}',
                      '{"schemaVersion": 1, "ruleSetVersion": "", "profiles": {"workflow": "x", "catalog": "y"}}'):
            with self.subTest(manifest=value):
                self.write(MANIFEST, value)
                result = self.run_checker()
                self.assert_failure(result, "Invalid validation profile manifest")
                self.assertNotIn("drift", result.stderr)

    def test_non_utf8_source_is_not_reported_as_drift(self):
        (self.root / BACKEND).write_bytes(b"\xff")
        result = self.run_checker()
        self.assert_failure(result, "Cannot read backend validation source")
        self.assertNotIn("drift", result.stderr)

    def test_custom_manifest_argument(self):
        self.write_manifest("custom profile.json")
        (self.root / MANIFEST).unlink()
        result = self.run_checker("custom profile.json")
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_matching_is_literal(self):
        self.write(BROWSER, "\n".join(VALUES).replace("0.8", "0X8"))
        self.assert_failure(self.run_checker(), f"Browser validation profile drift: {VALUES[1]}")


if __name__ == "__main__":
    unittest.main()
