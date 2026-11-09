// SPDX-License-Identifier: Apache-2.0

// Simplified, trader-focused 4-step workflow for `LandingStepper`.
// Focuses on the effortless user experience (Snap/Ask → Instant Clarity →
// Auto-Sized Risk → Walk Away with Phone Alerts) rather than backend internals.

export interface Step {
  id: number;
  label: string;
  tag: string;
  title: string;
  description: string;
  sceneBadge: string;
  sceneTitle: string;
  sceneSubtitle: string;
  takeaway: string;
}

export const STEPS: Step[] = [
  {
    id: 1,
    label: '01',
    tag: 'SNAP OR ASK',
    title: 'Drop a Chart Screenshot or Ask by Voice',
    description:
      'Paste a screenshot of your chart, tap the mic to ask out loud, or type a quick question. Kestrel reads the candles, trendlines, and upcoming news in seconds.',
    sceneBadge: 'STEP 01 · AI CHART & VOICE VISION',
    sceneTitle: 'Instant Chart & Market Recognition',
    sceneSubtitle: 'Reads candlestick patterns, key levels, and news windows from a single drop.',
    takeaway: 'Works with chart screenshots, voice prompts, or plain text',
  },
  {
    id: 2,
    label: '02',
    tag: 'INSTANT CLARITY',
    title: 'Get a Second Opinion With Zero Emotion',
    description:
      'No more FOMO or hesitation. See an instant conviction score and a clear Buy, Sell, or Stand-Aside read backed by trend, news, and big-money flow.',
    sceneBadge: 'STEP 02 · EMOTION-FREE CONVICTION',
    sceneTitle: 'Clear Go or No-Go Conviction Dial',
    sceneSubtitle: 'Weighs buyer vs. seller strength so you never chase a weak move.',
    takeaway: 'Tells you when to strike—and when to sit on your hands',
  },
  {
    id: 3,
    label: '03',
    tag: 'AUTO-SIZED RISK',
    title: 'Lock In Your Exact Stop-Loss & Lot Size',
    description:
      'Never do manual pip math again. Kestrel places your stop-loss safely beyond market noise and calculates the exact position size to keep your risk under 1%.',
    sceneBadge: 'STEP 03 · AUTOMATIC 1% SHIELD',
    sceneTitle: 'Zero-Math Position & Stop-Loss Sizing',
    sceneSubtitle: 'Automatically caps every trade inside your 1.0% account safety zone.',
    takeaway: 'One bad trade can never wipe out your week',
  },
  {
    id: 4,
    label: '04',
    tag: 'WALK AWAY',
    title: 'Save to Your Journal & Get Phone Alerts',
    description:
      'Log the setup to your Trade Journal in one click, arm instant Telegram and phone push alerts for your entry and targets, and step away from the screen.',
    sceneBadge: 'STEP 04 · 24/7 PHONE RADAR & JOURNAL',
    sceneTitle: 'Trade Without Being Glued to Screens',
    sceneSubtitle: 'Pings your phone when price hits your levels and tracks your R-multiple edge.',
    takeaway: 'Instant alerts via Telegram, Browser Push, and Email',
  },
];

export const STAGE_INTERVAL_MS = 4800;
