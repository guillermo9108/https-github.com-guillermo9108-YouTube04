import React, { useState, useEffect, useRef, useMemo } from 'react';
import { X, ChevronLeft, ChevronRight, Play, Pause, Loader2, Trash2 } from 'lucide-react';
import { Story } from '../../types';
import { db } from '../../services/db';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from '../Router';

export default function StoryViewer() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [stories, setStories] = useState<Story[]>([]);
    const [loading, setLoading] = useState(true);
    const [currentUserIndex, setCurrentUserIndex] = useState(0);
    const [currentStoryIndex, setCurrentStoryIndex] = useState(0);
    const [progress, setProgress] = useState(0);
    const [paused, setPaused] = useState(false);
    const videoRef = useRef<HTMLVideoElement>(null);
    const progressInterval = useRef<number | null>(null);

    // Group stories by user
    const groupedStories = useMemo(() => {
        const groups: Record<string, Story[]> = {};
        stories.forEach(s => {
            if (!groups[s.userId]) groups[s.userId] = [];
            groups[s.userId].push(s);
        });
        // Sort stories within each group by createdAt
        Object.values(groups).forEach(group => {
            group.sort((a, b) => a.createdAt - b.createdAt);
        });
        return Object.values(groups);
    }, [stories]);

    useEffect(() => {
        const fetchStories = async () => {
            try {
                const res = await db.getStories();
                setStories(res);
                
                // Check if we should start at a specific user (from URL)
                const params = new URLSearchParams(window.location.hash.split('?')[1]);
                const startUserId = params.get('userId');
                if (startUserId) {
                    const groups = Object.values(
                        res.reduce((acc: Record<string, Story[]>, s: Story) => {
                            if (!acc[s.userId]) acc[s.userId] = [];
                            acc[s.userId].push(s);
                            return acc;
                        }, {})
                    );
                    const index = (groups as any[]).findIndex((g: any) => g[0].userId === startUserId);
                    if (index !== -1) setCurrentUserIndex(index);
                }
            } catch (e) {
                console.error("Failed to fetch stories:", e);
            } finally {
                setLoading(false);
            }
        };
        fetchStories();
    }, []);

    const currentGroup = groupedStories[currentUserIndex] || [];
    const currentStory = currentGroup[currentStoryIndex];

    const nextStory = () => {
        if (currentStoryIndex < currentGroup.length - 1) {
            setCurrentStoryIndex(prev => prev + 1);
            setProgress(0);
        } else if (currentUserIndex < groupedStories.length - 1) {
            setCurrentUserIndex(prev => prev + 1);
            setCurrentStoryIndex(0);
            setProgress(0);
        } else {
            navigate('/');
        }
    };

    const prevStory = () => {
        if (currentStoryIndex > 0) {
            setCurrentStoryIndex(prev => prev - 1);
            setProgress(0);
        } else if (currentUserIndex > 0) {
            const prevUserIdx = currentUserIndex - 1;
            setCurrentUserIndex(prevUserIdx);
            setCurrentStoryIndex(groupedStories[prevUserIdx].length - 1);
            setProgress(0);
        }
    };

    const handleDelete = async () => {
        if (!currentStory || !user || currentStory.userId !== user.id) return;
        if (!window.confirm("¿Estás seguro de que quieres eliminar esta historia?")) return;

        try {
            await db.deleteStory(currentStory.id, user.id);
            // Remove from local state
            const newStories = stories.filter(s => s.id !== currentStory.id);
            setStories(newStories);
            
            if (newStories.length === 0) {
                navigate('/');
                return;
            }

            // Adjust indices if necessary
            if (currentStoryIndex >= currentGroup.length - 1) {
                if (currentUserIndex >= groupedStories.length - 1) {
                    // Last story of last user
                    setCurrentUserIndex(Math.max(0, currentUserIndex - 1));
                    setCurrentStoryIndex(0);
                } else {
                    // Last story of current user, move to next user
                    setCurrentStoryIndex(0);
                }
            }
            setProgress(0);
        } catch (e) {
            console.error("Failed to delete story:", e);
            alert("Error al eliminar la historia");
        }
    };

    useEffect(() => {
        if (loading || !currentStory || paused) return;

        const duration = currentStory.type === 'VIDEO' ? 0 : 5000; // 5s for images, dynamic for video
        
        if (currentStory.type === 'IMAGE') {
            const step = 100 / (duration / 100);
            progressInterval.current = window.setInterval(() => {
                setProgress(prev => {
                    if (prev >= 100) {
                        clearInterval(progressInterval.current!);
                        nextStory();
                        return 100;
                    }
                    return prev + step;
                });
            }, 100);
        }

        return () => {
            if (progressInterval.current) clearInterval(progressInterval.current);
        };
    }, [currentStory, currentUserIndex, currentStoryIndex, paused, loading]);

    const handleVideoMetadata = (e: React.SyntheticEvent<HTMLVideoElement>) => {
        const video = e.currentTarget;
        const duration = video.duration * 1000;
        const step = 100 / (duration / 100);
        
        if (progressInterval.current) clearInterval(progressInterval.current);
        
        progressInterval.current = window.setInterval(() => {
            if (video.paused) return;
            setProgress((video.currentTime / video.duration) * 100);
            if (video.ended) {
                clearInterval(progressInterval.current!);
                nextStory();
            }
        }, 100);
    };

    if (loading) {
        return (
            <div className="fixed inset-0 bg-black flex items-center justify-center">
                <Loader2 className="animate-spin text-white" size={48} />
            </div>
        );
    }

    if (!currentStory) {
        return (
            <div className="fixed inset-0 bg-black flex flex-col items-center justify-center text-white p-6 text-center">
                <p className="text-lg font-bold mb-4">No hay historias disponibles</p>
                <button onClick={() => navigate('/')} className="bg-[#1877f2] px-6 py-2 rounded-lg font-bold">Volver al inicio</button>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 bg-black z-[1000] flex flex-col select-none">
            {/* Progress Bars */}
            <div className="absolute top-0 left-0 right-0 p-2 flex gap-1 z-50">
                {currentGroup.map((_, idx) => (
                    <div key={idx} className="h-1 flex-1 bg-white/20 rounded-full overflow-hidden">
                        <div 
                            className="h-full bg-white transition-all duration-100 ease-linear"
                            style={{ 
                                width: idx < currentStoryIndex ? '100%' : idx === currentStoryIndex ? `${progress}%` : '0%' 
                            }}
                        />
                    </div>
                ))}
            </div>

            {/* Header */}
            <div className="absolute top-4 left-0 right-0 p-4 flex items-center justify-between z-50">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full border-2 border-white overflow-hidden bg-slate-800">
                        {currentStory.avatarUrl ? (
                            <img src={currentStory.avatarUrl} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center text-white font-bold">
                                {currentStory.username?.[0]?.toUpperCase()}
                            </div>
                        )}
                    </div>
                    <div className="flex flex-col">
                        <span className="text-white font-bold text-sm shadow-sm">{currentStory.username}</span>
                        <span className="text-white/70 text-[10px] shadow-sm">
                            {new Date(currentStory.createdAt * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {user?.id === currentStory.userId && (
                        <button 
                            onClick={(e) => { e.stopPropagation(); handleDelete(); }} 
                            className="text-white p-2 hover:bg-red-500/20 rounded-full transition-colors"
                            title="Eliminar historia"
                        >
                            <Trash2 size={24} className="text-red-400" />
                        </button>
                    )}
                    <button onClick={() => navigate('/')} className="text-white p-2 hover:bg-white/10 rounded-full transition-colors">
                        <X size={24} />
                    </button>
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 relative flex items-center justify-center overflow-hidden" onClick={() => setPaused(!paused)}>
                {currentStory.contentUrl ? (
                    currentStory.type === 'IMAGE' ? (
                        <img 
                            src={currentStory.contentUrl} 
                            className="max-w-full max-h-full object-contain" 
                            referrerPolicy="no-referrer"
                            alt="Story content"
                        />
                    ) : (
                        <video 
                            ref={videoRef}
                            src={currentStory.contentUrl} 
                            className="max-w-full max-h-full object-contain"
                            autoPlay
                            playsInline
                            onLoadedMetadata={handleVideoMetadata}
                            onPlay={() => setPaused(false)}
                            onPause={() => setPaused(true)}
                        />
                    )
                ) : (
                    // Text-only story background
                    <div className="w-full h-full bg-gradient-to-br from-purple-600 to-pink-600" />
                )}

                {/* Overlay Text */}
                {currentStory.overlayText && (
                    <div className="absolute inset-0 flex items-center justify-center p-8 pointer-events-none">
                        <p 
                            className="text-3xl md:text-5xl font-bold text-center break-words px-4 py-2 rounded-lg"
                            style={{ 
                                color: currentStory.overlayColor || '#ffffff',
                                backgroundColor: currentStory.overlayBg || 'transparent'
                            }}
                        >
                            {currentStory.overlayText}
                        </p>
                    </div>
                )}

                {/* Background Audio */}
                {currentStory.audioUrl && (
                    <audio 
                        src={currentStory.audioUrl} 
                        autoPlay 
                        loop 
                        muted={paused}
                        ref={(el) => {
                            if (el) {
                                if (paused) el.pause();
                                else el.play().catch(() => {});
                            }
                        }}
                    />
                )}

                {/* Paused Indicator */}
                {paused && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/20 pointer-events-none">
                        <Pause size={64} className="text-white opacity-50" />
                    </div>
                )}
            </div>

            {/* Navigation Controls (Hidden but clickable) */}
            <div className="absolute inset-y-0 left-0 w-1/3 z-40" onClick={(e) => { e.stopPropagation(); prevStory(); }} />
            <div className="absolute inset-y-0 right-0 w-1/3 z-40" onClick={(e) => { e.stopPropagation(); nextStory(); }} />

            {/* Desktop Navigation Buttons */}
            <div className="hidden md:block">
                <button 
                    onClick={(e) => { e.stopPropagation(); prevStory(); }}
                    className="absolute left-4 top-1/2 -translate-y-1/2 p-3 bg-white/10 hover:bg-white/20 text-white rounded-full transition-all z-50"
                >
                    <ChevronLeft size={32} />
                </button>
                <button 
                    onClick={(e) => { e.stopPropagation(); nextStory(); }}
                    className="absolute right-4 top-1/2 -translate-y-1/2 p-3 bg-white/10 hover:bg-white/20 text-white rounded-full transition-all z-50"
                >
                    <ChevronRight size={32} />
                </button>
            </div>
        </div>
    );
}
