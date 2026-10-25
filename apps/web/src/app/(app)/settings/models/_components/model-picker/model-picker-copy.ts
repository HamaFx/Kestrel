// SPDX-License-Identifier: Apache-2.0

// Per-domain copy for the generic model picker: titles, helper paragraphs,
// and the empty-state icon + text shown when no provider is configured.

import { IconBrain, IconEye, IconLetterCase } from '@tabler/icons-react';

import type { ModelPickerKind } from './model-options';

export const TITLES: Record<ModelPickerKind, string> = {
  chat: 'Current chat model',
  vision: 'Current vision model',
  embedding: 'Current embedding model',
};

export const HELPERS: Record<ModelPickerKind, string> = {
  chat:
    'The chosen model handles every chat turn unless you pick a different ' +
    'model for that specific turn from the chat toolbar. Changes apply immediately.',
  vision:
    'Used by the chart-screenshot analyser (`analyze_chart_image` tool) when ' +
    'you attach an image to a chat turn. Set this to a vision-capable model from ' +
    'your configured provider.',
  embedding:
    'Used by RAG / memory / news embeddings. Dimension must match the DB column; ' +
    'switching models later requires a backfill.',
};

export const NO_PROVIDERS_COPY: Record<ModelPickerKind, string> = {
  chat: 'to pick a default chat model',
  vision: 'to pick a default vision model',
  embedding: 'to pick a default embedding model',
};

export const NO_PROVIDERS_ICONS: Record<ModelPickerKind, typeof IconBrain> = {
  chat: IconBrain,
  vision: IconEye,
  embedding: IconLetterCase,
};
