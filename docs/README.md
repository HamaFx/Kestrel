# Kestrel documentation

These are the current public OSS documents. They describe the supported single-user self-hosted release and are maintained against the implementation.

| Document                              | Purpose                                                                     |
| ------------------------------------- | --------------------------------------------------------------------------- |
| [Configuration](configuration.md)     | Environment variables, defaults, secrets, and feature flags                 |
| [Troubleshooting](troubleshooting.md) | Setup, runtime, provider, worker, migration, and recovery problems          |
| [Architecture](architecture.md)       | Web, worker, package, data, AI, database, and security boundaries           |
| [Release process](release.md)         | Public validation, artifacts, Docker publication, and rollback requirements |

Repository-level policy and status documents:

- [README](../README.md) — product overview and quick start
- [Deployment matrix](deployment-matrix.md) — supported profiles and operator requirements
- [Current readiness audit](audit/current-status.md) — current release classification and remaining work
- [Audit findings](audit/findings.md) — detailed audit findings and action record
- [Audit history](audit/audit-history.md) — comprehensive historical audit report
- [Validation report](audit/validation-report.md) — local RLS, backup, and Docker smoke test results
- [Dependency licenses](DEPENDENCY_LICENSES.md) — inventory of third-party package licenses
- [Security policy](../SECURITY.md) — vulnerability reporting and security responsibilities
- [Contributing](../CONTRIBUTING.md) — contributor workflow and coding rules
- [Support](../SUPPORT.md) — support channels and diagnostic information

The `architecture-explorer.html` and `architecture-explorer.json` files in this directory are static informational snapshots. They are not runtime dependencies and are not generated automatically during builds.
