/**
 * Platform Utilities for PWA <=> APK Native Client Synchronization
 */

export const isRunningInAPK = (): boolean => {
  if (typeof window === 'undefined') return false;
  
  const ua = navigator.userAgent || '';
  const hasApkHeader = ua.includes('StreamPayAPK') || ua.includes('StreamPay') || ua.includes('com.streampay.app');
  const hasAndroidInterface = !!(window as any).StreamPayAPK || !!(window as any).VideoBridge;
  
  return hasApkHeader || hasAndroidInterface;
};

/**
 * Sends a micro-interaction event or message to the APK native JS interfaces.
 */
export const sendNativeEvent = (event: string, payload: any = {}): void => {
  if (typeof window === 'undefined') return;

  const data = JSON.stringify({ event, ...payload });

  // 1. Try VideoBridge postMessage (typical custom interface / React Native style)
  if ((window as any).VideoBridge && typeof (window as any).VideoBridge.postMessage === 'function') {
    try {
      (window as any).VideoBridge.postMessage(data);
    } catch (e) {
      console.error("Error posting to VideoBridge", e);
    }
  }

  // 2. Try StreamPayAPK specific direct event sender or message handler if available
  if ((window as any).StreamPayAPK) {
    if (typeof (window as any).StreamPayAPK.postMessage === 'function') {
      try {
        (window as any).StreamPayAPK.postMessage(data);
      } catch (e) {
        console.error("Error posting to StreamPayAPK.postMessage", e);
      }
    } else if (typeof (window as any).StreamPayAPK.onEvent === 'function') {
      try {
        (window as any).StreamPayAPK.onEvent(event, JSON.stringify(payload));
      } catch (e) {
        console.error("Error calling StreamPayAPK.onEvent", e);
      }
    }
  }
};

/**
 * Notifies the APK to download a file with direct URL
 */
export const triggerNativeDownload = (url: string, filename: string): boolean => {
  if (typeof window === 'undefined') return false;

  // If there's a specialized native download method explicitly exposed
  if ((window as any).StreamPayAPK && typeof (window as any).StreamPayAPK.download === 'function') {
    try {
      (window as any).StreamPayAPK.download(url, filename);
      return true;
    } catch (e) {
      console.error("Error invoking StreamPayAPK.download", e);
    }
  }

  // Or send via general bridge event
  if ((window as any).VideoBridge || (window as any).StreamPayAPK) {
    sendNativeEvent('download', { url, filename });
    return true;
  }

  return false;
};

/**
 * Persists the session token to standard document.cookie with Lax / Secure flags
 * so that Android CookieManager can securely read and capture it in background.
 */
export const persistSessionCookie = (token: string): void => {
  if (typeof document === 'undefined') return;
  
  // Set the sessionToken cookie
  // Lax SameSite is highly recommended for OAuth/Hybrid WebViews so cookies persist,
  // Secure flag is set based on location protocols, but in WebView native we always append Secure if page is secure or if we want compatibility.
  const secureFlag = window.location.protocol === 'https:' ? 'Secure;' : '';
  const maxAge = 31536000; // 1 year
  
  document.cookie = `sessionToken=${token}; path=/; max-age=${maxAge}; SameSite=Lax; ${secureFlag}`;
};

/**
 * Clears the sessionToken cookie on logout.
 */
export const clearSessionCookie = (): void => {
  if (typeof document === 'undefined') return;
  document.cookie = `sessionToken=; path=/; max-age=0; SameSite=Lax; Secure`;
};

