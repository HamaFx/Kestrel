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

export const DRIVER = String.raw`
function __kestrelSession(ms) {
  var d = new Date(ms);
  var hour = d.getUTCHours();
  var minute = d.getUTCMinutes();
  var day = d.getUTCDay();
  var isAsian = hour < 7;
  var isLondon = hour >= 7 && hour < 16;
  var isNewYork = hour >= 12 && hour < 21;
  return {
    hourUtc: hour,
    minuteUtc: minute,
    dayOfWeek: day,
    asian: isAsian,
    london: isLondon,
    newYork: isNewYork,
    overlap: hour >= 12 && hour < 16,
    londonOpenKillzone: hour >= 7 && hour < 10,
    newYorkOpenKillzone: hour >= 12 && hour < 15,
    weekend: day === 0 || day === 6
  };
}

function __kestrelZone(top, bottom, age, strength) {
  if (!top || !bottom) return null;
  var zone = { top: top, bottom: bottom, age: age };
  if (strength !== undefined) zone.strength = strength;
  return zone;
}

function __kestrelSmc(i) {
  var s = __KP.smc;
  var sweep = s.sweepSide[i] ? {
    side: s.sweepSide[i] > 0 ? 'high' : 'low',
    level: s.sweepLevel[i],
    wick: s.sweepWick[i],
    magnitude: s.sweepMagnitude[i],
    age: s.sweepAge[i]
  } : null;
  var structure = s.structureDirection[i] ? {
    direction: s.structureDirection[i] > 0 ? 'bullish' : 'bearish',
    kind: s.structureKind[i] === 1 ? 'bos' : 'choch',
    level: s.structureLevel[i],
    age: s.structureAge[i]
  } : null;
  return {
    fvg: {
      bullish: __kestrelZone(s.fvgBullTop[i], s.fvgBullBottom[i], s.fvgBullAge[i]),
      bearish: __kestrelZone(s.fvgBearTop[i], s.fvgBearBottom[i], s.fvgBearAge[i])
    },
    orderBlock: {
      bullish: __kestrelZone(s.obBullTop[i], s.obBullBottom[i], s.obBullAge[i], s.obBullStrength[i]),
      bearish: __kestrelZone(s.obBearTop[i], s.obBearBottom[i], s.obBearAge[i], s.obBearStrength[i])
    },
    sweep: sweep,
    structure: structure,
    swingHigh: s.swingHigh[i] || null,
    swingLow: s.swingLow[i] || null,
    pdh: s.pdh[i] || null,
    pdl: s.pdl[i] || null,
    asianHigh: s.asianHigh[i] || null,
    asianLow: s.asianLow[i] || null
  };
}

function __kestrelFormat(value) {
  if (typeof value === 'string') return value;
  try {
    var text = JSON.stringify(value);
    return typeof text === 'string' ? text : String(value);
  } catch (err) {
    return String(value);
  }
}

function __kestrelNumber(value, label) {
  var n = Number(value);
  if (!isFinite(n)) throw new Error(label + ' must be a finite number');
  return n;
}

function __kestrelNormalize(sig, i) {
  if (sig === null || sig === undefined) return null;
  if (typeof sig !== 'object') {
    throw new Error('getSignal must return an object or null (bar ' + (i + 1) + ')');
  }
  var side = sig.side;
  if (side !== 'long' && side !== 'short') {
    throw new Error("signal.side must be 'long' or 'short' (bar " + (i + 1) + ')');
  }
  var stop = __kestrelNumber(sig.stop, 'signal.stop');
  if (stop <= 0) throw new Error('signal.stop must be > 0 (bar ' + (i + 1) + ')');

  var entry = 'market';
  if (sig.entry !== undefined && sig.entry !== null && sig.entry !== 'market') {
    entry = __kestrelNumber(sig.entry, 'signal.entry');
    if (entry <= 0) throw new Error('signal.entry must be > 0 (bar ' + (i + 1) + ')');
  }

  var out = {
    side: side,
    entry: entry,
    stop: stop,
    signalIndex: i,
    signalTime: __KP.bars.t[i]
  };

  if (sig.target !== undefined && sig.target !== null) {
    out.target = __kestrelNumber(sig.target, 'signal.target');
    if (out.target <= 0) throw new Error('signal.target must be > 0 (bar ' + (i + 1) + ')');
  }
  if (sig.riskPct !== undefined && sig.riskPct !== null) {
    out.riskPct = __kestrelNumber(sig.riskPct, 'signal.riskPct');
  }
  if (sig.maxBars !== undefined && sig.maxBars !== null) {
    out.maxBars = Math.floor(__kestrelNumber(sig.maxBars, 'signal.maxBars'));
    if (out.maxBars < 1) throw new Error('signal.maxBars must be >= 1');
  }
  if (sig.validBars !== undefined && sig.validBars !== null) {
    out.validBars = Math.floor(__kestrelNumber(sig.validBars, 'signal.validBars'));
    if (out.validBars < 1) throw new Error('signal.validBars must be >= 1');
  }
  if (sig.breakEvenAtR !== undefined && sig.breakEvenAtR !== null) {
    out.breakEvenAtR = __kestrelNumber(sig.breakEvenAtR, 'signal.breakEvenAtR');
  }
  if (sig.trailing !== undefined && sig.trailing !== null) {
    if (typeof sig.trailing !== 'object') throw new Error('signal.trailing must be an object');
    var type = sig.trailing.type;
    if (type !== 'atr' && type !== 'percent' && type !== 'fixed') {
      throw new Error("signal.trailing.type must be 'atr', 'percent' or 'fixed'");
    }
    out.trailing = {
      type: type,
      value: __kestrelNumber(sig.trailing.value, 'signal.trailing.value')
    };
  }
  if (sig.reason !== undefined && sig.reason !== null) {
    out.reason = String(sig.reason).slice(0, 200);
  }
  if (sig.tags !== undefined && sig.tags !== null) {
    if (!Array.isArray(sig.tags)) throw new Error('signal.tags must be an array of strings');
    out.tags = sig.tags.slice(0, 10).map(function (tag) { return String(tag).slice(0, 40); });
  }
  return out;
}

var __kestrelLogs = [];
function __kestrelLog(level, args) {
  if (__kestrelLogs.length >= __KP.limits.maxLogs) return;
  var parts = [];
  for (var k = 0; k < args.length; k += 1) parts.push(__kestrelFormat(args[k]).slice(0, 500));
  __kestrelLogs.push(level + ': ' + parts.join(' '));
}
globalThis.console = {
  log: function () { __kestrelLog('log', arguments); },
  info: function () { __kestrelLog('info', arguments); },
  warn: function () { __kestrelLog('warn', arguments); },
  error: function () { __kestrelLog('error', arguments); },
  debug: function () { __kestrelLog('debug', arguments); }
};

function __kestrelRun() {
  if (typeof getSignal !== 'function') {
    throw new Error('Your strategy must define a function named getSignal(ctx).');
  }
  var N = __KP.bars.t.length;
  var I = 0;
  function price(offset) {
    offset = offset === undefined ? 0 : Math.floor(offset);
    if (offset > 0) throw new Error('price() cannot read future bars (offset must be <= 0)');
    var j = I + offset;
    if (j < 0 || j >= N) return null;
    return { t: __KP.bars.t[j], open: __KP.bars.o[j], high: __KP.bars.h[j], low: __KP.bars.l[j], close: __KP.bars.c[j], volume: __KP.bars.v[j] };
  }
  function series(name, offset) {
    offset = offset === undefined ? 0 : Math.floor(offset);
    if (offset > 0) throw new Error('series() cannot read future bars (offset must be <= 0)');
    if (!Object.prototype.hasOwnProperty.call(__KP.series, name)) {
      throw new Error('Unknown series "' + name + '". Available: ' + __KP.seriesNames.join(', '));
    }
    var arr = __KP.series[name];
    var j = I + offset;
    if (j < 0 || j >= N) return null;
    var value = arr[j];
    return typeof value === 'number' && isFinite(value) ? value : null;
  }

  var signals = [];
  for (I = 0; I < N; I += 1) {
    var ctx = {
      i: I,
      bars: I + 1,
      t: __KP.bars.t[I],
      symbol: __KP.symbol,
      timeframe: __KP.timeframe,
      params: __KP.params,
      open: __KP.bars.o[I],
      high: __KP.bars.h[I],
      low: __KP.bars.l[I],
      close: __KP.bars.c[I],
      volume: __KP.bars.v[I],
      price: price,
      bar: price,
      series: series,
      session: __kestrelSession(__KP.bars.t[I]),
      smc: __kestrelSmc(I),
      atr: function (offset) { return series('atr14', offset); }
    };

    var sig;
    try {
      sig = getSignal(ctx);
    } catch (err) {
      throw new Error('getSignal threw on bar ' + (I + 1) + ': ' + (err && err.message ? err.message : String(err)));
    }
    var normalized = __kestrelNormalize(sig, I);
    if (normalized) {
      signals.push(normalized);
      if (signals.length > __KP.limits.maxSignals) {
        throw new Error('Strategy produced more than ' + __KP.limits.maxSignals + ' signals.');
      }
    }
  }

  return JSON.stringify({ signals: signals, logs: __kestrelLogs, bars: N });
}
`;
