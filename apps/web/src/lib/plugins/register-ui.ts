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

// Side-effect bootstrap for plugin UI slots.
//
// Importing this module registers every bundled plugin's `definePluginUi`
// definition with the process-wide `pluginUiRegistry`. A module import (not a
// `useEffect`) is deliberate: the sidebar, ⌘K palette, dashboard and chat
// renderer must see the slots on their very first render, including SSR.
//
// Every plugin UI module registered here is part of the client bundle. Heavy
// cards should use `next/dynamic` inside the plugin package so they stay
// lazily loaded.
import { registerBundledPluginUi } from '@kestrel/plugins/ui';

registerBundledPluginUi();
