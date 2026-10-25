'use client';

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
import type { Symbol } from '@kestrel/shared';

import { Button } from '@/components/ui/button';

import { AlertDeliveryFields } from './alert-delivery-fields';
import { PreviewCallout } from './alert-preview-callout';
import { AlertRuleFields } from './alert-rule-fields';
import { useAlertForm } from './use-alert-form';

interface AlertFormProps {
  initialSymbol?: Symbol;
  onCreated?: () => void;
}

export function AlertForm({ initialSymbol, onCreated }: AlertFormProps) {
  const controller = useAlertForm({ initialSymbol, onCreated });
  const {
    type,
    symbol,
    tf,
    indicator,
    direction,
    level,
    submitting,
    testing,
    error,
    testAlert,
    submit,
  } = controller;

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 px-4 pb-4">
      <AlertRuleFields controller={controller} />

      <PreviewCallout
        type={type}
        symbol={symbol}
        tf={tf}
        indicator={indicator}
        direction={direction}
        level={level}
      />

      <AlertDeliveryFields controller={controller} />

      {error ? (
        <p id="alert-form-error" role="alert" className="text-danger text-sm">
          {error}
        </p>
      ) : null}

      <div className="mt-2 flex flex-col gap-2">
        <Button
          type="submit"
          disabled={submitting || !level}
          size="lg"
          loading={submitting}
          className="w-full"
        >
          {submitting ? 'Creating…' : 'Create alert'}
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={testing || !level}
          loading={testing}
          onClick={() => void testAlert()}
          className="w-full"
        >
          {testing ? 'Checking…' : 'Verify Alert Rule'}
        </Button>
      </div>
    </form>
  );
}
