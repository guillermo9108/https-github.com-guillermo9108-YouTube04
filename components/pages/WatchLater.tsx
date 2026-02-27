
import React, { useState, useEffect } from 'react';
import { db } from '../../services/db';
import { Video } from '../../types';
import { useAuth } from '../../context/AuthContext';
import VideoCard from '../VideoCard';
import { Clock, Film, Loader2, ArrowLeft } from 'lucide-react';
import { useNavigate, Link } from '../Router';

export default function WatchLater() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [videos, setVideos] = useState<Video[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!user) return;
        
        const loadVideos = async () => {
            setLoading(true);
            try {
                const all = await db.getAllVideos();
                // Filtramos por los IDs presentes en user.watchLater
                const saved = all.filter(v => user.watchLater.includes(v.id));
                setVideos(saved);
            } catch(e) {} finally {
                setLoading(false);
            }
        };

        loadVideos();
    }, [user?.watchLater]);

    if (loading) return <div className="flex justify-center p-20"><Loader2 className="animate-spin text-indigo-500" size={48}/></div>;

    return (
        <div className="pb-24 animate-in fade-in">
            <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-4">
                    <button onClick={() => navigate(-1)} className="p-2 hover:bg-slate-800 rounded-full text-slate-400">
                        <ArrowLeft size={24}/>
                    </button>
                    <div>
                        <h1 className="text-2xl font-black text-white uppercase italic tracking-tighter flex items-center gap-2">
                            <Clock className="text-amber-500"/> Ver más tarde
                        </h1>
                        <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">{videos.length} videos guardados</p>
                    </div>
                </div>
            </div>

            {videos.length === 0 ? (
                <div className="text-center py-40 bg-slate-900/20 rounded-[40px] border-2 border-dashed border-slate-800/50">
                    <Film className="mx-auto mb-4 text-slate-800" size={64}/>
                    <p className="text-slate-500 font-bold uppercase text-xs tracking-widest mb-4">No tienes videos guardados</p>
                    <Link to="/" className="inline-block bg-indigo-600 hover:bg-indigo-500 text-white px-8 py-3 rounded-full font-black text-xs uppercase tracking-widest transition-all">Explorar Contenido</Link>
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                    {videos.map(v => (
                        <VideoCard 
                            key={v.id} 
                            video={v} 
                            isUnlocked={user?.role === 'ADMIN' || user?.id === v.creatorId} 
                            isWatched={false} 
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
