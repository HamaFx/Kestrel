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
import { IconChevronDown } from '@tabler/icons-react';
import { useState } from 'react';

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
    answer:
      'Kestrel is built for Spot Gold (XAU/USD), major Forex pairs (EUR/USD, GBP/USD, USD/JPY, AUD/USD), and leading crypto perpetuals. Every analysis cross-references live price action against US Treasury yields (2Y, 10Y), the Dollar Index (DXY), and upcoming economic events.',
  },
  {
    id: '02',
    question: 'How does the 4-Desk Committee resolve conflicting market signals?',
    answer:
      'Quick Read mode runs a single analyst for a fast 5-second check. In Full Committee mode, all four specialist desks (Technical, Macro, Risk, and Sentiment) evaluate the market independently. If Technicals spots a bullish setup right before a high-impact Fed release or hawkish macro shift, the desks flag the conflict openly and the Risk Desk warns you to stand down or reduce size instead of forcing a weak trade.',
  },
  {
    id: '03',
    question: 'Does Kestrel hold custody of funds or place trades automatically?',
    answer:
      'Never. Kestrel is a 100% non-custodial research and trade-planning copilot. Every committee briefing gives you exact Entry zones, Invalidation stops, position sizing, and Take-Profit targets that you can log to your Trade Journal and monitor with instant Telegram, Push, and Email alerts (with direct MT5 / cTrader bridge integration on our future roadmap).',
  },
  {
    id: '04',
    question: 'Do I need to configure my own AI API keys or market data feeds?',
    answer:
      'No. Kestrel is a fully hosted subscription platform—all four specialist AI desks, real-time Gold, Forex, and Crypto market data, breaking news wires, economic calendars, and alert delivery channels are included and ready the moment you sign in.',
  },
  {
    id: '05',
    question: 'Can I use Kestrel on my phone as well as desktop?',
    answer:
      'Yes. Kestrel works seamlessly across desktop, tablet, and mobile browsers, and can be installed directly to your phone’s home screen as a web app with instant browser push and Telegram notifications for your price and indicator alerts.',
  },
];

export function LandingFAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section
      id="faq"
      className="relative overflow-hidden border-t border-white/5 bg-[#0d0d0d] py-28 lg:py-36"
    >
      {/* Halftone Columns Background */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 right-0 w-1/3 bg-contain bg-right bg-no-repeat opacity-20 select-none"
        style={{ backgroundImage: 'url(/landing/faq-halftone-columns.png)' }}
      />

      <div className="relative z-10 mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="mb-16 flex flex-col items-center gap-4 text-center">
          <span className="text-brand font-mono text-xs font-semibold tracking-wider uppercase">
            Frequently Asked Questions
          </span>
          <h2 className="font-display text-fg text-3xl font-normal tracking-[-0.03em] sm:text-5xl">
            EVERY DETAIL <span className="font-redaction-35 text-brand italic">Clarified</span>
          </h2>
          <p className="text-fg-muted max-w-xl font-sans text-base">
            Clear answers on how Kestrel&apos;s 4-desk AI committee, risk guardrails, and hosted
            subscription work.
          </p>
        </div>

        {/* Accordion List with Zero-Jitter CSS Grid Row Transitions */}
        <div className="flex flex-col gap-4">
          {FAQS.map((faq, index) => {
            const isOpen = openIndex === index;
            return (
              <div
                key={faq.id}
                className={cn(
                  'surface-chip overflow-hidden rounded-xl border transition-all duration-200',
                  isOpen
                    ? 'border-brand/40 bg-[#161616] shadow-[var(--shadow-chip)]'
                    : 'border-white/5 bg-white/[0.02] hover:border-white/10',
                )}
              >
                <button
                  id={`faq-trigger-${faq.id}`}
                  type="button"
                  aria-expanded={isOpen}
                  aria-controls={`faq-panel-${faq.id}`}
                  onClick={() => setOpenIndex(isOpen ? null : index)}
                  className="flex w-full items-center justify-between p-5 text-left transition-transform active:translate-y-[0.5px] sm:p-6"
                >
                  <div className="flex items-center gap-3 pr-4">
                    <span className="text-brand font-mono text-xs font-bold">{faq.id}</span>
                    <span className="font-display text-fg text-lg font-normal tracking-tight sm:text-xl">
                      {faq.question}
                    </span>
                  </div>
                  <div
                    className={cn(
                      'flex size-8 shrink-0 items-center justify-center rounded-lg border transition-transform duration-200',
                      isOpen
                        ? 'bg-brand border-brand rotate-180 text-white shadow-[0_0_8px_rgba(255,54,22,0.3)]'
                        : 'text-fg-subtle border-white/10 bg-white/5',
                    )}
                  >
                    <IconChevronDown className="size-4" />
                  </div>
                </button>

                {/* Zero-Jitter CSS Grid Row Accordion Body */}
                <div
                  id={`faq-panel-${faq.id}`}
                  role="region"
                  aria-labelledby={`faq-trigger-${faq.id}`}
                  className={cn(
                    'grid transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]',
                    isOpen
                      ? 'grid-rows-[1fr] opacity-100'
                      : 'pointer-events-none grid-rows-[0fr] opacity-0',
                  )}
                >
                  <div className="overflow-hidden">
                    <div className="text-fg-muted border-t border-white/5 px-5 pt-4 pb-5 font-sans text-sm leading-relaxed sm:px-6 sm:pb-6">
                      {faq.answer}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
