import { createHmac, timingSafeEqual } from 'node:crypto';

const CHALLENGE_TTL_MS = 30_000;

export function generateImpersonationChallenge(): string {
  const now = Date.now();
  const timestamp = now.toString(16);
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error('AUTH_SECRET is required to generate impersonation challenge');
  const signature = createHmac('sha256', secret.slice(0, 128))
    .update(`impersonate:${timestamp}`)
    .digest('hex');
  return `${timestamp}.${signature}`;
}

export function verifyImpersonationChallenge(challenge: string): boolean {
  const separator = challenge.indexOf('.');
  if (separator < 1 || separator >= challenge.length - 1) return false;
  const timestamp = challenge.slice(0, separator);
  const signature = challenge.slice(separator + 1);
  const issuedAt = Number.parseInt(timestamp, 16);
  if (!Number.isFinite(issuedAt) || Date.now() - issuedAt > CHALLENGE_TTL_MS) return false;

  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) return false;
  const expected = createHmac('sha256', secret.slice(0, 128))
    .update(`impersonate:${timestamp}`)
    .digest('hex');
  if (expected.length !== signature.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}
