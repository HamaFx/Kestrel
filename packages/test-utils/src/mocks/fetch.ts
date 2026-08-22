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

export type MockFetchHandler = (url: string, options?: RequestInit) => Promise<Response>;

export function createMockFetch(): {
  handler: MockFetchHandler;
  mockResponse: (urlMatcher: RegExp | string, response: unknown, status?: number) => void;
  mockError: (urlMatcher: RegExp | string, error: Error) => void;
  reset: () => void;
  getCallHistory: () => Array<{ url: string; method: string }>;
} {
  const routes = new Map<
    string,
    { response: unknown; status: number; isError: boolean; error?: Error }
  >();
  const callHistory: Array<{ url: string; method: string }> = [];

  const handler: MockFetchHandler = async (url: string, options?: RequestInit) => {
    callHistory.push({ url, method: options?.method ?? 'GET' });
    for (const [pattern, route] of routes) {
      const regex = new RegExp(pattern);
      if (regex.test(url)) {
        if (route.isError && route.error) throw route.error;
        return new Response(JSON.stringify(route.response), {
          status: route.status,
          headers: { 'content-type': 'application/json' },
        });
      }
    }
    return new Response(JSON.stringify({ error: 'unmocked' }), { status: 404 });
  };

  return {
    handler,
    mockResponse(urlMatcher: RegExp | string, response: unknown, status = 200) {
      routes.set(urlMatcher instanceof RegExp ? urlMatcher.source : urlMatcher, {
        response,
        status,
        isError: false,
      });
    },
    mockError(urlMatcher: RegExp | string, error: Error) {
      routes.set(urlMatcher instanceof RegExp ? urlMatcher.source : urlMatcher, {
        response: null,
        status: 0,
        isError: true,
        error,
      });
    },
    reset() {
      routes.clear();
      callHistory.length = 0;
    },
    getCallHistory() {
      return [...callHistory];
    },
  };
}
