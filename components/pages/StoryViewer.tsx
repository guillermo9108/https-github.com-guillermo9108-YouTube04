import React, { useState, useEffect, useRef, useMemo } from 'react';
import { X, ChevronLeft, ChevronRight, Play, Pause, Loader2, Trash2, Heart, Smile, Send, Eye, MessageCircle } from 'lucide-react';
import { Story } from '../../types';
import { db } from '../../services/db';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from '../Router';
import { getThumbnailUrl } from '../../utils/image';

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

    // Reactions & Views states
    const [interactions, setInteractions] = useState<{ views: any[], reactions: any[] }>({ views: [], reactions: [] });
    const [showInteractionsList, setShowInteractionsList] = useState(false);
    const [replyText, setReplyText] = useState('');

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
                // Pass user?.id to prioritize friends' stories
                const res = await db.getStories(user?.id);
                setStories(res);
                
                // Check if we should start at a specific user (from URL)
                const hash = window.location.hash || '';
                const parts = hash.split('?');
                const params = new URLSearchParams(parts.length > 1 ? parts[1] : '');
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
    }, [user?.id]);

    const currentGroup = groupedStories[currentUserIndex] || [];
    const currentStory = currentGroup[currentStoryIndex];

    const saveProgress = (userId: string, index: number, total: number) => {
        try {
            const savedRaw = localStorage.getItem('sp_stories_progress');
            const progressObj = savedRaw ? JSON.parse(savedRaw) : {};
            const completed = index === total - 1;
            progressObj[userId] = {
                lastSeenStoryIndex: index,
                completed: completed || (progressObj[userId]?.completed ?? false),
                timestamp: Date.now()
            };
            localStorage.setItem('sp_stories_progress', JSON.stringify(progressObj));
        } catch (e) {
            console.error("Error saving story progress", e);
        }
    };

    // Auto-save progress
    useEffect(() => {
        if (currentGroup && currentGroup.length > 0 && currentStoryIndex !== undefined) {
            const creatorId = currentGroup[0].userId;
            saveProgress(creatorId, currentStoryIndex, currentGroup.length);
        }
    }, [currentUserIndex, currentStoryIndex, currentGroup]);

    // Resume progress when the active user group loads
    useEffect(() => {
        if (currentGroup && currentGroup.length > 0) {
            const creatorId = currentGroup[0].userId;
            try {
                const savedRaw = localStorage.getItem('sp_stories_progress');
                if (savedRaw) {
                    const progressObj = JSON.parse(savedRaw);
                    if (progressObj[creatorId]) {
                        const { lastSeenStoryIndex, completed } = progressObj[creatorId];
                        if (!completed && lastSeenStoryIndex > 0 && lastSeenStoryIndex < currentGroup.length) {
                            setCurrentStoryIndex(lastSeenStoryIndex);
                        } else {
                            setCurrentStoryIndex(0);
                        }
                    } else {
                        setCurrentStoryIndex(0);
                    }
                }
            } catch (e) {
                console.error("Error loading story progress", e);
            }
        }
    }, [currentUserIndex, currentGroup?.length]);

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

    // Register active story view in DB
    useEffect(() => {
        if (currentStory && user) {
            db.registerStoryView(currentStory.id, user.id).catch(() => {});
        }
    }, [currentStory?.id, user?.id]);

    // Handle reactions submitting
    const handleReact = async (reactionType: string) => {
        if (!user || !currentStory) return;
        try {
            await db.reactToStory(currentStory.id, user.id, reactionType);
            // Re-fetch details to show immediate update if owner
            if (showInteractionsList) {
                const updated = await db.getStoryInteractions(currentStory.id);
                setInteractions(updated);
            }
        } catch (e) {
            console.error(e);
        }
    };

    // Query interactions when viewer counts drawer is toggled
    useEffect(() => {
        if (currentStory && showInteractionsList) {
            db.getStoryInteractions(currentStory.id)
                .then(setInteractions)
                .catch(() => {});
        }
    }, [currentStory?.id, showInteractionsList]);

    // Send story text replies inside chat
    const handleSendReply = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!replyText.trim() || !user || !currentStory) return;
        
        let receiverId = currentStory.userId;
        let textToSend = `[Respondió a tu historia 🎬] "${replyText}"`;

        if (receiverId.startsWith('group_')) {
            const origCreatorId = currentStory.originalVideo?.creatorId;
            if (!origCreatorId) {
                alert("No se puede responder a esta historia de grupo pues no tiene un creador asociado.");
                return;
            }
            receiverId = origCreatorId;
            textToSend = `[Respondió a tu publicación en ${currentStory.username} 🎬] "${replyText}"`;
        }

        if (receiverId === user.id) {
            alert("No puedes responder a tu propia historia");
            return;
        }

        try {
            await db.sendMessage({
                userId: user.id,
                receiverId,
                text: textToSend
            });
            setReplyText('');
            alert("Respuesta enviada al chat");
        } catch (err) {
            console.error("Failed to send reply:", err);
            alert("Error al enviar la respuesta.");
        }
    };

    useEffect(() => {
        if (loading || !currentStory || paused) return;

        // Use duration from DB (converted to ms) or fallback to defaults
        const dbDuration = (currentStory as any).duration ? (currentStory as any).duration * 1000 : null;
        const duration = dbDuration || (currentStory.type === 'VIDEO' ? 0 : 5000); 
        
        if (currentStory.type === 'IMAGE' || (currentStory.type === 'VIDEO' && dbDuration)) {
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
                
                // For videos, also check currentTime if we have a forced duration
                if (currentStory.type === 'VIDEO' && videoRef.current && dbDuration) {
                    const video = videoRef.current;
                    if (video.currentTime * 1000 >= duration) {
                        clearInterval(progressInterval.current!);
                        nextStory();
                    }
                }
            }, 100);
        }

        return () => {
            if (progressInterval.current) clearInterval(progressInterval.current);
        };
    }, [currentStory, currentUserIndex, currentStoryIndex, paused, loading]);

    useEffect(() => {
        if (videoRef.current && currentStory?.type === 'VIDEO') {
            try {
                videoRef.current.currentTime = 0;
                videoRef.current.load();
                videoRef.current.play().catch(() => {});
            } catch (e) {}
        }
    }, [currentUserIndex, currentStoryIndex, currentStory?.id, currentStory?.type]);

    const handleVideoMetadata = (e: React.SyntheticEvent<HTMLVideoElement>) => {
        const video = e.currentTarget;
        const dbDuration = (currentStory as any).duration ? (currentStory as any).duration * 1000 : null;
        
        // If we have a forced duration from DB, we handle it in the main useEffect
        if (dbDuration) return;

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

    // Resolve poster or thumbnail accurately
    const posterUrl = currentStory.originalVideo?.thumbnailUrl || (currentStory as any).thumbnailUrl || currentStory.contentUrl;

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
            <div className="absolute top-4 left-0 right-0 p-4 flex items-center justify-between z-50 bg-gradient-to-b from-black/60 to-transparent">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full border-2 border-white overflow-hidden bg-slate-800">
                        {currentStory.avatarUrl ? (
                            <img src={getThumbnailUrl(currentStory.avatarUrl)} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
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
                            className="max-w-full max-h-full object-contain animate-in fade-in duration-300" 
                            referrerPolicy="no-referrer"
                            alt="Story content"
                        />
                    ) : (
                        <video 
                            ref={videoRef}
                            src={currentStory.contentUrl} 
                            poster={getThumbnailUrl(posterUrl)}
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

                {/* Shared Content Overlay (Facebook style) */}
                {(currentStory.originalVideo || currentStory.originalMarketplaceItem) && (
                    <div className="absolute inset-x-0 bottom-36 flex justify-center p-4 z-50 pointer-events-none">
                        <div 
                            className="bg-black/80 backdrop-blur-md border border-white/20 rounded-2xl w-full max-w-[300px] overflow-hidden pointer-events-auto shadow-2xl active:scale-95 transition-transform"
                            onClick={(e) => {
                                e.stopPropagation();
                                if (currentStory.originalVideo) navigate(`/watch/${currentStory.videoId}`);
                                if (currentStory.originalMarketplaceItem) navigate(`/marketplace/${currentStory.productId}`);
                            }}
                        >
                            <div className="flex p-2 gap-3 items-center">
                                <div className="w-12 h-12 rounded-lg overflow-hidden shrink-0 bg-slate-800">
                                    <img 
                                        src={getThumbnailUrl(currentStory.originalVideo ? currentStory.originalVideo.thumbnailUrl : (currentStory.originalMarketplaceItem?.images?.[0] || ''))} 
                                        className="w-full h-full object-cover"
                                        referrerPolicy="no-referrer"
                                    />
                                </div>
                                <div className="min-w-0 pr-2">
                                    <h4 className="text-white text-xs font-bold truncate">
                                        {currentStory.originalVideo ? currentStory.originalVideo.title : currentStory.originalMarketplaceItem?.title}
                                    </h4>
                                    <p className="text-white/60 text-[10px] truncate">
                                        {currentStory.originalVideo ? `@${currentStory.originalVideo.creatorName}` : (currentStory.originalMarketplaceItem ? `Marketplace • ${currentStory.originalMarketplaceItem.price} $` : '')}
                                    </p>
                                </div>
                            </div>
                            <div className="bg-white/10 p-1.5 text-center border-t border-white/5">
                                <span className="text-white text-[10px] font-bold uppercase tracking-widest">
                                    {currentStory.originalVideo ? 'Ver Video' : 'Ver Producto'}
                                </span>
                            </div>
                        </div>
                    </div>
                )}

                {/* Overlay Text */}
                {currentStory.overlayText && (
                    <div className="absolute inset-0 flex items-center justify-center p-8 pointer-events-none">
                        <p 
                            className="text-3xl md:text-5xl font-bold text-center break-words px-4 py-2 rounded-lg shadow-xl"
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

            {/* Bottom Panel Actions: Facebook style input & reaction bar */}
            <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/90 to-transparent z-[60] flex flex-col gap-3">
                {currentStory.userId && currentStory.userId.startsWith('group_') ? (
                    <div className="text-center text-slate-300 text-xs font-bold py-3 px-4 select-none w-full bg-black/40 backdrop-blur-sm rounded-xl border border-white/5 shadow-inner">
                        💬 Comentarios desactivados para historias de grupo
                    </div>
                ) : (
                    <>
                        {/* Facebook Reactions Floating Row */}
                        {user && (
                            <div className="flex items-center gap-2 justify-center py-1.5 bg-black/45 backdrop-blur-md rounded-full border border-white/10 px-3 self-center shadow-lg transform transition-transform hover:scale-105">
                                {[
                                    { emoji: '👍', name: 'LIKE', label: 'Me gusta' },
                                    { emoji: '❤️', name: 'LOVE', label: 'Me encanta' },
                                    { emoji: '🥰', name: 'CARE', label: 'Me importa' },
                                    { emoji: '😆', name: 'HAHA', label: 'Me divierte' },
                                    { emoji: '😮', name: 'WOW', label: 'Me asombra' },
                                    { emoji: '😢', name: 'SAD', label: 'Me entristece' },
                                    { emoji: '😡', name: 'ANGRY', label: 'Me enoja' }
                                ].map((react) => (
                                    <button 
                                        key={react.name}
                                        onClick={(e) => { e.stopPropagation(); handleReact(react.name); }}
                                        className="text-2xl hover:scale-130 active:scale-95 transition-all p-1"
                                        title={react.label}
                                    >
                                        {react.emoji}
                                    </button>
                                ))}
                            </div>
                        )}

                        <div className="flex items-center gap-2 max-w-lg mx-auto w-full">
                            {/* Send direct reply in chat */}
                            {user && currentStory.userId !== user.id ? (
                                <form onSubmit={handleSendReply} className="flex-1 flex gap-2 items-center" onClick={(e) => e.stopPropagation()}>
                                    <input 
                                        type="text"
                                        placeholder={`Responder a ${currentStory.username}...`}
                                        value={replyText}
                                        onChange={(e) => setReplyText(e.target.value)}
                                        onFocus={() => setPaused(true)}
                                        onBlur={() => setTimeout(() => setPaused(false), 500)}
                                        className="flex-1 h-10 bg-white/10 border border-white/20 rounded-full px-4 text-white placeholder-white/50 text-sm focus:outline-none focus:ring-2 focus:ring-[#1877f2] focus:bg-white/20 transition-all font-sans"
                                    />
                                    <button 
                                        type="submit"
                                        className="w-10 h-10 flex items-center justify-center bg-[#1877f2] hover:bg-blue-600 rounded-full text-white active:scale-90 transition-transform"
                                        title="Enviar respuesta"
                                    >
                                        <Send size={16} />
                                    </button>
                                </form>
                            ) : (
                                <div className="flex-1" />
                            )}

                            {/* Owner stats checking */}
                            {user && user.id === currentStory.userId && (
                                <button 
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setPaused(true);
                                        setShowInteractionsList(true);
                                    }}
                                    className="bg-white/15 hover:bg-white/25 border border-white/20 text-white rounded-full px-4 py-2 text-xs font-bold flex items-center gap-1.5 transition-all ml-auto"
                                >
                                    <Eye size={16} />
                                    <span>Ver vistas</span>
                                </button>
                            )}
                        </div>
                    </>
                )}
            </div>

            {/* Interactions Overlaid Drawer */}
            {showInteractionsList && (
                <div className="fixed inset-0 z-[1100] bg-black/95 flex flex-col p-safe animate-in fade-in slide-in-from-bottom duration-250">
                    <div className="flex items-center justify-between p-4 border-b border-white/10 bg-slate-950">
                        <h3 className="text-white font-bold text-base flex items-center gap-2">
                            <Eye size={18} className="text-[#1877f2]" />
                            Estadísticas de la Historia
                        </h3>
                        <button 
                            onClick={() => {
                                setShowInteractionsList(false);
                                setPaused(false);
                            }}
                            className="w-8 h-8 flex items-center justify-center bg-white/10 text-white rounded-full hover:bg-white/20 active:scale-90 transition-transform"
                        >
                            <X size={18} />
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-6">
                        {/* Reactions Breakdown */}
                        <div>
                            <span className="text-xs font-bold tracking-wider uppercase text-white/50">Reacciones</span>
                            {interactions.reactions.length === 0 ? (
                                <p className="text-sm text-white/40 mt-1">Nadie ha reaccionado todavía</p>
                            ) : (
                                <div className="grid grid-cols-1 gap-2.5 mt-2">
                                    {interactions.reactions.map((react: any, i: number) => {
                                        const reactionEmojis: Record<string, string> = {
                                            LIKE: '👍', LOVE: '❤️', CARE: '🥰', HAHA: '😆', WOW: '😮', SAD: '😢', ANGRY: '😡'
                                        };
                                        return (
                                            <div key={i} className="flex items-center gap-3 bg-white/5 p-2 rounded-xl">
                                                <div className="w-10 h-10 rounded-full overflow-hidden bg-slate-800">
                                                    {react.avatarUrl ? <img src={getThumbnailUrl(react.avatarUrl)} className="w-full h-full object-cover" /> : <div className="w-full h-full bg-slate-700 uppercase flex items-center justify-center font-bold text-white">{react.username?.[0]}</div>}
                                                </div>
                                                <span className="text-white font-medium text-sm flex-1">{react.username}</span>
                                                <span className="text-2xl">{reactionEmojis[react.reaction] || '👍'}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* Views Breakdown */}
                        <div>
                            <span className="text-xs font-bold tracking-wider uppercase text-white/50">Vistas ({interactions.views.length})</span>
                            {interactions.views.length === 0 ? (
                                <p className="text-sm text-white/40 mt-1">Ningún usuario ha visualizado esta historia</p>
                            ) : (
                                <div className="grid grid-cols-1 gap-2.5 mt-2">
                                    {interactions.views.map((viewer: any, i: number) => (
                                        <div key={i} className="flex items-center gap-3 bg-white/5 p-2 rounded-xl">
                                            <div className="w-10 h-10 rounded-full overflow-hidden bg-slate-800">
                                                {viewer.avatarUrl ? <img src={getThumbnailUrl(viewer.avatarUrl)} className="w-full h-full object-cover" /> : <div className="w-full h-full bg-slate-700 uppercase flex items-center justify-center font-bold text-white">{viewer.username?.[0]}</div>}
                                            </div>
                                            <div className="flex flex-col flex-1">
                                                <span className="text-white font-medium text-sm">{viewer.username}</span>
                                                <span className="text-white/40 text-[10px]">{viewer.timestamp ? new Date(viewer.timestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}