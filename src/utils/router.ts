/**
 * Router utilities for MPA architecture
 *
 * In this MPA setup, each app has its own base path: /apps/{app_id}/
 * This utility automatically detects the basename from the URL.
 */

/**
 * Extracts the basename from the current URL path
 *
 * @returns The basename for React Router (e.g., "/apps/my-app")
 *
 * @example
 * // URL: http://localhost:8000/apps/my-app/
 * getBasename() // Returns: "/apps/my-app"
 *
 * // URL: http://localhost:8000/apps/my-app/about
 * getBasename() // Returns: "/apps/my-app"
 */
export function getBasename(): string {
  const path = window.location.pathname;

  // Match pattern: /apps/{app_id}
  const match = path.match(/^\/apps\/[^/]+/);

  if (match) {
    return match[0];
  }

  // Fallback to root if not in /apps/ structure
  // This is useful for development or testing outside the MPA environment
  return '/';
}

