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

// Phase 3 Task 3 — the Custom Agents modals are hand-rolled dialogs (no
// <dialog>/vaul shell), so Escape must be wired explicitly. The editor must
// also refuse to close while a save/upload is in flight.

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The plugin UI lives outside apps/web, so there is no alias for it — the
// deep relative imports below are the only way to unit-test the dialog shell.
// eslint-disable-next-line no-restricted-imports
import { AgentEditor } from '../../../plugins/custom-agents/src/ui/agent-editor';
// eslint-disable-next-line no-restricted-imports
import { AgentRunsDialog } from '../../../plugins/custom-agents/src/ui/agent-runs-dialog';

const editorState = vi.hoisted(() => ({ busy: false }));

vi.mock('../../../plugins/custom-agents/src/ui/use-agent-editor', () => ({
  useAgentEditor: () => ({
    step: 0,
    setStep: vi.fn(),
    busy: editorState.busy,
    error: null,
    save: vi.fn(),
  }),
}));

vi.mock('../../../plugins/custom-agents/src/ui/editor-general-tab', () => ({
  EditorGeneralTab: () => null,
}));

vi.mock('../../../plugins/custom-agents/src/ui/api', () => ({
  pluginFetch: vi.fn(() => new Promise(() => {})),
  errorMessage: (err: unknown) => String(err),
  fmtDate: (value: unknown) => String(value),
}));

beforeEach(() => {
  editorState.busy = false;
});

afterEach(cleanup);

describe('Custom Agents modal keyboard contract (Phase 3)', () => {
  it('closes the agent editor on Escape', () => {
    const onClose = vi.fn();
    render(
      <AgentEditor open agent={null} catalog={null as never} onClose={onClose} onSaved={vi.fn()} />,
    );

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('ignores Escape while the editor is busy saving', () => {
    editorState.busy = true;
    const onClose = vi.fn();
    render(
      <AgentEditor open agent={null} catalog={null as never} onClose={onClose} onSaved={vi.fn()} />,
    );

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('does not wire Escape when the editor is closed', () => {
    const onClose = vi.fn();
    render(
      <AgentEditor
        open={false}
        agent={null}
        catalog={null as never}
        onClose={onClose}
        onSaved={vi.fn()}
      />,
    );

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes the run history dialog on Escape', () => {
    const onClose = vi.fn();
    render(
      <AgentRunsDialog
        agent={{ id: 'agent-1', slug: 'scalper', runCount: 0 } as never}
        onClose={onClose}
      />,
    );

    expect(screen.getByRole('dialog')).toBeTruthy();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
