import React from 'react';
import { Video } from '../types';
import { useNavigate } from './Router';
import { Play, MoreHorizontal, Eye } from 'lucide-react';

interface ShortsGridProps {
    shorts: Video[];
    isSingle?: boolean;
}

export default function ShortsGrid({ shorts, isSingle }: ShortsGridProps) {
    const navigate = useNavigate();

    const formatViews = (views: number) => {
        if (views >= 1000000) return (views / 1000000).toFixed(1) + 'M';
        if (views >= 1000) return (views / 1000).toFixed(1) + 'K';
        return views.toString();
    };

    return (
        <div className="bg-[var(--bg-secondary)] py-3 border-y border-[var(--divider)] my-1">
            <div className="flex items-center justify-between px-4 mb-2">
                <div className="flex items-center gap-2">
                    <div className="w-5 h-5 bg-gradient-to-br from-pink-500 to-orange-500 rounded-sm flex items-center justify-center text-white">
                        <Play size={12} fill="currentColor" />
                    </div>
                    <h2 className="text-[15px] font-bold text-[var(--text-primary)]">Reels</h2>
                </div>
                <button className="text-[var(--text-secondary)] p-1 hover:bg-[var(--bg-hover)] rounded-full transition-colors">
                    <MoreHorizontal size={18} />
                </button>
            </div>

            <div className={`flex gap-2 px-3 pb-1 ${isSingle ? '' : 'overflow-x-auto scrollbar-hide'}`}>
                {shorts.map((short) => (
                    <div 
                        key={short.id}
                        onClick={() => navigate(`/shorts?id=${short.id}`)}
                        className={`relative bg-zinc-900 rounded-lg overflow-hidden shrink-0 cursor-pointer group active:scale-95 transition-transform shadow-sm border border-[var(--divider)] ${
                            isSingle 
                            ? 'w-full max-w-[280px] aspect-[9/16] mx-auto' 
                            : 'min-w-[130px] w-[130px] aspect-[9/16]'
                        }`}
                    >
                        <img 
                            src={short.thumbnailUrl || '/api/uploads/thumbnails/default.jpg'} 
                            className="w-full h-full object-cover opacity-90 group-hover:scale-110 transition-transform duration-500"
                            alt={short.title}
                            referrerPolicy="no-referrer"
                        />
                        
                        {/* Overlay Gradient */}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent"></div>

                        {/* Play Icon Center */}
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <div className="w-10 h-10 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center border border-white/30">
                                <Play size={20} className="text-white fill-white ml-1" />
                            </div>
                        </div>

                        {/* Views */}
                        <div className="absolute bottom-3 left-3 flex items-center gap-1 text-white text-[11px] font-bold drop-shadow-md">
                            <Eye size={12} />
                            <span>{formatViews(short.views)}</span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
