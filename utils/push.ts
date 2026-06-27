import { db } from '../services/db';

export const isPushSupported = (): boolean => {
  return 'serviceWorker' in navigator && 'PushManager' in window;
};

export const getNotificationPermission = (): NotificationPermission => {
  return Notification.permission;
};

export const subscribeUserToPush = async (userId: string): Promise<boolean> => {
  if (!isPushSupported()) return false;

  try {
    const registration = await navigator.serviceWorker.ready;
    
    // Solicitar permiso
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return false;

    // Obtener clave VAPID pública del servidor
    const settings = await db.getSystemSettings();
    const vapidPublicKey = settings.vapidPublicKey;

    if (!vapidPublicKey) {
      console.error("VAPID Public Key not found in settings");
      return false;
    }

    // Suscribirse al Push Manager
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey)
    });

    // Enviar suscripción al backend
    await db.subscribePush({
      userId,
      subscription: subscription.toJSON()
    });

    return true;
  } catch (error) {
    console.error("Error subscribing to push:", error);
    return false;
  }
};

export const unsubscribeFromPush = async (): Promise<boolean> => {
  if (!isPushSupported()) return false;

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    
    if (subscription) {
      await subscription.unsubscribe();
      await db.unsubscribePush({ endpoint: subscription.endpoint });
    }
    
    return true;
  } catch (error) {
    console.error("Error unsubscribing from push:", error);
    return false;
  }
};

export const isSubscribedToPush = async (): Promise<boolean> => {
  if (!isPushSupported()) return false;
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  return !!subscription;
};

export const sendTestNotification = async (userId: string): Promise<boolean> => {
  try {
    await db.testPush({ userId });
    return true;
  } catch (error) {
    console.error("Error sending test push:", error);
    return false;
  }
};

// Helper para convertir la clave VAPID
function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
