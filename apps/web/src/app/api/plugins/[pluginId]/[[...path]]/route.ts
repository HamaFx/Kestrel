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

// SPDX-License-Identifier: Apache-2.0

// Generic plugin HTTP surface: /api/plugins/<pluginId>/<...path>
//
// Every request is authenticated and tenant-scoped by `withAuth`; plugin
// handlers see decrypted per-user settings and isolated storage. A plugin
// route is reachable only when the calling user has that plugin installed.

import { withAuth } from '@/lib/api';
import { dispatchPluginApiRequest } from '@/lib/services/plugin-api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface PluginRouteParams {
  pluginId: string;
  path?: string[];
}

async function dispatch(
  request: Request,
  paramsPromise: Promise<PluginRouteParams>,
  userId: string,
): Promise<Response> {
  const params = await paramsPromise;
  return dispatchPluginApiRequest({
    request,
    userId,
    pluginId: params.pluginId,
    segments: params.path ?? [],
  });
}

export const GET = withAuth<PluginRouteParams>(async (request, { params, user }) =>
  dispatch(request, params, user.userId),
);

export const POST = withAuth<PluginRouteParams>(async (request, { params, user }) =>
  dispatch(request, params, user.userId),
);

export const PUT = withAuth<PluginRouteParams>(async (request, { params, user }) =>
  dispatch(request, params, user.userId),
);

export const PATCH = withAuth<PluginRouteParams>(async (request, { params, user }) =>
  dispatch(request, params, user.userId),
);

export const DELETE = withAuth<PluginRouteParams>(async (request, { params, user }) =>
  dispatch(request, params, user.userId),
);
