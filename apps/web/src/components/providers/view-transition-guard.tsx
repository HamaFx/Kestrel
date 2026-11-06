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

// The browser's View Transitions API rejects `ready` / `finished` /
// `updateCallbackDone` when an update takes longer than its internal timeout.
// `next-view-transitions` never attaches handlers to those promises, so a slow
// route (dashboard charts, journal data) surfaces as an unhandled rejection.
// Navigation itself already completed; the timed-out animation is cosmetic.
//
// Patch the start method once at app mount so every transition promise has a
// rejection handler. The original method is still responsible for starting
// and running the transition, and the patch is removed on unmount.

import { useEffect } from 'react';

interface ViewTransitionLike {
  ready: Promise<void>;
  finished: Promise<void>;
  updateCallbackDone?: Promise<void>;
}

type StartViewTransition = (callback: () => void | Promise<void>) => ViewTransitionLike;

interface ViewTransitionDocument {
  startViewTransition?: StartViewTransition;
}

function ignoreTransitionAbort(): void {
  // Expected when the browser aborts a transition; navigation is unaffected.
}

export function ViewTransitionGuard() {
  useEffect(() => {
    if (typeof document === 'undefined') return;

    const doc = document as unknown as ViewTransitionDocument;
    if (typeof doc.startViewTransition !== 'function') return;

    const original = doc.startViewTransition.bind(doc);
    doc.startViewTransition = (callback) => {
      const transition = original(callback);
      void transition.ready.catch(ignoreTransitionAbort);
      void transition.finished.catch(ignoreTransitionAbort);
      void transition.updateCallbackDone?.catch(ignoreTransitionAbort);
      return transition;
    };

    return () => {
      doc.startViewTransition = original;
    };
  }, []);

  return null;
}
