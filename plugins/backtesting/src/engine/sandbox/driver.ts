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

function __kestrelLevels(i) {
  var s = __KP.levels;
  return {
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

function __kestrelNormalize(sig, i) {
  if (sig === null || sig === undefined) return null;
  if (typeof sig !== 'object') {
    throw new Error('getSignal must return an object or null (bar ' + (i + 1) + ')');
  }
  // The sandbox only guarantees a JSON-serializable payload. Field validation
  // and clamping belong to toSignal on the host side.
  try {
    return JSON.parse(JSON.stringify(sig));
  } catch (err) {
    throw new Error('getSignal must return JSON-serializable data (bar ' + (i + 1) + ')');
  }
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
      levels: __kestrelLevels(I),
      costs: __KP.costs,
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
      if (normalized.entry === undefined || normalized.entry === null) {
        normalized.entry = 'market';
      }
      normalized.signalIndex = I;
      normalized.signalTime = __KP.bars.t[I];
      signals.push(normalized);
      if (signals.length > __KP.limits.maxSignals) {
        throw new Error('Strategy produced more than ' + __KP.limits.maxSignals + ' signals.');
      }
    }
  }

  return JSON.stringify({ signals: signals, logs: __kestrelLogs, bars: N });
}
`;
