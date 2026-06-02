import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Video, User } from '../types';
import { Link, useNavigate } from './Router';
import CommentSection from './watch/CommentSection';
import { CheckCircle2, Clock, MoreVertical, Play, Music, RefreshCw, Folder, Share2, Download, Eye, Edit3, Trash2, ExternalLink, Image as ImageIcon, X, Layers, ChevronLeft, ChevronRight, ThumbsUp, MessageCircle, UserPlus, Heart, Globe, X as CloseIcon, Wand2, Scissors } from 'lucide-react';
import InteractiveDescription from './InteractiveDescription';
import { db } from '../services/db';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useSettings } from '../context/SettingsContext';
import { getThumbnailUrl } from '../utils/image';
import { generateThumbnail } from '../utils/videoGenerator';
import { isRunningInAPK, triggerNativeDownload } from '../utils/platform';
import ShareModal from './ShareModal';
import { VideoTranscodeModal } from './Admin/VideoTranscodeModal';

// Sistema de control global para no saturar el servidor
let isAnyCardProcessing = false;
const failedExtractions = new Set<string>();
const thumbnailQueue: string[] = [];

const processQueue = async () => {
    if (isAnyCardProcessing || thumbnailQueue.length === 0) return;
    
    const videoId = thumbnailQueue.shift();
    if (!videoId) return;

    // Disparar un evento personalizado para que la instancia del VideoCard correspondiente procese
    window.dispatchEvent(new CustomEvent('process_thumbnail', { detail: { videoId } }));
};

// Revisar la cola periódicamente
setInterval(processQueue, 2000);

interface VideoCardProps {
  video: Video;
  isUnlocked: boolean;
  isWatched?: boolean;
  onCategoryClick?: () => void;
  showDownload?: boolean;
  onDownload?: () => void;
  onView?: () => void;
  onConvert?: () => void;
  context?: { query?: string, category?: string, folder?: string, page?: number, sort_order?: string };
}

const formatTimeAgo = (timestamp: number) => {
  const seconds = Math.floor(Date.now() / 1000 - timestamp);
  let interval = seconds / 31536000;
  if (interval > 1) return Math.floor(interval) + " a";
  interval = seconds / 2592000;
  if (interval > 1) return Math.floor(interval) + " m";
  interval = seconds / 86400;
  if (interval > 1) return Math.floor(interval) + " d";
  interval = seconds / 3600;
  if (interval > 1) return Math.floor(interval) + " h";
  interval = seconds / 60;
  if (interval > 1) return Math.floor(interval) + " min";
  return "Ahora";
};

const formatDuration = (seconds: any) => {
    const sNum = Number(seconds);
    if (isNaN(sNum) || sNum <= 0) return '0:00';
    const h = Math.floor(sNum / 3600);
    const m = Math.floor((sNum % 3600) / 60);
    const s = Math.floor(sNum % 60);
    return h > 0 ? `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}` : `${m}:${s.toString().padStart(2, '0')}`;
};

