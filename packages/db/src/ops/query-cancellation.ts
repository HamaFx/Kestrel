import postgres, { type Sql } from 'postgres';

export interface CancellableQueryOptions {
  signal?: AbortSignal;
  ssl?: false | { rejectUnauthorized: boolean; ca?: string };
}

/**
 * Execute work on a dedicated postgres.js connection. The query callback can
 * pass the supplied signal to postgres.js tagged-template calls; postgres.js
 * then sends PostgreSQL cancellation on abort instead of merely abandoning
 * the JavaScript promise.
 */
export async function withCancellablePostgresQuery<T>(
  url: string,
  query: (sql: Sql, signal: AbortSignal | undefined) => Promise<T>,
  options: CancellableQueryOptions = {},
): Promise<T> {
  if (options.signal?.aborted) throw abortError();

  const clientOptions = {
    prepare: false,
    max: 1,
    idle_timeout: 5,
    connect_timeout: 10,
    ...(options.ssl !== undefined ? { ssl: options.ssl } : {}),
  };
  const client = postgres(url, clientOptions);

  try {
    return await query(client, options.signal);
  } finally {
    await client.end({ timeout: 5 });
  }
}

export function abortError(): DOMException {
  return new DOMException('PostgreSQL query aborted', 'AbortError');
}
