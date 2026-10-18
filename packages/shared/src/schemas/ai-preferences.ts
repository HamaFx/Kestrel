import { z } from 'zod';

/** Presentation preferences only; never authorization, tool, or policy input. */
export const PresentationPreferencesSchema = z.strictObject({
  customInstructions: z.string().trim().max(2_000).optional(),
  responseStyle: z.enum(['default', 'concise', 'technical', 'risk-first']).optional(),
  citeSources: z.boolean().optional(),
});

export type PresentationPreferences = z.infer<typeof PresentationPreferencesSchema>;
