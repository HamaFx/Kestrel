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
    reason: 'London sweep + FVG reclaim',
    tags: ['smc', 'london'],
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

## SMC snapshots

Zones are point-in-time:

- FVG becomes visible on its third bar (the confirmation bar).
- Order block becomes visible after its two impulse bars.
- Swing becomes visible after its right-hand lookback.
- Sweep becomes visible on the sweeping bar.
- Structure event becomes visible on the break bar.
- `age` is the number of bars since visibility.

The engine exposes only the **nearest unmitigated** zone on each side of price:

```js
if (ctx.smc.fvg.bullish && ctx.low <= ctx.smc.fvg.bullish.top) {
  // price is retesting a bullish FVG
}
```

Mitigation is bar-by-bar: a wick into a zone keeps it alive, a close through the
far side invalidates it.

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
return {
  side: 'long',
  entry: ctx.smc.fvg.bullish.top,
  stop: ctx.smc.fvg.bullish.bottom - ctx.atr() * 0.25,
  validBars: 8,
};
```
