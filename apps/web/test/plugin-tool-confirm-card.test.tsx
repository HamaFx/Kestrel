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

// @vitest-environment jsdom

// Phase 2 (P0-6) — the chat Confirm/Cancel card for plugin write tools.

import type { PluginToolConfirmUi } from '@kestrel/shared';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PluginToolConfirmCard } from '@/components/chat/parts/plugin-tool-confirm-card';

afterEach(cleanup);

const payload: PluginToolConfirmUi = {
  kind: 'plugin-tool-confirm',
  pluginId: 'paper-trading',
  toolId: 'paper_place_order',
  description: 'Place a virtual order in a paper account.',
  proposedInput: { symbol: 'XAUUSD', lots: 1, side: 'buy' },
};

describe('PluginToolConfirmCard', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    document.cookie = 'hfx_csrf=csrf-token-1';
  });

  it('renders the tool, its description and the proposed input without executing', () => {
    render(<PluginToolConfirmCard payload={payload} />);

    expect(screen.getByText('Paper Place Order')).toBeDefined();
    expect(screen.getByText('needs confirmation')).toBeDefined();
    expect(screen.getByText(/paper account/)).toBeDefined();
    expect(screen.getByText('symbol')).toBeDefined();
    expect(screen.getByText('XAUUSD')).toBeDefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('executes the tool on Confirm with the CSRF token and renders the result', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ data: { ok: true, orderId: 'order-1' } }), { status: 200 }),
    );

    render(<PluginToolConfirmCard payload={payload} />);
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/plugins/paper-trading/tools/paper_place_order/confirm');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['x-csrf-token']).toBe('csrf-token-1');
    expect(JSON.parse(String(init.body))).toEqual({ input: payload.proposedInput });

    await waitFor(() => expect(screen.getByText(/order-1/)).toBeDefined());
  });

  it('surfaces a failed confirmation and allows retrying', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: { message: 'Margin check failed' } }), { status: 400 }),
    );

    render(<PluginToolConfirmCard payload={payload} />);
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }));

    await waitFor(() => expect(screen.getByRole('alert')).toBeDefined());
    expect(screen.getByText('Margin check failed')).toBeDefined();
    expect(screen.getByRole('button', { name: /confirm/i })).toBeDefined();
  });

  it('cancels without calling the endpoint', () => {
    render(<PluginToolConfirmCard payload={payload} />);
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

    expect(screen.getByText(/cancelled/)).toBeDefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
