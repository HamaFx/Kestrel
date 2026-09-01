import { describe, expect, it } from 'vitest';

import { PresentationPreferencesSchema } from '../src';

describe('presentation preferences schema', () => {
  it('accepts bounded presentation preferences', () => {
    expect(
      PresentationPreferencesSchema.parse({
        customInstructions: 'Use bullet points.',
        responseStyle: 'concise',
        citeSources: true,
      }),
    ).toMatchObject({ responseStyle: 'concise', citeSources: true });
  });

  it('rejects unknown policy-like fields', () => {
    expect(() =>
      PresentationPreferencesSchema.parse({ customInstructions: 'x', tool: 'set_alert' }),
    ).toThrow();
  });

  it('rejects oversized custom instructions', () => {
    expect(() =>
      PresentationPreferencesSchema.parse({ customInstructions: 'x'.repeat(2_001) }),
    ).toThrow();
  });
});
