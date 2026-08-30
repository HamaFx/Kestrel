# Support

## How to Get Help

### Documentation

The current public documentation is maintained in the repository root. Start here:

| Document | Read when |
| --- | --- |
| [README.md](README.md) | You want the public scope and quick start |
| [OPEN_SOURCE_DEPLOYMENT_MATRIX.md](OPEN_SOURCE_DEPLOYMENT_MATRIX.md) | You need supported deployment profiles |
| [OPEN_SOURCE_READINESS_CURRENT.md](OPEN_SOURCE_READINESS_CURRENT.md) | You need current readiness status and release gates |
| [docs/configuration.md](docs/configuration.md) | You need environment-variable details |
| [docs/troubleshooting.md](docs/troubleshooting.md) | You are diagnosing setup or runtime failures |
| [docs/architecture.md](docs/architecture.md) | You need to understand system boundaries |
| [SECURITY.md](SECURITY.md) | You are touching auth, encryption, RLS, or deployment security |
| [CONTRIBUTING.md](CONTRIBUTING.md) | You are contributing code or documentation |

### Bugs and Feature Requests

| Need | Where |
| --- | --- |
| Report a bug | [Open a bug report issue](https://github.com/HamaFx/Kestrel/issues/new?template=bug_report.yml) |
| Request a feature | [Open a feature request issue](https://github.com/HamaFx/Kestrel/issues/new?template=feature_request.yml) |
| Report a security vulnerability | Use GitHub private vulnerability reporting as described in [SECURITY.md](SECURITY.md) |

### Questions and Discussion

| Platform | Use |
| --- | --- |
| GitHub Issues | Bug reports, feature requests, and specific technical questions |
| GitHub Discussions | General questions, ideas, and show-and-tell, if enabled |

### Before You Ask

1. Search existing issues; your question may already be answered.
2. Read the relevant documentation above.
3. Include your OS, Node.js version, pnpm version, Docker version if relevant, error message, and reproduction steps.
4. Never include passwords, API keys, database URLs, session tokens, or private user data.

## Self-Hosting Support

If you are self-hosting Kestrel:

1. Read [README.md](README.md) for the supported quick starts.
2. Read [OPEN_SOURCE_DEPLOYMENT_MATRIX.md](OPEN_SOURCE_DEPLOYMENT_MATRIX.md) for deployment, health, and backup requirements.
3. Read [docs/configuration.md](docs/configuration.md) and [docs/troubleshooting.md](docs/troubleshooting.md) for configuration and recovery guidance.
4. Read [SECURITY.md](SECURITY.md) before exposing an instance beyond localhost.
5. State clearly whether you are using Simple/PGlite, Docker Compose, external PostgreSQL, or the maintainer-specific Vercel/GCE topology.

Self-hosters are responsible for their infrastructure security, TLS, firewall, backups, provider terms, and secret management. Shared multi-user/RLS hosting is not supported by the current OSS release.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the contributor guide.
