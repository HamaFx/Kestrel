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

// Shared skill-directory resolution for bundled plugin packages.
//
// A plugin's `SKILL.md` directories live next to the source package, and the
// relative location differs between the source tree, a Next standalone build,
// and an installed pnpm package. Bundlers also inline `import.meta.url` in some
// server chunks, so the source-relative candidate is only one of several valid
// locations.

import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Resolve one `<pluginDirName>/skills/<skillSubdir>` directory. */
export function resolvePluginSkillDir(
  importMetaUrl: string,
  pluginDirName: string,
  skillSubdir: string,
): string {
  const candidates = [
    join(dirname(fileURLToPath(importMetaUrl)), '..', 'skills', skillSubdir),
    join(process.cwd(), 'plugins', pluginDirName, 'skills', skillSubdir),
    join(
      process.cwd(),
      'node_modules',
      '@kestrel',
      `plugin-${pluginDirName}`,
      'skills',
      skillSubdir,
    ),
    join(process.cwd(), '..', '..', 'plugins', pluginDirName, 'skills', skillSubdir),
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0]!;
}
