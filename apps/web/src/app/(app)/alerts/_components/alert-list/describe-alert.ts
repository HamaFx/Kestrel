// SPDX-License-Identifier: Apache-2.0

// Human-readable rule summary for an alert, used in rows and confirm dialogs.
// The format is owned by `describeAlertRule` in @kestrel/shared so the list,
// the AI tool descriptions, and notification delivery cannot drift.
import { describeAlertRule, type Alert } from '@kestrel/shared';

export function describeAlert(a: Alert): string {
  return describeAlertRule(a.rule);
}
