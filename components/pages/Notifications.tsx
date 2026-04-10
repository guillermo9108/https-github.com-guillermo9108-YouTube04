import React, { useState, useEffect, useMemo } from 'react';
import { ChevronLeft, Bell, CheckCircle, MessageSquare, TrendingUp } from 'lucide-react';
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
    const { notifications: rtNotifications, markAsRead } = useNotifications();
    const [notifs, setNotifs] = useState<AppNotification[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (user) {
            db.getNotifications(user.id)
                .then(setNotifs)
                .finally(() => setLoading(false));
        }
    }, [user?.id]);

    const handleNotifClick = async (n: AppNotification) => {
        if (Number(n.isRead) === 0) {
            try {
                await db.markNotificationRead(n.id);
                setNotifs(prev => prev.map(p => p.id === n.id ? { ...p, isRead: true } : p));
            } catch (e) {
                console.error('Error marking notification as read:', e);
            }
        }
        navigate(n.link);
    };

    const handleMarkAllRead = async () => {
        if (!user) return;
        try {
            await db.markAllNotificationsRead(user.id);
            setNotifs(prev => prev.map(n => ({ ...n, isRead: true })));
            markAsRead();
        } catch (e) {
            console.error('Error marking all as read:', e);
        }
    };

    const allNotifications = useMemo(() => {
        const formattedRt = rtNotifications.map(rn => ({
            id: rn.id,
            userId: user?.id || '',
            text: rn.message,
            type: 'SHARE' as any,
            timestamp: rn.timestamp,
            link: rn.videoId ? `/watch/${rn.videoId}` : '/',
            isRead: false as any,
            metadata: { videoId: rn.videoId }
        }));
        return [...formattedRt, ...notifs].sort((a, b) => b.timestamp - a.timestamp);
    }, [rtNotifications, notifs, user?.id]);

    const unreadCount = allNotifications.filter(n => Number(n.isRead) === 0).length;

    return (
        <div className="min-h-screen bg-[#18191a] pb-20">
            {/* Header */}
            <header className="sticky top-0 z-50 bg-[#242526] border-b border-white/5 shadow-lg">
                <div className="flex items-center justify-between px-4 h-14">
                    <button
                        onClick={() => navigate(-1)}
                        className="flex items-center gap-2 text-[#e4e6eb] hover:text-white transition-colors"
                    >
                        <ChevronLeft size={24} />
                        <span className="font-semibold">Notificaciones</span>
                    </button>
                    {unreadCount > 0 && (
                        <button
                            onClick={handleMarkAllRead}
                            className="px-3 py-1.5 bg-[#3a3b3c] hover:bg-[#4e4f50] text-[#e4e6eb] rounded-lg text-xs font-semibold transition-colors flex items-center gap-2"
                        >
                            <CheckCircle size={14} />
                            Marcar todo como leído
                        </button>
                    )}
                </div>
            </header>

            {/* Notifications List */}
            <div className="max-w-2xl mx-auto">
                {loading ? (
                    <div className="flex flex-col items-center justify-center py-20 gap-4">
                        <div className="w-12 h-12 border-4 border-[#1877f2] border-t-transparent rounded-full animate-spin"></div>
                        <p className="text-sm text-[#b0b3b8]">Cargando notificaciones...</p>
                    </div>
                ) : allNotifications.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 gap-4">
                        <MessageSquare size={48} className="text-[#3a3b3c]" />
                        <p className="text-sm text-[#b0b3b8] font-semibold">No tienes notificaciones</p>
                    </div>
                ) : (
                    <div className="bg-[#242526] border-y border-white/5 divide-y divide-white/5">
                        {allNotifications.map((n: any) => (
                            <button
                                key={n.id}
                                onClick={() => handleNotifClick(n)}
                                className={`w-full flex gap-4 p-4 text-left hover:bg-[#3a3b3c] transition-colors ${
                                    Number(n.isRead) === 0 ? 'bg-[#1877f2]/5' : ''
                                }`}
                            >
                                {/* Avatar/Thumbnail */}
                                <div
                                    className={`shrink-0 overflow-hidden shadow-lg ${
                                        n.type === 'UPLOAD' ? 'w-20 aspect-video rounded-lg' : 'w-14 h-14 rounded-full'
                                    } bg-[#3a3b3c] flex items-center justify-center border border-white/5`}
                                >
                                    {n.avatarUrl ? (
                                        <img
                                            src={n.avatarUrl}
                                            className="w-full h-full object-cover"
                                            referrerPolicy="no-referrer"
                                            alt="Avatar"
                                        />
                                    ) : (
                                        <Bell size={20} className="text-[#b0b3b8]" />
                                    )}
                                </div>

                                {/* Content */}
                                <div className="flex-1 min-w-0 flex flex-col justify-center">
                                    <div className="flex justify-between items-start mb-1">
                                        <span
                                            className={`text-xs font-bold px-2 py-0.5 rounded uppercase ${
                                                n.type === 'SALE'
                                                    ? 'bg-[#31a24c]/20 text-[#31a24c]'
                                                    : n.type === 'UPLOAD'
                                                    ? 'bg-[#1877f2]/20 text-[#1877f2]'
                                                    : 'bg-[#3a3b3c] text-[#b0b3b8]'
                                            }`}
                                        >
                                            {n.type}
                                        </span>
                                        <span className="text-xs text-[#b0b3b8]">{formatTimeAgo(n.timestamp)}</span>
                                    </div>
                                    <p className="text-sm text-[#e4e6eb] font-medium line-clamp-2">{n.text}</p>
                                    {n.type === 'SALE' && n.metadata?.net && (
                                        <div className="mt-2 flex items-center gap-1.5 text-xs font-bold text-[#31a24c]">
                                            <TrendingUp size={12} />
                                            Ganaste: +{Number(n.metadata.net).toFixed(2)} $
                                        </div>
                                    )}
                                    {Number(n.isRead) === 0 && (
                                        <div className="mt-2 w-2 h-2 bg-[#1877f2] rounded-full"></div>
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
