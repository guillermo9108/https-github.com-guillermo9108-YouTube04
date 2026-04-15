import React, { useState, useEffect } from 'react';
import { ChevronLeft, History, Play, Trash2, Clock } from 'lucide-react';
import { useNavigate } from '../Router';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../services/db';
import { Video } from '../../types';
import { motion } from 'motion/react';

export default function HistoryPage() {
    const navigate = useNavigate();
    const { user } = useAuth();
    const [videos, setVideos] = useState<Video[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (user) {
            loadHistory();
        }
    }, [user]);

    const loadHistory = async () => {
        try {
            const data = await db.getUserHistory(user!.id);
            setVideos(data);
        } catch (error) {
            console.error("Error fetching history", error);
        } finally {
            setLoading(false);
        }
    };

    const handleVideoClick = (videoId: string) => {
        navigate(`/video/${videoId}`);
    };

    const formatTime = (timestamp: number) => {
        const date = new Date(timestamp * 1000);
        const now = new Date();
        const diff = now.getTime() - date.getTime();
        
        if (diff < 86400000) { // Menos de 24h
            return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }
        return date.toLocaleDateString([], { day: '2-digit', month: 'short' });
    };

    return (
        <div className="min-h-screen bg-[var(--bg-primary)] pb-20">
            {/* Header */}
            <header className="sticky top-0 z-50 bg-[var(--bg-secondary)] border-b border-[var(--divider)] shadow-sm">
                <div className="flex items-center gap-3 px-4 h-14">
                    <button
                        onClick={() => navigate(-1)}
                        className="w-9 h-9 rounded-full bg-[var(--bg-tertiary)] flex items-center justify-center hover:bg-[var(--bg-hover)] transition-colors"
                    >
                        <ChevronLeft size={24} className="text-[var(--text-primary)]" />
                    </button>
                    <div className="flex items-center gap-2">
                        <History size={20} className="text-[var(--accent)]" />
                        <h1 className="text-lg font-bold text-[var(--text-primary)]">Historial</h1>
                    </div>
                </div>
            </header>

            {/* Content */}
            <div className="max-w-2xl mx-auto p-3">
                {loading ? (
                    <div className="flex items-center justify-center py-20">
                        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[var(--accent)]"></div>
                    </div>
                ) : videos.length === 0 ? (
                    <div className="py-20 text-center">
                        <History size={48} className="mx-auto text-[var(--text-secondary)] mb-4 opacity-20" />
                        <h2 className="text-base font-bold text-[var(--text-primary)]">Tu historial está vacío</h2>
                        <p className="text-xs text-[var(--text-secondary)] mt-1">Los videos que veas aparecerán aquí</p>
                    </div>
                ) : (
                    <div className="flex flex-col gap-2">
                        {videos.map((video, index) => (
                            <motion.div
                                key={`${video.id}-${index}`}
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: index * 0.03 }}
                                onClick={() => handleVideoClick(video.id)}
                                className="bg-[var(--bg-secondary)] p-2 rounded-lg border border-[var(--divider)] flex gap-3 hover:bg-[var(--bg-hover)] transition-colors cursor-pointer group"
                            >
                                <div className="relative w-32 aspect-video bg-black rounded overflow-hidden shrink-0 border border-[var(--divider)]">
                                    <img
                                        src={video.thumbnailUrl}
                                        alt={video.title}
                                        className="w-full h-full object-cover"
                                        referrerPolicy="no-referrer"
                                    />
                                    <div className="absolute bottom-1 right-1 px-1 bg-black/70 rounded text-[8px] font-bold text-white">
                                        {Math.floor(video.duration / 60)}:{(video.duration % 60).toString().padStart(2, '0')}
                                    </div>
                                </div>
                                <div className="flex-1 min-w-0 py-0.5 flex flex-col justify-between">
                                    <div>
                                        <h3 className="text-xs font-bold text-[var(--text-primary)] line-clamp-2 leading-tight group-hover:text-[var(--accent)] transition-colors">
                                            {video.title}
                                        </h3>
                                        <p className="text-[10px] text-[var(--text-secondary)] font-bold mt-1 truncate">
                                            {video.creatorName}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-1.5 text-[9px] text-[var(--text-secondary)] font-bold uppercase">
                                        <Clock size={10} />
                                        <span>Visto {formatTime((video as any).watchedAt)}</span>
                                    </div>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
