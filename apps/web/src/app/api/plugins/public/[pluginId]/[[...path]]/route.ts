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

// Generic public plugin transport surface:
//   /api/plugins/public/<pluginId>/<...path>
//
// Intentionally unauthenticated. A public handler MUST validate the
// provider's signature/secret before doing work (the Telegram plugin checks
// both an HMAC-signed path token and Telegram's secret header). The handler
// also resolves the owning install itself; `getInstall` fails closed.

import { dispatchPluginPublicApiRequest } from '@/lib/services/plugin-api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface PublicPluginRouteParams {
  pluginId: string;
  path?: string[];
}

async function dispatch(
  request: Request,
  paramsPromise: Promise<PublicPluginRouteParams>,
): Promise<Response> {
  const params = await paramsPromise;
  return dispatchPluginPublicApiRequest({
    request,
    pluginId: params.pluginId,
    segments: params.path ?? [],
  });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<PublicPluginRouteParams> },
): Promise<Response> {
  return dispatch(request, params);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<PublicPluginRouteParams> },
): Promise<Response> {
  return dispatch(request, params);
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<PublicPluginRouteParams> },
): Promise<Response> {
  return dispatch(request, params);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<PublicPluginRouteParams> },
): Promise<Response> {
  return dispatch(request, params);
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<PublicPluginRouteParams> },
): Promise<Response> {
  return dispatch(request, params);
}
