// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';

import { FOUR_SPECIALIST_DESKS, resolveStrategistDesk } from '@/lib/kestrel-strategist-desks';
import { MODE_LABELS } from '@/components/chat/chat-top-bar/mode-labels';

describe('canonical 4-desk strategist registry', () => {
  it('exposes all 4 specialist desks in canonical order with distinct artwork and codes', () => {
    expect(FOUR_SPECIALIST_DESKS.map((d) => d.id)).toEqual([
      'fundamental',
      'technical',
      'risk',
      'sentiment',
    ]);
    expect(FOUR_SPECIALIST_DESKS.map((d) => d.code)).toEqual([
      'DESK-I // HORUS',
      'DESK-II // ASTROLABE',
      'DESK-III // HOPLITE',
      'DESK-IV // SENTINEL',
    ]);
    const artwork = FOUR_SPECIALIST_DESKS.map((d) => d.artworkPath);
    expect(new Set(artwork).size).toBe(4);
    for (const desk of FOUR_SPECIALIST_DESKS) {
      expect(desk.accentColor.startsWith('var(--color-')).toBe(true);
      expect(desk.epithet.length).toBeGreaterThan(0);
      expect(desk.defaultPrompt.length).toBeGreaterThan(0);
    }
  });

  it('resolves legacy aliases (macro, quant, economist, technician, risk_manager, flow) to canonical desks', () => {
    expect(resolveStrategistDesk('macro').code).toBe('DESK-I // HORUS');
    expect(resolveStrategistDesk('economist').code).toBe('DESK-I // HORUS');
    expect(resolveStrategistDesk('quant').code).toBe('DESK-II // ASTROLABE');
    expect(resolveStrategistDesk('technician').code).toBe('DESK-II // ASTROLABE');
    expect(resolveStrategistDesk('risk_manager').code).toBe('DESK-III // HOPLITE');
    expect(resolveStrategistDesk('sentiment').code).toBe('DESK-IV // SENTINEL');
    expect(resolveStrategistDesk('flow').code).toBe('DESK-IV // SENTINEL');
    expect(resolveStrategistDesk('arbiter').code).toBe('STAGE II // ARBITER');
    expect(resolveStrategistDesk('fusion').code).toBe('STAGE II // ARBITER');
  });

  it('falls back to a neutral specialist config for unknown keys', () => {
    const unknown = resolveStrategistDesk('not-a-desk');
    expect(unknown.code).toBe('DESK // SPECIALIST');
    expect(unknown.id).not.toBe('risk');
  });

  it('uses Fast Scout and Convene Council as the canonical mode labels', () => {
    expect(MODE_LABELS.single).toBe('Fast Scout');
    expect(MODE_LABELS.full).toBe('Convene Council');
  });
});
