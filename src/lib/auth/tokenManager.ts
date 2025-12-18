// src/lib/auth/tokenManager.ts
let inMemoryToken: string | null = null;
let refreshTimer: NodeJS.Timeout | null = null;

export function setToken(token: string, expiresInSec?: number) {
  inMemoryToken = token;

  // Auto-refresh token slightly before it expires
  if (expiresInSec) {
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(async () => {
      console.log('🔄 Refreshing token...');
      // This will be handled by Firebase getIdToken(true)
    }, (expiresInSec - 60) * 1000); // refresh 1 min early
  }
}

export function getToken() {
  return inMemoryToken;
}

export function clearToken() {
  inMemoryToken = null;
  if (refreshTimer) clearTimeout(refreshTimer);
}

// Default export for compatibility
const tokenManager = { setToken, getToken, clearToken };
export default tokenManager;
