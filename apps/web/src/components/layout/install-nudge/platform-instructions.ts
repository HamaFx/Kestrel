// SPDX-License-Identifier: Apache-2.0
//
// "Add Kestrel to your home screen" instructions per platform.
//
// Only Chromium fires `beforeinstallprompt`; every other platform has to be
// told where the browser hides its install action. Keeping the copy here means
// the nudge and /settings/install always say exactly the same thing.

import {
  IconApps,
  IconDeviceLaptop,
  IconDeviceMobile,
  IconDots,
  IconDownload,
  IconMenu2,
  IconShare,
  type Icon,
} from '@tabler/icons-react';

import { isAndroid, isChromium, isDesktopSafari, isIOS } from '@/lib/pwa/platform-detect';

export type InstallPlatform =
  'ios' | 'macos-safari' | 'chromium-desktop' | 'chromium-android' | 'other';

export interface InstallStep {
  /** Short imperative label, e.g. "Tap Share". */
  readonly label: string;
  /** Where the control lives, e.g. "in Safari's toolbar". */
  readonly detail?: string;
  readonly icon: Icon;
}

export interface InstallInstructions {
  readonly title: string;
  readonly summary: string;
  readonly steps: readonly InstallStep[];
  /** Optional footnote (iOS behaviour changes, storage isolation, …). */
  readonly note?: string;
}

export function installPlatform(): InstallPlatform {
  if (isIOS()) return 'ios';
  if (isDesktopSafari()) return 'macos-safari';
  if (isChromium()) return isAndroid() ? 'chromium-android' : 'chromium-desktop';
  return 'other';
}

const IOS_INSTRUCTIONS: InstallInstructions = {
  title: 'Add Kestrel to your Home Screen',
  summary: 'Home Screen apps open full screen, keep working offline, and can receive alerts.',
  steps: [
    {
      label: 'Tap Share',
      detail: 'the square-with-arrow button in Safari’s toolbar',
      icon: IconShare,
    },
    {
      label: 'Choose “Add to Home Screen”',
      detail: 'scroll the share sheet if you do not see it',
      icon: IconDeviceMobile,
    },
    { label: 'Confirm Add', detail: 'iOS 26+ opens it as a web app automatically', icon: IconApps },
  ],
  note: 'Notifications on iPhone and iPad only work for Home Screen apps, and the app keeps its own storage — you may need to sign in once more.',
};

const MAC_SAFARI_INSTRUCTIONS: InstallInstructions = {
  title: 'Add Kestrel to your Dock',
  summary: 'Safari web apps get their own window, Dock icon, and keyboard-visible menus.',
  steps: [
    { label: 'Open the File menu', icon: IconMenu2 },
    { label: 'Choose “Add to Dock…”', icon: IconApps },
    { label: 'Confirm Add', icon: IconDeviceLaptop },
  ],
  note: 'Notifications for Safari web apps need macOS 13 or newer.',
};

const CHROMIUM_DESKTOP_INSTRUCTIONS: InstallInstructions = {
  title: 'Install Kestrel',
  summary: 'Kestrel becomes its own window with a taskbar icon and offline shell.',
  steps: [
    {
      label: 'Look for the install icon',
      detail: 'the monitor-with-arrow at the right end of the address bar',
      icon: IconDownload,
    },
    {
      label: 'Or open the browser menu',
      detail: '⋮ → Save and share → Install Kestrel',
      icon: IconDots,
    },
  ],
};

const CHROMIUM_ANDROID_INSTRUCTIONS: InstallInstructions = {
  title: 'Install Kestrel',
  summary: 'Installed apps get a home-screen icon, an app switcher entry, and working alerts.',
  steps: [
    {
      label: 'Open the browser menu',
      detail: '⋮ in the top-right of Chrome or your browser',
      icon: IconDots,
    },
    { label: 'Tap “Install app”', detail: 'or “Add to Home screen”', icon: IconApps },
  ],
};

const INSTRUCTIONS: Record<InstallPlatform, InstallInstructions | null> = {
  ios: IOS_INSTRUCTIONS,
  'macos-safari': MAC_SAFARI_INSTRUCTIONS,
  'chromium-desktop': CHROMIUM_DESKTOP_INSTRUCTIONS,
  'chromium-android': CHROMIUM_ANDROID_INSTRUCTIONS,
  other: null,
};

export function instructionsFor(platform: InstallPlatform): InstallInstructions | null {
  return INSTRUCTIONS[platform];
}
