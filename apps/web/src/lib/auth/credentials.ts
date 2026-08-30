export const DUMMY_PASSWORD_HASH = '$2b$12$LyYuAYJhLrPU7mAIQPzVNu5HBJ/neEmE2uZZDD5ayPPROn5ruSaJ2';

export function normalizeCredential(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export function normalizeEmail(value: unknown): string {
  return normalizeCredential(value).toLowerCase().trim();
}
