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

    // Combinar notificaciones en tiempo real con las de DB
    const allNotifications = [...rtNotifications, ...notifs].sort((a, b) => b.timestamp - a.timestamp);

    const handleNotifClick = (n: AppNotification) => {
        if (n.type === 'UPLOAD' && n.videoId) {
            navigate(`/watch/${n.videoId}`);
        } else if (n.type === 'SALE' && n.videoId) {
            navigate(`/watch/${n.videoId}`);
        }
    };

    const handleMarkAllRead = async () => {
        if (!user) return;
        await db.markAllNotificationsRead(user.id);
        setNotifs(prev => prev.map(n => ({ ...n, isRead: true })));
    };

    return (
        <div className="min-h-screen bg-[var(--bg-primary)] pb-20">
            {/* Header */}
            <header className="sticky top-0 z-50 bg-[var(--bg-secondary)] border-b border-[var(--divider)] shadow-sm">
                <div className="flex items-center justify-between px-4 h-14">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => navigate(-1)}
                            className="w-9 h-9 rounded-full bg-[var(--bg-tertiary)] flex items-center justify-center hover:bg-[var(--bg-hover)] transition-colors"
                        >
                            <ChevronLeft size={24} className="text-[var(--text-primary)]" />
                        </button>
                        <h1 className="text-lg font-bold text-[var(--text-primary)]">Notificaciones</h1>
                    </div>
                    {allNotifications.length > 0 && (
                        <button
                            onClick={handleMarkAllRead}
                            className="px-3 py-1.5 bg-[var(--bg-tertiary)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)] rounded-md text-xs font-bold transition-colors flex items-center gap-2"
                        >
                            <CheckCircle size={14} />
                            Marcar todo
                        </button>
                    )}
                </div>
            </header>

            {/* Content */}
            <div className="max-w-2xl mx-auto">
                {loading ? (
                    <div className="flex items-center justify-center py-20">
                        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[var(--accent)]"></div>
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
                    <div className="divide-y divide-[var(--divider)]">
                        {allNotifications.map((n: any) => (
                            <button
                                key={n.id}
                                onClick={() => handleNotifClick(n)}
                                className={`w-full p-4 flex gap-3 text-left transition-all hover:bg-[var(--bg-hover)] ${
                                    Number(n.isRead) === 0 ? 'bg-[var(--bg-tertiary)]' : 'bg-[var(--bg-secondary)]'
                                }`}
                            >
                                {/* Avatar/Thumbnail */}
                                <div
                                    className={`shrink-0 overflow-hidden ${
                                        n.type === 'UPLOAD' ? 'w-20 aspect-video rounded-md' : 'w-12 h-12 rounded-full'
                                    } bg-[var(--bg-tertiary)] flex items-center justify-center border border-[var(--divider)]`}
                                >
                                    {n.avatarUrl ? (
                                        <img src={n.avatarUrl} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                    ) : (
                                        <Bell size={18} className="text-[var(--text-secondary)]" />
                                    )}
                                </div>

                                {/* Content */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-start justify-between gap-2 mb-0.5">
                                        <span
                                            className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${
                                                n.type === 'SALE'
                                                    ? 'bg-emerald-500/10 text-emerald-500'
                                                    : n.type === 'UPLOAD'
                                                    ? 'bg-indigo-500/10 text-indigo-500'
                                                    : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]'
                                            }`}
                                        >
                                            {n.type}
                                        </span>
                                        <span className="text-[10px] text-[var(--text-secondary)]">{formatTimeAgo(n.timestamp)}</span>
                                    </div>
                                    <p className="text-sm text-[var(--text-primary)] leading-snug mb-1">{n.text}</p>
                                    {n.type === 'SALE' && n.metadata?.net && (
                                        <div className="flex items-center gap-1 text-[11px] font-bold text-emerald-500">
                                            <TrendingUp size={10} />
                                            Ganaste: +{Number(n.metadata.net).toFixed(2)} $
                                        </div>
                                    )}
                                    {Number(n.isRead) === 0 && (
                                        <div className="w-2 h-2 rounded-full bg-[var(--accent)] mt-1.5"></div>
                                    )}
                                </div>
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
