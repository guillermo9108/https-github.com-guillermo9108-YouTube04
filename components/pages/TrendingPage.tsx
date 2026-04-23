import React, { useState, useEffect } from 'react';
import { ChevronLeft, TrendingUp, Play, Heart, Eye } from 'lucide-react';
import { useNavigate } from '../Router';
import { db } from '../../services/db';
import { Video } from '../../types';
import { motion } from 'motion/react';

export default function TrendingPage() {
    const navigate = useNavigate();
    const [videos, setVideos] = useState<Video[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchTrending = async () => {
            try {
                const data = await db.getTrendingVideos();
                setVideos(data);
            } catch (error) {
                console.error("Error fetching trending videos", error);
            } finally {
                setLoading(false);
            }
        };
        fetchTrending();
    }, []);

    const handleVideoClick = (videoId: string) => {
        navigate(`/watch/${videoId}`);
    };

    return (
        <div className="min-h-screen bg-[var(--bg-primary)] pb-20">
            {/* Header */}
            <header className="sticky top-[calc(104px+env(safe-area-inset-top,24px))] z-50 bg-[var(--bg-secondary)] border-b border-[var(--divider)] shadow-sm">
                <div className="flex items-center gap-3 px-4 h-14">
                    <button
                        onClick={() => navigate(-1)}
                        className="w-9 h-9 rounded-full bg-[var(--bg-tertiary)] flex items-center justify-center hover:bg-[var(--bg-hover)] transition-colors"
                    >
                        <ChevronLeft size={24} className="text-[var(--text-primary)]" />
                    </button>
                    <div className="flex items-center gap-2">
                        <TrendingUp size={20} className="text-[var(--accent)]" />
                        <h1 className="text-lg font-bold text-[var(--text-primary)]">Tendencia</h1>
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
                        <TrendingUp size={48} className="mx-auto text-[var(--text-secondary)] mb-4 opacity-20" />
                        <h2 className="text-base font-bold text-[var(--text-primary)]">No hay tendencias hoy</h2>
                        <p className="text-xs text-[var(--text-secondary)] mt-1">Vuelve más tarde para ver lo más popular</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-4">
                        {videos.map((video, index) => (
                            <motion.div
                                key={video.id}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: index * 0.05 }}
                                onClick={() => handleVideoClick(video.id)}
                                className="bg-[var(--bg-secondary)] rounded-xl overflow-hidden border border-[var(--divider)] shadow-sm group cursor-pointer"
                            >
                                <div className="relative aspect-video bg-black">
                                    <img
                                        src={video.thumbnailUrl}
                                        alt={video.title}
                                        className="w-full h-full object-cover opacity-90 group-hover:scale-105 transition-transform duration-500"
                                        referrerPolicy="no-referrer"
                                    />
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                                    <div className="absolute bottom-2 right-2 px-1.5 py-0.5 bg-black/70 rounded text-[10px] font-bold text-white">
                                        {Math.floor(video.duration / 60)}:{(video.duration % 60).toString().padStart(2, '0')}
                                    </div>
                                    <div className="absolute top-2 left-2 w-6 h-6 bg-[var(--accent)] rounded-full flex items-center justify-center text-[10px] font-bold text-white shadow-lg">
                                        #{index + 1}
                                    </div>
                                </div>
                                <div className="p-3">
                                    <h3 className="text-sm font-bold text-[var(--text-primary)] line-clamp-2 leading-tight">
                                        {video.title}
                                    </h3>
                                    <div className="flex items-center gap-3 mt-2">
                                        <div className="flex items-center gap-1 text-[10px] text-[var(--text-secondary)] font-bold uppercase">
                                            <Eye size={12} />
                                            <span>{video.views} vistas</span>
                                        </div>
                                        <div className="flex items-center gap-1 text-[10px] text-[var(--text-secondary)] font-bold uppercase">
                                            <Heart size={12} />
                                            <span>{video.likes} likes</span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 mt-3 pt-3 border-t border-[var(--divider)]">
                                        <img
                                            src={video.creatorAvatarUrl || 'https://picsum.photos/seed/avatar/100/100'}
                                            className="w-6 h-6 rounded-full object-cover border border-[var(--divider)]"
                                            alt={video.creatorName}
                                            referrerPolicy="no-referrer"
                                        />
                                        <span className="text-[10px] font-bold text-[var(--text-secondary)] truncate">
                                            {video.creatorName}
                                        </span>
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
