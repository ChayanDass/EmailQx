const rawApiUrl = import.meta.env.VITE_API_URL || '';
export const API_BASE_URL = rawApiUrl.endsWith('/') ? rawApiUrl.slice(0, -1) : rawApiUrl;

/**
 * Returns full URL if VITE_API_URL is configured (e.g. https://server-sigma-jet.vercel.app/api/stats),
 * or relative path fallback (/api/stats) if VITE_API_URL is empty.
 */
export function getApiUrl(path: string): string {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  if (API_BASE_URL) {
    return `${API_BASE_URL}${cleanPath}`;
  }
  return cleanPath;
}
