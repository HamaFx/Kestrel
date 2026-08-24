import { describe, expect, it } from 'vitest';

import {
  normalizeWorkflowStatus,
  toApiWorkflowStatus,
  toMastraWorkflowStatus,
} from '../src/workflow-status';

describe('workflow status normalization', () => {
  it('normalizes aliases to one domain vocabulary', () => {
    expect(normalizeWorkflowStatus('complete')).toBe('succeeded');
    expect(normalizeWorkflowStatus('success')).toBe('succeeded');
    expect(normalizeWorkflowStatus('ready')).toBe('succeeded');
    expect(normalizeWorkflowStatus('retrying')).toBe('pending');
    expect(normalizeWorkflowStatus('unknown')).toBe('pending');
  });

  it('adapts terminal statuses for API and Mastra layers', () => {
    expect(toApiWorkflowStatus('succeeded')).toBe('complete');
    expect(toMastraWorkflowStatus('succeeded')).toBe('success');
    expect(toApiWorkflowStatus('blocked')).toBe('failed');
    expect(toMastraWorkflowStatus('cancelled')).toBe('failed');
  });
});
