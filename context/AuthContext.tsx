import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { User } from '../types';
import { db } from '../services/db';
import { useToast } from './ToastContext';

interface AuthContextType {
  user: User | null;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string, avatar?: File | null) => Promise<void>;
  logout: () => void;
  refreshUser: () => void;
  isLoading: boolean;
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
  const heartbeatTimerRef = useRef<number | null>(null);
  const userRef = useRef<User | null>(null); 
  const toast = useToast();
  
  // Sincronizar Ref con State
  useEffect(() => { userRef.current = user; }, [user]);

  const logout = () => {
    if (userRef.current) {
        try { db.logout(userRef.current.id).catch(() => {}); } catch(e){}
    }
    setUser(null);
    localStorage.removeItem('sp_current_user_id');
    localStorage.removeItem('sp_session_token');
    localStorage.removeItem('sp_offline_user');
    if (heartbeatTimerRef.current) window.clearTimeout(heartbeatTimerRef.current);
    window.dispatchEvent(new Event('sp_logout'));
  };

  useEffect(() => {
    const handleExpired = () => {
        toast.warning("Sesión cerrada: Has iniciado sesión en otro dispositivo.");
        logout();
    };
    window.addEventListener('sp_session_expired', handleExpired);

    const savedId = localStorage.getItem('sp_current_user_id');
    const savedToken = localStorage.getItem('sp_session_token');

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
     const currentToken = localStorage.getItem('sp_session_token');
     const currentId = localStorage.getItem('sp_current_user_id');
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

  const login = async (username: string, password: string) => {
    setIsLoading(true);
    try {
        const u = await db.login(username, password);
        u.balance = Number(u.balance);
        setUser(u);
        db.saveOfflineUser(u);
        localStorage.setItem('sp_current_user_id', u.id);
        if (u.sessionToken) localStorage.setItem('sp_session_token', u.sessionToken);
    } finally {
        setIsLoading(false);
    }
  };

  const register = async (username: string, password: string, avatar?: File | null) => {
    setIsLoading(true);
    try {
        const u = await db.register(username, password, avatar);
        u.balance = Number(u.balance);
        setUser(u);
        db.saveOfflineUser(u);
        localStorage.setItem('sp_current_user_id', u.id);
        if (u.sessionToken) localStorage.setItem('sp_session_token', u.sessionToken);
    } finally {
        setIsLoading(false);
    }
  };

  return (
    <AuthContext.Provider value={{ user, login, register, logout, refreshUser, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
};