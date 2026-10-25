'use client';

// SPDX-License-Identifier: Apache-2.0

// All allowed models of one catalog provider, ready to drop inside the
// picker's `<select>` as option rows.
import type { ProviderMeta } from '@kestrel/shared';

import { providerOptions, type ModelPickerKind } from './model-options';
import { ModelRow } from './model-row';

export function ProviderOptions({
  provider,
  kind,
}: {
  provider: ProviderMeta;
  kind: ModelPickerKind;
}) {
  return (
    <>
      {providerOptions(provider, kind).map((option) => (
        <ModelRow key={option.value} option={option} />
      ))}
    </>
  );
}
