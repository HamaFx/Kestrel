/**
 * Copyright 2026 Kestrel
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// Tests for the upgraded Telegram bot system.
// Run: pnpm --filter @kestrel/ai test -- --run telegram

import { beforeEach, describe, expect, it } from 'vitest';

import {
  buildModeToggleKeyboard,
  formatTelegramAnalysisReply,
  parseCommand,
  parseTelegramAnalysisMode,
} from '../src/bot';
import { chunkText } from '../src/telegram/client';
import { _resetForTesting, isDuplicateUpdate, markProcessed } from '../src/telegram/idempotency';
import {
  _resetRateLimitsForTesting,
  checkRateLimit,
  getRateLimitStatus,
} from '../src/telegram/rate-limiter';

// ── Idempotency Guard ──

describe('Telegram Idempotency Guard', () => {
  beforeEach(() => {
    _resetForTesting();
  });

  it('marks updates as processed', () => {
    expect(isDuplicateUpdate(1001)).toBe(false);
    markProcessed(1001);
    expect(isDuplicateUpdate(1001)).toBe(true);
  });

  it('returns false for unprocessed updates', () => {
    expect(isDuplicateUpdate(2002)).toBe(false);
  });

  it('handles multiple updates', () => {
    markProcessed(1);
    markProcessed(2);
    markProcessed(3);
    expect(isDuplicateUpdate(1)).toBe(true);
    expect(isDuplicateUpdate(2)).toBe(true);
    expect(isDuplicateUpdate(3)).toBe(true);
    expect(isDuplicateUpdate(4)).toBe(false);
  });
});

// ── Rate Limiter ──

describe('Telegram Rate Limiter', () => {
  beforeEach(() => {
    _resetRateLimitsForTesting();
  });

  it('allows requests within limit', () => {
    const result = checkRateLimit('user1', 'bot_command', 5);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
  });

  it('blocks requests exceeding limit', () => {
    for (let i = 0; i < 5; i++) {
      checkRateLimit('user2', 'bot_command', 5);
    }
    const result = checkRateLimit('user2', 'bot_command', 5);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it('tracks per-user separately', () => {
    for (let i = 0; i < 5; i++) {
      checkRateLimit('userA', 'bot_command', 5);
    }
    const resultB = checkRateLimit('userB', 'bot_command', 5);
    expect(resultB.allowed).toBe(true);
  });

  it('tracks per-action separately', () => {
    for (let i = 0; i < 10; i++) {
      checkRateLimit('userC', 'bot_chat', 10);
    }
    const cmdResult = checkRateLimit('userC', 'bot_command', 30);
    expect(cmdResult.allowed).toBe(true);
  });

  it('getRateLimitStatus does not consume slots', () => {
    checkRateLimit('userD', 'bot_command', 3);
    const status1 = getRateLimitStatus('userD', 'bot_command', 3);
    expect(status1.remaining).toBe(2);
    const status2 = getRateLimitStatus('userD', 'bot_command', 3);
    expect(status2.remaining).toBe(2); // unchanged
  });
});

// ── Message Chunking ──

describe('Text Chunking', () => {
  it('returns single chunk for short text', () => {
    const chunks = chunkText('Hello world', 4000);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBe('Hello world');
  });

  it('splits long text on newlines', () => {
    const line = 'A'.repeat(50) + '\n';
    const text = line.repeat(100); // ~5100 chars
    const chunks = chunkText(text, 4000);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(4000);
    }
  });

  it('splits on spaces when no newline nearby', () => {
    const text = 'word '.repeat(1000); // ~5000 chars, no newlines
    const chunks = chunkText(text, 4000);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(4000);
    }
  });

  it('hard-cuts when no good split point', () => {
    const text = 'X'.repeat(5000); // no spaces or newlines
    const chunks = chunkText(text, 4000);
    expect(chunks.length).toBe(2);
    expect(chunks[0]!.length).toBe(4000);
    expect(chunks[1]!.length).toBe(1000);
  });

  it('handles empty text', () => {
    const chunks = chunkText('', 4000);
    expect(chunks).toEqual(['']);
  });
});

// ── Phase 6: Telegram Mode Selection & Plain-English Formatting ──

describe('Telegram Mode Selection & Plain-English Formatting', () => {
  it('parses quick/single and full/team mode flags', () => {
    expect(parseTelegramAnalysisMode('quick')).toBe('single');
    expect(parseTelegramAnalysisMode('single')).toBe('single');
    expect(parseTelegramAnalysisMode('1')).toBe('single');
    expect(parseTelegramAnalysisMode('full')).toBe('full');
    expect(parseTelegramAnalysisMode('team')).toBe('full');
    expect(parseTelegramAnalysisMode('4')).toBe('full');
    expect(parseTelegramAnalysisMode('unknown')).toBeNull();
  });

  it('parses inline button callback_data into /analyze commands', () => {
    expect(parseCommand('analyze:full:XAUUSD')).toEqual({
      command: 'analyze',
      args: ['XAUUSD', 'full'],
    });
    expect(parseCommand('analyze:quick:EURUSD')).toEqual({
      command: 'analyze',
      args: ['EURUSD', 'quick'],
    });
  });

  it('formats full team analysis in plain trader English with expert breakdown', () => {
    const reply = formatTelegramAnalysisReply({
      symbol: 'XAUUSD',
      mode: 'full',
      finalText: 'Bottom Line: Gold holds above 2400 support.',
      agentOpinions: [
        {
          agentName: 'technical',
          bias: 'bullish',
          confidence: 0.8,
          reasoning: 'Above EMA20',
        },
        {
          agentName: 'risk',
          bias: 'neutral',
          confidence: 0.65,
          reasoning: 'Watch CPI volatility',
        },
      ],
    });
    expect(reply).toContain('🧠 Full Team Analysis (4 Experts) — XAUUSD');
    expect(reply).toContain('📈 Technical Chartist: Bullish (80% confidence)');
    expect(reply).toContain('🛡️ Risk Manager: Neutral (65% confidence)');
    expect(reply).toContain('Bottom Line: Gold holds above 2400 support.');
    expect(reply).not.toMatch(/Mastra|packetId|canonical/i);
  });

  it('builds mode toggle inline keyboard buttons', () => {
    expect(buildModeToggleKeyboard('XAUUSD', 'single')).toEqual([
      [{ text: '🧠 Run Full 4-Expert Team Analysis', callback_data: 'analyze:full:XAUUSD' }],
    ]);
    expect(buildModeToggleKeyboard('XAUUSD', 'full')).toEqual([
      [{ text: '⚡ Run Quick Check (1 Expert)', callback_data: 'analyze:quick:XAUUSD' }],
    ]);
  });
});
