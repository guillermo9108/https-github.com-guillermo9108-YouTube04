import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { User } from '../types';
import { db } from '../services/db';
import { useToast } from './ToastContext';

interface AuthContextType {
  user: User | null;
  login: (username: string, password: string, rememberMe?: boolean) => Promise<void>;
  register: (username: string, password: string, avatar?: File | null, rememberMe?: boolean) => Promise<void>;
  logout: () => void;
  refreshUser: () => void;
  isLoading: boolean;
  isOffline: boolean;
  socket: WebSocket | null;
  socketRef: React.RefObject<WebSocket | null>;
  onlineUserIds: Set<string>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
};

export const AuthProvider = ({ children }: { children?: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isOffline, setIsOffline] = useState(db.getIsOffline());
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set());
  const socketRef = useRef<WebSocket | null>(null);
  const heartbeatTimerRef = useRef<number | null>(null);
  const userRef = useRef<User | null>(null); 
  const toast = useToast();
  
  // Sincronizar Ref con State
  useEffect(() => { userRef.current = user; }, [user]);

  useEffect(() => {
    let reconnectTimer: number | null = null;
    let ws: WebSocket | null = null;

    const connect = () => {
      if (!user) return;
      
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.host;
      ws = new WebSocket(`${protocol}//${host}`);
      
      ws.onopen = () => {
        console.log("WebSocket connected");
        if (ws) {
            ws.send(JSON.stringify({ type: 'IDENTIFY', payload: { userId: user.id } }));
            setSocket(ws);
            socketRef.current = ws;
        }
      };

      ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            if (data.type === 'NOTIFICATION') {
                window.dispatchEvent(new CustomEvent('sp_notification', { detail: data.payload }));
            }
            if (data.type === 'USER_STATUS') {
                const { userId, status } = data.payload;
                const uid = String(userId);
                setOnlineUserIds(prev => {
                    const next = new Set(prev);
                    if (status === 'online') next.add(uid);
                    else next.delete(uid);
                    return next;
                });
            }
            if (data.type === 'ONLINE_USERS') {
                const list = (data.payload as any[]).map(id => String(id));
                setOnlineUserIds(new Set(list));
            }
        } catch (e) {}
      };

      ws.onclose = () => {
        console.log("WebSocket disconnected, retrying in 3s...");
        setSocket(null);
        socketRef.current = null;
        reconnectTimer = window.setTimeout(connect, 3000);
      };

      ws.onerror = (err) => {
        console.error("WebSocket error", err);
        ws?.close();
      };
    };

    if (user) {
      connect();
    } else if (ws) {
      (ws as WebSocket).close();
    }

    return () => {
      if (ws) ws.close();
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
    };
  }, [user?.id]);

  useEffect(() => {
    const handleOffline = () => setIsOffline(true);
    const handleOnline = () => setIsOffline(false);
    
    window.addEventListener('sp_offline', handleOffline);
    window.addEventListener('sp_online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);

    return () => {
        window.removeEventListener('sp_offline', handleOffline);
        window.removeEventListener('sp_online', handleOnline);
        window.removeEventListener('offline', handleOffline);
        window.removeEventListener('online', handleOnline);
    };
  }, []);

  const logout = () => {
    if (userRef.current) {
        try { db.logout(userRef.current.id).catch(() => {}); } catch(e){}
    }
    setUser(null);
    localStorage.removeItem('sp_current_user_id');
    localStorage.removeItem('sp_session_token');
    localStorage.removeItem('sp_offline_user');
    sessionStorage.removeItem('sp_current_user_id');
    sessionStorage.removeItem('sp_session_token');
    if (heartbeatTimerRef.current) window.clearTimeout(heartbeatTimerRef.current);
    window.dispatchEvent(new Event('sp_logout'));
  };

  useEffect(() => {
    const handleExpired = () => {
        toast.warning("Sesión cerrada: Has iniciado sesión en otro dispositivo.");
        logout();
    };
    window.addEventListener('sp_session_expired', handleExpired);

    const savedId = localStorage.getItem('sp_current_user_id') || sessionStorage.getItem('sp_current_user_id');
    const savedToken = localStorage.getItem('sp_session_token') || sessionStorage.getItem('sp_session_token');

    const initAuth = async () => {
        if (savedId && savedToken) {
            try {
                const u = await db.getUser(savedId);
                if (u) {
                    u.sessionToken = savedToken;
                    u.balance = Number(u.balance);
                    setUser(u);
                    db.saveOfflineUser(u);
                } else {
                    logout();
                }
            } catch (err) {
                const offlineUser = db.getOfflineUser();
                if (offlineUser && offlineUser.id === savedId) {
                    setUser(offlineUser);
                }
            } finally {
                setIsLoading(false);
            }
        } else {
            setIsLoading(false);
        }
    };

    initAuth();
    return () => window.removeEventListener('sp_session_expired', handleExpired);
  }, []);

  useEffect(() => {
    const runHeartbeat = async () => {
        if (userRef.current && !document.hidden) {
            try {
                const updatedUser = await db.heartbeat(userRef.current.id);
                if (updatedUser) {
                    if (Number(updatedUser.balance) !== Number(userRef.current.balance) || updatedUser.vipExpiry !== userRef.current.vipExpiry) {
                        setUser(prev => prev ? ({ ...prev, ...updatedUser, balance: Number(updatedUser.balance) }) : null);
                    }
                }
                
                // Real-time heartbeat via WebSocket
                if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
                    socketRef.current.send(JSON.stringify({ 
                        type: 'HEARTBEAT', 
                        payload: { userId: userRef.current.id } 
                    }));
                }
            } catch (e) {
                // Interceptor handles 401
            }
        }
        // Programar siguiente ejecución tras finalizar la actual
        heartbeatTimerRef.current = window.setTimeout(runHeartbeat, 30000);
    };

    if (user && user.sessionToken) {
        db.saveOfflineUser(user);
        if (heartbeatTimerRef.current) window.clearTimeout(heartbeatTimerRef.current);
        heartbeatTimerRef.current = window.setTimeout(runHeartbeat, 30000);
    }

    return () => {
        if (heartbeatTimerRef.current) window.clearTimeout(heartbeatTimerRef.current);
    };
  }, [!!user]);

  const refreshUser = async () => {
     const currentToken = localStorage.getItem('sp_session_token') || sessionStorage.getItem('sp_session_token');
     const currentId = localStorage.getItem('sp_current_user_id') || sessionStorage.getItem('sp_current_user_id');
     if (currentId && currentToken) {
        try {
            const u = await db.getUser(currentId);
            if(u) {
                const refreshed = {
                    ...u, 
                    sessionToken: currentToken,
                    balance: Number(u.balance)
                };
                setUser(refreshed);
                db.saveOfflineUser(refreshed);
            }
        } catch(e) {}
     }
  };

  const login = async (username: string, password: string, rememberMe: boolean = true) => {
    setIsLoading(true);
    try {
        const u = await db.login(username, password);
        u.balance = Number(u.balance);
        setUser(u);
        db.saveOfflineUser(u);
        
        const storage = rememberMe ? localStorage : sessionStorage;
        storage.setItem('sp_current_user_id', u.id);
        // Always save session token to localStorage for APK background polling
        if (u.sessionToken) {
            localStorage.setItem('sp_session_token', u.sessionToken);
            if (!rememberMe) sessionStorage.setItem('sp_session_token', u.sessionToken);
        }
    } finally {
        setIsLoading(false);
    }
  };

  const register = async (username: string, password: string, avatar?: File | null, rememberMe: boolean = true) => {
    setIsLoading(true);
    try {
        const u = await db.register(username, password, avatar);
        u.balance = Number(u.balance);
        setUser(u);
        db.saveOfflineUser(u);
        
        const storage = rememberMe ? localStorage : sessionStorage;
        storage.setItem('sp_current_user_id', u.id);
        // Always save session token to localStorage for APK background polling
        if (u.sessionToken) {
            localStorage.setItem('sp_session_token', u.sessionToken);
            if (!rememberMe) sessionStorage.setItem('sp_session_token', u.sessionToken);
        }
    } finally {
        setIsLoading(false);
    }
  };

  return (
    <AuthContext.Provider value={{ user, login, register, logout, refreshUser, isLoading, isOffline, socket, socketRef, onlineUserIds }}>
      {children}
    </AuthContext.Provider>
  );
};