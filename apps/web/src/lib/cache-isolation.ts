'use client';

/** Remove application-owned browser state before leaving an authenticated account. */
export async function clearKestrelClientState(): Promise<void> {
  if (typeof window === 'undefined') return;

  try {
    for (let index = localStorage.length - 1; index >= 0; index -= 1) {
      const key = localStorage.key(index);
      if (key?.startsWith('kestrel:') || key?.startsWith('hamafx:') || key?.startsWith('hfx_')) {
        localStorage.removeItem(key);
      }
    }
    sessionStorage.clear();
  } catch {
    // Storage may be unavailable; logout must still proceed.
  }

  if ('caches' in window) {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key.startsWith('kestrel-')).map((key) => caches.delete(key)));
    } catch {
      // Cache cleanup is best effort; service-worker activation also rotates caches.
    }
  }
}
