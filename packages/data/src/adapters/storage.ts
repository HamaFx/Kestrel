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

export interface SupabaseStorageEnv {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}

export interface StorageObjectInfo {
  name: string;
}

function storageBaseUrl(env: SupabaseStorageEnv): string {
  const url = new URL(env.SUPABASE_URL);
  if (url.protocol !== 'https:') {
    throw new Error('Supabase Storage requires HTTPS');
  }
  return url.toString().replace(/\/+$/, '');
}

function storageHeaders(env: SupabaseStorageEnv): Record<string, string> {
  return {
    authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    'content-type': 'application/json',
  };
}

export async function listStorageObjects(
  env: SupabaseStorageEnv,
  bucket: string,
  prefix: string,
): Promise<StorageObjectInfo[]> {
  const res = await fetch(`${storageBaseUrl(env)}/storage/v1/object/list/${encodeURIComponent(bucket)}`, {
    method: 'POST',
    redirect: 'error',
    headers: storageHeaders(env),
    body: JSON.stringify({ prefix, limit: 1000, offset: 0 }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '<no body>');
    throw new Error(`Supabase Storage list failed: HTTP ${res.status} — ${detail.slice(0, 200)}`);
  }

  const body = await res.text();
  if (body.length > 256 * 1024) throw new Error('Supabase Storage list response exceeded safety limit');
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    throw new Error('Supabase Storage list returned invalid JSON');
  }
  return Array.isArray(json)
    ? json.filter(
        (item): item is StorageObjectInfo =>
          typeof item === 'object' &&
          item !== null &&
          typeof (item as { name?: unknown }).name === 'string',
      )
    : [];
}

export async function deleteStorageObjects(
  env: SupabaseStorageEnv,
  bucket: string,
  paths: string[],
): Promise<void> {
  if (paths.length === 0 || paths.length > 1000) {
    throw new Error('Storage delete path count is outside the permitted range');
  }
  if (paths.some((path) => path.includes('..') || path.startsWith('/'))) {
    throw new Error('Storage delete path is invalid');
  }
  const res = await fetch(`${storageBaseUrl(env)}/storage/v1/object/${encodeURIComponent(bucket)}`, {
    method: 'DELETE',
    redirect: 'error',
    headers: storageHeaders(env),
    body: JSON.stringify({ prefixes: paths }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '<no body>');
    throw new Error(`Supabase Storage delete failed: HTTP ${res.status} — ${detail.slice(0, 200)}`);
  }
}
