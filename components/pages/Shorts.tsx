
import React, { useEffect, useState, useRef, useMemo } from 'react';
import { Heart, MessageCircle, Share2, ThumbsDown, Send, X, Loader2, ArrowLeft, Pause, Search, UserCheck, VideoOff, Crown, RefreshCw } from 'lucide-react';
import { db } from '../../services/db';
import { Video, Comment, UserInteraction } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { Link } from '../Router';
import { useToast } from '../../context/ToastContext';
import { getThumbnailUrl } from '../../utils/image';
import ShareModal from '../ShareModal';

interface ShortItemProps {
  video: Video;
  isActive: boolean;
  isNear: boolean;
  onOpenShare: (v: Video) => void;
  onInteraction?: (videoId: string, type: 'LIKE' | 'DISLIKE' | 'WATCHED' | 'QUICK_SKIP') => void;
}

const ShortItem = ({ video, isActive, isNear, onOpenShare, onInteraction }: ShortItemProps) => {
  const { user } = useAuth();
  const videoRef = useRef<HTMLVideoElement>(null);
  const clickTimerRef = useRef<number | null>(null);
  const loadTimeoutRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const wasInteractedRef = useRef<boolean>(false);
  
  const [showHeart, setShowHeart] = useState(false);
  const [paused, setPaused] = useState(false);
  const [shouldLoadVideo, setShouldLoadVideo] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  
  const [interaction, setInteraction] = useState<UserInteraction | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [showComments, setShowComments] = useState(false);
  const [newComment, setNewComment] = useState('');
  
  const [likeCount, setLikeCount] = useState(Number(video.likes || 0));
  const [dislikeCount, setDislikeCount] = useState(Number(video.dislikes || 0));
  const [dataLoaded, setDataLoaded] = useState(false);

  useEffect(() => {
    setLikeCount(Number(video.likes || 0));
    setDislikeCount(Number(video.dislikes || 0));
    
    if (user && isNear && !dataLoaded) {
      db.getInteraction(user.id, video.id).then(setInteraction);
      db.getComments(video.id).then(setComments);
      setDataLoaded(true);
    }
  }, [user, video.id, isNear, video.likes, video.dislikes]);

  useEffect(() => {
    const el = videoRef.current;
    if (isActive) {
        startTimeRef.current = Date.now();
        wasInteractedRef.current = false;
        // Delay video loading to optimize fast scrolling
        if (loadTimeoutRef.current) clearTimeout(loadTimeoutRef.current);
        loadTimeoutRef.current = window.setTimeout(() => {
            setShouldLoadVideo(true);
        }, 1200); // Increased delay to 1.2s for better scroll experience
    } else {
        if (loadTimeoutRef.current) clearTimeout(loadTimeoutRef.current);
        setShouldLoadVideo(false);
        setIsPlaying(false);
        if (el) {
            try {
                const playTime = (Date.now() - startTimeRef.current) / 1000;
                // Si se pasó rápido (< 5s) y no hubo interacción positiva
                if (!wasInteractedRef.current && playTime < 5 && onInteraction) {
                    onInteraction(video.id, 'QUICK_SKIP');
                }

                el.pause(); 
                if (user && !interaction?.isWatched) {
                    db.markSkipped(user.id, video.id);
                }
                if (!isNear) {
                    el.removeAttribute('src');
                    el.load();
                }
            } catch (e) {}
        }
    }
    return () => {
        if (loadTimeoutRef.current) clearTimeout(loadTimeoutRef.current);
    };
  }, [isActive, video.id, isNear, user, interaction?.isWatched]);

  // Preload thumbnail for "near" videos
  useEffect(() => {
    if (isNear && video.thumbnailUrl) {
      const img = new Image();
      img.src = getThumbnailUrl(video.thumbnailUrl) || '';
    }
  }, [isNear, video.thumbnailUrl]);

  useEffect(() => {
    const el = videoRef.current;
    if (isActive && shouldLoadVideo && el) {
        el.currentTime = 0; 
        setPaused(false);
        setIsPlaying(false);
        el.muted = false; 
        el.play().then(() => {
            setIsPlaying(true);
        }).catch(() => {
            el.muted = true;
            el.play().then(() => {
                setIsPlaying(true);
            }).catch(() => {});
        });
        db.incrementView(video.id);
    }
  }, [isActive, shouldLoadVideo]);

  const handleTimeUpdate = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const el = e.currentTarget;
    if (el.duration > 0) {
      const progress = el.currentTime / el.duration;
      if (progress >= 0.95 && !interaction?.isWatched && user) {
        wasInteractedRef.current = true;
        db.markWatched(user.id, video.id).then(() => {
          setInteraction(prev => prev ? { ...prev, isWatched: true, isSkipped: false } : { isWatched: true, liked: false, disliked: false, isSkipped: false });
          if (onInteraction) onInteraction(video.id, 'WATCHED');
        });
      }
    }
  };

  const handleRate = async (rating: 'like' | 'dislike') => {
    if (!user) return;
    try {
        wasInteractedRef.current = true;
        const res = await db.rateVideo(user.id, video.id, rating);
        setInteraction(res); 
        if (res.newLikeCount !== undefined) setLikeCount(res.newLikeCount);
        if (res.newDislikeCount !== undefined) setDislikeCount(res.newDislikeCount);
        if (onInteraction) onInteraction(video.id, rating === 'like' ? 'LIKE' : 'DISLIKE');
    } catch(e) {}
  };

  const handleScreenTouch = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (clickTimerRef.current) {
        clearTimeout(clickTimerRef.current); clickTimerRef.current = null;
        handleRate('like'); setShowHeart(true); setTimeout(() => setShowHeart(false), 800);
    } else {
        clickTimerRef.current = window.setTimeout(() => {
            clickTimerRef.current = null;
            if (videoRef.current) {
                if (videoRef.current.paused) { 
                    videoRef.current.play().catch(() => {}); 
                    setPaused(false); 
                } else { 
                    videoRef.current.pause(); 
                    setPaused(true); 
                }
            }
        }, 250);
    }
  };

  const videoSrc = useMemo(() => {
    if (!isNear || !shouldLoadVideo) return ""; 
    // Redirigir al puerto 3001 del streamer en Node.js
    return db.getStreamerUrl(video.id, user?.sessionToken);
  }, [video.id, isNear, user?.sessionToken, shouldLoadVideo]);

  if (!isNear) return <div className="w-full h-full snap-start bg-black shrink-0 flex items-center justify-center"><Loader2 className="animate-spin text-slate-800" /></div>;

  return (
    <div className="relative w-full h-[100dvh] md:h-full snap-start snap-always shrink-0 flex items-center justify-center bg-black overflow-hidden">
      <div className="absolute inset-0 z-0 bg-black" onClick={handleScreenTouch}>
        {(!videoSrc || !shouldLoadVideo) && (
            <img 
              src={getThumbnailUrl(video.thumbnailUrl) || ''} 
              className="w-full h-full object-cover opacity-60" 
              referrerPolicy="no-referrer" 
            />
        )}
        {videoSrc && (
            <video
                ref={videoRef} src={videoSrc} poster={getThumbnailUrl(video.thumbnailUrl) || ''}
                className="w-full h-full object-cover" loop playsInline preload="metadata" crossOrigin="anonymous"
                onTimeUpdate={handleTimeUpdate}
                onPlaying={() => setIsPlaying(true)}
                onWaiting={() => setIsPlaying(false)}
            />
        )}
        {isActive && shouldLoadVideo && !isPlaying && (
            <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
                <div className="relative">
                    <div className="w-16 h-16 rounded-full border-4 border-emerald-500/20 border-t-emerald-500 animate-spin shadow-[0_0_15px_rgba(16,185,129,0.5)]"></div>
                    <div className="absolute inset-0 rounded-full bg-emerald-500/10 blur-xl animate-pulse"></div>
                </div>
            </div>
        )}
        {paused && <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-white/50"><Pause size={64} fill="currentColor" /></div>}
        {showHeart && <div className="absolute inset-0 flex items-center justify-center pointer-events-none animate-in zoom-in fade-in duration-300"><Heart size={120} className="text-red-500 fill-red-500 drop-shadow-2xl" /></div>}
      </div>
      <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/80 pointer-events-none z-10" />
      
      <div className="absolute right-2 bottom-24 z-30 flex flex-col items-center gap-4 pb-safe">
        <div className="flex flex-col items-center">
          <button onClick={(e) => { e.stopPropagation(); handleRate('like'); }} className={`w-11 h-11 rounded-full flex items-center justify-center backdrop-blur-md bg-black/30 transition-colors ${interaction?.liked ? 'text-[var(--accent)]' : 'text-white'}`}>
             <Heart size={24} fill={interaction?.liked ? "currentColor" : "none"} />
          </button>
          <span className="text-[11px] font-bold text-white drop-shadow-md mt-1">{likeCount}</span>
        </div>

        <div className="flex flex-col items-center">
          <button onClick={(e) => { e.stopPropagation(); handleRate('dislike'); }} className={`w-11 h-11 rounded-full flex items-center justify-center backdrop-blur-md bg-black/30 transition-colors ${interaction?.disliked ? 'text-red-500' : 'text-white'}`}>
             <ThumbsDown size={24} fill={interaction?.disliked ? "currentColor" : "none"} />
          </button>
          <span className="text-[11px] font-bold text-white drop-shadow-md mt-1">{dislikeCount > 0 ? dislikeCount : '0'}</span>
        </div>

        <div className="flex flex-col items-center">
          <button onClick={(e) => { e.stopPropagation(); setShowComments(true); }} className="w-11 h-11 rounded-full flex items-center justify-center backdrop-blur-md bg-black/30 text-white">
             <MessageCircle size={24} />
          </button>
          <span className="text-[11px] font-bold text-white drop-shadow-md mt-1">{comments.length}</span>
        </div>

        <button onClick={(e) => { e.stopPropagation(); onOpenShare(video); }} className="w-11 h-11 rounded-full flex items-center justify-center backdrop-blur-md bg-black/30 text-white">
            <Share2 size={24} />
        </button>
      </div>

      <div className="absolute bottom-8 left-3 right-16 z-30 text-white flex flex-col gap-2 pointer-events-none pb-safe">
         <div className="flex items-center gap-2 pointer-events-auto">
            <Link to={`/channel/${video.creatorId}`} className="relative shrink-0">
                <div className="w-10 h-10 rounded-full border border-white/50 overflow-hidden bg-slate-800">
                    {video.creatorAvatarUrl ? <img src={getThumbnailUrl(video.creatorAvatarUrl) || ''} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center font-bold text-white bg-[var(--accent)]">{video.creatorName?.[0] || '?'}</div>}
                </div>
            </Link>
            <div className="min-w-0">
                <Link to={`/channel/${video.creatorId}`} className="font-bold text-sm drop-shadow-md hover:underline truncate block">@{video.creatorName || 'Usuario'}</Link>
                <button className="bg-white/20 backdrop-blur-md px-2 py-0.5 rounded text-[9px] font-bold uppercase text-white">Seguir</button>
            </div>
         </div>
         <div className="pointer-events-auto">
            <h2 className="text-sm font-bold leading-tight mb-1 drop-shadow-md">{video.title}</h2>
            <p className="text-xs text-slate-200 line-clamp-2 opacity-90 drop-shadow-sm">{video.description}</p>
         </div>
      </div>

      {showComments && (
        <div className="fixed inset-0 z-[100] flex items-end bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
           <div className="w-full bg-[var(--bg-secondary)] rounded-t-xl h-[70%] flex flex-col border-t border-[var(--divider)] shadow-2xl animate-in slide-in-from-bottom" onClick={(e) => e.stopPropagation()}>
              <div className="p-4 border-b border-[var(--divider)] flex justify-between items-center">
                <h3 className="font-bold text-[var(--text-primary)] text-sm">Comentarios ({comments.length})</h3>
                <button onClick={() => setShowComments(false)} className="text-[var(--text-secondary)] bg-[var(--bg-tertiary)] p-1.5 rounded-full"><X size={20} /></button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                 {comments.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 opacity-50">
                        <MessageCircle size={40} className="text-[var(--text-secondary)] mb-2" />
                        <p className="text-sm font-bold text-[var(--text-secondary)]">No hay comentarios aún</p>
                    </div>
                 ) : comments.map(c => (
                      <div key={c.id} className="flex gap-3">
                         <div className="w-8 h-8 rounded-full bg-[var(--bg-tertiary)] shrink-0 border border-[var(--divider)] overflow-hidden">
                            {c.userAvatarUrl ? <img src={c.userAvatarUrl} className="w-full h-full object-cover"/> : <div className="w-full h-full flex items-center justify-center text-xs font-bold text-[var(--text-secondary)]">{c?.username?.[0] || '?'}</div>}
                         </div>
                         <div className="flex-1">
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-[var(--text-primary)]">@{c.username || 'Anónimo'}</span>
                                <span className="text-[10px] text-[var(--text-secondary)]">{new Date(c.timestamp * 1000).toLocaleDateString()}</span>
                            </div>
                            <p className="text-sm text-[var(--text-primary)] mt-0.5 leading-snug">{c.text}</p>
                         </div>
                      </div>
                 ))}
              </div>
              <form onSubmit={async (e) => { 
                  e.preventDefault(); 
                  if(!newComment.trim()) return; 
                  try {
                    const c = await db.addComment(user!.id, video.id, newComment); 
                    if (c) setComments(p => [c, ...p]); 
                    setNewComment(''); 
                  } catch(err) {}
              }} className="p-4 bg-[var(--bg-secondary)] border-t border-[var(--divider)] flex gap-2 pb-safe">
                <input type="text" value={newComment} onChange={e => setNewComment(e.target.value)} className="flex-1 bg-[var(--bg-tertiary)] border border-[var(--divider)] rounded-md px-4 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] transition-all" placeholder="Escribe un comentario..." />
                <button type="submit" disabled={!newComment.trim()} className="bg-[var(--accent)] text-white w-9 h-9 rounded-md flex items-center justify-center disabled:opacity-30 transition-all"><Send size={18} /></button>
              </form>
           </div>
           <div className="absolute inset-0 -z-10" onClick={() => setShowComments(false)}></div>
        </div>
      )}
    </div>
  );
};

