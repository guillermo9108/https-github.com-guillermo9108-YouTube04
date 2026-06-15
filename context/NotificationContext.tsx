import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';

interface Notification {
  id: string;
  message: string;
  text?: string;
  type?: string;
  link?: string;
  avatarUrl?: string;
  videoId?: string;
  timestamp: number;
}

interface NotificationContextType {
  notifications: Notification[];
  unreadCount: number;
  markAsRead: () => void;
  sendShareNotification: (targetUserId: string, videoTitle: string, videoId: string) => void;
  requestPermission: () => Promise<NotificationPermission>;
  permission: NotificationPermission;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [ws, setWs] = useState<WebSocket | null>(null);
  const { user } = useAuth();
  const { info } = useToast();
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof window !== 'undefined' && 'Notification' in window
      ? Notification.permission
      : 'denied'
  );

  const requestPermission = useCallback(async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return 'denied';
    }
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      return result;
    } catch (err) {
      console.error('Error requesting notification permission:', err);
      return 'denied';
    }
  }, []);

  const triggerPushNotification = useCallback((notif: any) => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    
    if (Notification.permission === 'granted') {
      const isUpload = notif.type === 'UPLOAD' || (notif.message && notif.message.toLowerCase().includes('nuevo'));
      const title = isUpload ? 'Nuevo video subido' : 'Nueva notificación';
      const body = notif.message || notif.text || '';
      const icon = notif.avatarUrl || '/icon-192x192.png';
      
      try {
        const n = new Notification(title, {
          body,
          icon,
          tag: notif.id || 'new-upload-notif'
        });
        
        n.onclick = () => {
          window.focus();
          if (notif.videoId) {
            window.location.href = `/watch/${notif.videoId}`;
          } else if (notif.link) {
            window.location.href = notif.link;
          }
          n.close();
        };
      } catch (err) {
        console.error('Error triggering local push notification:', err);
      }
    }
  }, []);

  const triggerChatPushNotification = useCallback((chat: { id: string; senderId: string; senderName: string; text: string; senderAvatar?: string }) => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    
    // Suppress if they are already on the chat screen with this sender
    const path = window.location.pathname;
    const isCurrentlyInConversation = path.endsWith('/chat/' + chat.senderId) || path.includes('/chat/' + chat.senderId);
    if (isCurrentlyInConversation) return;

    if (Notification.permission === 'granted') {
      const title = `Mensaje de @${chat.senderName}`;
      const body = chat.text || 'Te ha enviado un mensaje';
      const icon = chat.senderAvatar || '/icon-192x192.png';
      
      try {
        const n = new Notification(title, {
          body,
          icon,
          tag: 'chat_' + chat.senderId
        });
        
        n.onclick = () => {
          window.focus();
          window.location.href = `/chat/${chat.senderId}`;
          n.close();
        };
      } catch (err) {
        console.error('Error triggering local chat push notification:', err);
      }
    }
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'default') {
        Notification.requestPermission().then(res => {
          setPermission(res);
        }).catch(err => {
          console.error('Failed to request notification permission:', err);
        });
      }
    }
  }, []);

  useEffect(() => {
    if (!user) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(`${protocol}//${window.location.host}`);

    socket.onopen = () => {
      console.log('Connected to notification server');
      socket.send(JSON.stringify({ type: 'IDENTIFY', userId: user.id }));
    };

    socket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'NOTIFICATION') {
        const newNotification = data.payload;
        
        const normalizedNotif: Notification = {
          id: newNotification.id || String(Date.now()),
          message: newNotification.message || newNotification.text || '',
          text: newNotification.text || newNotification.message || '',
          type: newNotification.type || 'SYSTEM',
          link: newNotification.link || '',
          avatarUrl: newNotification.avatarUrl || '',
          videoId: newNotification.videoId,
          timestamp: newNotification.timestamp || Math.floor(Date.now() / 1000)
        };

        setNotifications(prev => [normalizedNotif, ...prev]);
        setUnreadCount(prev => prev + 1);
        info(normalizedNotif.message);
        
        // Trigger native device/browser push alert for video uploads from followed channels (type UPLOAD)
        triggerPushNotification(normalizedNotif);
      } else if (data.type === 'CHAT_MESSAGE') {
        const msg = data.payload;
        const msgSenderId = String(msg.senderId || msg.sender_id || "");
        
        // Suppress if sent by ourselves
        if (user && msgSenderId !== String(user.id)) {
          const senderName = msg.senderName || msg.username || 'Alguien';
          const msgText = msg.text || 'Te ha enviado un archivo';
          const senderAvatar = msg.senderAvatar || msg.avatarUrl || '';
          
          triggerChatPushNotification({
            id: msg.id || String(Date.now()),
            senderId: msgSenderId,
            senderName,
            text: msgText,
            senderAvatar
          });
          
          // Also show a temporary beautiful notification in-app (unless already in-conversation)
          const path = window.location.pathname;
          const isCurrentlyInConversation = path.endsWith('/chat/' + msgSenderId) || path.includes('/chat/' + msgSenderId);
          if (!isCurrentlyInConversation) {
            info(`Nuevo mensaje de @${senderName}: ${msgText}`);
          }
        }
      }
    };

    socket.onclose = () => {
      console.log('Disconnected from notification server');
    };

    setWs(socket);

    return () => {
      socket.close();
    };
  }, [user, info, triggerPushNotification, triggerChatPushNotification]);

  const markAsRead = useCallback(() => {
    setUnreadCount(0);
  }, []);

  const sendShareNotification = useCallback((targetUserId: string, videoTitle: string, videoId: string) => {
    if (ws && ws.readyState === WebSocket.OPEN && user) {
      ws.send(JSON.stringify({
        type: 'SHARE_VIDEO',
        payload: {
          targetUserId,
          videoTitle,
          videoId,
          senderName: user.username
        }
      }));
    }
  }, [ws, user]);

  return (
    <NotificationContext.Provider value={{ notifications, unreadCount, markAsRead, sendShareNotification, requestPermission, permission }}>
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
};
