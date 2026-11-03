# `getSignal(ctx)` API reference

## Required shape

```js
function getSignal(ctx) {
  // return null, or a signal object
  return {
    side: 'long',
    entry: 'market',
    stop: ctx.close - ctx.atr() * 1.5,
    target: ctx.close + ctx.atr() * 3,
    riskPct: 1,
    maxBars: 40,
    breakEvenAtR: 1,
    trailing: { type: 'atr', value: 1.5 },
    reason: 'London open reclaim of the Asian high',
    tags: ['session', 'london'],
  };
}
```

`getSignal` is called on every bar, including warm-up bars. Return early when a
required feature is `null`.

## Signal fields

| Field          | Type                 | Default           | Notes                                           |
| -------------- | -------------------- | ----------------- | ----------------------------------------------- |
| `side`         | `'long' \| 'short'`  | required          |                                                 |
| `stop`         | number               | required          | Must be on the losing side of the eventual fill |
| `entry`        | `'market' \| number` | `'market'`        | Number = limit price                            |
| `target`       | number               | none              | Take profit; omit to rely on trailing/time stop |
| `riskPct`      | number               | run setting       | 0.01–10, % of current equity                    |
| `maxBars`      | integer              | run setting (100) | Hard time stop                                  |
| `validBars`    | integer              | 5                 | Limit order lifetime in bars                    |
| `trailing`     | object               | none              | `{ type:'atr'\|'percent'\|'fixed', value }`     |
| `breakEvenAtR` | number               | none              | Move stop to entry at N R                       |
| `reason`       | string               | none              | Max 200 chars, shown on the trade               |
| `tags`         | string[]             | none              | Max 10 tags, 40 chars each                      |

Invalid signals are rejected with a reason in `rejectedSignals`; they do not
crash the run.

## Accessor rules

- `ctx.price(offset)` and `ctx.series(name, offset)` reject `offset > 0`.
- `ctx.series` returns `null` while an indicator is warming up.
- Unknown series names throw a helpful error listing every available name.
- `ctx.bars` is the number of bars seen so far (1-based), while `ctx.i` is
  0-based.

## Level snapshots

Levels are point-in-time:

- A swing becomes visible after its right-hand lookback bars close.
- PDH/PDL only populate once a full prior UTC day has closed.
- The Asian range populates at 07:00 UTC and holds until the next session.
- `0` means "not known yet" — gate on it before comparing prices.

```js
const asianHigh = ctx.levels.asianHigh;
if (!asianHigh || ctx.close <= asianHigh) return null;
```

Only objective price extremes are exposed: recent swing pivots and session
highs/lows. There are no zone or break detectors.

## Params

```js
// run params: { lookback: 24, minRR: 2 }
const lookback = Number(ctx.params.lookback ?? 20);
```

Params are JSON only. Do not pass functions.

## Common patterns

**Warm-up gate**

```js
if (ctx.series('ema200') === null || ctx.series('atr14') === null) return null;
```

**Session gate**

```js
if (!ctx.session.londonOpenKillzone) return null;
```

**Reward:risk gate**

```js
const risk = ctx.close - stop;
if (risk <= 0) return null;
const target = ctx.close + risk * 2;
```

**Limit entry**

```js
const swingHigh = ctx.levels.swingHigh;
if (!swingHigh) return null;
return {
  side: 'long',
  entry: swingHigh,
  stop: ctx.levels.swingLow - ctx.atr() * 0.25,
  validBars: 8,
};
```
