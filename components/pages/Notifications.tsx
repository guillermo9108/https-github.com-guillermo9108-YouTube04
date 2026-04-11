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
        <div className="min-h-screen bg-[#18191a]">
            {/* Header */}
            <header className="sticky top-0 z-50 bg-[#242526] border-b border-white/5 shadow-lg">
                <div className="flex items-center justify-between px-4 h-14">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => navigate(-1)}
                            className="w-10 h-10 rounded-full bg-[#3a3b3c] flex items-center justify-center hover:bg-[#4e4f50] transition-colors"
                        >
                            <ChevronLeft size={24} className="text-[#e4e6eb]" />
                        </button>
                        <h1 className="text-xl font-bold text-[#e4e6eb]">Notificaciones</h1>
                    </div>
                    {allNotifications.length > 0 && (
                        <button
                            onClick={handleMarkAllRead}
                            className="px-4 py-2 bg-[#3a3b3c] hover:bg-[#4e4f50] text-[#e4e6eb] rounded-lg text-sm font-semibold transition-colors flex items-center gap-2"
                        >
                            <CheckCircle size={16} />
                            Marcar todo
                        </button>
                    )}
                </div>
            </header>

            {/* Content */}
            <div className="max-w-2xl mx-auto">
                {loading ? (
                    <div className="flex items-center justify-center py-20">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#1877f2]"></div>
                    </div>
                ) : allNotifications.length === 0 ? (
                    <div className="py-20 text-center">
                        <div className="flex flex-col items-center gap-4">
                            <div className="w-20 h-20 rounded-full bg-[#3a3b3c] flex items-center justify-center">
                                <Bell size={40} className="text-[#b0b3b8]" />
                            </div>
                            <div>
                                <h2 className="text-lg font-bold text-[#e4e6eb] mb-2">No tienes notificaciones</h2>
                                <p className="text-sm text-[#b0b3b8]">Cuando recibas notificaciones, aparecerán aquí</p>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="divide-y divide-white/5">
                        {allNotifications.map((n: any) => (
                            <button
                                key={n.id}
                                onClick={() => handleNotifClick(n)}
                                className={`w-full p-4 flex gap-3 text-left transition-all hover:bg-[#3a3b3c] ${
                                    Number(n.isRead) === 0 ? 'bg-[#26272b]' : 'bg-[#242526]'
                                }`}
                            >
                                {/* Avatar/Thumbnail */}
                                <div
                                    className={`shrink-0 overflow-hidden ${
                                        n.type === 'UPLOAD' ? 'w-20 aspect-video rounded-lg' : 'w-14 h-14 rounded-full'
                                    } bg-[#3a3b3c] flex items-center justify-center border border-white/5`}
                                >
                                    {n.avatarUrl ? (
                                        <img src={n.avatarUrl} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                    ) : (
                                        <Bell size={20} className="text-[#b0b3b8]" />
                                    )}
                                </div>

                                {/* Content */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-start justify-between gap-2 mb-1">
                                        <span
                                            className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
                                                n.type === 'SALE'
                                                    ? 'bg-emerald-500/20 text-emerald-400'
                                                    : n.type === 'UPLOAD'
                                                    ? 'bg-indigo-500/20 text-indigo-400'
                                                    : 'bg-[#3a3b3c] text-[#b0b3b8]'
                                            }`}
                                        >
                                            {n.type}
                                        </span>
                                        <span className="text-xs text-[#b0b3b8]">{formatTimeAgo(n.timestamp)}</span>
                                    </div>
                                    <p className="text-sm text-[#e4e6eb] leading-snug mb-1">{n.text}</p>
                                    {n.type === 'SALE' && n.metadata?.net && (
                                        <div className="flex items-center gap-1 text-xs font-bold text-emerald-400">
                                            <TrendingUp size={12} />
                                            Ganaste: +{Number(n.metadata.net).toFixed(2)} $
                                        </div>
                                    )}
                                    {Number(n.isRead) === 0 && (
                                        <div className="w-2 h-2 rounded-full bg-[#1877f2] mt-2"></div>
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
