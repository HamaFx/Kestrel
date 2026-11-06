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

// SPDX-License-Identifier: Apache-2.0

// the object layout and the URL shapes are now shared
// between the uploader, the storage proxy, the cleanup cron and the journal
// renderers. These tests pin the layout (so the cron can never silently drift
// from the uploader again) and the accepted legacy URL forms (so rows written
// before the fix keep resolving).

import { describe, expect, it } from 'vitest';

import {
  buildChatImageObjectPath,
  chatImageDay,
  chatImageObjectPrefix,
  chatImageProxyPath,
  parseChatImageObjectPath,
  resolveChatImageSrc,
} from '../src/lib/http/chat-image-paths';

const USER_ID = 'user-123';

describe('buildChatImageObjectPath', () => {
  it('writes <userId>/<YYYY-MM-DD>/<hex-prefix>-<filename>', () => {
    const at = new Date('2026-10-20T23:59:59.000Z');
    const path = buildChatImageObjectPath(USER_ID, 'chart screenshot 1.png', at);

    expect(path).toMatch(/^user-123\/2026-10-20\/[0-9a-f]{12}-chart_screenshot_1\.png$/);
  });

  it('sanitises a filename with no usable characters', () => {
    const path = buildChatImageObjectPath(USER_ID, '***', new Date('2026-10-20T00:00:00Z'));
    expect(path).toMatch(/^user-123\/2026-10-20\/[0-9a-f]{12}-___$/);
  });

  it('rejects a user id that would escape the owner prefix', () => {
    expect(() => buildChatImageObjectPath('../other', 'a.png')).toThrow('invalid user id');
  });

  it('uses the UTC day partition', () => {
    expect(chatImageDay(new Date('2026-10-20T23:59:59.999Z'))).toBe('2026-10-20');
    expect(chatImageDay(new Date('2026-10-21T00:00:00.000Z'))).toBe('2026-10-21');
  });
});

describe('chatImageObjectPrefix', () => {
  it('builds the user prefix and the user/day prefix', () => {
    expect(chatImageObjectPrefix(USER_ID)).toBe('user-123');
    expect(chatImageObjectPrefix(USER_ID, '2026-10-20')).toBe('user-123/2026-10-20');
  });

  it('rejects a malformed day', () => {
    expect(() => chatImageObjectPrefix(USER_ID, '20-10-2026')).toThrow('invalid day');
  });
});

describe('parseChatImageObjectPath', () => {
  const path = 'user-123/2026-10-20/0a1b2c3d4e5f-chart.webp';

  it('accepts the bare storage path', () => {
    expect(parseChatImageObjectPath(path)).toBe(path);
  });

  it('accepts the app proxy path and absolute proxy URL', () => {
    expect(parseChatImageObjectPath(`/api/uploads/${path}`)).toBe(path);
    expect(parseChatImageObjectPath(`https://kestrel.example.com/api/uploads/${path}`)).toBe(path);
  });

  it('accepts the legacy public URL stored by rows written before the fix', () => {
    expect(
      parseChatImageObjectPath(
        `https://project.supabase.co/storage/v1/object/public/chat-images/${path}`,
      ),
    ).toBe(path);
  });

  it('accepts signed and authenticated Supabase URL forms', () => {
    expect(
      parseChatImageObjectPath(
        `https://project.supabase.co/storage/v1/object/sign/chat-images/${path}?token=abc.def`,
      ),
    ).toBe(path);
    expect(
      parseChatImageObjectPath(
        `https://project.supabase.co/storage/v1/object/authenticated/chat-images/${path}`,
      ),
    ).toBe(path);
  });

  it.each([
    ['data URL', 'data:image/png;base64,AAAA'],
    ['blob URL', 'blob:https://kestrel.example.com/1234'],
    ['foreign host', 'https://evil.example.com/chart.png'],
    ['wrong host path', 'https://project.supabase.co/storage/v1/object/public/other-bucket/a.png'],
    ['traversal', 'user-123/2026-10-20/../../secrets'],
    ['traversal segment', '../../etc/passwd'],
    ['missing segment', 'user-123/2026-10-20'],
    ['bad day', 'user-123/not-a-day/chart.png'],
    ['bad user id', 'user/123/2026-10-20/chart.png'],
    ['empty', ''],
  ])('rejects %s', (_label, value) => {
    expect(parseChatImageObjectPath(value)).toBeNull();
  });

  it('resolves legacy URLs and proxy URLs to the same proxy path', () => {
    const proxy = `/api/uploads/${path}`;
    const legacy = `https://project.supabase.co/storage/v1/object/public/chat-images/${path}`;
    expect(chatImageProxyPath(legacy)).toBe(proxy);
    expect(chatImageProxyPath(proxy)).toBe(proxy);
    expect(chatImageProxyPath(path)).toBe(proxy);
    expect(chatImageProxyPath('https://evil.example.com/x.png')).toBeNull();
  });

  it('passes foreign renderer values through untouched', () => {
    expect(resolveChatImageSrc('data:image/png;base64,AAAA')).toBe('data:image/png;base64,AAAA');
    expect(resolveChatImageSrc(path)).toBe(`/api/uploads/${path}`);
  });
});
