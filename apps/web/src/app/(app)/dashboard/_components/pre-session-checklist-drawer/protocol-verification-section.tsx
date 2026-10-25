'use client';

// SPDX-License-Identifier: Apache-2.0

// Step 4 of the pre-session ritual: the two mandatory acknowledgements that
// gate the day's gameplan.
export function ProtocolVerificationSection({
  newsReviewed,
  strategyAligned,
  maxDailyR,
  onNewsReviewedChange,
  onStrategyAlignedChange,
}: {
  newsReviewed: boolean;
  strategyAligned: boolean;
  maxDailyR: number;
  onNewsReviewedChange: (checked: boolean) => void;
  onStrategyAlignedChange: (checked: boolean) => void;
}) {
  return (
    <div className="surface-chip flex flex-col gap-2.5 rounded-xl border border-white/10 p-3.5 shadow-sm">
      <span className="text-caption text-fg-subtle font-semibold tracking-wider uppercase">
        4. Session Protocol Verification
      </span>

      <label className="text-fg flex cursor-pointer items-start gap-2.5 text-xs">
        <input
          type="checkbox"
          checked={newsReviewed}
          onChange={(e) => onNewsReviewedChange(e.target.checked)}
          className="border-border bg-bg-elev-2 text-brand focus:ring-brand accent-brand mt-0.5 size-4 cursor-pointer rounded-xs"
        />
        <span>
          <strong>Economic Calendar Checked</strong>: I have reviewed today's high-impact releases
          and will not enter reckless market orders before high-volatility events.
        </span>
      </label>

      <label className="text-fg flex cursor-pointer items-start gap-2.5 text-xs">
        <input
          type="checkbox"
          checked={strategyAligned}
          onChange={(e) => onStrategyAlignedChange(e.target.checked)}
          className="border-border bg-bg-elev-2 text-brand focus:ring-brand accent-brand mt-0.5 size-4 cursor-pointer rounded-xs"
        />
        <span>
          <strong>Discipline Commitment</strong>: I will honor my stop losses, never revenge-trade,
          and shut down terminal if my {maxDailyR}R max drawdown is reached.
        </span>
      </label>
    </div>
  );
}
