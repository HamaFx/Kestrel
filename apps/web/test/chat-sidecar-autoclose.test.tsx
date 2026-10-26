// @vitest-environment jsdom
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

// Regression guard for the unclosable ThreadViewsDock on >=1280px viewports.
//
// The old auto-open effect listed `splitMode` in its dependency array and ran
// unconditionally, so closing the dock flipped `splitMode` → the effect re-ran
// → it saw messages/full-committee mode and re-opened the dock immediately.
// The dock must auto-open once per thread and then stay closed when dismissed.

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ChatScreen } from '@/components/chat/chat-screen';

vi.mock('@/components/chat/chat-thread-view', () => ({
  ChatThreadView: () => <div data-testid="thread-view" />,
}));

vi.mock('@/components/chat/chat-top-bar', () => ({
  ChatTopBar: ({ onToggleViews }: { onToggleViews?: () => void }) => (
    <button type="button" data-testid="toggle-views" onClick={onToggleViews}>
      Chart &amp; Desks
    </button>
  ),
}));

vi.mock('@/components/chat/thread-views-dock', () => ({
  ThreadViewsDock: ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) =>
    isOpen ? (
      <button type="button" data-testid="close-views" onClick={onClose}>
        Close views
      </button>
    ) : null,
}));

vi.mock('@/components/chat/hooks/use-chat-keyboard-shortcuts', () => ({
  useChatKeyboardShortcuts: () => undefined,
}));

vi.mock('@/components/chat/hooks/use-chat-toolbar', async () => {
  const { useState } = await import('react');
  return {
    useChatToolbar: () => {
      const [splitMode, setSplitMode] = useState(false);
      const [dockTab, setDockTab] = useState<'chart' | 'opinions' | 'plan'>('chart');
      return {
        splitMode,
        setSplitMode,
        dockTab,
        setDockTab,
        analysisMode: 'full' as const,
        analysisModeRef: { current: 'full' as const },
        showAgentOpinions: true,
        chatModel: null,
        modelSelectionPending: false,
        handleAnalysisModeChange: vi.fn(),
        handleChatModelChange: vi.fn(),
      };
    },
  };
});

vi.mock('@/components/chat/hooks/use-chat-session', async () => {
  const { useRef } = await import('react');
  return {
    useChatSession: () => ({
      messages: [{ id: 'm1' }, { id: 'm2' }],
      agentProgress: null,
      error: undefined,
      dismissedError: false,
      setDismissedError: vi.fn(),
      summary: null,
      setSummary: vi.fn(),
      lastAssistantId: undefined,
      lastUserTextRef: useRef(''),
      isStreaming: false,
      status: 'ready' as const,
      title: 'Gold breakout thesis',
      selectedAgentSlug: null,
      selectedAgent: null,
      customAgents: [],
      setSelectedAgentSlug: vi.fn(),
      handleSubmit: vi.fn(),
      handleStop: vi.fn(),
      handleCopy: vi.fn(),
      handleRegenerate: vi.fn(),
      handleEdit: vi.fn(),
      confirmEl: null,
    }),
  };
});

afterEach(cleanup);

function renderScreen() {
  return render(
    <ChatScreen
      threadId="thread-1"
      initialTitle="Gold breakout thesis"
      initialMessages={[]}
      initialThreads={[]}
      pinnedSymbol="XAUUSD"
    />,
  );
}

/** Let any pending effects/timers flush before asserting. */
async function settle() {
  await act(async () => {
    await Promise.resolve();
  });
}

describe('ChatScreen sidecar auto-open', () => {
  it('auto-opens the views dock exactly once on xl viewports when content exists', async () => {
    vi.stubGlobal('innerWidth', 1400);
    renderScreen();
    await settle();

    expect(screen.getByTestId('close-views')).toBeTruthy();
  });

  it('stays closed after dismissal even with messages and full-committee mode', async () => {
    vi.stubGlobal('innerWidth', 1400);
    renderScreen();
    await settle();
    expect(screen.getByTestId('close-views')).toBeTruthy();

    fireEvent.click(screen.getByTestId('close-views'));
    expect(screen.queryByTestId('close-views')).toBeNull();

    // The old effect re-opened the dock on the very next commit.
    await settle();
    expect(screen.queryByTestId('close-views')).toBeNull();
  });

  it('keeps a manual re-open working after a dismissal', async () => {
    vi.stubGlobal('innerWidth', 1400);
    renderScreen();
    await settle();

    fireEvent.click(screen.getByTestId('close-views'));
    await settle();
    expect(screen.queryByTestId('close-views')).toBeNull();

    fireEvent.click(screen.getByTestId('toggle-views'));
    await settle();
    expect(screen.getByTestId('close-views')).toBeTruthy();
  });

  it('does not auto-open below the xl breakpoint', async () => {
    vi.stubGlobal('innerWidth', 900);
    renderScreen();
    await settle();

    expect(screen.queryByTestId('close-views')).toBeNull();
  });
});