export default function Shorts() {
  const { user, isOffline } = useAuth();
  const toast = useToast();
  
  const isVip = user?.role === 'ADMIN' || (user?.vipExpiry && user.vipExpiry > Date.now() / 1000);

  const [videos, setVideos] = useState<Video[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [isUnseenMode, setIsUnseenMode] = useState(true);
  const loadedVideoIds = useRef<Set<string>>(new Set());
  const sessionSeed = useMemo(() => Math.random().toString(36).substring(7), []);
  
  // Lógica de recomendación por carpeta
  const [currentFolder, setCurrentFolder] = useState<string | null>(null);
  const [consecutiveNegatives, setConsecutiveNegatives] = useState(0);
  const [shortsPath, setShortsPath] = useState<string>('');

  const containerRef = useRef<HTMLDivElement>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const [videoToShare, setVideoToShare] = useState<Video | null>(null);

  if (!isVip) {
    return (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-6 bg-black/90 backdrop-blur-xl">
            <div className="bg-slate-900 border border-white/10 rounded-[40px] w-full max-w-sm p-8 text-center shadow-2xl animate-in zoom-in-95 duration-300">
                <div className="w-20 h-20 bg-indigo-600/20 rounded-full flex items-center justify-center mx-auto mb-6 border border-indigo-500/30">
                    <Crown className="text-indigo-500" size={40} />
                </div>
                <h2 className="text-2xl font-black text-white uppercase italic mb-3 tracking-tighter">Acceso VIP Requerido</h2>
                <p className="text-slate-400 text-sm mb-8 leading-relaxed">
                    La sección de Shorts es exclusiva para miembros VIP. Suscríbete para obtener acceso total a todo el contenido corto de la plataforma.
                </p>
                <div className="flex flex-col gap-3">
                    <Link to="/vip" className="bg-indigo-600 text-white w-full py-4 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-indigo-500 transition-all shadow-lg shadow-indigo-600/20 active:scale-95">
                        Ver Planes VIP
                    </Link>
                    <Link to="/" className="w-full py-3 text-slate-500 text-[10px] font-black uppercase tracking-widest hover:text-white transition-all">
                        Volver al Inicio
                    </Link>
                </div>
            </div>
        </div>
    );
  }

  const getFolder = (video: Video) => {
    const path = (video as any).rawPath || video.videoUrl || '';
    const parts = path.split(/[\\/]/).filter(Boolean);
    if (parts.length > 1) return parts[parts.length - 2];
    return 'ROOT';
  };

  const handleInteraction = (videoId: string, type: 'LIKE' | 'DISLIKE' | 'WATCHED' | 'QUICK_SKIP') => {
    if (!isUnseenMode || isContextMode) return; // No reordenar si venimos de un grid o estamos en modo "visto"

    const video = videos.find(v => v.id === videoId);
    if (!video) return;

    const folder = getFolder(video);
    const isPositive = type === 'LIKE' || type === 'WATCHED';
    const isNegative = type === 'DISLIKE' || type === 'QUICK_SKIP';

    if (isPositive) {
        setCurrentFolder(folder);
        setConsecutiveNegatives(0);
        // Reordenar la cola para poner videos de esta carpeta a continuación
        reorderQueue(folder, true);
    } else if (isNegative) {
        if (currentFolder === folder) {
            const newNegs = consecutiveNegatives + 1;
            setConsecutiveNegatives(newNegs);
            if (newNegs >= 2) {
                setCurrentFolder(null);
                setConsecutiveNegatives(0);
                reorderQueue(folder, false); // Alejar esta carpeta
            } else {
                // Mantener carpeta por una vez más
                reorderQueue(folder, true);
            }
        } else {
            setCurrentFolder(folder);
            setConsecutiveNegatives(1);
            reorderQueue(folder, true);
        }
    }
  };

  const reorderQueue = (folder: string, prioritize: boolean) => {
    setVideos(prev => {
        const currentBatch = [...prev];
        const nextVideos = currentBatch.slice(activeIndex + 1);
        const playedVideos = currentBatch.slice(0, activeIndex + 1);

        let matching = nextVideos.filter(v => getFolder(v) === folder);
        let others = nextVideos.filter(v => getFolder(v) !== folder);

        if (prioritize) {
            // Si no hay suficientes en la cola actual, fetchShorts se encargará al llegar al final
            // pero aquí movemos los que tengamos
            return [...playedVideos, ...matching, ...others];
        } else {
            // Alejar los de esta carpeta
            return [...playedVideos, ...others, ...matching];
        }
    });
  };

  const fetchShorts = async (p: number, forceAll: boolean = false, retryCount: number = 0) => {
    if (loading || (!hasMore && p !== 0 && !forceAll)) return;
    if (retryCount > 5) {
        setHasMore(false);
        setLoading(false);
        return;
    }
    
    setLoading(true);
    
    const currentMode = forceAll ? false : isUnseenMode;
    
    try {
        // Si tenemos una carpeta activa y estamos en modo positivo, intentamos traer de esa carpeta
        const folderToFetch = (currentMode && currentFolder) ? currentFolder : '';
        const res = await db.getShorts(p, 40, 'VIDEO', '', user?.id || '', sessionSeed, currentMode, folderToFetch);
        
        const shortsOnly = res.videos.filter(v => {
            if (!v || loadedVideoIds.current.has(v.id)) return false;
            const path = (v as any).rawPath || v.videoUrl || '';
            const isImage = v.category === 'IMAGES' || path.match(/\.(jpg|jpeg|png|webp|gif|bmp|svg)(\?.*)?$/i);
            const isAudio = Number(v.is_audio) === 1;
            const duration = Number(v.duration || 0);
            
            // Si viene de la ruta de shorts, lo permitimos siempre (duration 0 suele ser que aún no se procesó)
            const isFromShortsPath = shortsPath && path.replace(/\\/g, '/').includes(shortsPath.replace(/\\/g, '/'));
            
            // Permitir videos PENDING para que aparezcan aunque no tengan miniatura aún
            const isPending = v.category === 'PENDING';
            
            return !isImage && !isAudio && (duration < 600 || duration === 0 || isFromShortsPath || isPending);
        });
        
        if (shortsOnly.length > 0) {
            shortsOnly.forEach(v => loadedVideoIds.current.add(v.id));
            setVideos(prev => {
                const newBatch = shortsOnly;
                if (p === 0 && !prev.length) return diversifyBatch(newBatch, []);
                return [...prev, ...diversifyBatch(newBatch, prev)];
            });
            setHasMore(res.hasMore);
            setPage(p);
        } else if (res.hasMore) {
            // If we filtered everything out but there's more, fetch next page automatically with a limit
            setLoading(false);
            fetchShorts(p + 1, forceAll, retryCount + 1);
            return;
        } else if (currentMode) {
            // Si estábamos buscando en una carpeta y se agotó, intentamos modo general
            if (currentFolder) {
                setCurrentFolder(null);
                setLoading(false);
                fetchShorts(p, forceAll, 0);
                return;
            }
            // No more unseen videos, switch to ALL mode
            setIsUnseenMode(false);
            setLoading(false);
            fetchShorts(0, true, 0);
            return;
        } else {
            setHasMore(false);
        }
    } catch (e) {
        console.error("Fetch shorts error:", e);
        if (!isOffline) {
            toast.error("Error al cargar shorts");
        }
    } finally {
        setLoading(false);
    }
  };

  // Función para evitar que aparezcan videos del mismo creador consecutivamente
  const diversifyBatch = (batch: Video[], existing: Video[]) => {
    if (batch.length <= 1) return batch;
    const result: Video[] = [];
    const pool = [...batch];
    let lastId = existing.length > 0 ? existing[existing.length - 1].creatorId : null;

    while (pool.length > 0) {
      let index = pool.findIndex(v => v.creatorId !== lastId);
      if (index === -1) index = 0; // Si no hay opción, tomamos el siguiente
      const [v] = pool.splice(index, 1);
      result.push(v);
      lastId = v.creatorId;
    }
    return result;
  };
  
  const [isContextMode, setIsContextMode] = useState(false);

  useEffect(() => {
    const hash = window.location.hash || '';
    const parts = hash.split('?');
    const params = new URLSearchParams(parts.length > 1 ? parts[1] : '');
    const initialId = params.get('id');
    const fromGrid = params.get('from') === 'grid';

    const init = async () => {
        const s = await db.getSystemSettings();
        if (s && s.shortsPath) setShortsPath(s.shortsPath);

        if (fromGrid && initialId) {
            const queueRaw = sessionStorage.getItem('shorts_context_queue');
            if (queueRaw) {
                try {
                    const queue = JSON.parse(queueRaw) as Video[];
                    const startIndex = queue.findIndex(v => v.id === initialId);
                    if (startIndex !== -1) {
                        const remaining = queue.slice(startIndex);
                        setVideos(remaining);
                        remaining.forEach(v => loadedVideoIds.current.add(v.id));
                        setIsContextMode(true);
                        // No necesitamos cargar más inmediatamente si el grid ya nos dio una lista
                        if (remaining.length < 5) {
                            fetchShorts(0);
                        } else {
                            setLoading(false);
                            setHasMore(true);
                        }
                        return;
                    }
                } catch (e) {
                    console.error("Error parsing context queue", e);
                }
            }
        }

        if (initialId && !loadedVideoIds.current.has(initialId)) {
            try {
                const video = await db.getVideo(initialId);
                if (video) {
                    setVideos([video]);
                    loadedVideoIds.current.add(video.id);
                    setCurrentFolder(getFolder(video));
                    fetchShorts(0);
                    return;
                }
            } catch (e) {
                console.error("Error loading initial short:", e);
            }
        }
        fetchShorts(0);
    };

    init();
  }, [isUnseenMode, user?.id]);

  useEffect(() => {
    const container = containerRef.current; if (!container || videos.length === 0) return;
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const index = Number((entry.target as HTMLElement).dataset.index);
                if (!isNaN(index)) setActiveIndex(index);
                
                // Lógica de "Load More" cuando el usuario llega al penúltimo Short
                if (index === videos.length - 2 && hasMore && !loading) {
                    fetchShorts(page + 1);
                }
            }
        });
    }, { root: container, threshold: 0.6 });
    Array.from(container.children).forEach((c) => observer.observe(c as Element));
    return () => observer.disconnect();
  }, [videos, page, hasMore, loading]);

  return (
    <div ref={containerRef} className="w-full h-full overflow-y-scroll snap-y snap-mandatory bg-black scrollbar-hide relative">
      <div className="fixed top-0 mt-safe left-4 pt-4 z-50 flex items-center gap-2">
          <Link to="/" className="p-3 bg-black/40 backdrop-blur-md rounded-full text-white flex items-center justify-center active:scale-90 transition-all"><ArrowLeft size={24} /></Link>
          <div className="bg-black/40 backdrop-blur-md px-4 py-2 rounded-full text-white font-black italic text-sm tracking-tighter">SHORTS</div>
      </div>

      <div className="fixed top-0 mt-safe right-4 pt-4 z-50 flex items-center gap-2">
          <button 
              onClick={() => {
                  setVideos([]);
                  setPage(0);
                  loadedVideoIds.current.clear();
                  fetchShorts(0, false, 0);
              }}
              className="p-3 bg-black/40 backdrop-blur-md rounded-full text-white flex items-center justify-center active:scale-90 transition-all"
              title="Refrescar"
          >
              <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
          </button>
          
          {user?.role === 'ADMIN' && (
              <button 
                  onClick={async () => {
                      try {
                          await db.scanLocalLibrary('');
                          toast.success('Escaneo iniciado en segundo plano');
                      } catch (e) {
                          toast.error('Error al iniciar escaneo');
                      }
                  }}
                  className="p-3 bg-indigo-600/40 backdrop-blur-md rounded-full text-white flex items-center justify-center active:scale-90 transition-all"
                  title="Escanear NAS"
              >
                  <Search size={20} />
              </button>
          )}
      </div>
      
      {loading && videos.length === 0 ? (
          <div className="w-full h-full flex flex-col items-center justify-center text-slate-500 gap-4"><Loader2 className="animate-spin text-indigo-500" size={32}/><p className="font-black uppercase text-[10px] tracking-widest italic opacity-50">Sintonizando...</p></div>
      ) : videos.length === 0 ? (
          <div className="w-full h-full flex flex-col items-center justify-center text-slate-500 gap-6 p-8 text-center bg-slate-950/50 backdrop-blur-xl">
              <div className="w-24 h-24 bg-slate-900 border border-white/5 rounded-[40px] flex items-center justify-center shadow-2xl">
                  <VideoOff size={40} className="text-slate-700" />
              </div>
              <div className="space-y-2">
                  <h2 className="text-xl font-black text-white uppercase tracking-tighter italic">No hay Shorts</h2>
                  <p className="text-sm text-slate-400 max-w-[200px] font-medium leading-relaxed">Vuelve más tarde para ver nuevos contenidos cortos.</p>
              </div>
          </div>
      ) : videos.map((video, idx) => (
        <div key={video.id} data-index={idx} className="w-full h-full snap-start">
             <ShortItem 
                video={video} 
                isActive={idx === activeIndex} 
                isNear={Math.abs(idx - activeIndex) <= 4}
                onOpenShare={(v) => setVideoToShare(v)}
                onInteraction={handleInteraction}
             />
        </div>
      ))}

      {/* Indicador de carga al final */}
      {hasMore && videos.length > 0 && (
          <div className="w-full h-20 flex items-center justify-center bg-black snap-start">
              <Loader2 className="animate-spin text-indigo-500" />
          </div>
      )}

      {videoToShare && (
          <ShareModal 
            video={videoToShare} 
            user={user} 
            onClose={() => setVideoToShare(null)} 
            onShareSuccess={(target) => {
                toast.success(`Short compartido con @${target}`);
                setVideoToShare(null);
            }} 
          />
      )}
    </div>
  );
}