const VideoCard: React.FC<VideoCardProps> = React.memo(({ video, isUnlocked, isWatched, onCategoryClick, showDownload, onDownload, onView, onConvert, context }) => {
  const { user, refreshUser } = useAuth();
  const { settings } = useSettings();
  const toast = useToast();
  const isNew = (Date.now() / 1000 - video.createdAt) < 86400;
  
  const [imgError, setImgError] = useState(false);
  const [retryOriginal, setRetryOriginal] = useState(false);
  const [localThumb, setLocalThumb] = useState<string | null>(null);
  const [inWatchLater, setInWatchLater] = useState(user?.watchLater?.includes(video.id) || false);
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [shouldLoadImg, setShouldLoadImg] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  const [inlinePlaying, setInlinePlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const navigate = useNavigate();
  const [showMembershipRequiredModal, setShowMembershipRequiredModal] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [commentsList, setCommentsList] = useState<any[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);

  const [reaction, setReaction] = useState<{ emoji: string; text: string }>(() => {
      try {
          const raw = localStorage.getItem('sp_reaction_' + video.id);
          if (raw) return JSON.parse(raw);
      } catch (e) {}
      return { emoji: '👍', text: 'Me gusta' };
  });

  const [showReactionsMenu, setShowReactionsMenu] = useState(false);
  const reactionTimerRef = useRef<any>(null);

  const handleStartPress = (e: React.MouseEvent | React.TouchEvent) => {
      if (reactionTimerRef.current) clearTimeout(reactionTimerRef.current);
      reactionTimerRef.current = setTimeout(() => {
          setShowReactionsMenu(true);
      }, 500); 
  };

  const handleReleasePress = () => {
      if (reactionTimerRef.current) {
          clearTimeout(reactionTimerRef.current);
          reactionTimerRef.current = null;
      }
  };

  const handleSelectReaction = async (emoji: string, text: string) => {
      try {
          localStorage.setItem('sp_reaction_' + video.id, JSON.stringify({ emoji, text }));
          setReaction({ emoji, text });
      } catch (e) {}

      if (!liked) {
          await handleLike();
      }
      setShowReactionsMenu(false);
  };

  const handleToggleComments = async () => {
      setShowComments(!showComments);
      if (!showComments) {
          setLoadingComments(true);
          try {
              const list = await db.getComments(video.id);
              setCommentsList(list || []);
          } catch (e) {
              console.error(e);
          } finally {
              setLoadingComments(false);
          }
      }
  };

  const handleCommentAdded = (newComment: any) => {
      setCommentsList(prev => [newComment, ...prev]);
  };

  // Auto-register on window global array for smart slider autoplay
  useEffect(() => {
    if (typeof window === 'undefined') return;
    (window as any).globalVideoCardList = (window as any).globalVideoCardList || [];
    
    const cardEntry = {
      id: video.id,
      play: () => setInlinePlaying(true),
      stop: () => setInlinePlaying(false)
    };
    
    (window as any).globalVideoCardList.push(cardEntry);
    
    return () => {
      if ((window as any).globalVideoCardList) {
        (window as any).globalVideoCardList = (window as any).globalVideoCardList.filter(
          (item: any) => item.id !== video.id
        );
      }
    };
  }, [video.id]);

  // Observer to pause video if it leaves the viewport
  useEffect(() => {
    if (!inlinePlaying) return;
    const videoElem = videoRef.current;
    if (!videoElem) return;

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (!entry.isIntersecting) {
                try {
                    videoElem.pause();
                } catch(e){}
            } else {
                try {
                    videoElem.play().catch(()=>{});
                } catch(e){}
            }
        });
    }, { threshold: 0.1 });

    observer.observe(videoElem);

    return () => {
        observer.unobserve(videoElem);
        observer.disconnect();
    };
  }, [inlinePlaying]);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showImageModal, setShowImageModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showFullTitle, setShowFullTitle] = useState(false);
  const [currentAlbumIndex, setCurrentAlbumIndex] = useState(0);
  const [likerName, setLikerName] = useState<string | null>(null);
  const [sharesCount, setSharesCount] = useState(Number(video.shares || 0));
  const cardRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

    const isAdmin = user?.role?.trim().toUpperCase() === 'ADMIN';
    const isOwner = user?.id === video.creatorId;
    const canEdit = isAdmin || isOwner;

  // Obtener liker aleatorio
  useEffect(() => {
    if (video.likes > 0) {
        db.getVideoLikers(video.id, user?.id).then(res => {
            if (res && res.length > 0) {
                setLikerName(res[0].username);
            }
        });
    }
  }, [video.id, video.likes, user?.id]);

  const isImage = useMemo(() => {
    if (video.category === 'IMAGES' || video.isAlbum) return true;
    const path = (video as any).rawPath || video.videoUrl || '';
    return !!path.match(/\.(jpg|jpeg|png|webp|gif|bmp|svg)(\?.*)?$/i);
  }, [video.videoUrl, video.category, video.isAlbum, (video as any).rawPath]);

  const isAudio = Number(video.is_audio) === 1;
  
  const defaultThumb = isAudio ? settings?.defaultAudioThumb : settings?.defaultVideoThumb;
  const hasDefaultThumb = !video.thumbnailUrl || video.thumbnailUrl.includes('default.jpg') || video.thumbnailUrl.includes('defaultaudio.jpg');

  // Obtener nombre de la carpeta (último segmento de la ruta)
  const locationLabel = useMemo(() => {
    const path = (video as any).rawPath || video.videoUrl || '';
    const parts = path.split(/[\\/]/).filter(Boolean);
    if (parts.length > 1) {
        return parts[parts.length - 2]; // Carpeta padre
    }
    return null;
  }, [video.videoUrl]);

  const groupLabel = useMemo(() => {
    const cat = (video.category || '').toUpperCase();
    if (cat === 'PERSONAL' || cat === 'VIDEOS') {
        return null;
    }
    if (locationLabel && (locationLabel.toUpperCase() === 'PERSONAL' || locationLabel.toUpperCase() === 'VIDEOS')) {
        return null;
    }
    const isSpecialCategory = video.category && !['TODOS', 'SHORT_VIDEOS', 'AUDIOS', 'IMAGES', 'VIP', 'MOVIES', 'SERIES'].includes(cat);
    if (isSpecialCategory) {
        return video.category;
    }
    const path = (video as any).rawPath || video.videoUrl || '';
    if (path.includes('/uploads/videos/')) {
        return locationLabel;
    }
    return null;
  }, [video.category, video.videoUrl, locationLabel]);

  const isHomePage = useMemo(() => {
    const hash = window.location.hash || '';
    return !hash || hash === '#/' || hash.startsWith('#/?') || hash.startsWith('#/index');
  }, [window.location.hash]);

  const videoGroupPath = useMemo(() => {
    const path = (video as any).rawPath || video.videoUrl || '';
    const normalized = path.replace(/\\/g, '/');
    const prefix = 'uploads/videos/';
    const index = normalized.indexOf(prefix);
    if (index !== -1) {
        const afterPrefix = normalized.substring(index + prefix.length);
        const parts = afterPrefix.split('/');
        if (parts.length > 1) {
            parts.pop(); // Remove filename
            return parts.join('/');
        }
    }
    return null;
  }, [video.videoUrl]);

  const watchUrl = useMemo(() => {
    if (isHomePage && videoGroupPath) {
        return `/groups?folder=${encodeURIComponent(videoGroupPath)}&play=${video.id}`;
    }

    let targetId = video.id;
    let path = '/watch/';

    const isReshare = video.id.startsWith('reshare_') || (!video.is_series_fragment && video.originalId);
    
    if (isReshare && video.originalId) {
        targetId = video.originalId;
    } else if (video.originalMarketplaceId) {
        targetId = video.originalMarketplaceId;
        path = '/marketplace/item/';
    }

    const base = `${path}${targetId}`;
    const params = new URLSearchParams();
    if (context?.query) params.set('q', context.query);
    if (context?.folder) params.set('f', context.folder);
    if (context?.category && context.category !== 'TODOS') params.set('c', context.category);
    if (context?.page !== undefined) params.set('p', String(context.page));
    if (context?.sort_order) params.set('s', context.sort_order);
    
    const qs = params.toString();
    return qs ? `${base}?${qs}` : base;
  }, [video.id, context, isHomePage, videoGroupPath]);

  // Observer para carga perezosa de imágenes y procesamiento
  useEffect(() => {
      const observer = new IntersectionObserver((entries) => {
          if (entries[0].isIntersecting) {
              setIsVisible(true);
              setShouldLoadImg(true); // Solo aquí pedimos la imagen
              observer.disconnect(); 
          }
      }, { threshold: 0.05, rootMargin: '200px' });
      if (cardRef.current) observer.observe(cardRef.current);
      return () => observer.disconnect();
  }, [video.id]);

  useEffect(() => {
      let isMounted = true;
      
      const handleProcessEvent = (e: any) => {
          if (e.detail.videoId === video.id && isMounted && !isProcessing && !localThumb) {
              startProcessing();
          }
      };

      const startProcessing = async () => {
          if (isAnyCardProcessing) return;
          isAnyCardProcessing = true;
          setIsProcessing(true);
          try {
              // Sistema de colaboración: Intentar bloquear el video para procesamiento
              const lockId = `client_${Math.random().toString(36).substring(2, 9)}`;
              const lockRes = await db.lockVideoForProcessing(video.id, lockId);
              
              if (!lockRes.success) {
                  failedExtractions.add(video.id);
                  return;
              }

              const streamUrl = db.getStreamerUrl(video.id, user?.sessionToken);
              const result = await generateThumbnail(streamUrl, isAudio, false); 
              if (!isMounted) return;
              
              if (result.duration > 0 || result.thumbnail) {
                  const fd = new FormData();
                  fd.append('id', video.id);
                  fd.append('duration', String(result.duration || video.duration));
                  fd.append('success', '1');
                  if (result.thumbnail) {
                      fd.append('thumbnail', result.thumbnail);
                      setLocalThumb(URL.createObjectURL(result.thumbnail));
                  }
                  await db.request('action=update_video_metadata', { method: 'POST', body: fd });
                  db.setHomeDirty();
              } else { 
                  await db.unlockVideo(video.id);
                  failedExtractions.add(video.id); 
              }
          } catch (e) { 
              failedExtractions.add(video.id); 
              try { await db.unlockVideo(video.id); } catch(err) {}
          } 
          finally { 
              isAnyCardProcessing = false;
              if (isMounted) setIsProcessing(false); 
          }
      };

      const canQueue = !isRunningInAPK() && isAdmin && isUnlocked && hasDefaultThumb && isVisible && !isProcessing && !localThumb && !failedExtractions.has(video.id);
      if (canQueue && !thumbnailQueue.includes(video.id)) {
          thumbnailQueue.push(video.id);
      }

      window.addEventListener('process_thumbnail', handleProcessEvent);
      return () => {
          isMounted = false;
          window.removeEventListener('process_thumbnail', handleProcessEvent);
      };
  }, [video.id, isAudio, hasDefaultThumb, isVisible, isUnlocked, user?.sessionToken]);

  useEffect(() => {
      return () => {
          if (localThumb) URL.revokeObjectURL(localThumb);
          if (isProcessing) isAnyCardProcessing = false;
      };
  }, [localThumb, isProcessing]);

  // Sincronizar estado de "Ver más tarde" con el usuario
  useEffect(() => {
      setInWatchLater(user?.watchLater?.includes(video.id) || false);
  }, [user?.watchLater, video.id]);

  const handleWatchLater = async (e: React.MouseEvent) => {
      e.preventDefault(); e.stopPropagation();
      if (!user) {
          toast.error("Debes iniciar sesión");
          return;
      }
      try {
          await db.toggleWatchLater(user.id, video.id);
          setInWatchLater(!inWatchLater);
          toast.success(!inWatchLater ? "Añadido a Ver más tarde" : "Eliminado de Ver más tarde");
          refreshUser();
      } catch (e) {
          console.error("Watch later failed:", e);
      }
  };

  const handleSplitShorts = async (e: React.MouseEvent) => {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    if (!isAdmin) return;
    setShowConfigModal(true);
    setShowMenu(false);
  };

  useEffect(() => {
      const handleClickOutside = (e: MouseEvent) => {
          if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
              setShowMenu(false);
          }
      };
      if (showMenu) {
          document.addEventListener('mousedown', handleClickOutside);
      }
      return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showMenu]);

  const handleShare = (e: React.MouseEvent) => {
      e.preventDefault(); e.stopPropagation();
      if (!user) {
          toast.error("Inicia sesión para compartir");
          return;
      }
      setShowShareModal(true);
      setShowMenu(false);
  };

  const handleDownload = async (e: React.MouseEvent, forceDownload: boolean = false) => {
      if (e) { e.preventDefault(); e.stopPropagation(); }
      setShowMenu(false);

      // 1. Comprobar acceso (Admin, Propietario, VIP o Compra previa)
      const isVip = !!(user?.vipExpiry && user.vipExpiry > Date.now() / 1000);
      const hasAccess = isAdmin || isOwner || isVip || isUnlocked;

      if (!hasAccess && !forceDownload) {
          setShowPurchaseModal(true);
          return;
      }

      // 2. Comprobar App Oficial (Solo si no es Admin)
      const isApp = isRunningInAPK() || (user?.deviceInfo?.includes('com.streampay.app') || 
                     user?.lastDeviceId?.includes('com.streampay.app') || 
                     user?.deviceInfo?.includes('StreamPayAPK') || 
                     user?.lastDeviceId?.includes('StreamPayAPK'));

      if (!isApp && !isAdmin) {
          toast.error("La descarga solo está disponible en la App oficial");
          return;
      }

      // 3. Proceder con la descarga
      try {
          const base = db.getStreamerUrl(video.id, user?.sessionToken);
          const filename = encodeURIComponent((video.title || 'video').replace(/[^a-z0-9]/gi, '_').toLowerCase());
          const ext = video.is_audio ? 'mp3' : 'mp4';
          const downloadUrl = `${base}&download=1&filename=${filename}.${ext}`;
          
          if (isRunningInAPK()) {
              const handled = triggerNativeDownload(downloadUrl, `${filename}.${ext}`);
              if (handled) {
                  toast.success("Descarga enviada al gestor de la APK...");
                  return;
              }
          }

          const link = document.createElement('a');
          link.href = downloadUrl;
          link.download = "";
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          toast.success("Iniciando descarga...");
      } catch (err) {
          toast.error("Error al iniciar descarga");
      }
  };

  const handlePurchase = async () => {
      if (!user || !video) return;
      if (Number(user.balance) < Number(video.price)) {
          setShowMembershipRequiredModal(true);
          setShowPurchaseModal(false);
          return;
      }
      try {
          await db.purchaseVideo(user.id, video.id);
          toast.success("¡Compra exitosa!");
          setShowPurchaseModal(false);
          refreshUser();
          
          // Descarga automática tras compra
          setTimeout(() => {
              handleDownload(null as any, true);
          }, 500);
      } catch (e: any) {
          toast.error(e.message || "Error en la compra");
      }
  };

  const handleDelete = async (e?: React.MouseEvent) => {
      if (e) { e.preventDefault(); e.stopPropagation(); }
      
      try {
          await db.deleteVideo(video.id, user?.id || '');
          toast.success("Video eliminado correctamente");
          db.setHomeDirty();
          window.location.reload(); 
      } catch (e) {
          toast.error("Error al eliminar video");
      }
      setShowDeleteConfirm(false);
      setShowMenu(false);
  };

  const handleImageClick = (e: React.MouseEvent) => {
      if (isImage) {
          e.preventDefault();
          e.stopPropagation();
          setCurrentAlbumIndex(0);
          setShowImageModal(true);
          if (user) {
              db.markWatched(user.id, video.id).catch(console.error);
          }
      }
  };

  const nextAlbumImage = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (video.albumItems) {
          setCurrentAlbumIndex(prev => (prev + 1) % video.albumItems!.length);
      }
  };

  const prevAlbumImage = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (video.albumItems) {
          setCurrentAlbumIndex(prev => (prev - 1 + video.albumItems!.length) % video.albumItems!.length);
      }
  };

  const displayThumb = useMemo(() => {
      if (!shouldLoadImg) return null; 
      if (localThumb) return localThumb;
      
      const hasThumb = video.thumbnailUrl && typeof video.thumbnailUrl === 'string' && video.thumbnailUrl.trim().length > 0 && !video.thumbnailUrl.includes('default.jpg');

      // Si es una imagen y no tiene miniatura, usar la URL de streaming
      if (isImage && !hasThumb) return db.getStreamerUrl(video.id);

      // Si ya intentamos la miniatura optimizada y falló, intentar la original
      if (retryOriginal && hasThumb) return video.thumbnailUrl;

      // Si hay error en la imagen o no hay miniatura, intentar usar el default de configuración
      if (imgError || !hasThumb) {
          const fallback = isAudio ? "/api/uploads/thumbnails/defaultaudio.jpg" : "/api/uploads/thumbnails/default.jpg";
          return defaultThumb || fallback;
      }

      return getThumbnailUrl(video.thumbnailUrl);
  }, [shouldLoadImg, localThumb, imgError, retryOriginal, video.thumbnailUrl, video.videoUrl, isAudio, isImage, defaultThumb]);

  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(Number(video.likes || 0));

  useEffect(() => {
    if (user && video.id) {
        db.getInteraction(user.id, video.id).then(res => {
            if (res) setLiked(res.liked);
        });
    }
  }, [user?.id, video.id]);

  const handleLike = async (e?: React.MouseEvent) => {
    if (e) {
        e.preventDefault();
        e.stopPropagation();
    }
    if (!user) {
        toast.error("Inicia sesión para reaccionar");
        return;
    }
    
    const oldLiked = liked;
    const oldLikeCount = likeCount;
    
    setLiked(!oldLiked);
    setLikeCount(prev => oldLiked ? prev - 1 : prev + 1);
    
    try {
        const res = await db.rateVideo(user.id, video.id, 'like');
        if (res.newLikeCount !== undefined) setLikeCount(res.newLikeCount);
        setLiked(res.liked);
    } catch (err) {
        setLiked(oldLiked);
        setLikeCount(oldLikeCount);
        toast.error("Error al reaccionar");
    }
  };

  return (
    <div ref={cardRef} className={`flex flex-col bg-[var(--bg-secondary)] ${isWatched ? 'opacity-70' : ''}`}>
      {/* Header: User Info */}
      <div className="flex items-center justify-between p-3">
        <div className="flex items-center gap-2">
          <Link to={`/channel/${video.creatorId}`} className="shrink-0">
              <div className="w-10 h-10 rounded-full border border-[var(--divider)] overflow-hidden bg-[var(--bg-tertiary)]">
                {video.creatorAvatarUrl || settings?.defaultAvatar ? (
                    <img src={getThumbnailUrl(video.creatorAvatarUrl) || settings?.defaultAvatar} className="w-full h-full object-cover" alt={video.creatorName} loading="lazy" referrerPolicy="no-referrer" />
                ) : (
                    <div className="w-full h-full flex items-center justify-center text-sm font-bold text-white uppercase">{video.creatorName?.[0] || '?'}</div>
                )}
              </div>
          </Link>
          <div className="flex flex-col">
            <div className="flex items-center gap-1 flex-wrap">
              {groupLabel ? (
                <>
                  <Link to={`/groups?folder=${encodeURIComponent(videoGroupPath || groupLabel)}`} className="text-[14px] font-extrabold text-[#1877f2] hover:underline leading-tight">
                    {groupLabel}
                  </Link>
                  <span className="text-[12px] text-[var(--text-secondary)] font-bold">›</span>
                  <Link to={`/channel/${video.creatorId}`} className="text-[13px] font-bold text-white hover:underline truncate max-w-[120px] leading-tight">
                    {video.creatorName || 'Usuario'}
                  </Link>
                </>
              ) : (
                <Link to={`/channel/${video.creatorId}`} className="text-[15px] font-bold text-white hover:underline truncate max-w-[200px] leading-tight">
                  {video.creatorName || 'Usuario'}
                </Link>
              )}
              <CheckCircle2 size={13} className="text-[#1877f2] fill-[#1877f2]/10" />
            </div>
            <div className="flex items-center gap-1 text-[12px] text-[var(--text-secondary)] leading-tight">
              <span>{formatTimeAgo(video.createdAt)}</span>
              <span>•</span>
              <Globe size={12} />
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-1">
          <div className="relative" ref={menuRef}>
            <button 
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowMenu(!showMenu); }} 
                className="p-2 text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] rounded-full transition-colors"
            >
                <MoreVertical size={20} />
            </button>
            
            {showMenu && (
                <div className="absolute top-full right-0 mt-1 w-56 bg-[var(--bg-secondary)] border border-[var(--divider)] rounded-md shadow-lg overflow-hidden z-50">
                    <div className="py-1">
                        <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleShare(e); }} className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-[var(--bg-hover)] text-[var(--text-primary)] text-left">
                            <Share2 size={16} className="text-[var(--text-secondary)]" />
                            <span className="text-sm">Compartir</span>
                        </button>
                        <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); if(onDownload) onDownload(); else handleDownload(e); }} className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-[var(--bg-hover)] text-[var(--text-primary)] text-left">
                            <Download size={16} className="text-[var(--text-secondary)]" />
                            <span className="text-sm">Descargar</span>
                        </button>
                        <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleWatchLater(e); }} className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-[var(--bg-hover)] text-[var(--text-primary)] text-left">
                            <Clock size={16} className={inWatchLater ? 'text-[var(--accent)]' : 'text-[var(--text-secondary)]'} />
                            <span className="text-sm">{inWatchLater ? 'Quitar de ver más tarde' : 'Ver más tarde'}</span>
                        </button>
                        {isAdmin && (
                            <>
                                <button 
                                    onClick={(e) => { 
                                        e.preventDefault(); 
                                        e.stopPropagation(); 
                                        onConvert?.(); 
                                        setShowMenu(false); 
                                    }} 
                                    className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-[var(--bg-hover)] text-[var(--text-primary)] text-left"
                                >
                                    <Wand2 size={16} className="text-amber-500" />
                                    <span className="text-sm">Convertir Video</span>
                                </button>
                                <button 
                                    onClick={(e) => { 
                                        e.preventDefault(); 
                                        e.stopPropagation(); 
                                        handleSplitShorts(e);
                                    }} 
                                    className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-[var(--bg-hover)] text-[var(--text-primary)] text-left"
                                >
                                    <Scissors size={16} className="text-amber-500" />
                                    <span className="text-sm">Configurar Fragmentación</span>
                                </button>
                            </>
                        )}
                        {canEdit && (
                            <>
                                <div className="h-px bg-[var(--divider)] my-1"></div>
                                <Link to={`/edit/${video.id}`} className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-[var(--bg-hover)] text-[var(--text-primary)] text-left">
                                    <Edit3 size={16} className="text-[var(--text-secondary)]" />
                                    <span className="text-sm">Editar</span>
                                </Link>
                                <button 
                                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowDeleteConfirm(true); setShowMenu(false); }}
                                    className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-red-50 text-red-600 hover:text-white transition-colors text-left"
                                >
                                    <Trash2 size={16} />
                                    <span className="text-sm">Eliminar</span>
                                </button>
                            </>
                        )}
                    </div>
                </div>
            )}
          </div>
          <button className="p-2 text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>
      </div>

      {/* Text Content: Title & Description */}
      <div className="px-3 pb-3">
        <div className="relative">
            <div className={`text-[15px] font-normal text-[var(--text-primary)] leading-snug ${!showFullTitle ? 'line-clamp-4' : ''}`}>
              {/* No mostrar título si es idéntico al inicio de la descripción (ignorando sufijos de álbum como " (1/2)") */}
              {!(video.description?.startsWith(video.title) || (video.title && video.description?.startsWith(video.title.replace(/\s\(\d+\/\d+\)$/, '')))) && (
                <span className="font-bold mr-1">{video.title}</span>
              )}
              {video.description && (
                  <div className="text-[var(--text-primary)]">
                      <InteractiveDescription text={video.description} />
                  </div>
              )}
            </div>
            {((video.title?.length || 0) + (video.description?.length || 0)) > 150 && !showFullTitle && (
                <button 
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowFullTitle(true); }}
                    className="text-[var(--text-secondary)] text-sm font-bold hover:underline mt-1"
                >
                    Ver más
                </button>
            )}
        </div>
      </div>

      {/* Media Content */}
      {video.originalVideo && (
          <div className="mx-3 mb-3 border border-[var(--divider)] rounded-xl overflow-hidden bg-[var(--bg-primary)] hover:border-[#1877f2]/50 transition-colors">
              <div className="p-3 flex items-center gap-2">
                  <Link to={`/channel/${video.originalVideo.creatorId}`} className="shrink-0">
                      <div className="w-8 h-8 rounded-full border border-[var(--divider)] overflow-hidden">
                          <img src={getThumbnailUrl(video.originalVideo.creatorAvatarUrl) || settings?.defaultAvatar} className="w-full h-full object-cover" alt={video.originalVideo.creatorName} referrerPolicy="no-referrer" />
                      </div>
                  </Link>
                  <div className="flex flex-col">
                      <div className="flex items-center gap-1.5">
                          <Link to={`/channel/${video.originalVideo.creatorId}`} className="text-xs font-bold text-[var(--text-primary)] hover:underline">
                              {video.originalVideo.creatorName}
                          </Link>
                          {video.originalVideo.creatorRole === 'ADMIN' && <CheckCircle2 size={10} className="text-[#1877f2] fill-[#1877f2]/10" />}
                      </div>
                      <div className="text-[10px] text-[var(--text-secondary)] leading-tight">
                          <span>{formatTimeAgo(video.originalVideo.createdAt)}</span>
                      </div>
                  </div>
              </div>

              {video.originalVideo.description && (
                  <div className="px-3 pb-2 text-sm text-[var(--text-primary)]">
                      <InteractiveDescription text={video.originalVideo.description} />
                  </div>
              )}

              <div className="relative aspect-video bg-black overflow-hidden">
                  <Link to={`/watch/${video.originalVideo.id}`} className="absolute inset-0">
                      <img 
                          src={getThumbnailUrl(video.originalVideo.thumbnailUrl) || (Number(video.originalVideo.is_audio) === 1 ? settings?.defaultAudioThumb : settings?.defaultVideoThumb)} 
                          alt={video.originalVideo.title}
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                      />
                      {!video.originalVideo.category?.includes('IMAGES') && (
                          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                              <div className="w-10 h-10 bg-black/30 backdrop-blur-[2px] border border-white/20 rounded-full flex items-center justify-center">
                                  {Number(video.originalVideo.is_audio) === 1 ? <Music size={20} className="text-white" /> : <Play size={20} className="text-white ml-1" />}
                              </div>
                          </div>
                      )}
                      {video.originalVideo.duration > 0 && (
                          <div className="absolute bottom-2 right-2 bg-black/80 text-white text-[9px] font-black px-1.5 py-0.5 rounded backdrop-blur-md">
                              {formatDuration(video.originalVideo.duration)}
                          </div>
                      )}
                  </Link>
              </div>
              <div className="p-3 bg-[var(--bg-tertiary)] border-t border-[var(--divider)]">
                  <div className="text-[10px] text-[var(--text-secondary)] uppercase font-bold tracking-wider mb-0.5">STREAMPAY.APP</div>
                  <h5 className="text-[var(--text-primary)] font-bold text-sm line-clamp-1">{video.originalVideo.title}</h5>
              </div>
          </div>
      )}

      {video.originalMarketplaceItem && (
          <div className="mx-3 mb-3 border border-[var(--divider)] rounded-xl overflow-hidden bg-[var(--bg-primary)] hover:border-[#1877f2]/50 transition-colors">
              <div className="p-3 flex items-center gap-2">
                  <div className="shrink-0 w-8 h-8 rounded-full border border-[var(--divider)] overflow-hidden">
                      <img src={video.originalMarketplaceItem.sellerAvatarUrl || settings?.defaultAvatar} className="w-full h-full object-cover" alt={video.originalMarketplaceItem.sellerName} referrerPolicy="no-referrer" />
                  </div>
                  <div className="flex flex-col">
                      <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-[var(--text-primary)]">
                              {video.originalMarketplaceItem.sellerName}
                          </span>
                          <CheckCircle2 size={10} className="text-[#1877f2] fill-[#1877f2]/10" />
                      </div>
                      <div className="text-[10px] text-[var(--text-secondary)] leading-tight">
                          <span>Tienda</span>
                      </div>
                  </div>
              </div>

              <div className="px-3 pb-2 text-sm text-[var(--text-primary)] font-medium">
                  Recomendó este producto de nuestra tienda oficial.
              </div>

              <div className="relative aspect-square bg-[#f0f2f5] overflow-hidden">
                  <Link to={`/marketplace/item/${video.originalMarketplaceItem.id}`} className="absolute inset-0">
                      <img 
                          src={video.originalMarketplaceItem.images?.[0] || 'https://via.placeholder.com/400'} 
                          alt={video.originalMarketplaceItem.title}
                          className="w-full h-full object-contain"
                          referrerPolicy="no-referrer"
                      />
                  </Link>
              </div>
              <div className="p-3 bg-[var(--bg-tertiary)] border-t border-[var(--divider)] flex justify-between items-center">
                  <div>
                      <div className="text-[10px] text-[var(--text-secondary)] uppercase font-bold tracking-wider mb-0.5">MARKETPLACE</div>
                      <h5 className="text-[var(--text-primary)] font-bold text-sm line-clamp-1">{video.originalMarketplaceItem.title}</h5>
                  </div>
                  <div className="text-right">
                      <div className="text-xs font-black text-[#45bd62]">${video.originalMarketplaceItem.price}</div>
                  </div>
              </div>
          </div>
      )}

      {!video.originalVideo && !video.originalMarketplaceItem && (
          <div className={`relative w-full ${video.isAlbum && video.albumItems && video.albumItems.length > 1 ? 'aspect-[4/3]' : 'aspect-video'} bg-black overflow-hidden`}>
            {video.isAlbum && video.albumItems && video.albumItems.length > 1 ? (
                <div 
                    className={`grid gap-0.5 h-full ${
                        video.albumItems.length === 2 ? 'grid-cols-2' : 
                        video.albumItems.length === 3 ? 'grid-cols-3' : 
                        'grid-cols-4'
                    }`} 
                    onClick={handleImageClick}
                >
                    {/* Variant 1: 2 Images (50/50) */}
                    {video.albumItems.length === 2 && video.albumItems.map(item => (
                        <div key={item.id} className="relative h-full">
                            <img 
                                src={db.getStreamerUrl(item.id)} 
                                alt={item.title}
                                className="w-full h-full object-cover"
                                referrerPolicy="no-referrer"
                            />
                        </div>
                    ))}

                    {/* Variant 2: 3 Images (Big left, two small right) */}
                    {video.albumItems.length === 3 && (
                        <>
                            <div className="col-span-2 h-full relative">
                                <img 
                                    src={db.getStreamerUrl(video.albumItems[0].id)} 
                                    alt={video.albumItems[0].title}
                                    className="w-full h-full object-cover"
                                    referrerPolicy="no-referrer"
                                />
                            </div>
                            <div className="col-span-1 flex flex-col gap-0.5 h-full">
                                {video.albumItems.slice(1, 3).map(item => (
                                    <div key={item.id} className="flex-1 relative">
                                        <img 
                                            src={db.getStreamerUrl(item.id)} 
                                            alt={item.title}
                                            className="w-full h-full object-cover"
                                            referrerPolicy="no-referrer"
                                        />
                                    </div>
                                ))}
                            </div>
                        </>
                    )}

                    {/* Variant 3: 4+ Images (Current Logic improved) */}
                    {video.albumItems.length >= 4 && (
                        <>
                            <div className="col-span-3 h-full relative">
                                <img 
                                    src={db.getStreamerUrl(video.albumItems[0].id)} 
                                    alt={video.albumItems[0].title}
                                    className="w-full h-full object-cover"
                                    referrerPolicy="no-referrer"
                                />
                            </div>
                            <div className="col-span-1 flex flex-col gap-0.5 h-full">
                                {video.albumItems.slice(1, 4).map((item, idx) => (
                                    <div key={item.id} className="flex-1 relative">
                                        <img 
                                            src={db.getStreamerUrl(item.id)} 
                                            alt={item.title}
                                            className="w-full h-full object-cover"
                                            referrerPolicy="no-referrer"
                                        />
                                        {idx === 2 && video.albumItems!.length > 4 && (
                                            <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                                                <span className="text-white font-black text-lg">+{video.albumItems!.length - 4}</span>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                </div>
            ) : inlinePlaying ? (
                <div className="absolute inset-0 z-10 bg-black flex items-center justify-center">
                    <video
                        ref={videoRef}
                        src={db.getStreamerUrl(video.id, user?.sessionToken)}
                        controls
                        autoPlay
                        playsInline
                        className="w-full h-full object-contain"
                        onPlay={() => {
                            if (window && (window as any).globalVideoCardList) {
                                (window as any).globalVideoCardList.forEach((item: any) => {
                                    if (item.id !== video.id) {
                                        item.stop();
                                    }
                                });
                            }
                        }}
                        onLoadedMetadata={(e) => {
                            try {
                                const videoElem = e.currentTarget;
                                const savedTime = localStorage.getItem(`sp_progress_${video.id}`);
                                if (savedTime) {
                                    videoElem.currentTime = parseFloat(savedTime);
                                }
                            } catch (err) {}
                        }}
                        onTimeUpdate={(e) => {
                            try {
                                const videoElem = e.currentTarget;
                                localStorage.setItem(`sp_progress_${video.id}`, String(videoElem.currentTime));
                            } catch (err) {}
                        }}
                        onEnded={() => {
                            setInlinePlaying(false);
                            if (window && (window as any).globalVideoCardList) {
                                const myIndex = (window as any).globalVideoCardList.findIndex((item: any) => item.id === video.id);
                                if (myIndex !== -1 && myIndex + 1 < (window as any).globalVideoCardList.length) {
                                    (window as any).globalVideoCardList[myIndex + 1].play();
                                }
                            }
                        }}
                    />
                    <button 
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setInlinePlaying(false); }}
                        className="absolute top-2 right-2 p-1.5 rounded-full bg-black/60 text-white z-20 hover:bg-black/90 transition shadow-lg border border-white/10"
                        title="Cerrar reproductor"
                    >
                        <X size={12} />
                    </button>
                </div>
            ) : (
                <Link 
                    to="#" 
                    onClick={(e) => { 
                        e.preventDefault(); 
                        if (video.isCategoryCard) { 
                            onCategoryClick?.(); 
                        } else if (isImage) { 
                            handleImageClick(e); 
                        } else { 
                            const isVip = user?.role?.trim().toUpperCase() === 'VIP' || user?.role?.trim().toUpperCase() === 'ADMIN';
                            const hasAccess = isAdmin || isOwner || isVip || isUnlocked;
                            if (!hasAccess && Number(video.price) > 0) {
                                setShowPurchaseModal(true);
                            } else {
                                setInlinePlaying(true); 
                            }
                        } 
                    }}
                    className="absolute inset-0 z-0 group/media"
                >
                    {displayThumb ? (
                        <div className="relative w-full h-full">
                            <img 
                            src={displayThumb} 
                            alt={video.title} 
                            className="w-full h-full object-cover group-hover/media:scale-105 transition-transform duration-700 ease-out animate-in fade-in"
                            loading="lazy" 
                            referrerPolicy="no-referrer"
                            onError={() => {
                                // Si falló la miniatura optimizada, intentar cargar la original antes de rendirse
                                if (!retryOriginal && video.thumbnailUrl && getThumbnailUrl(video.thumbnailUrl) !== video.thumbnailUrl) {
                                    setRetryOriginal(true);
                                } else {
                                    setImgError(true);
                                }
                            }}
                            />
                            
                            {/* Play/Music Icon Overlay - Only for non-images */}
                            {!isImage && (
                                <div className="absolute inset-0 flex items-center justify-center pointer-events-none transition-opacity duration-300">
                                    <div className="w-14 h-14 bg-black/30 backdrop-blur-[2px] border border-white/20 rounded-full flex items-center justify-center group-hover/media:scale-110 transition-transform duration-300">
                                        {isAudio ? (
                                            <Music size={28} className="text-white fill-white/20" />
                                        ) : (
                                            <Play size={28} className="text-white fill-white/40 ml-1" />
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-slate-900 to-slate-950 text-slate-700 p-4">
                            <div className="relative flex flex-col items-center justify-center">
                                {isAudio ? <Music size={48} className="opacity-10 mb-2" /> : isImage ? <ImageIcon size={48} className="opacity-10 mb-2" /> : <Play size={48} className="opacity-10 mb-2"/>}
                                {isProcessing && (
                                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 backdrop-blur-[2px] rounded-xl p-2 select-none">
                                        <span className="text-indigo-400 text-xs font-black animate-pulse">
                                            {video.transcode_progress !== undefined && video.transcode_progress > 0 
                                                ? `${video.transcode_progress}%` 
                                                : `${Math.floor(Math.random() * 20) + 40}%`
                                            }
                                        </span>
                                    </div>
                                )}
                            </div>
                            {!shouldLoadImg && <div className="text-[10px] font-bold opacity-20 uppercase tracking-widest mt-2">Cargando...</div>}
                        </div>
                    )}
                </Link>
            )}
            
            {locationLabel && (
                <div className="absolute top-2 left-2 bg-black/60 backdrop-blur-md text-[8px] font-black text-slate-300 px-2 py-0.5 rounded-lg border border-white/10 uppercase tracking-widest flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none">
                    <Folder size={8} className="text-indigo-400" /> {locationLabel}
                </div>
            )}

            {!isImage && (
                <div className="absolute bottom-2 right-2 flex items-center gap-2">
                {onView && (
                    <button 
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onView(); }}
                            className="bg-[#2d88ff] text-white p-1 rounded-md shadow-lg hover:bg-[#2d88ff]/80 transition-colors"
                            title="Ver contenido"
                    >
                        <Eye size={14} />
                    </button>
                )}
                {onConvert && (
                    <button 
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onConvert(); }}
                            className="bg-amber-600 text-white p-1 rounded-md shadow-lg hover:bg-amber-500 transition-colors"
                            title="Convertir Video (Transcodificar)"
                    >
                        <Wand2 size={14} />
                    </button>
                )}
                <div className="bg-black/80 text-white text-[10px] font-black flex items-center gap-2 px-2 py-0.5 rounded-lg backdrop-blur-md border border-white/5">
                    {showDownload && (
                        <button 
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDownload?.(); }}
                            className="text-[#2d88ff] hover:text-white transition-colors"
                        >
                            <Download size={12} />
                        </button>
                    )}
                    <div className="h-3 w-[1px] bg-white/20"></div>
                    {isProcessing ? (
                        <div className="flex items-center gap-1">
                            <RefreshCw size={10} className="animate-spin text-indigo-400" />
                            <span>PROCESANDO</span>
                        </div>
                    ) : formatDuration(video.duration)}
                </div>
                </div>
            )}

            {isImage && (
                <div className="absolute top-3 right-3 z-10 flex gap-2">
                    {showDownload && (
                        <button 
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDownload?.(); }}
                            className="bg-black/60 backdrop-blur-md text-white p-1.5 rounded-lg shadow-lg hover:bg-[#2d88ff]"
                        >
                            <Download size={14} />
                        </button>
                    )}
                    {video.isAlbum && (
                        <div className="bg-indigo-600 text-white p-1.5 rounded-lg shadow-lg flex items-center gap-1">
                            <Layers size={14} />
                            <span className="text-[10px] font-black">{video.albumItems?.length}</span>
                        </div>
                    )}
                    <div className="bg-black/60 backdrop-blur-md text-white p-1.5 rounded-lg shadow-lg">
                        <ImageIcon size={14} />
                    </div>
                </div>
            )}

            {isNew && !isWatched && !isAudio && (
                <div className="absolute top-2 left-2 bg-red-600 text-white text-[9px] font-black px-2 py-0.5 rounded-lg shadow-lg shadow-red-900/40 animate-pulse uppercase tracking-widest pointer-events-none">NUEVO</div>
            )}

            {isWatched && (
                <div className="absolute inset-0 bg-black/60 flex items-center justify-center backdrop-blur-[2px] pointer-events-none">
                    <div className="flex items-center gap-2 text-slate-200 bg-indigo-600/80 px-3 py-1 rounded-full backdrop-blur-md border border-white/10 shadow-xl">
                        <CheckCircle2 size={14} /> <span className="text-[10px] font-black tracking-widest uppercase">VISTO</span>
                    </div>
                </div>
            )}
            
            {!isUnlocked && !isWatched && (
                <div className="absolute bottom-2 left-2 bg-amber-400 text-black text-[10px] font-black px-2 py-0.5 rounded-lg shadow-lg flex items-center gap-1.5 border border-amber-500/20 pointer-events-none">
                    {video.price} cr
                </div>
            )}
          </div>
      )}

      {/* Footer: Interactions */}
      <div className="p-1">
        <div className="flex items-center justify-between px-3 py-2">
          <div className="flex items-center gap-1.5">
            <div className="flex items-center -space-x-1">
                <div className="w-4 h-4 bg-[var(--accent)] rounded-full flex items-center justify-center border border-[var(--bg-secondary)] shadow-sm">
                <ThumbsUp size={8} className="text-white fill-white" />
                </div>
                <div className="w-4 h-4 bg-[#f02849] rounded-full flex items-center justify-center border border-[var(--bg-secondary)] shadow-sm">
                <Heart size={8} className="text-white fill-white" />
                </div>
            </div>
            <span className="text-[11px] text-[var(--text-secondary)] font-medium">
                {likerName ? (
                    <>
                        {likerName} {likeCount > 1 ? `y ${likeCount - 1} más` : ''}
                    </>
                ) : (
                    <>{likeCount}</>
                )}
            </span>
          </div>
          <div className="flex items-center gap-3 text-[11px] text-[var(--text-secondary)] font-medium">
            <span>{video.views} vistas</span>
            <span>{sharesCount} compartido</span>
          </div>
        </div>
        
        <div className="h-px bg-[var(--divider)] mx-2 mb-1"></div>
        
        <div className="flex items-center gap-1 px-1 pb-1 relative">
          {/* Long-press Reactions Menu Overlay */}
          {showReactionsMenu && (
            <div className="absolute bottom-[48px] left-2 bg-slate-900/95 backdrop-blur-md border border-white/10 rounded-full px-3 py-2 flex items-center gap-3.5 shadow-2xl z-[60] animate-in fade-in slide-in-from-bottom-2 duration-150">
              {[
                { emoji: '👍', text: 'Me gusta' },
                { emoji: '❤️', text: 'Me encanta' },
                { emoji: '😂', text: 'Me divierte' },
                { emoji: '😮', text: 'Me asombra' },
                { emoji: '😢', text: 'Me entristece' },
                { emoji: '😡', text: 'Me enoja' }
              ].map((r) => (
                <button
                  key={r.emoji}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleSelectReaction(r.emoji, r.text);
                  }}
                  className="text-2xl hover:scale-130 transition-transform duration-100 cursor-pointer active:scale-95"
                  title={r.text}
                >
                  {r.emoji}
                </button>
              ))}
            </div>
          )}

          <button 
            onClick={handleLike}
            onMouseDown={handleStartPress}
            onMouseUp={handleReleasePress}
            onMouseLeave={handleReleasePress}
            onTouchStart={handleStartPress}
            onTouchEnd={handleReleasePress}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-md transition-all hover:bg-[var(--bg-hover)] ${liked ? 'text-[#1877f2]' : 'text-[var(--text-secondary)]'}`}
          >
            {liked ? (
              <span className="text-sm animate-in zoom-in duration-200">{reaction.emoji}</span>
            ) : (
              <ThumbsUp size={18} />
            )}
            <span className="text-xs font-bold">{liked ? reaction.text : 'Me gusta'}</span>
          </button>

          <button 
            onClick={handleToggleComments}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-md hover:bg-[var(--bg-hover)] transition-all ${showComments ? 'text-[#1877f2]' : 'text-[var(--text-secondary)]'}`}
          >
            <MessageCircle size={18} />
            <span className="text-xs font-bold">Comentar</span>
          </button>

          <button onClick={handleShare} className="flex-1 flex items-center justify-center gap-2 py-2 rounded-md hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] transition-all">
            <Share2 size={18} />
            <span className="text-xs font-bold">Compartir</span>
          </button>
        </div>

        {showComments && (
          <div className="border-t border-[var(--divider)] p-4 bg-[var(--bg-primary)] max-h-[400px] overflow-y-auto animate-in slide-in-from-top-2 duration-200">
            {loadingComments ? (
              <div className="flex items-center justify-center py-4 gap-2 text-xs text-slate-400 font-bold uppercase tracking-wider">
                <RefreshCw size={14} className="animate-spin text-indigo-500" />
                Cargando comentarios...
              </div>
            ) : (
              <CommentSection 
                videoId={video.id}
                user={user}
                comments={commentsList}
                onCommentAdded={handleCommentAdded}
              />
            )}
          </div>
        )}
      </div>

      {/* Gutter below post */}
      <div className="h-2 bg-[var(--bg-primary)]"></div>

      {showDeleteConfirm && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-300">
              <div className="bg-slate-900 border border-white/10 rounded-[40px] p-8 max-w-sm w-full shadow-2xl animate-in zoom-in duration-300 text-center">
                  <div className="w-16 h-16 bg-red-500/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
                      <Trash2 size={32} className="text-red-500" />
                  </div>
                  <h3 className="text-xl font-black text-white uppercase tracking-tighter mb-2">¿Eliminar video?</h3>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-8 leading-relaxed">Esta acción no se puede deshacer. El archivo se borrará permanentemente.</p>
                  <div className="flex flex-col gap-3">
                      <button 
                          onClick={() => handleDelete()}
                          className="w-full py-4 bg-red-600 hover:bg-red-500 text-white font-black rounded-2xl transition-all shadow-xl active:scale-95"
                      >
                          ELIMINAR
                      </button>
                      <button 
                          onClick={() => setShowDeleteConfirm(false)}
                          className="w-full py-4 bg-[var(--bg-tertiary)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)] font-black rounded-2xl transition-all"
                      >
                          CANCELAR
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* Image Modal */}
      {showImageModal && (
          <div className="fixed inset-0 z-[200] flex flex-col bg-black animate-in fade-in duration-300">
              {/* Header */}
              <div className="flex items-center justify-between p-4 bg-gradient-to-b from-black/80 to-transparent z-10">
                  <div className="flex items-center gap-3">
                      <button onClick={() => setShowImageModal(false)} className="p-2 text-white hover:bg-white/10 rounded-full">
                          <ChevronLeft size={24} />
                      </button>
                      <div className="flex flex-col">
                          <span className="text-sm font-bold text-white">{video.creatorName}</span>
                          <span className="text-[10px] text-slate-400">{formatTimeAgo(video.createdAt)}</span>
                      </div>
                  </div>
                  <div className="flex items-center gap-2">
                      <button onClick={handleDownload} className="p-2 text-white hover:bg-white/10 rounded-full">
                          <Download size={20} />
                      </button>
                      <button onClick={(e) => { e.preventDefault(); setShowImageModal(false); handleShare(e); }} className="p-2 text-white hover:bg-white/10 rounded-full">
                          <Share2 size={20} />
                      </button>
                  </div>
              </div>

              {/* Content */}
              <div className="flex-1 relative flex items-center justify-center overflow-hidden">
                  {video.isAlbum && video.albumItems && video.albumItems.length > 1 && (
                      <>
                          <button 
                              onClick={prevAlbumImage}
                              className="absolute left-2 top-1/2 -translate-y-1/2 p-3 bg-black/40 hover:bg-black/60 text-white rounded-full transition-all z-10"
                          >
                              <ChevronLeft size={24} />
                          </button>
                          <button 
                              onClick={nextAlbumImage}
                              className="absolute right-2 top-1/2 -translate-y-1/2 p-3 bg-black/40 hover:bg-black/60 text-white rounded-full transition-all z-10"
                          >
                              <ChevronRight size={24} />
                          </button>
                      </>
                  )}

                  <img 
                      src={db.getStreamerUrl(video.isAlbum && video.albumItems ? video.albumItems[currentAlbumIndex].id : video.id)} 
                      alt={video.title} 
                      className="max-w-full max-h-full object-contain" 
                      referrerPolicy="no-referrer"
                  />
              </div>

              {/* Footer */}
              <div className="p-4 bg-gradient-to-t from-black/80 to-transparent">
                  <p className="text-sm text-white mb-2 line-clamp-2">
                      {video.isAlbum && video.albumItems ? video.albumItems[currentAlbumIndex].title : video.title}
                  </p>
                  <div className="flex items-center gap-4">
                      <button onClick={handleLike} className={`flex items-center gap-1.5 text-sm ${liked ? 'text-blue-500' : 'text-white'}`}>
                          <ThumbsUp size={18} className={liked ? 'fill-current' : ''} />
                          <span>{likeCount}</span>
                      </button>
                      <Link to={watchUrl} className="flex items-center gap-1.5 text-sm text-white">
                          <MessageCircle size={18} />
                          <span>Comentar</span>
                      </Link>
                  </div>
              </div>
          </div>
      )}

      {/* Share Modal */}
      {showShareModal && (
          <ShareModal 
            video={video} 
            onClose={() => setShowShareModal(false)}
            onShared={() => {
                setSharesCount(prev => prev + 1);
            }}
          />
      )}

      {/* Purchase Modal for Download */}
      {showPurchaseModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-300">
              <div className="bg-slate-900 border border-white/10 p-8 rounded-[40px] shadow-2xl flex flex-col items-center text-center max-w-sm animate-in zoom-in-95">
                  <div className="w-16 h-16 bg-amber-500/20 rounded-2xl flex items-center justify-center mb-6">
                      <Download size={32} className="text-amber-500" />
                  </div>
                  <h2 className="text-xl font-black text-white uppercase tracking-tighter mb-2">Desbloquear para Descargar</h2>
                  <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mb-8 leading-relaxed">Este contenido es premium. Debes comprarlo para poder descargarlo y verlo offline.</p>
                  
                  <div className="w-full space-y-3">
                      <button onClick={handlePurchase} className="w-full py-4 bg-amber-500 hover:bg-amber-400 text-black font-black rounded-2xl transition-all shadow-xl active:scale-95 flex items-center justify-center gap-2">
                          COMPRAR POR {video.price} cr
                      </button>
                      <button onClick={() => setShowPurchaseModal(false)} className="w-full py-4 bg-[var(--bg-tertiary)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)] font-black rounded-2xl transition-all">
                          CANCELAR
                      </button>
                  </div>
                  
                  <div className="mt-6 flex items-center gap-2 text-[10px] text-slate-500 font-black uppercase tracking-widest">
                      Tu saldo: <span className="text-white">{Number(user?.balance || 0).toFixed(2)} cr</span>
                  </div>
              </div>
          </div>
      )}
      {showMembershipRequiredModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm animate-in fade-in duration-300">
              <div className="bg-slate-950 border border-white/10 p-8 rounded-[40px] shadow-2xl flex flex-col items-center text-center max-w-sm animate-in zoom-in-95">
                  <div className="w-16 h-16 bg-red-400/20 rounded-2xl flex items-center justify-center mb-6 border border-red-500/30">
                      <Layers size={32} className="text-red-500" />
                  </div>
                  <h2 className="text-xl font-black text-white uppercase tracking-tighter mb-2">Membresía Requerida</h2>
                  <p className="text-sm text-slate-300 font-bold tracking-tight mb-8 leading-relaxed">No tienes saldo suficiente. Debes obtener una membresía.</p>
                  
                  <div className="w-full space-y-3">
                      <button 
                          onClick={() => {
                              setShowMembershipRequiredModal(false);
                              navigate('/vip');
                          }} 
                          className="w-full py-4 bg-indigo-600 hover:bg-slate-800 text-white font-black rounded-2xl transition-all shadow-xl active:scale-95 flex items-center justify-center gap-2"
                      >
                          OBTENER MEMBRESÍA
                      </button>
                      <button 
                          onClick={() => setShowMembershipRequiredModal(false)} 
                          className="w-full py-4 bg-[var(--bg-tertiary)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)] font-black rounded-2xl transition-all"
                      >
                          CANCELAR
                      </button>
                  </div>
              </div>
          </div>
      )}
      {showConfigModal && (
        <VideoTranscodeModal 
          video={video}
          show={showConfigModal}
          onClose={() => setShowConfigModal(false)}
          onSaved={() => {
              // Si el padre pasó onConvert, podemos llamarlo si queremos que sepa que algo cambió
              // pero el modal ya hace el db request de add_to_queue.
              setShowMenu(false);
          }}
        />
      )}
    </div>
  );
});

export default VideoCard;