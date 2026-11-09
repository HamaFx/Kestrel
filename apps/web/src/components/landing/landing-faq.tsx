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

import { BlueprintPlate } from '@/components/brand/blueprint-plates';
import { cn } from '@/lib/formatters/cn';

interface FAQItem {
  id: string;
  question: string;
  answer: string;
}

const FAQS: FAQItem[] = [
  {
    id: '01',
    question: 'Which markets are supported out of the box?',
    answer:
      'Spot Gold (XAU/USD), 11 major Forex pairs, and 6 liquid Crypto pairs—cross-referenced against US Treasury yields and DXY.',
  },
  {
    id: '02',
    question: 'How does the 4-Desk Committee handle conflicting signals?',
    answer:
      'All four desks score independently; if Risk or Macro flags a conflict or R:R below 1:2.0, the setup is automatically vetoed.',
  },
  {
    id: '03',
    question: 'Does Kestrel hold custody of funds or execute live broker orders?',
    answer:
      'Never—Kestrel is a 100% non-custodial research terminal with an optional virtual Paper Trading broker and QuickJS backtester.',
  },
  {
    id: '04',
    question: 'How are my AI API keys and monthly budgets protected?',
    answer:
      'Keys are encrypted at rest with AES-256-GCM and guarded by an atomic integer-cent ledger that enforces daily and monthly caps.',
  },
  {
    id: '05',
    question: 'Can I receive alerts on mobile and Telegram?',
    answer:
      'Yes—install Kestrel as a mobile PWA for Web Push alerts or connect your own BotFather webhook via the Telegram plugin.',
  },
];

export function LandingFAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section
      id="faq"
      className="relative overflow-hidden border-b border-white/[0.07] bg-[#121212] py-20 lg:py-28"
    >
      {/* Bayer-dithered chiaroscuro aegis backdrop */}
      <div
        aria-hidden="true"
        className="section-backdrop-mask-right pointer-events-none absolute top-6 right-0 z-0 h-[260px] w-[80%] opacity-20 mix-blend-screen select-none sm:h-[340px] sm:w-[60%] lg:top-0 lg:right-0 lg:h-[78%] lg:w-[40%] lg:opacity-28"
      >
        <BlueprintPlate id="aegis" variant="backdrop" className="h-full w-full" />
      </div>

      <div className="relative z-10 mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        {/* Concise Section Header */}
        <div className="mb-10 flex flex-col justify-between gap-4 border-b border-white/[0.07] pb-7 lg:flex-row lg:items-end">
          <div>
            <div className="text-brand mb-2.5 flex items-center gap-2 font-mono text-xs tracking-[0.14em] uppercase">
              <span>// 05 · SPECIFICATION FAQ</span>
            </div>
            <h2 className="font-display text-fg text-3xl font-normal tracking-[-0.02em] sm:text-5xl">
              Every Detail <span className="font-redaction-35 text-brand italic">Clarified.</span>
            </h2>
          </div>
          <p className="text-fg-muted max-w-sm font-sans text-sm leading-relaxed">
            Direct answers on market coverage, risk vetoes, BYOK encryption, and self-hosting.
          </p>
        </div>

        {/* Accordion List */}
        <div className="flex flex-col gap-3">
          {FAQS.map((faq, index) => {
            const isOpen = openIndex === index;
            return (
              <div
                key={faq.id}
                className={cn(
                  'overflow-hidden rounded-xl border transition-all duration-200',
                  isOpen
                    ? 'border-brand/40 bg-[#151618]'
                    : 'border-white/[0.07] bg-[#141517]/60 hover:border-white/15',
                )}
              >
                <button
                  id={`faq-trigger-${faq.id}`}
                  type="button"
                  aria-expanded={isOpen}
                  aria-controls={`faq-panel-${faq.id}`}
                  onClick={() => setOpenIndex(isOpen ? null : index)}
                  className="flex w-full items-center justify-between px-5 py-4 text-left sm:px-6"
                >
                  <div className="flex items-center gap-3 pr-4">
                    <span className="text-brand font-mono text-xs font-bold">{faq.id}</span>
                    <span className="font-display text-fg text-lg font-normal tracking-tight sm:text-xl">
                      {faq.question}
                    </span>
                  </div>
                  <div
                    className={cn(
                      'flex size-7 shrink-0 items-center justify-center rounded-md border transition-transform duration-200',
                      isOpen
                        ? 'bg-brand border-brand rotate-180 text-white'
                        : 'text-fg-subtle border-white/10 bg-white/5',
                    )}
                  >
                    <IconChevronDown className="size-4" />
                  </div>
                </button>

                <div
                  id={`faq-panel-${faq.id}`}
                  role="region"
                  aria-labelledby={`faq-trigger-${faq.id}`}
                  className={cn(
                    'grid transition-all duration-200 ease-out',
                    isOpen
                      ? 'grid-rows-[1fr] opacity-100'
                      : 'pointer-events-none grid-rows-[0fr] opacity-0',
                  )}
                >
                  <div className="overflow-hidden">
                    <div className="text-fg-muted border-t border-white/[0.06] px-5 pt-3.5 pb-4 font-sans text-sm leading-relaxed sm:px-6">
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
