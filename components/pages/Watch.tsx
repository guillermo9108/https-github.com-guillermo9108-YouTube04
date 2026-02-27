import React, { useEffect, useState, useRef, useMemo } from 'react';
import { Video, Comment, UserInteraction, Category } from '../../types';
import { db } from '../../services/db';
import { useAuth } from '../../context/AuthContext';
import { useParams, Link, useNavigate } from '../Router';
import { 
    Loader2, Heart, ThumbsDown, MessageCircle, Lock, 
    ChevronRight, Home, Play, Info, ExternalLink, AlertTriangle, Send, CheckCircle2, Clock, Share2, X, Search, UserCheck, PlusCircle, ArrowRightCircle, Wallet, ShoppingCart, Music, ChevronDown, Bell, BellOff, ListFilter
} from 'lucide-react';
import VideoCard from '../VideoCard';
import { useToast } from '../../context/ToastContext';
import { useGrid } from '../../context/GridContext';
import { generateThumbnail } from '../../utils/videoGenerator';

const naturalCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

export default function Watch() {
    const { id } = useParams();
    const { user, refreshUser } = useAuth();
    const { setThrottled } = useGrid();
    const navigate = useNavigate();
    const toast = useToast();
    
    // Obtener contexto completo desde la URL
    const navigationContext = useMemo(() => {
        const hash = window.location.hash;
        if (!hash.includes('?')) return { q: null, f: '', c: 'TODOS', p: 0 };
        const params = new URLSearchParams(hash.split('?')[1]);
        return {
            q: params.get('q'),
            f: params.get('f') || '',
            c: params.get('c') || 'TODOS',
            p: parseInt(params.get('p') || '0')
        };
    }, [id, window.location.hash]);

    const [video, setVideo] = useState<Video | null>(null);
    const [loading, setLoading] = useState(true);
    const [isUnlocked, setIsUnlocked] = useState(false);
    const [isPurchasing, setIsPurchasing] = useState(false);
    const [interaction, setInteraction] = useState<UserInteraction | null>(null);
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
    }, [id]);

    const fetchRelated = async (p: number) => {
        if (loadingMoreRelated || (!hasMoreRelated && p !== navigationContext.p)) return;
        setLoadingMoreRelated(true);
        
        // Cargar el filtro persistente del sistema
        const mediaFilter = localStorage.getItem('sp_media_filter') || 'ALL';
        
        try {
            const res = await db.getVideos(p, 40, navigationContext.f, navigationContext.q || '', navigationContext.c, mediaFilter as any);
            const filteredResults = res.videos;
            
            if (p === navigationContext.p) {
                setRelatedVideos(filteredResults.filter(v => v.id !== id));
                setSeriesQueue(filteredResults);
            } else {
                setRelatedVideos(prev => [...prev, ...filteredResults.filter(v => v.id !== id)]);
                setSeriesQueue(prev => [...prev, ...filteredResults]);
            }
            setHasMoreRelated(res.hasMore);
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
                    setIsUnlocked(Boolean(access || isAdmin || (isVipActive && v.creatorRole === 'ADMIN') || user.id === v.creatorId));
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

    const handleVideoEnded = async () => {
        if (!video || !user) return;
        const currentIndex = seriesQueue.findIndex(v => v.id === video.id);
        let nextVid = seriesQueue[currentIndex + 1];
        
        if (!nextVid && hasMoreRelated) {
             toast.info("Cargando siguiente episodio...");
             await fetchRelated(relatedPage + 1);
             return;
        }

        if (!nextVid && !navigationContext.q && relatedVideos.length > 0) {
            nextVid = relatedVideos[0];
        }
        if (!nextVid) return;

        const isAdmin = user.role?.trim().toUpperCase() === 'ADMIN';
        const isVip = !!(user.vipExpiry && user.vipExpiry > Date.now() / 1000);
        const hasAccess = isAdmin || (isVip && nextVid.creatorRole === 'ADMIN') || user.id === nextVid.creatorId;
        
        const params = new URLSearchParams();
        if (navigationContext.q) params.set('q', navigationContext.q);
        if (navigationContext.f) params.set('f', navigationContext.f);
        if (navigationContext.c !== 'TODOS') params.set('c', navigationContext.c);
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
        // Usamos el helper de Streamer en Node.js (Puerto 3001)
        return db.getStreamerUrl(video.id);
    }, [video?.id]);

    const searchContextLabel = navigationContext.q || (navigationContext.f ? `Carpeta: ${navigationContext.f.split('/').pop()}` : null);

    if (loading) return <div className="flex justify-center p-20"><Loader2 className="animate-spin text-indigo-500" size={48}/></div>;

    return (
        <div className="flex flex-col bg-slate-950 min-h-screen animate-in fade-in relative">
            {/* Contenedor de Video Pegajoso - Mejorado para móviles */}
            <div className="w-full bg-black sticky top-0 z-[45] shadow-2xl border-b border-white/5 overflow-hidden">
                <div className="relative aspect-video w-full max-w-[1400px] mx-auto bg-black overflow-hidden group">
                    {isUnlocked ? (
                        <div className={`relative z-10 w-full h-full flex flex-col items-center justify-center ${video?.is_audio ? 'bg-slate-900/40 backdrop-blur-md' : ''}`}>
                            {video?.is_audio && video?.thumbnailUrl && !video.thumbnailUrl.includes('default.jpg') && (
                                <img src={video.thumbnailUrl} className="absolute inset-0 w-full h-full object-cover blur-3xl opacity-30 scale-110" />
                            )}
                            <video 
                                ref={videoRef} 
                                src={streamUrl} 
                                controls 
                                autoPlay 
                                poster={video?.thumbnailUrl} 
                                className="w-full h-full object-contain" 
                                onEnded={handleVideoEnded} 
                                crossOrigin="anonymous" 
                                onPlay={() => setThrottled(true)} 
                                onPause={() => setThrottled(false)}
                                onTimeUpdate={handleTimeUpdate}
                            />
                        </div>
                    ) : (
                        <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
                            {video && <img src={video.thumbnailUrl} className="absolute inset-0 w-full h-full object-cover blur-3xl opacity-30 scale-110"/>}
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
                                {video?.creatorAvatarUrl ? <img src={video.creatorAvatarUrl} className="w-full h-full object-cover"/> : <div className="w-full h-full flex items-center justify-center font-black text-white bg-indigo-600">{video?.creatorName?.[0]}</div>}
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

                            <button onClick={() => setShowShareModal(true)} className="flex items-center justify-center bg-slate-900 border border-white/5 p-3.5 rounded-2xl text-slate-300 hover:text-white transition-all active:scale-95 shrink-0" title="Compartir">
                                <Share2 size={18}/>
                            </button>

                            <button onClick={() => setShowComments(true)} className="flex items-center gap-2 bg-slate-900 border border-white/5 px-5 py-3 rounded-2xl text-slate-300 hover:text-white transition-all active:scale-95 shrink-0">
                                <MessageCircle size={18}/>
                                <span className="text-[10px] font-black uppercase tracking-widest">{comments.length}</span>
                            </button>
                        </div>
                    </div>

                    {video?.description && (
                        <div className="bg-slate-900/50 p-6 rounded-[32px] border border-white/5 text-sm text-slate-300 leading-relaxed whitespace-pre-wrap mb-8">
                            <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-3">Descripción del Contenido</h3>
                            {video.description}
                        </div>
                    )}

                    <div className="hidden lg:block">
                        <div className="flex items-center gap-3 mb-6">
                            <MessageCircle size={20} className="text-indigo-400"/>
                            <h3 className="text-sm font-black text-white uppercase tracking-widest">Conversación ({comments.length})</h3>
                        </div>
                        <form onSubmit={handleAddComment} className="flex gap-4 mb-8">
                            <div className="w-10 h-10 rounded-full bg-slate-800 shrink-0 overflow-hidden">
                                {user?.avatarUrl ? <img src={user.avatarUrl} className="w-full h-full object-cover"/> : <div className="w-full h-full flex items-center justify-center font-black text-white bg-indigo-600">{user?.username?.[0]}</div>}
                            </div>
                            <div className="flex-1 flex gap-2">
                                <input type="text" value={newComment} onChange={e => setNewComment(e.target.value)} placeholder="Escribe un comentario público..." className="flex-1 bg-transparent border-b border-white/10 focus:border-indigo-500 outline-none text-sm text-white py-2 transition-all" />
                                <button type="submit" disabled={!newComment.trim() || isSubmitting} className="p-3 bg-indigo-600 text-white rounded-2xl disabled:opacity-30 active:scale-90 transition-all shadow-lg"><Send size={18}/></button>
                            </div>
                        </form>
                        <div className="space-y-6">
                            {comments.map(c => (
                                <div key={c.id} className="flex gap-4 group">
                                    <div className="w-10 h-10 rounded-full bg-slate-800 shrink-0 overflow-hidden">
                                        {c.userAvatarUrl ? <img src={c.userAvatarUrl} className="w-full h-full object-cover"/> : <div className="w-full h-full flex items-center justify-center text-xs font-bold text-slate-500">{c.username?.[0]}</div>}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="text-xs font-black text-slate-200">@{c.username}</span>
                                            <span className="text-[9px] text-slate-600 font-bold uppercase">{new Date(c.timestamp * 1000).toLocaleDateString()}</span>
                                        </div>
                                        <p className="text-sm text-slate-400 leading-relaxed">{c.text}</p>
                                    </div>
                                </div>
                            ))}
                            {comments.length === 0 && <p className="text-center py-10 text-slate-600 italic text-xs">Sé el primero en comentar...</p>}
                        </div>
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
                            
                            const params = new URLSearchParams();
                            if (navigationContext.q) params.set('q', navigationContext.q);
                            if (navigationContext.f) params.set('f', navigationContext.f);
                            if (navigationContext.c !== 'TODOS') params.set('c', navigationContext.c);
                            params.set('p', String(relatedPage));
                            const contextSuffix = params.toString() ? `?${params.toString()}` : '';
                            
                            return (
                                <Link key={v.id} to={`/watch/${v.id}${contextSuffix}`} className={`group flex gap-3 p-2 hover:bg-white/5 rounded-2xl transition-all ${isNextInQueue ? 'bg-indigo-500/[0.03] border border-indigo-500/10' : ''}`}>
                                    <div className="w-32 aspect-video bg-slate-900 rounded-xl overflow-hidden relative border border-white/5 shrink-0">
                                        <img src={v.thumbnailUrl} className="w-full h-full object-cover group-hover:scale-110 transition-transform" loading="lazy" />
                                        {isNextInQueue && (
                                            <div className="absolute inset-0 bg-indigo-600/30 flex items-center justify-center animate-in fade-in">
                                                <div className="flex flex-col items-center">
                                                    <Play size={20} className="text-white fill-current"/>
                                                    <span className="text-[8px] font-black text-white uppercase mt-1">Siguiente</span>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0 py-1">
                                        <h4 className="text-[11px] font-black text-white line-clamp-2 uppercase leading-tight group-hover:text-indigo-400 transition-colors">{v.title}</h4>
                                        <div className="text-[9px] text-slate-500 font-bold uppercase mt-1">@{v.creatorName}</div>
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
                        <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
                            {comments.map(c => (
                                <div key={c.id} className="flex gap-4 animate-in fade-in slide-in-from-bottom-2">
                                    <div className="w-10 h-10 rounded-2xl bg-slate-800 shrink-0 border border-white/5 overflow-hidden">
                                        {c.userAvatarUrl ? <img src={c.userAvatarUrl} className="w-full h-full object-cover"/> : <div className="w-full h-full flex items-center justify-center text-xs font-bold text-slate-400">{c.username?.[0]}</div>}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-baseline justify-between gap-2 mb-1">
                                            <span className="text-xs font-black text-slate-200">@{c.username}</span>
                                            <span className="text-[8px] text-slate-600 uppercase font-bold">{new Date(c.timestamp * 1000).toLocaleDateString()}</span>
                                        </div>
                                        <p className="text-sm text-slate-400 leading-snug">{c.text}</p>
                                    </div>
                                </div>
                            ))}
                            {comments.length === 0 && <p className="text-center py-20 text-slate-600 italic uppercase text-[9px] font-bold tracking-widest">Sin comentarios aún</p>}
                        </div>
                        <form onSubmit={handleAddComment} className="p-6 bg-slate-950 border-t border-white/5 flex gap-3 pb-safe">
                            <input type="text" value={newComment} onChange={e => setNewComment(e.target.value)} className="flex-1 bg-slate-900 border border-white/10 rounded-2xl px-5 py-3.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-all shadow-inner" placeholder="Escribe un comentario..." />
                            <button type="submit" disabled={!newComment.trim() || isSubmitting} className="bg-indigo-600 text-white w-12 h-12 rounded-2xl flex items-center justify-center disabled:opacity-30 shadow-xl active:scale-90 transition-all">
                                {isSubmitting ? <Loader2 className="animate-spin" size={18}/> : <Send size={20} />}
                            </button>
                        </form>
                    </div>
                    <div className="hidden lg:block flex-1" onClick={() => setShowComments(false)}></div>
                </div>
            )}

            {/* Share Modal */}
            {showShareModal && (
                <div className="fixed inset-0 z-[200] bg-black/90 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in">
                    <div className="bg-slate-900 border border-white/10 rounded-[40px] w-full max-w-md overflow-hidden shadow-2xl animate-in zoom-in-95">
                        <div className="p-8 bg-slate-950 border-b border-white/5 flex justify-between items-center">
                            <div>
                                <h3 className="font-black text-white uppercase tracking-widest text-sm flex items-center gap-2"><Share2 size={18} className="text-indigo-400"/> Compartir Video</h3>
                                <p className="text-[10px] text-slate-500 font-bold uppercase mt-1">Recomendar a un amigo</p>
                            </div>
                            <button onClick={() => { setShowShareModal(false); setShareSearch(''); setShareSuggestions([]); }} className="p-2.5 bg-slate-800 text-slate-500 hover:text-white rounded-2xl transition-all"><X/></button>
                        </div>
                        <div className="p-8 space-y-6">
                            <div className="relative">
                                <Search className="absolute left-4 top-4 text-slate-500" size={18}/>
                                <input 
                                    type="text" value={shareSearch} onChange={e => handleShareSearch(e.target.value)}
                                    placeholder="Buscar por @nombre_usuario..."
                                    className="w-full bg-slate-950 border border-white/5 rounded-[24px] pl-12 pr-4 py-4 text-white focus:border-indigo-500 outline-none transition-all shadow-inner font-bold"
                                />
                            </div>
                            
                            <div className="space-y-2 max-h-64 overflow-y-auto custom-scrollbar pr-2">
                                {shareSuggestions.map(s => (
                                    <button 
                                        key={s.username} 
                                        onClick={() => sendVideoToUser(s.username)}
                                        className="w-full p-4 flex items-center gap-4 hover:bg-indigo-600 rounded-[24px] transition-all group active:scale-95"
                                    >
                                        <div className="w-12 h-12 rounded-2xl overflow-hidden bg-slate-800 shrink-0 border border-white/5 shadow-lg">
                                            {s.avatarUrl ? <img src={s.avatarUrl} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-sm font-black text-white bg-slate-700">{s.username?.[0]}</div>}
                                        </div>
                                        <div className="text-left flex-1 min-w-0">
                                            <span className="text-sm font-black text-white group-hover:text-white block truncate">@{s.username}</span>
                                            <span className="text-[9px] text-slate-500 group-hover:text-indigo-200 uppercase font-black tracking-widest">Enviar instantáneo</span>
                                        </div>
                                        <ArrowRightCircle size={20} className="text-white opacity-0 group-hover:opacity-100 transition-opacity"/>
                                    </button>
                                ))}
                                {shareSearch.length >= 2 && shareSuggestions.length === 0 && (
                                    <p className="text-center py-10 text-slate-600 font-bold uppercase text-[9px] tracking-widest">No se encontraron usuarios</p>
                                )}
                                {shareSearch.length < 2 && (
                                    <div className="flex flex-col items-center justify-center py-10 text-slate-700">
                                        <Search size={40} className="mb-3 opacity-20"/>
                                        <p className="text-[9px] font-black uppercase tracking-[0.2em] text-center">Escribe el nombre del destinatario</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}