import React, { useState, useEffect } from 'react';
import { ChevronLeft, Bell, MessageSquare, CheckCircle, TrendingUp, Play, ShoppingBag, Upload as UploadIcon } from 'lucide-react';
import { useNavigate } from '../Router';
import { useAuth } from '../../context/AuthContext';
import { useNotifications } from '../../context/NotificationContext';
import { db } from '../../services/db';
import { Notification as AppNotification } from '../../types';

const formatTimeAgo = (timestamp: number) => {
    const diff = Math.floor(Date.now() / 1000 - timestamp);
    if (diff < 60) return 'ahora';
    if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`;
    if (diff < 86400) return `hace ${Math.floor(diff / 3600)} h`;
    return `hace ${Math.floor(diff / 86400)} d`;
};

const fixMediaUrl = (url?: string) => {
    if (!url) return '';
    if (url.startsWith('http') || url.startsWith('blob:') || url.startsWith('data:') || url.startsWith('api/') || url.startsWith('/')) return url;
    return 'api/' + url;
};

export default function Notifications() {
    const navigate = useNavigate();
    const { user } = useAuth();
    const { notifications: rtNotifications, unreadCount: rtUnreadCount, markAsRead } = useNotifications();
    const [notifs, setNotifs] = useState<AppNotification[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!user) return;

        const loadNotifications = async () => {
            try {
                const dbNotifs = await db.getNotifications(user.id, 100);
                setNotifs(dbNotifs);
            } catch (err) {
                console.error('Error loading notifications:', err);
            } finally {
                setLoading(false);
            }
        };

        loadNotifications();
        markAsRead(); // Marcar como leídas al abrir la página
    }, [user]);

    // Combinar notificaciones en tiempo real con las de DB y deduplicar por ID
    const allNotifications = Array.from(new Map([...rtNotifications, ...notifs].map(n => [n.id, n])).values())
        .sort((a, b) => b.timestamp - a.timestamp);

    const handleNotifClick = async (n: AppNotification) => {
        // Marcar como leída individualmente
        if (Number(n.isRead) === 0) {
            try {
                await db.markNotificationRead(n.id);
                setNotifs(prev => prev.map(notif => notif.id === n.id ? { ...notif, isRead: true } : notif));
            } catch (err) {
                console.error('Error marking notification as read:', err);
            }
        }

        // Navegación inteligente
        if (n.videoId) {
            navigate(`/watch/${n.videoId}`);
        } else if (n.link) {
            // Si el link es una ruta relativa, navegar directamente
            if (n.link.startsWith('/')) {
                navigate(n.link);
            } else if (n.link.includes('watch/')) {
                // Extraer ID si el link tiene formato /watch/v_123
                const parts = n.link.split('/');
                const id = parts[parts.length - 1];
                if (id) navigate(`/watch/${id}`);
            } else {
                navigate(n.link);
            }
        } else if (n.type === 'SALE') {
            navigate(`/seller-dashboard`);
        }
    };

    const handleMarkAllRead = async () => {
        if (!user) return;
        await db.markAllNotificationsRead(user.id);
        setNotifs(prev => prev.map(n => ({ ...n, isRead: true })));
    };

    return (
        <div className="min-h-screen bg-[var(--bg-primary)] pb-20">
            {/* Content */}
            <div className="max-w-2xl mx-auto bg-[var(--bg-secondary)] min-h-screen">
                <div className="p-3 flex items-center justify-between border-b border-[var(--divider)]">
                    <h2 className="text-base font-bold text-[var(--text-primary)]">Notificaciones</h2>
                    {allNotifications.length > 0 && (
                        <button onClick={handleMarkAllRead} className="text-sm text-[var(--accent)] font-medium">
                            Marcar como leídas
                        </button>
                    )}
                </div>

                {loading ? (
                    <div className="flex items-center justify-center py-20">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--accent)]"></div>
                    </div>
                ) : allNotifications.length === 0 ? (
                    <div className="py-20 text-center">
                        <div className="flex flex-col items-center gap-4">
                            <div className="w-16 h-16 rounded-full bg-[var(--bg-tertiary)] flex items-center justify-center">
                                <Bell size={32} className="text-[var(--text-secondary)]" />
                            </div>
                            <div>
                                <h2 className="text-base font-bold text-[var(--text-primary)] mb-1">No tienes notificaciones</h2>
                                <p className="text-xs text-[var(--text-secondary)]">Cuando recibas notificaciones, aparecerán aquí</p>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="flex flex-col">
                        {allNotifications.map((n: any) => (
                            <button
                                key={n.id}
                                onClick={() => handleNotifClick(n)}
                                className={`w-full px-3 py-3 flex gap-3 text-left transition-all hover:bg-[var(--bg-hover)] border-b border-[var(--divider)] ${
                                    Number(n.isRead) === 0 ? 'bg-[#2e3031]' : 'bg-transparent'
                                }`}
                            >
                                {/* Avatar/Icon */}
                                <div className="shrink-0 relative">
                                    <div className="w-14 h-14 rounded-full overflow-hidden bg-[var(--bg-tertiary)] border border-[var(--divider)]">
                                        {n.avatarUrl ? (
                                            <img 
                                                src={fixMediaUrl(n.avatarUrl)} 
                                                className="w-full h-full object-cover" 
                                                referrerPolicy="no-referrer" 
                                                onError={(e) => {
                                                    // Si la imagen falla, ocultarla para mostrar el fallback de texto de abajo
                                                    (e.target as HTMLImageElement).style.display = 'none';
                                                }}
                                            />
                                        ) : null}
                                        {(!n.avatarUrl) && (
                                            <div className="w-full h-full flex items-center justify-center bg-indigo-600 text-white font-bold text-lg">
                                                {n.text?.[0] || 'N'}
                                            </div>
                                        )}
                                    </div>
                                    <div className={`absolute -bottom-1 -right-1 w-6 h-6 rounded-full flex items-center justify-center border-2 border-[var(--bg-secondary)] ${
                                        n.type === 'SALE' ? 'bg-emerald-500' : 
                                        n.type === 'UPLOAD' ? 'bg-indigo-500' : 'bg-blue-500'
                                    }`}>
                                        {n.type === 'SALE' ? <ShoppingBag size={12} className="text-white" /> : 
                                         n.type === 'UPLOAD' ? <UploadIcon size={12} className="text-white" /> : 
                                         <Bell size={12} className="text-white" />}
                                    </div>
                                </div>

                                {/* Content */}
                                <div className="flex-1 min-w-0 flex flex-col justify-center">
                                    <p className={`text-[14px] leading-snug ${Number(n.isRead) === 0 ? 'font-bold text-[var(--text-primary)]' : 'text-[var(--text-primary)]'}`}>
                                        {n.text}
                                    </p>
                                    <span className={`text-[12px] mt-0.5 ${Number(n.isRead) === 0 ? 'text-[var(--accent)] font-bold' : 'text-[var(--text-secondary)]'}`}>
                                        {formatTimeAgo(n.timestamp)}
                                    </span>
                                </div>

                                {/* Unread dot */}
                                {Number(n.isRead) === 0 && (
                                    <div className="shrink-0 flex items-center">
                                        <div className="w-2.5 h-2.5 rounded-full bg-[var(--accent)]"></div>
                                    </div>
                                )}
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
