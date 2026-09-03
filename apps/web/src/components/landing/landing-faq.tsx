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

import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { IconChevronDown } from '@tabler/icons-react';
import { cn } from '@/lib/cn';

interface FAQItem {
  id: string;
  question: string;
  answer: string;
}

const FAQS: FAQItem[] = [
  {
    id: '01',
    question: 'What markets does Kestrel specialize in?',
    answer: 'Kestrel is hyper-specialized for Spot Gold (XAU/USD) and major institutional Forex pairs (EUR/USD, GBP/USD, USD/JPY, AUD/USD). It continuously cross-references interbank currency flows against US Treasury yields (2Y, 10Y) and the Dollar Index (DXY).',
  },
  {
    id: '02',
    question: 'How does the 4-desk committee resolve conflicting signals?',
    answer: 'When the Technical Desk identifies a bullish Fair Value Gap but the Macro Desk flags hawkish central bank speech or impending NFP volatility, the Syndicate Arbiter marks the setup as "Disputed Consensus" and invokes mathematical risk rules. Kestrel will never issue a trade card unless all four specialized criteria satisfy minimal conviction thresholds.',
  },
  {
    id: '03',
    question: 'Does Kestrel connect directly to my broker or hold custody of funds?',
    answer: 'Zero custody. Kestrel is an institutional intelligence and execution-planning terminal. All trading decisions generate verified institutional Trade Order cards with explicit Entry, Invalidation, and Take-Profit Cones that you can execute directly or dispatch via encrypted webhooks to MetaTrader, cTrader, or custom FIX bridges.',
  },
  {
    id: '04',
    question: 'What models and backends power Kestrel?',
    answer: 'Kestrel employs an ensemble multi-agent architecture built on the Mastra engine. Specialist agents leverage fine-tuned frontier models routed by task: Claude 3.7 Sonnet for spatial candlestick and SMC order block analysis, Gemini 2.5 Flash for high-speed macroeconomic wire parsing, and DeepSeek-R1 for mathematical risk and position sizing calculations.',
  },
  {
    id: '05',
    question: 'Is Kestrel fully accessible on mobile devices?',
    answer: 'Yes. Kestrel is built mobile-first as an installable Progressive Web Application (PWA) with hardware safe-area insets, tactile 44px+ hit targets, and touch-optimized lightweight TradingView charts.',
  },
];

export function LandingFAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section id="faq" className="relative py-28 lg:py-36 bg-[#0d0d0d] overflow-hidden border-t border-white/5">
      {/* Halftone Columns Background */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 right-0 w-1/3 opacity-20 select-none bg-contain bg-no-repeat bg-right"
        style={{ backgroundImage: 'url(/landing/faq-halftone-columns.png)' }}
      />

      <div className="relative z-10 mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="flex flex-col items-center text-center gap-4 mb-16">
          <span className="font-mono text-xs font-semibold tracking-wider text-brand uppercase">
            Frequently Answered Questions
          </span>
          <h2 className="font-display text-3xl font-normal tracking-[-0.03em] text-fg sm:text-5xl">
            EVERY DETAIL{' '}
            <span className="font-redaction-35 italic text-brand">Clarified</span>
          </h2>
          <p className="font-sans text-base text-fg-muted max-w-xl">
            Transparent explanations of Kestrel's algorithmic arbitration, non-custodial security, and data architecture.
          </p>
        </div>

        {/* Accordion List with Smooth Auto-Height Spring */}
        <div className="flex flex-col gap-4">
          {FAQS.map((faq, index) => {
            const isOpen = openIndex === index;
            return (
              <div
                key={faq.question}
                className={cn(
                  'surface-chip rounded-xl border transition-colors duration-200 overflow-hidden',
                  isOpen
                    ? 'bg-[#161616] border-brand/40 shadow-[var(--shadow-chip)]'
                    : 'bg-white/[0.02] border-white/5 hover:border-white/10',
                )}
              >
                <button
                  type="button"
                  onClick={() => setOpenIndex(isOpen ? null : index)}
                  className="flex w-full items-center justify-between p-5 sm:p-6 text-left"
                >
                  <div className="flex items-center gap-3 pr-4">
                    <span className="font-mono text-xs text-brand font-bold">
                      {faq.id}
                    </span>
                    <span className="font-display text-lg font-normal tracking-tight text-fg sm:text-xl">
                      {faq.question}
                    </span>
                  </div>
                  <div
                    className={cn(
                      'flex size-8 shrink-0 items-center justify-center rounded-lg border transition-transform duration-200',
                      isOpen
                        ? 'bg-brand text-white border-brand rotate-180'
                        : 'bg-white/5 text-fg-subtle border-white/10',
                    )}
                  >
                    <IconChevronDown className="size-4" />
                  </div>
                </button>

                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                      className="overflow-hidden"
                    >
                      <div className="px-5 pb-5 sm:px-6 sm:pb-6 font-sans text-sm leading-relaxed text-fg-muted border-t border-white/5 pt-4">
                        {faq.answer}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
