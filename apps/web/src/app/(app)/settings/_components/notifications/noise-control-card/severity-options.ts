// SPDX-License-Identifier: Apache-2.0

// Severity choices shared by the noise-control rule list and digest preview.

import type { Severity } from '@kestrel/shared';

export const SEVERITY_OPTIONS: { value: Severity; label: string }[] = [
  { value: 'info', label: 'Info' },
  { value: 'warning', label: 'Warning' },
  { value: 'error', label: 'Error' },
  { value: 'critical', label: 'Critical' },
];
