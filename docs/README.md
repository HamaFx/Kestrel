# Kestrel Documentation Index

This directory contains the current procedural, architectural, and operational documentation for **Kestrel**.

---

## 1. Architectural & Framework Standards

| Document                                                                                                 | Description                                                                                                  |
| -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| [`14-nextjs-16-architecture-guide.md`](./14-nextjs-16-architecture-guide.md)                             | **Next.js 16 & React 19 Architecture Guide, Best Practices, and Modernization Roadmap** (Canonical standard) |
| [`15-typescript-architecture-and-upgrade-report.md`](./15-typescript-architecture-and-upgrade-report.md) | **TypeScript Architecture, Modern Compiler Research & Upgrade Report** (Canonical standard)                  |
| [`01-architecture.md`](./01-architecture.md)                                                             | High-level system architecture overview                                                                      |
| [`02-data-flows.md`](./02-data-flows.md)                                                                 | Real-time market telemetry and event data flows                                                              |
| [`03-backend-api.md`](./03-backend-api.md)                                                               | Backend route handler specifications and contracts                                                           |
| [`04-frontend-ux.md`](./04-frontend-ux.md)                                                               | Frontend UX design principles and mobile-first layout                                                        |
| [`architecture-explorer.html`](./architecture-explorer.html)                                             | Interactive architecture snapshot explorer                                                                   |
| [`architecture-explorer.json`](./architecture-explorer.json)                                             | Machine-readable architecture topology snapshot                                                              |

---

## 2. Operations, Deployment & Setup

| Document                                                                                   | Description                                                |
| ------------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| [`13-first-run-setup.md`](./13-first-run-setup.md)                                         | Step-by-step developer onboarding and first-run setup      |
| [`11-self-hosting.md`](./11-self-hosting.md)                                               | Docker, Compose, and self-hosted server deployment guide   |
| [`08-deployment.md`](./08-deployment.md)                                                   | Production Vercel + GCE VM deployment procedures           |
| [`10-security.md`](./10-security.md)                                                       | Security practices, key rotation, and proxy hardening      |
| [`INCIDENT-RESPONSE.md`](./INCIDENT-RESPONSE.md)                                           | Production incident triage and response runbook            |
| [`BILLING-WEBHOOK-SAFETY-GATE.md`](./BILLING-WEBHOOK-SAFETY-GATE.md)                       | Operational safety procedure for payment provider webhooks |
| [`14-oss-release-checklist.md`](./14-oss-release-checklist.md)                             | Open-source release verification checklist                 |

---

## 3. AI Agent Architecture & Mastra Implementation

| Document                                                                             | Description                                                   |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------- |
| [`AI-AGENT-ARCHITECTURE.md`](./AI-AGENT-ARCHITECTURE.md)                             | Current AI agent core, Mastra workflows, and tool boundary    |
| [`AI-AGENT-VALIDATION-LOG.md`](./AI-AGENT-VALIDATION-LOG.md)                         | Dated AI agent verification, testing, and deployment evidence |
| [`07-agent-understanding.md`](./07-agent-understanding.md)                           | Conceptual model for autonomous trading agent behavior        |
| [`08-agent-setup-run.md`](./08-agent-setup-run.md)                                   | Guide to configuring and running autonomous agent runs        |

---

## 4. Testing, Auditing & Quality Assurance

| Document                                                                   | Description                                                     |
| -------------------------------------------------------------------------- | --------------------------------------------------------------- |
| [`09-testing.md`](./09-testing.md)                                         | Testing conventions, Vitest patterns, and Playwright E2E suites |
