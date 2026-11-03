# Asian Range Breakout

The Asian session (00:00–07:00 UTC) usually prints a narrow box. The first
London bars decide whether that box holds or resolves. This playbook trades
the resolution, not a prediction.

## Setup (long)

1. Record `ctx.levels.asianHigh` / `asianLow`. Both must be non-zero (the range
   is complete at 07:00 UTC).
2. Require a close above `asianHigh` during the London open window
   (`ctx.session.londonOpenKillzone`).
3. Optional regime filter: `ema50 > ema200` and `adx14 > 18`.
4. Optional size filter: the box height must be at least 0.5 ATR14 and at most
   2.5 ATR14. Too tight prints whipsaw; too wide leaves no reward.
5. Stop below `asianLow` minus 0.25 ATR. Take profit at PDH, or 2R when the box
   is the only reference.
6. Time stop after 12–24 bars; the edge decays once New York takes over.

Short is symmetric: close below `asianLow`, stop above `asianHigh`, target PDL.

## Filters

- Skip the first bar of the session; let the opening range print.
- Skip when a high-impact event is due in the next hour (the agent can check
  the calendar before running the backtest, but the strategy itself must stay
  deterministic and calendar-free).
- One trade per session.

## Failure modes

- Trend days never retest the box: entering on the first close avoids missing
  them, but stop distance is larger. That is the trade-off this playbook
  accepts.
- Range days produce repeated false breaks: the box-height filter and the
  London-only window are the defence.
