import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';

interface Notification {
  id: string;
  message: string;
  videoId?: string;
  timestamp: number;
}

interface NotificationContextType {
  notifications: Notification[];
  unreadCount: number;
  markAsRead: () => void;
  sendShareNotification: (targetUserId: string, videoTitle: string, videoId: string) => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [ws, setWs] = useState<WebSocket | null>(null);
  const { user } = useAuth();
  const { info } = useToast();

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
        setNotifications(prev => [newNotification, ...prev]);
        setUnreadCount(prev => prev + 1);
        info(newNotification.message);
      }
    };

    socket.onclose = () => {
      console.log('Disconnected from notification server');
    };

    setWs(socket);

    return () => {
      socket.close();
    };
  }, [user, info]);

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
    <NotificationContext.Provider value={{ notifications, unreadCount, markAsRead, sendShareNotification }}>
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
