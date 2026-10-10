# Kestrel Load Testing

This directory contains standalone k6 / load testing configurations and scenarios for private benchmarking.

> **Note**: Legacy header-spoofing (`__system__` / `AUTH_MODE=legacy`) has been removed. Load test scenarios now require a real seeded user session or test credentials configured against your target deployment.

## Running Tests Locally

1. Seed a test user in your local database.
2. Configure credentials in your environment or scenario configuration.
3. Run using k6 or Docker Compose:
   ```bash
   docker compose -f docker-compose.loadtest.yml up
   ```
