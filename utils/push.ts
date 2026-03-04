
import { db } from '../services/db';

const VAPID_PUBLIC_KEY = 'BEl62i_E_07p9H77Yy7Jv9p8P9p8P9p8P9p8P9p8P9p8P9p8P9p8P9p8P9p8P9p8P9p8P9p8P9p8P9p8'; // Placeholder, user should provide real one

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export async function subscribeUserToPush(userId: string) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.warn('Push notifications not supported');
    return;
  }

  try {
    const registration = await navigator.serviceWorker.register('/sw.js');
    console.log('Service Worker registered');

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      throw new Error('Permission not granted for notifications');
    }

    // Get VAPID key from settings if possible, otherwise use placeholder
    let publicKey = VAPID_PUBLIC_KEY;
    try {
        const settings = await db.getSystemSettings();
        if (settings.vapidPublicKey) publicKey = settings.vapidPublicKey;
    } catch(e) {}

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey)
    });

    const subData = JSON.parse(JSON.stringify(subscription));
    await db.request('action=subscribe_push', {
        method: 'POST',
        body: JSON.stringify({
            userId,
            subscription: {
                endpoint: subData.endpoint,
                keys: {
                    p256dh: subData.keys.p256dh,
                    auth: subData.keys.auth
                }
            }
        })
    });

    return true;
  } catch (error) {
    console.error('Failed to subscribe to push notifications:', error);
    throw error;
  }
}
