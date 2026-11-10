/**
 * @vitest-environment happy-dom
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { Badge } from '@/components/ui/badge';
import { Button, ButtonGroup, TacticalButtonChrome } from '@/components/ui/button';
import { DayGrid, type DayGridDatum } from '@/components/ui/day-grid';
import { Field } from '@/components/ui/field';
import {
  Frame,
  FrameAction,
  FrameDescription,
  FrameFooter,
  FrameHeader,
  FramePanel,
  FrameRow,
  FrameTitle,
} from '@/components/ui/frame';
import { Input, InputAddon, InputGroup } from '@/components/ui/input';
import {
  Kpi,
  KpiFooter,
  KpiGroup,
  KpiHeader,
  KpiLabel,
  KpiTrend,
  KpiValue,
} from '@/components/ui/kpi';
import { OtpInput } from '@/components/ui/otp-input';
import { RangeMeter } from '@/components/ui/range-meter';
import { Select } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Splitter } from '@/components/ui/splitter';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';

describe('Kestrel PanelUI-inspired Tier 1 & Tier 2 primitives', () => {
  it('propagates FieldContext id, aria-describedby, and error state to nested InputGroup + Input', () => {
    const html = renderToStaticMarkup(
      createElement(
        Field,
        {
          label: 'Stop Loss',
          htmlFor: 'sl-price',
          helper: 'Price level where thesis invalidates',
          error: 'Stop must be below entry',
          required: true,
        },
        createElement(
          InputGroup,
          null,
          createElement(Input, { defaultValue: '2640.00' }),
          createElement(InputAddon, null, 'USD'),
        ),
      ),
    );

    expect(html).toContain('data-slot="field"');
    expect(html).toContain('data-invalid="true"');
    expect(html).toContain('data-slot="input-group"');
    expect(html).toContain('id="sl-price"');
    expect(html).toContain('aria-describedby="sl-price-error"');
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('Stop must be below entry');
    // Helper description hides while error is active to prevent vertical layout shift
    expect(html).not.toContain('Price level where thesis invalidates');
  });

  it('renders Select with visible label or FieldContext and standardized h-12 height, plus Textarea', () => {
    const selectHtml = renderToStaticMarkup(
      createElement(
        Select,
        { label: 'Symbol', defaultValue: 'XAUUSD' },
        createElement('option', { value: 'XAUUSD' }, 'XAUUSD'),
      ),
    );
    expect(selectHtml).toContain('Symbol');
    expect(selectHtml).toContain('data-slot="select"');
    expect(selectHtml).toContain('h-12');

    const textareaHtml = renderToStaticMarkup(
      createElement(
        Field,
        { label: 'Notes', htmlFor: 'trade-notes', helper: 'Execution rationale' },
        createElement(Textarea, { defaultValue: 'London sweep' }),
      ),
    );
    expect(textareaHtml).toContain('data-slot="textarea"');
    expect(textareaHtml).toContain('id="trade-notes"');
    expect(textareaHtml).toContain('aria-describedby="trade-notes-helper"');
  });

  it('renders width-stable loading Button, icon sizes, TacticalButtonChrome, ButtonGroup, and Badge dot/info', () => {
    const btnHtml = renderToStaticMarkup(
      createElement(
        ButtonGroup,
        null,
        createElement(Button, { loading: true }, 'Submit Order'),
        createElement(Button, { size: 'icon-sm', 'aria-label': 'Edit' }, 'E'),
        createElement(
          Button,
          { variant: 'tactical' },
          createElement(TacticalButtonChrome, { loading: false }, 'Launch'),
        ),
      ),
    );
    expect(btnHtml).toContain('data-slot="button-group"');
    expect(btnHtml).toContain('invisible');
    expect(btnHtml).toContain('size-8');

    const badgeHtml = renderToStaticMarkup(
      createElement(Badge, { tone: 'info', dot: true }, 'SYNCED'),
    );
    expect(badgeHtml).toContain('data-slot="badge"');
    expect(badgeHtml).toContain('SYNCED');
  });

  it('renders 6-cell OtpInput with group separator and one-time-code input overlay', () => {
    const otpHtml = renderToStaticMarkup(
      createElement(OtpInput, {
        name: 'totpCode',
        value: '123456',
        length: 6,
        groupEvery: 3,
      }),
    );
    expect(otpHtml).toContain('data-slot="otp-input"');
    expect(otpHtml).toContain('autocomplete="one-time-code"');
    expect(otpHtml).toContain('name="totpCode"');
    expect(otpHtml).toContain('—');
  });

  it('renders concentric Frame and polarity-aware Kpi with goodDirection="down"', () => {
    const frameHtml = renderToStaticMarkup(
      createElement(
        Frame,
        null,
        createElement(
          FrameHeader,
          null,
          createElement(FrameTitle, null, 'Execution Telemetry'),
          createElement(FrameDescription, null, '4 metrics'),
          createElement(FrameAction, null, 'Reset'),
        ),
        createElement(
          FramePanel,
          { variant: 'band' },
          createElement(FrameRow, null, 'Max Drawdown'),
        ),
        createElement(FrameFooter, null, 'Updated live'),
      ),
    );
    expect(frameHtml).toContain('data-slot="frame"');
    expect(frameHtml).toContain('data-slot="frame-panel"');
    expect(frameHtml).toContain('data-slot="frame-row"');

    const kpiHtml = renderToStaticMarkup(
      createElement(
        KpiGroup,
        { cols: 2 },
        createElement(
          Kpi,
          null,
          createElement(
            KpiHeader,
            null,
            createElement(KpiLabel, null, 'MAE Drawdown'),
            createElement(KpiTrend, { change: -0.45, goodDirection: 'down', suffix: 'R' }),
          ),
          createElement(KpiValue, { tone: 'bull' }, '0.45R'),
          createElement(KpiFooter, null, 'Within 1R stop'),
        ),
      ),
    );
    expect(kpiHtml).toContain('data-slot="kpi-group"');
    expect(kpiHtml).toContain('−0.45R');
    expect(kpiHtml).toContain('text-bull');
  });

  it('renders Slider, 41-tick RangeMeter, DayGrid heatmap, Splitter, and Table', () => {
    const sliderHtml = renderToStaticMarkup(
      createElement(Slider, {
        label: 'Stop Offset',
        valueLabel: '2,640.00',
        ariaLabel: 'Adjust stop price',
        value: 2640,
        min: 2620,
        max: 2660,
        origin: 'center',
        tone: 'bear',
        onValueChange: () => {},
      }),
    );
    expect(sliderHtml).toContain('data-slot="slider"');
    expect(sliderHtml).toContain('data-origin="center"');

    const meterHtml = renderToStaticMarkup(
      createElement(RangeMeter, {
        value: 2655,
        min: 2630,
        max: 2680,
        marker: 2650,
        markerLabel: 'Entry 2650',
        tone: 'bull',
        ariaLabel: 'Trade range meter',
      }),
    );
    expect(meterHtml).toContain('data-slot="range-meter"');
    expect(meterHtml).toContain('role="meter"');

    const gridData: DayGridDatum[] = [{ date: '2026-10-01', value: 2.1, count: 2 }];
    const dayGridHtml = renderToStaticMarkup(
      createElement(DayGrid, { data: gridData, weeks: 4 }),
    );
    expect(dayGridHtml).toContain('data-slot="day-grid"');
    expect(dayGridHtml).toContain('+2.10R');

    const splitterHtml = renderToStaticMarkup(
      createElement(Splitter, {
        orientation: 'vertical',
        label: 'Resize panel',
        value: 55,
        min: 30,
        max: 70,
      }),
    );
    expect(splitterHtml).toContain('role="separator"');
    expect(splitterHtml).toContain('data-orientation="vertical"');

    const tableHtml = renderToStaticMarkup(
      createElement(
        Table,
        { stackOnMobile: true },
        createElement(
          TableHeader,
          null,
          createElement(
            TableRow,
            null,
            createElement(TableHead, null, 'Symbol'),
            createElement(TableHead, { numeric: true }, 'R'),
          ),
        ),
        createElement(
          TableBody,
          null,
          createElement(
            TableRow,
            null,
            createElement(TableCell, null, 'XAUUSD'),
            createElement(TableCell, { numeric: true }, '+2.00R'),
          ),
        ),
      ),
    );
    expect(tableHtml).toContain('data-slot="table"');
    expect(tableHtml).toContain('table-stack');
  });
});
