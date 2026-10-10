# Security patch floors verified 2026-10-10

The first CI run after repairing the validation-profile gate reported six HIGH or
CRITICAL vulnerabilities in the existing Maven dependency floors. The affected
`pom.xml` was unchanged from main commit `8262e39d3c9c51f45bcd1de4bfdb8fb47453b081`
(blob `5589ab573e2ceccae4eb17ae6923fa009488216a`).

Update only Netty's existing BOM floor from `4.1.136.Final` to `4.1.137.Final` and
Jackson's from `2.21.5` to `2.21.7`. Quarkus, Kogito, SonataFlow and compiler versions
remain unchanged. No scan, severity gate or suppression is removed. Scanner findings
identify affected packages; they do not establish application exploitability.

| Package | CVE | First patched version in the current series | Primary advisory |
| --- | --- | --- | --- |
| jackson-core | CVE-2026-89407 | 2.21.7 | [GHSA-p6pp-m3f8-5c89](https://github.com/advisories/GHSA-p6pp-m3f8-5c89) |
| jackson-core | CVE-2026-89425 | 2.21.7 | [GHSA-7hhh-6rmp-j9qf](https://github.com/advisories/GHSA-7hhh-6rmp-j9qf) |
| jackson-databind | CVE-2026-68497 | 2.21.6 | [GHSA-q4xh-88c3-wmh7](https://github.com/advisories/GHSA-q4xh-88c3-wmh7) |
| jackson-databind | CVE-2026-91776 | 2.21.7 | [GHSA-wv8q-qhhj-9h54](https://github.com/advisories/GHSA-wv8q-qhhj-9h54) |
| jackson-databind | CVE-2026-91777 | 2.21.7 | [GHSA-cxp5-3px4-pw24](https://github.com/advisories/GHSA-cxp5-3px4-pw24) |
| netty-handler | CVE-2026-75595 | 4.1.137.Final | [GHSA-c4c3-7fpv-j4q5](https://github.com/advisories/GHSA-c4c3-7fpv-j4q5) |

These versions were verified using the GitHub global security advisories API and
the exact published Maven Central POMs:

- [Netty BOM 4.1.137.Final](https://repo.maven.apache.org/maven2/io/netty/netty-bom/4.1.137.Final/netty-bom-4.1.137.Final.pom)
- [Netty handler 4.1.137.Final](https://repo.maven.apache.org/maven2/io/netty/netty-handler/4.1.137.Final/netty-handler-4.1.137.Final.pom)
- [Jackson BOM 2.21.7](https://repo.maven.apache.org/maven2/com/fasterxml/jackson/jackson-bom/2.21.7/jackson-bom-2.21.7.pom)
- [Jackson core 2.21.7](https://repo.maven.apache.org/maven2/com/fasterxml/jackson/core/jackson-core/2.21.7/jackson-core-2.21.7.pom)
- [Jackson databind 2.21.7](https://repo.maven.apache.org/maven2/com/fasterxml/jackson/core/jackson-databind/2.21.7/jackson-databind-2.21.7.pom)

[The initial CI run](https://github.com/bassemZohdy/open-workflow-with-agent/actions/runs/38029847004)
records the pre-patch findings. Compatibility and the resulting security status must
be verified by the complete CI pipeline on the patched commit; the artifact and
advisory checks alone are not compatibility or production-acceptance evidence.
