import React, { useState, useEffect } from 'react';
import { ChevronLeft, History, Play, Clock, MoreVertical, Trash2 } from 'lucide-react';
import { useNavigate } from '../Router';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../services/db';
import { Video } from '../../types';

export default function HistoryPage() {
    const navigate = useNavigate();
    const { user } = useAuth();
    const [videos, setVideos] = useState<Video[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!user) return;
        
        const loadHistory = async () => {
            try {
                const activity = await db.getUserActivity(user.id);
                if (activity.watched && activity.watched.length > 0) {
                    // History is usually chronological, let's reverse to show newest first
                    const watchedIds = [...activity.watched].reverse();
                    const videoPromises = watchedIds.map(id => db.getVideo(id));
                    const results = await Promise.all(videoPromises);
                    setVideos(results.filter((v): v is Video => v !== null));
                }
            } catch (e) {
                console.error("Error loading history:", e);
            } finally {
                setLoading(false);
            }
        };

        loadHistory();
    }, [user]);

    return (
        <div className="min-h-screen bg-[#18191a] pb-20">
            <header className="sticky top-0 z-50 bg-[#242526] border-b border-[#3e4042] px-4 h-14 flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <button onClick={() => navigate(-1)} className="text-[#e4e6eb] hover:bg-[#3a3b3c] p-2 rounded-full transition-colors">
                        <ChevronLeft size={24} />
                    </button>
                    <h1 className="text-lg font-bold text-[#e4e6eb]">Historial</h1>
                </div>
                {videos.length > 0 && (
                    <button className="text-[#1877f2] text-sm font-bold px-2 py-1 rounded hover:bg-[#1877f2]/10">
                        Borrar todo
                    </button>
                )}
            </header>

            {loading ? (
                <div className="flex flex-col items-center justify-center py-40">
                    <div className="w-10 h-10 border-4 border-[#1877f2] border-t-transparent rounded-full animate-spin"></div>
                </div>
            ) : videos.length > 0 ? (
                <div className="divide-y divide-[#3e4042]">
                    {videos.map((video, index) => (
                        <div 
                            key={`${video.id}-${index}`} 
                            onClick={() => navigate(`/watch/${video.id}`)}
                            className="flex gap-3 p-3 hover:bg-[#3a3b3c] transition-colors cursor-pointer group"
                        >
                            <div className="relative w-40 aspect-video rounded-lg overflow-hidden bg-[#242526] shrink-0">
                                <img 
                                    src={video.thumbnailUrl} 
                                    className="w-full h-full object-cover" 
                                    alt={video.title}
                                    referrerPolicy="no-referrer"
                                />
                                <div className="absolute bottom-1 right-1 bg-black/80 text-white text-[10px] font-bold px-1 rounded">
                                    {Math.floor(video.duration / 60)}:{(video.duration % 60).toString().padStart(2, '0')}
                                </div>
                            </div>
                            <div className="flex-1 min-w-0 flex flex-col justify-center">
                                <h3 className="text-[#e4e6eb] font-bold text-sm line-clamp-2 leading-tight mb-1">{video.title}</h3>
                                <p className="text-[#b0b3b8] text-xs truncate">{video.creatorName}</p>
                                <div className="flex items-center gap-2 mt-1 text-[#b0b3b8] text-[10px]">
                                    <span>Visto recientemente</span>
                                </div>
                            </div>
                            <button className="text-[#b0b3b8] p-1 self-start">
                                <MoreVertical size={18} />
                            </button>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="flex flex-col items-center justify-center py-40 text-[#b0b3b8] gap-4 px-6 text-center">
                    <div className="w-20 h-20 rounded-full bg-[#242526] flex items-center justify-center">
                        <History size={40} className="text-[#b0b3b8] opacity-50" />
                    </div>
                    <div>
                        <p className="font-bold text-[#e4e6eb] text-lg">No hay historial</p>
                        <p className="text-sm mt-1">Los videos que veas aparecerán aquí para que puedas volver a verlos.</p>
                    </div>
                </div>
            )}
        </div>
    );
}
