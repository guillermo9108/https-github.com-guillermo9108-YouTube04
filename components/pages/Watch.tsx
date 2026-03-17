import React, { useEffect, useState, useRef, useMemo } from 'react';
import { Video, Comment, UserInteraction, Category } from '../../types';
import { db } from '../../services/db';
import { useAuth } from '../../context/AuthContext';
import { useSettings } from '../../context/SettingsContext';
import { useParams, Link, useNavigate } from '../Router';
import { 
    Loader2, Heart, ThumbsDown, MessageCircle, Lock, 
    ChevronRight, Home, Play, Info, ExternalLink, AlertTriangle, Send, CheckCircle2, Clock, Share2, X, Search, UserCheck, PlusCircle, ArrowRightCircle, Wallet, ShoppingCart, Music, ChevronDown, Bell, BellOff, ListFilter, Download, RotateCw, Maximize, Minimize
} from 'lucide-react';
import VideoCard from '../VideoCard';
import { useToast } from '../../context/ToastContext';
import { useGrid } from '../../context/GridContext';
import { generateThumbnail } from '../../utils/videoGenerator';

// Refactored Components
import CommentSection from '../watch/CommentSection';
import ShareModal from '../watch/ShareModal';

const naturalCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

export default function Watch() {
    const { id } = useParams();
    const { user, refreshUser } = useAuth();
    const { settings } = useSettings();
    const { setThrottled } = useGrid();
    const navigate = useNavigate();
    const toast = useToast();
    
    // Obtener contexto completo desde la URL
    const navigationContext = useMemo(() => {
        const hash = window.location.hash;
        if (!hash.includes('?')) return { q: null, f: '', c: 'TODOS', p: 0, s: '' };
        const params = new URLSearchParams(hash.split('?')[1]);
        return {
            q: params.get('q'),
            f: params.get('f') || '',
            c: params.get('c') || 'TODOS',
            p: parseInt(params.get('p') || '0'),
            s: params.get('s') || ''
        };
    }, [id, window.location.hash]);

    const [video, setVideo] = useState<Video | null>(null);
    const [loading, setLoading] = useState(true);
    const [isUnlocked, setIsUnlocked] = useState(false);
    const [isPurchasing, setIsPurchasing] = useState(false);
    const [interaction, setInteraction] = useState<UserInteraction | null>(null);
    const [rotation, setRotation] = useState(0);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [showControls, setShowControls] = useState(true);
    const [videoFit, setVideoFit] = useState<'contain' | 'cover'>('contain');
    const controlsTimerRef = useRef<any>(null);
    const videoContainerRef = useRef<HTMLDivElement>(null);
    const [relatedVideos, setRelatedVideos] = useState<Video[]>([]);
    const [seriesQueue, setSeriesQueue] = useState<Video[]>([]); 
    
    // Paginación de Relacionados
    const [relatedPage, setRelatedPage] = useState(navigationContext.p);
    const [hasMoreRelated, setHasMoreRelated] = useState(true);
    const [loadingMoreRelated, setLoadingMoreRelated] = useState(false);
    
    // Social State
    const [likes, setLikes] = useState<number>(0);
    const [dislikes, setDislikes] = useState<number>(0);
    const [comments, setComments] = useState<Comment[]>([]);
    const [showComments, setShowComments] = useState(false); 
    const [newComment, setNewComment] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSubscribed, setIsSubscribed] = useState(false);

    // Auto-Extraction State
    const [extractionAttempted, setExtractionAttempted] = useState(false);

    // Share Modal State
    const [showShareModal, setShowShareModal] = useState(false);
    const [shareSearch, setShareSearch] = useState('');
    const [shareSuggestions, setShareSuggestions] = useState<any[]>([]);
    const shareTimeout = useRef<any>(null);

    const videoRef = useRef<HTMLVideoElement>(null);
    const viewMarkedRef = useRef(false);

    useEffect(() => { 
        window.scrollTo(0, 0); 
        refreshUser(); 
        viewMarkedRef.current = false;
        setThrottled(true);
        setRelatedPage(navigationContext.p);
        setRelatedVideos([]);
        setSeriesQueue([]);
        setShowComments(false);
        setExtractionAttempted(false); 
        return () => { setThrottled(false); };
    }, [id, navigationContext.s]);

    const fetchRelated = async (p: number) => {
        if (loadingMoreRelated || (!hasMoreRelated && p !== navigationContext.p)) return;
        setLoadingMoreRelated(true);
        
        // Cargar el filtro persistente del sistema
        const mediaFilter = localStorage.getItem('sp_media_filter') || 'ALL';
        
        try {
            let filteredResults: Video[] = [];
            let hasMore = false;

            if (navigationContext.f) {
                // Si estamos en una carpeta, usar getFolderVideos para mantener el sortOrder
                const res = await db.getFolderVideos(id || '', navigationContext.s || '', user?.id);
                filteredResults = res.videos;
                hasMore = false; // getFolderVideos devuelve todo
            } else {
                const res = await db.getVideos(p, 40, navigationContext.f, navigationContext.q || '', navigationContext.c, mediaFilter as any, navigationContext.s, user?.id);
                filteredResults = res.videos;
                hasMore = res.hasMore;
            }
            
            let finalResults = filteredResults;
            
            // Refuerzo de orden local si el backend no lo aplicó correctamente
            if (navigationContext.s === 'ALPHA') {
                finalResults = [...filteredResults].sort((a, b) => naturalCollator.compare(a.title, b.title));
            } else if (navigationContext.s === 'LATEST') {
                finalResults = [...filteredResults].sort((a, b) => b.createdAt - a.createdAt);
            } else if (navigationContext.s === 'OLDEST') {
                finalResults = [...filteredResults].sort((a, b) => a.createdAt - b.createdAt);
            }

            if (p === navigationContext.p || navigationContext.f) {
                const nonImages = finalResults.filter(v => {
                    if (!v) return false;
                    const path = (v as any).rawPath || v.videoUrl || '';
                    const isImg = v.category === 'IMAGES' || path.match(/\.(jpg|jpeg|png|webp|gif|bmp|svg)(\?.*)?$/i);
                    return v.id !== id && !isImg;
                });
                setRelatedVideos(nonImages);
                setSeriesQueue(finalResults.filter(v => {
                    if (!v) return false;
                    const path = (v as any).rawPath || v.videoUrl || '';
                    return !(v.category === 'IMAGES' || path.match(/\.(jpg|jpeg|png|webp|gif|bmp|svg)(\?.*)?$/i));
                }));
            } else {
                const nonImages = finalResults.filter(v => {
                    if (!v) return false;
                    const path = (v as any).rawPath || v.videoUrl || '';
                    const isImg = v.category === 'IMAGES' || path.match(/\.(jpg|jpeg|png|webp|gif|bmp|svg)(\?.*)?$/i);
                    return v.id !== id && !isImg;
                });
                setRelatedVideos(prev => [...prev, ...nonImages]);
                setSeriesQueue(prev => {
                    const newNonImages = finalResults.filter(v => {
                        if (!v) return false;
                        const path = (v as any).rawPath || v.videoUrl || '';
                        return !(v.category === 'IMAGES' || path.match(/\.(jpg|jpeg|png|webp|gif|bmp|svg)(\?.*)?$/i));
                    });
                    return [...prev, ...newNonImages];
                });
            }
            setHasMoreRelated(hasMore);
            setRelatedPage(p);
        } catch (e) {} finally { setLoadingMoreRelated(false); }
    };

    useEffect(() => {
        if (!id) return;
        setLoading(true);
        
        const fetchData = async () => {
            try {
                const v = await db.getVideo(id);
                if (!v) { setLoading(false); return; }

                const path = (v as any).rawPath || v.videoUrl || '';
                const isImage = v.category === 'IMAGES' || path.match(/\.(jpg|jpeg|png|webp|gif|bmp|svg)(\?.*)?$/i);
                if (isImage) {
                    setLoading(false);
                    // Redirect to channel or home if it's an image, as they should be viewed in modal
                    window.location.hash = `/channel/${v.creatorId}`;
                    return;
                }

            setVideo(v); 
                setLikes(Number(v.likes || 0));
                setDislikes(Number(v.dislikes || 0));

                await fetchRelated(navigationContext.p);

                db.getComments(v.id).then(setComments);

                if (user) {
                    const [access, interact, sub] = await Promise.all([
                        db.hasPurchased(user.id, v.id),
                        db.getInteraction(user.id, v.id),
                        db.checkSubscription(user.id, v.creatorId)
                    ]);
                    const isAdmin = user.role?.trim().toUpperCase() === 'ADMIN';
                    const isVipActive = !!(user.vipExpiry && user.vipExpiry > Date.now() / 1000);
                    setIsUnlocked(Boolean(access || isAdmin || isVipActive || user.id === v.creatorId));
                    setInteraction(interact);
                    setIsSubscribed(sub);
                }
            } catch (e) {} finally { setLoading(false); }
        };
        fetchData();
    }, [id, user?.id, navigationContext.q, navigationContext.f, navigationContext.c]);

    const handleRate = async (type: 'like' | 'dislike') => {
        if (!user || !video) return;
        try {
            const res = await db.rateVideo(user.id, video.id, type);
            setInteraction(res);
            if (res.newLikeCount !== undefined) setLikes(res.newLikeCount);
            if (res.newDislikeCount !== undefined) setDislikes(res.newDislikeCount);
        } catch(e) {}
    };

    const handleAddComment = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || !video || !newComment.trim() || isSubmitting) return;
        setIsSubmitting(true);
        try {
            const c = await db.addComment(user.id, video.id, newComment.trim());
            setComments(prev => [c, ...prev]);
            setNewComment('');
            toast.success("Comentario publicado");
        } catch(e) { toast.error("Error al comentar"); }
        finally { setIsSubmitting(false); }
    };

    const handleToggleSubscribe = async () => {
        if (!user || !video) return;
        try {
            const res = await db.toggleSubscribe(user.id, video.creatorId);
            setIsSubscribed(res.isSubscribed);
            toast.success(res.isSubscribed ? "Suscrito al canal" : "Suscripción cancelada");
        } catch(e) {}
    };

    const handleShareSearch = (val: string) => {
        setShareSearch(val);
        if (shareTimeout.current) clearTimeout(shareTimeout.current);
        if (val.length < 2) { setShareSuggestions([]); return; }
        shareTimeout.current = setTimeout(async () => {
            if (!user) return;
            const hits = await db.searchUsers(user.id, val);
            setShareSuggestions(hits);
        }, 300);
    };

    const sendVideoToUser = async (targetUsername: string) => {
        if (!user || !video) return;
        try {
            await db.request(`action=share_video`, {
                method: 'POST',
                body: JSON.stringify({ videoId: video.id, senderId: user.id, targetUsername })
            });
            toast.success(`Video enviado a @${targetUsername}`);
            setShowShareModal(false);
            setShareSearch('');
            setShareSuggestions([]);
        } catch (e: any) { toast.error(e.message); }
    };

    const handlePurchase = async () => {
        if (!user || !video || isPurchasing) return;
        if (Number(user.balance) < Number(video.price)) { toast.error("Saldo insuficiente"); navigate('/vip'); return; }
        setIsPurchasing(true);
        try {
            await db.purchaseVideo(user.id, video.id);
            setIsUnlocked(true); toast.success("¡Desbloqueado!"); refreshUser();
        } catch (e: any) { toast.error(e.message); } finally { setIsPurchasing(false); }
    };

    const handleTimeUpdate = async () => {
        const el = videoRef.current;
        if (!el || !video || extractionAttempted || !isUnlocked) return;

        const isDefault = video.thumbnailUrl.includes('default.jpg') || video.thumbnailUrl.includes('defaultaudio.jpg');
        if (!isDefault) return;

        if (!video.is_audio && el.currentTime > 2 && el.videoWidth > 0) {
            setExtractionAttempted(true);
            try {
                const canvas = document.createElement('canvas');
                canvas.width = el.videoWidth;
                canvas.height = el.videoHeight;
                const ctx = canvas.getContext('2d');
                if (ctx) {
                    ctx.drawImage(el, 0, 0);
                    canvas.toBlob(async (blob) => {
                        if (blob) {
                            const file = new File([blob], "thumb_auto.jpg", { type: "image/jpeg" });
                            await db.updateVideoMetadata(video.id, Math.floor(el.duration), file);
                            setVideo(prev => prev ? { ...prev, thumbnailUrl: URL.createObjectURL(blob) } : null);
                        }
                    }, 'image/jpeg', 0.8);
                }
            } catch (e) { console.warn("Lazy extraction failed for video", e); }
        }
        
        if (video.is_audio && el.currentTime > 0.5) {
            setExtractionAttempted(true);
            try {
                const result = await generateThumbnail(streamUrl, true, false); 
                if (result.thumbnail) {
                    await db.updateVideoMetadata(video.id, Math.floor(el.duration || video.duration), result.thumbnail);
                    setVideo(prev => prev ? { ...prev, thumbnailUrl: URL.createObjectURL(result.thumbnail!) } : null);
                }
            } catch (e) { console.warn("Lazy extraction failed for audio", e); }
        }
    };

    const toggleFullscreen = () => {
        if (!videoContainerRef.current) return;
        if (!document.fullscreenElement) {
            videoContainerRef.current.requestFullscreen().catch(err => {
                console.error(`Error attempting to enable full-screen mode: ${err.message}`);
            });
            setVideoFit('cover'); // Auto-adjust to fill screen in fullscreen
        } else {
            document.exitFullscreen();
            setVideoFit('contain');
        }
    };

    const resetControlsTimer = () => {
        setShowControls(true);
        if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
        controlsTimerRef.current = setTimeout(() => {
            if (isFullscreen || (videoRef.current && !videoRef.current.paused)) {
                setShowControls(false);
            }
        }, 3000);
    };

    const handleMouseMove = () => {
        resetControlsTimer();
    };

    const togglePlay = (e?: React.MouseEvent) => {
        e?.stopPropagation();
        if (!videoRef.current) return;
        if (videoRef.current.paused) videoRef.current.play();
        else videoRef.current.pause();
        resetControlsTimer();
    };

    const seek = (seconds: number, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!videoRef.current) return;
        videoRef.current.currentTime += seconds;
        resetControlsTimer();
    };

    useEffect(() => {
        const handleFullscreenChange = () => {
            setIsFullscreen(!!document.fullscreenElement);
        };
        document.addEventListener('fullscreenchange', handleFullscreenChange);
        return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
    }, []);

    const handleVideoEnded = async () => {
        if (!video || !user) return;
        
        // Intentar encontrar el video actual en la cola
        let currentIndex = seriesQueue.findIndex(v => v.id === video.id);
        
        // Si es el último de la página y hay más, cargar más antes de saltar
        if (currentIndex === seriesQueue.length - 1 && hasMoreRelated && !navigationContext.f) {
            toast.info("Cargando siguientes resultados...");
            await fetchRelated(relatedPage + 1);
            // Re-calcular índice tras la carga
            currentIndex = seriesQueue.findIndex(v => v.id === video.id);
        }

        let nextVid = seriesQueue[currentIndex + 1] || relatedVideos[0];
        
        if (!nextVid) {
            toast.info("Has llegado al final de la lista");
            return;
        }

        const isAdmin = user.role?.trim().toUpperCase() === 'ADMIN';
        const isVip = !!(user.vipExpiry && user.vipExpiry > Date.now() / 1000);
        const hasAccess = isAdmin || (isVip && nextVid.creatorRole === 'ADMIN') || user.id === nextVid.creatorId;
        
        const params = new URLSearchParams();
        if (navigationContext.q) params.set('q', navigationContext.q);
        if (navigationContext.f) params.set('f', navigationContext.f);
        if (navigationContext.c !== 'TODOS') params.set('c', navigationContext.c);
        if (navigationContext.s) params.set('s', navigationContext.s);
        params.set('p', String(relatedPage));
        const contextSuffix = params.toString() ? `?${params.toString()}` : '';

        if (hasAccess) { navigate(`/watch/${nextVid.id}${contextSuffix}`); return; }
        const purchased = await db.hasPurchased(user.id, nextVid.id);
        if (purchased) { navigate(`/watch/${nextVid.id}${contextSuffix}`); return; }
        if (Number(nextVid.price) <= Number(user.autoPurchaseLimit) && Number(user.balance) >= Number(nextVid.price)) {
            try {
                await db.purchaseVideo(user.id, nextVid.id);
                refreshUser(); navigate(`/watch/${nextVid.id}${contextSuffix}`);
            } catch (e) { navigate(`/watch/${nextVid.id}${contextSuffix}`); }
        } else {
            navigate(`/watch/${nextVid.id}${contextSuffix}`); 
        }
    };

    const streamUrl = useMemo(() => {
        if (!video) return '';
        return db.getStreamerUrl(video.id, user?.sessionToken);
    }, [video?.id, user?.sessionToken]);

    const downloadUrl = useMemo(() => {
        if (!video) return '';
        const base = db.getStreamerUrl(video.id, user?.sessionToken);
        const filename = encodeURIComponent((video.title || 'video').replace(/[^a-z0-9]/gi, '_').toLowerCase());
        const ext = video.is_audio ? 'mp3' : 'mp4';
        return `${base}&download=1&filename=${filename}.${ext}`;
    }, [video?.id, user?.sessionToken, video?.title, video?.is_audio]);

    const searchContextLabel = navigationContext.q || (navigationContext.f ? `Carpeta: ${navigationContext.f.split('/').pop()}` : null);

    if (loading) return <div className="flex justify-center p-20"><Loader2 className="animate-spin text-indigo-500" size={48}/></div>;

    const isAudio = Boolean(video?.is_audio);
    const defaultThumb = isAudio ? settings?.defaultAudioThumb : settings?.defaultVideoThumb;
    const posterUrl = video?.thumbnailUrl || defaultThumb || (isAudio ? '/api/uploads/thumbnails/defaultaudio.jpg' : '/api/uploads/thumbnails/default.jpg');

    return (
        <div className="flex flex-col bg-slate-950 min-h-screen animate-in fade-in relative">
            {/* Contenedor de Video Pegajoso - Mejorado para móviles */}
            <div className="w-full bg-black sticky top-0 z-[45] shadow-2xl border-b border-white/5 overflow-hidden">
                <div 
                    ref={videoContainerRef}
                    onMouseMove={handleMouseMove}
                    onClick={togglePlay}
                    className={`relative aspect-video w-full max-w-[1400px] mx-auto bg-black overflow-hidden group ${isFullscreen ? 'h-screen max-w-none aspect-auto' : ''}`}
                >
                    {isUnlocked ? (
                        <div className={`relative z-10 w-full h-full flex flex-col items-center justify-center ${video?.is_audio ? 'bg-slate-900/40 backdrop-blur-md' : ''}`}>
                            {(video?.is_audio || !video?.thumbnailUrl) && (
                                <img src={posterUrl} className="absolute inset-0 w-full h-full object-cover blur-3xl opacity-30 scale-110" referrerPolicy="no-referrer" />
                            )}
                            <video 
                                ref={videoRef} 
                                src={streamUrl} 
                                controls={!isFullscreen} // Hide native controls in fullscreen to use custom ones
                                autoPlay 
                                poster={posterUrl} 
                                className={`w-full h-full transition-transform duration-300 ${videoFit === 'cover' ? 'object-cover' : 'object-contain'}`} 
                                style={{ transform: `rotate(${rotation}deg)` }}
                                onEnded={handleVideoEnded} 
                                crossOrigin="anonymous" 
                                onPlay={() => { setThrottled(true); resetControlsTimer(); }} 
                                onPause={() => { setThrottled(false); setShowControls(true); }}
                                onTimeUpdate={handleTimeUpdate}
                            />

                            {/* Floating Controls Overlay - Visible on Hover or Fullscreen */}
                            <div className={`absolute inset-0 z-20 transition-opacity flex flex-col justify-between p-4 bg-gradient-to-t from-black/60 via-transparent to-black/40 ${showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                                <div className="flex justify-between items-start">
                                    <div className="flex flex-col">
                                        <h3 className="text-white font-black text-sm uppercase tracking-tighter drop-shadow-lg">{video?.title}</h3>
                                        <p className="text-slate-300 text-[10px] font-bold uppercase tracking-widest">@{video?.creatorName}</p>
                                    </div>
                                    <div className="flex gap-2">
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); setVideoFit(prev => prev === 'contain' ? 'cover' : 'contain'); }}
                                            className="p-3 bg-black/60 backdrop-blur-md rounded-2xl text-white hover:bg-indigo-600 transition-all shadow-xl border border-white/10 pointer-events-auto"
                                            title="Ajustar Pantalla"
                                        >
                                            <Maximize size={20} className={videoFit === 'cover' ? 'text-indigo-400' : ''} />
                                        </button>
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); setRotation(prev => (prev + 90) % 360); }}
                                            className="p-3 bg-black/60 backdrop-blur-md rounded-2xl text-white hover:bg-indigo-600 transition-all shadow-xl border border-white/10 pointer-events-auto"
                                            title="Girar Video"
                                        >
                                            <RotateCw size={20} />
                                        </button>
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); toggleFullscreen(); }}
                                            className="p-3 bg-black/60 backdrop-blur-md rounded-2xl text-white hover:bg-indigo-600 transition-all shadow-xl border border-white/10 pointer-events-auto"
                                            title={isFullscreen ? "Salir de Pantalla Completa" : "Pantalla Completa"}
                                        >
                                            {isFullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
                                        </button>
                                    </div>
                                </div>

                                {/* Center Play/Pause and Seek for Fullscreen/Mobile */}
                                <div className="flex items-center justify-center gap-12">
                                    <button onClick={(e) => seek(-10, e)} className="p-4 bg-black/40 backdrop-blur-md rounded-full text-white hover:bg-white/20 transition-all pointer-events-auto active:scale-90">
                                        <RotateCw size={32} className="transform -rotate-180" />
                                        <span className="absolute text-[10px] font-black">10</span>
                                    </button>
                                    <button onClick={togglePlay} className="p-8 bg-indigo-600/80 backdrop-blur-md rounded-full text-white hover:bg-indigo-500 transition-all shadow-2xl pointer-events-auto active:scale-90">
                                        {videoRef.current?.paused ? <Play size={48} fill="currentColor" /> : <div className="flex gap-2"><div className="w-3 h-12 bg-white rounded-full"></div><div className="w-3 h-12 bg-white rounded-full"></div></div>}
                                    </button>
                                    <button onClick={(e) => seek(10, e)} className="p-4 bg-black/40 backdrop-blur-md rounded-full text-white hover:bg-white/20 transition-all pointer-events-auto active:scale-90">
                                        <RotateCw size={32} />
                                        <span className="absolute text-[10px] font-black">10</span>
                                    </button>
                                </div>

                                <div className="flex flex-col gap-2">
                                    {/* Progress Bar for Fullscreen */}
                                    {isFullscreen && videoRef.current && (
                                        <div className="w-full h-1.5 bg-white/20 rounded-full overflow-hidden pointer-events-auto cursor-pointer relative group/progress" onClick={(e) => {
                                            e.stopPropagation();
                                            const rect = e.currentTarget.getBoundingClientRect();
                                            const pos = (e.clientX - rect.left) / rect.width;
                                            if (videoRef.current) videoRef.current.currentTime = pos * videoRef.current.duration;
                                        }}>
                                            <div 
                                                className="h-full bg-indigo-500 transition-all" 
                                                style={{ width: `${(videoRef.current.currentTime / videoRef.current.duration) * 100}%` }}
                                            ></div>
                                        </div>
                                    )}
                                    <div className="flex justify-between items-center">
                                        <div className="text-[10px] font-black text-white uppercase tracking-widest bg-black/40 px-3 py-1 rounded-full backdrop-blur-md border border-white/5">
                                            {videoRef.current ? `${Math.floor(videoRef.current.currentTime / 60)}:${Math.floor(videoRef.current.currentTime % 60).toString().padStart(2, '0')}` : '0:00'} / {Math.floor((video?.duration || 0) / 60)}:{Math.floor((video?.duration || 0) % 60).toString().padStart(2, '0')}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
                            {video && <img src={video.thumbnailUrl} className="absolute inset-0 w-full h-full object-cover blur-3xl opacity-30 scale-110" referrerPolicy="no-referrer" />}
                            <div className="relative z-10 bg-slate-900/60 backdrop-blur-xl border border-white/10 p-8 rounded-[48px] shadow-2xl flex flex-col items-center text-center max-w-md animate-in zoom-in-95 mx-4">
                                <Lock size={24} className="text-amber-500 mb-4"/>
                                <h2 className="text-xl font-black text-white uppercase tracking-tighter mb-6">Contenido Premium</h2>
                                <button onClick={handlePurchase} disabled={isPurchasing} className="w-full py-4 bg-amber-500 hover:bg-amber-400 text-black font-black rounded-3xl transition-all shadow-xl active:scale-95">
                                    {isPurchasing ? 'PROCESANDO...' : `DESBLOQUEAR POR ${video?.price} $`}
                                </button>
                                <div className="mt-4 text-[10px] text-slate-500 font-bold uppercase tracking-widest">Saldo: {Number(user?.balance || 0).toFixed(2)} $</div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <div className="max-w-7xl mx-auto w-full p-4 lg:p-8 flex flex-col lg:flex-row gap-8">
                <div className="flex-1 min-w-0">
                    <h1 className="text-2xl font-black text-white mb-2 uppercase italic tracking-tighter break-words">{video?.title}</h1>
                    <div className="text-[10px] text-slate-500 font-bold uppercase mb-6">{video?.views} vistas • {new Date(video!.createdAt * 1000).toLocaleDateString()}</div>
                    
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-white/5 pb-8 mb-8">
                        <div className="flex items-center gap-4">
                            <Link to={`/channel/${video?.creatorId}`} className="w-12 h-12 rounded-2xl bg-slate-800 overflow-hidden shrink-0 border border-white/10">
                                {video?.creatorAvatarUrl || settings?.defaultAvatar ? (
                                    <img src={video?.creatorAvatarUrl || settings?.defaultAvatar} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center font-black text-white bg-indigo-600">
                                        {video?.creatorName?.[0]}
                                    </div>
                                )}
                            </Link>
                            <div className="min-w-0">
                                <Link to={`/channel/${video?.creatorId}`} className="font-black text-white hover:text-indigo-400 block truncate">@{video?.creatorName}</Link>
                                <div className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">Creador Verificado</div>
                            </div>
                            {user?.id !== video?.creatorId && (
                                <button 
                                    onClick={handleToggleSubscribe}
                                    className={`ml-2 px-6 py-2 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all active:scale-95 shrink-0 ${isSubscribed ? 'bg-slate-800 text-slate-400 border border-white/5' : 'bg-white text-black hover:bg-slate-200 shadow-lg'}`}
                                >
                                    {isSubscribed ? 'Suscrito' : 'Suscribirse'}
                                </button>
                            )}
                        </div>

                        <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide max-w-full">
                            <div className="flex bg-slate-900 rounded-2xl p-1 border border-white/5 shrink-0">
                                <button onClick={() => handleRate('like')} className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all ${interaction?.liked ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}>
                                    <Heart size={18} fill={interaction?.liked ? "currentColor" : "none"} />
                                    <span className="text-xs font-black">{likes}</span>
                                </button>
                                <div className="w-px h-6 bg-white/5 self-center"></div>
                                <button onClick={() => handleRate('dislike')} className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all ${interaction?.disliked ? 'bg-red-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}>
                                    <ThumbsDown size={18} fill={interaction?.disliked ? "currentColor" : "none"} />
                                    <span className="text-xs font-black">{dislikes}</span>
                                </button>
                            </div>

                            <button onClick={() => setRotation(prev => (prev + 90) % 360)} className="flex items-center justify-center bg-slate-900 border border-white/5 p-3.5 rounded-2xl text-slate-300 hover:text-white transition-all active:scale-95 shrink-0" title="Girar Pantalla">
                                <RotateCw size={18}/>
                            </button>

                            <button onClick={() => setShowShareModal(true)} className="flex items-center justify-center bg-slate-900 border border-white/5 p-3.5 rounded-2xl text-slate-300 hover:text-white transition-all active:scale-95 shrink-0" title="Compartir">
                                <Share2 size={18}/>
                            </button>

                            <button onClick={() => setShowComments(true)} className="flex items-center gap-2 bg-slate-900 border border-white/5 px-5 py-3 rounded-2xl text-slate-300 hover:text-white transition-all active:scale-95 shrink-0">
                                <MessageCircle size={18}/>
                                <span className="text-[10px] font-black uppercase tracking-widest">{comments.length}</span>
                            </button>

                            {(user?.deviceInfo?.includes('com.streampay.app') || user?.lastDeviceId?.includes('com.streampay.app') || user?.deviceInfo?.includes('StreamPayAPK') || user?.lastDeviceId?.includes('StreamPayAPK')) && isUnlocked && (
                                <a 
                                    href={downloadUrl}
                                    download=""
                                    className="flex items-center gap-2 bg-emerald-600 border border-white/5 px-5 py-3 rounded-2xl text-white hover:bg-emerald-500 transition-all active:scale-95 shrink-0"
                                >
                                    <Download size={18}/>
                                    <span className="text-[10px] font-black uppercase tracking-widest">Descargar</span>
                                </a>
                            )}
                        </div>
                    </div>

                    {video?.description && (
                        <div className="bg-slate-900/50 p-6 rounded-[32px] border border-white/5 text-sm text-slate-300 leading-relaxed whitespace-pre-wrap mb-8">
                            <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-3">Descripción del Contenido</h3>
                            {video.description}
                        </div>
                    )}

                    <div className="hidden lg:block">
                        <CommentSection 
                            videoId={video?.id || ''} 
                            user={user} 
                            comments={comments} 
                            onCommentAdded={(c) => setComments(prev => [c, ...prev])}
                        />
                    </div>
                </div>

                <div className="lg:w-80 space-y-4 shrink-0 overflow-hidden">
                    <div className="flex items-center justify-between px-2">
                        <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                            <Play size={12} className="text-indigo-500"/> {searchContextLabel ? 'En esta lista' : 'Recomendados'}
                        </h3>
                        {searchContextLabel && (
                            <Link to="/" className="text-[9px] font-black text-indigo-400 hover:text-white uppercase tracking-tighter flex items-center gap-1">
                                <X size={10}/> Salir de Contexto
                            </Link>
                        )}
                    </div>
                    
                    {searchContextLabel && (
                        <div className="bg-indigo-600/10 border border-indigo-500/20 p-3 rounded-2xl mb-2">
                            <div className="flex items-center gap-2 text-indigo-400 font-black text-[9px] uppercase tracking-widest">
                                <ListFilter size={12}/> Viendo resultados de:
                            </div>
                            <div className="text-xs font-bold text-white mt-1 italic line-clamp-1">"{searchContextLabel}"</div>
                        </div>
                    )}

                    <div className="space-y-4">
                        {seriesQueue.map((v, idx) => {
                            if (v.id === id) return null; 
                            
                            const isNextInQueue = seriesQueue.findIndex(sq => sq.id === video?.id) + 1 === idx;
                            const isCurrent = v.id === id;
                            
                            const params = new URLSearchParams();
                            if (navigationContext.q) params.set('q', navigationContext.q);
                            if (navigationContext.f) params.set('f', navigationContext.f);
                            if (navigationContext.c !== 'TODOS') params.set('c', navigationContext.c);
                            if (navigationContext.s) params.set('s', navigationContext.s);
                            params.set('p', String(relatedPage));
                            const contextSuffix = params.toString() ? `?${params.toString()}` : '';
                            
                            return (
                                <Link 
                                    key={v.id} 
                                    to={`/watch/${v.id}${contextSuffix}`} 
                                    className={`group flex gap-3 p-2 hover:bg-white/5 rounded-2xl transition-all relative ${isCurrent ? 'bg-indigo-500/10 border border-indigo-500/20' : isNextInQueue ? 'bg-white/5' : ''}`}
                                >
                                    <div className="w-32 aspect-video bg-slate-900 rounded-xl overflow-hidden relative border border-white/5 shrink-0">
                                        <img src={v.thumbnailUrl} className={`w-full h-full object-cover group-hover:scale-110 transition-transform ${isCurrent ? 'opacity-40' : ''}`} loading="lazy" referrerPolicy="no-referrer" />
                                        
                                        {isCurrent && (
                                            <div className="absolute inset-0 flex items-center justify-center">
                                                <div className="flex gap-1 items-end h-4">
                                                    <div className="w-1 bg-indigo-500 animate-[bounce_1s_infinite_0ms]"></div>
                                                    <div className="w-1 bg-indigo-500 animate-[bounce_1s_infinite_200ms]"></div>
                                                    <div className="w-1 bg-indigo-500 animate-[bounce_1s_infinite_400ms]"></div>
                                                </div>
                                            </div>
                                        )}

                                        {isNextInQueue && !isCurrent && (
                                            <div className="absolute inset-0 bg-indigo-600/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                                <Play size={20} className="text-white fill-current"/>
                                            </div>
                                        )}

                                        {/* Indicador de Precio/Bloqueo */}
                                        {Number(v.price) > 0 && (
                                            <div className="absolute top-1 right-1 bg-amber-500 text-black text-[7px] font-black px-1.5 py-0.5 rounded-md shadow-lg">
                                                {v.price} $
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0 py-1">
                                        <h4 className={`text-[11px] font-black line-clamp-2 uppercase leading-tight transition-colors ${isCurrent ? 'text-indigo-400' : 'text-white group-hover:text-indigo-400'}`}>{v.title}</h4>
                                        <div className="text-[9px] text-slate-500 font-bold uppercase mt-1 flex items-center gap-1">
                                            <span className="truncate">@{v.creatorName}</span>
                                            {isCurrent && <span className="text-indigo-500 ml-auto text-[7px] tracking-widest animate-pulse">REPRODUCIENDO</span>}
                                        </div>
                                    </div>
                                </Link>
                            );
                        })}
                    </div>

                    {hasMoreRelated && (
                        <button 
                            onClick={() => fetchRelated(relatedPage + 1)}
                            disabled={loadingMoreRelated}
                            className="w-full py-4 bg-slate-900 hover:bg-slate-800 text-slate-400 font-black text-[10px] uppercase tracking-widest rounded-3xl border border-slate-800 transition-all flex items-center justify-center gap-2 shadow-xl"
                        >
                            {loadingMoreRelated ? <Loader2 size={14} className="animate-spin"/> : <ChevronDown size={14}/>} 
                            {loadingMoreRelated ? 'Buscando...' : 'Cargar más contenido'}
                        </button>
                    )}
                </div>
            </div>

            {/* Mobile/Overlay Comments Drawer */}
            {showComments && (
                <div className="fixed inset-0 z-[100] flex items-end bg-black/80 backdrop-blur-sm animate-in fade-in duration-300">
                    <div className="w-full lg:max-w-md lg:absolute lg:right-0 lg:top-0 lg:h-full bg-slate-900 rounded-t-[40px] lg:rounded-none h-[80%] flex flex-col border-t lg:border-t-0 lg:border-l border-white/10 shadow-2xl animate-in slide-in-from-bottom lg:slide-in-from-right duration-500">
                        <div className="p-6 border-b border-white/5 flex justify-between items-center bg-slate-950/50">
                            <div>
                                <h3 className="font-black text-white uppercase text-xs tracking-widest flex items-center gap-2"><MessageCircle size={14}/> Comentarios</h3>
                                <p className="text-[9px] text-indigo-400 font-bold uppercase mt-0.5">{comments.length} Mensajes</p>
                            </div>
                            <button onClick={() => setShowComments(false)} className="text-slate-400 bg-slate-800 p-2.5 rounded-2xl hover:text-white transition-all"><X size={20} /></button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                            <CommentSection 
                                videoId={video?.id || ''} 
                                user={user} 
                                comments={comments} 
                                onCommentAdded={(c) => setComments(prev => [c, ...prev])}
                            />
                        </div>
                    </div>
                    <div className="hidden lg:block flex-1" onClick={() => setShowComments(false)}></div>
                </div>
            )}

            {/* Share Modal */}
            {showShareModal && video && (
                <ShareModal 
                    video={video} 
                    user={user} 
                    onClose={() => setShowShareModal(false)}
                    onShareSuccess={(targetUsername) => {
                        toast.success(`Video enviado a @${targetUsername}`);
                        setShowShareModal(false);
                    }}
                />
            )}
        </div>
    );
}