import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Video } from '../types';
import { Link } from './Router';
import { CheckCircle2, Clock, MoreVertical, Play, Music, RefreshCw, Folder, Share2, Download, Edit3, Trash2, ExternalLink, Image as ImageIcon, X, Layers, ChevronLeft, ChevronRight, ThumbsUp, MessageCircle, UserPlus, Heart } from 'lucide-react';
import { db } from '../services/db';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useSettings } from '../context/SettingsContext';
import { generateThumbnail } from '../utils/videoGenerator';

// Sistema de control global para no saturar el servidor
let isAnyCardProcessing = false;
const failedExtractions = new Set<string>();

interface VideoCardProps {
  video: Video;
  isUnlocked: boolean;
  isWatched?: boolean;
  onCategoryClick?: () => void;
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

const formatDuration = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return h > 0 ? `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}` : `${m}:${s.toString().padStart(2, '0')}`;
};

const VideoCard: React.FC<VideoCardProps> = React.memo(({ video, isUnlocked, isWatched, onCategoryClick, context }) => {
  const { user, refreshUser } = useAuth();
  const { settings } = useSettings();
  const toast = useToast();
  const isNew = (Date.now() / 1000 - video.createdAt) < 86400;
  
  const [imgError, setImgError] = useState(false);
  const [localThumb, setLocalThumb] = useState<string | null>(null);
  const [inWatchLater, setInWatchLater] = useState(user?.watchLater?.includes(video.id) || false);
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [shouldLoadImg, setShouldLoadImg] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showImageModal, setShowImageModal] = useState(false);
  const [showFullTitle, setShowFullTitle] = useState(false);
  const [currentAlbumIndex, setCurrentAlbumIndex] = useState(0);
  const cardRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

    const isAdmin = user?.role?.trim().toUpperCase() === 'ADMIN';
    const isOwner = user?.id === video.creatorId;
    const canEdit = isAdmin || isOwner;

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

  const watchUrl = useMemo(() => {
    const base = `/watch/${video.id}`;
    const params = new URLSearchParams();
    if (context?.query) params.set('q', context.query);
    if (context?.folder) params.set('f', context.folder);
    if (context?.category && context.category !== 'TODOS') params.set('c', context.category);
    if (context?.page !== undefined) params.set('p', String(context.page));
    if (context?.sort_order) params.set('s', context.sort_order);
    
    const qs = params.toString();
    return qs ? `${base}?${qs}` : base;
  }, [video.id, context]);

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
      const canProcess = isUnlocked && hasDefaultThumb && isVisible && !isProcessing && !localThumb && !isAnyCardProcessing && !failedExtractions.has(video.id);
      if (canProcess) {
          isAnyCardProcessing = true;
          setIsProcessing(true);
          const process = async () => {
              try {
                  const streamUrl = db.getStreamerUrl(video.id, user?.sessionToken);
                  const result = await generateThumbnail(streamUrl, isAudio, false); // No saltar imagen
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
                  } else { failedExtractions.add(video.id); }
              } catch (e) { failedExtractions.add(video.id); } 
              finally { if (isMounted) { setIsProcessing(false); isAnyCardProcessing = false; } }
          };
          const t = setTimeout(process, 1000);
          return () => { isMounted = false; clearTimeout(t); };
      }
  }, [video.id, isAudio, hasDefaultThumb, isVisible, isProcessing, localThumb, isUnlocked]);

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
      const url = `${window.location.origin}/#${watchUrl}`;
      console.log("Sharing URL:", url);
      if (navigator.share) {
          navigator.share({ title: video.title, url }).catch((err) => {
              console.error("Share failed:", err);
              // Fallback to clipboard if share is cancelled or fails
              if (navigator.clipboard) {
                  navigator.clipboard.writeText(url);
                  toast.success("Enlace copiado");
              }
          });
      } else if (navigator.clipboard) {
          navigator.clipboard.writeText(url);
          toast.success("Enlace copiado al portapapeles");
      } else {
          toast.info("Copia el enlace: " + url);
      }
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
      const isApp = (user?.deviceInfo?.includes('com.streampay.app') || 
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
          toast.error("Saldo insuficiente");
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
      
      // Si es una imagen y no tiene miniatura, usar la URL de streaming
      if (isImage && !video.thumbnailUrl) return db.getStreamerUrl(video.id);

      // Si hay error en la imagen o no hay miniatura, intentar usar el default de configuración
      if (imgError || !video.thumbnailUrl) {
          return defaultThumb || (isAudio ? "/api/uploads/thumbnails/defaultaudio.jpg" : "/api/uploads/thumbnails/default.jpg");
      }

      return video.thumbnailUrl;
  }, [shouldLoadImg, localThumb, imgError, video.thumbnailUrl, video.videoUrl, isAudio, isImage, defaultThumb]);

  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(Number(video.likes || 0));

  useEffect(() => {
    if (user && video.id) {
        db.getInteraction(user.id, video.id).then(res => {
            if (res) setLiked(res.liked);
        });
    }
  }, [user?.id, video.id]);

  const handleLike = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
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
    <div ref={cardRef} className={`flex flex-col bg-slate-900/40 border border-white/5 rounded-2xl overflow-hidden group transition-all duration-300 ${isWatched ? 'opacity-70 hover:opacity-100' : ''}`}>
      {/* Header: User Info */}
      <div className="flex items-center justify-between p-2.5">
        <div className="flex items-center gap-2">
          <Link to={`/channel/${video.creatorId}`} className="shrink-0">
              {video.creatorAvatarUrl || settings?.defaultAvatar ? (
                  <img src={video.creatorAvatarUrl || settings?.defaultAvatar} className="w-9 h-9 rounded-full object-cover bg-slate-800 border border-white/10" alt={video.creatorName} loading="lazy" referrerPolicy="no-referrer" />
              ) : (
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-xs font-black text-white shadow-inner uppercase">{video.creatorName?.[0] || '?'}</div>
              )}
          </Link>
          <div className="flex flex-col">
            <div className="flex items-center gap-1">
              <Link to={`/channel/${video.creatorId}`} className="text-xs font-bold text-white hover:text-indigo-400 transition-colors truncate max-w-[100px]">
                {video.creatorName || 'Usuario'}
              </Link>
              <CheckCircle2 size={10} className="text-indigo-500 fill-indigo-500/10" />
              <span className="text-slate-500 text-[10px]">•</span>
              <button className="text-indigo-400 text-[10px] font-bold hover:text-indigo-300 transition-colors">Seguir</button>
            </div>
            <div className="flex items-center gap-1 text-[9px] text-slate-500 font-medium">
              <span>{formatTimeAgo(video.createdAt)}</span>
              <span className="w-0.5 h-0.5 bg-slate-700 rounded-full"></span>
              <ExternalLink size={8} />
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-0.5">
          <div className="relative" ref={menuRef}>
            <button 
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowMenu(!showMenu); }} 
                className={`p-1.5 rounded-full hover:bg-white/5 text-slate-400 transition-all ${showMenu ? 'bg-white/10 text-white' : ''}`}
            >
                <MoreVertical size={16} />
            </button>
            
            {showMenu && (
                <div className="absolute top-full right-0 mt-1 w-48 bg-slate-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-50 animate-in fade-in zoom-in-95 origin-top-right">
                    <div className="p-1">
                        <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleShare(e); }} className="w-full p-2.5 flex items-center gap-3 rounded-xl hover:bg-white/5 text-slate-300 hover:text-white transition-colors text-left">
                            <Share2 size={14} className="text-slate-500" />
                            <span className="text-[10px] font-black uppercase tracking-widest">Compartir</span>
                        </button>
                        <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDownload(e); }} className="w-full p-2.5 flex items-center gap-3 rounded-xl hover:bg-white/5 text-slate-300 hover:text-white transition-colors text-left">
                            <Download size={14} className="text-slate-500" />
                            <span className="text-[10px] font-black uppercase tracking-widest">Descargar</span>
                        </button>
                        <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleWatchLater(e); }} className="w-full p-2.5 flex items-center gap-3 rounded-xl hover:bg-white/5 text-slate-300 hover:text-white transition-colors text-left">
                            <Clock size={14} className={inWatchLater ? 'text-indigo-400' : 'text-slate-500'} />
                            <span className="text-[10px] font-black uppercase tracking-widest">{inWatchLater ? 'Quitar de ver más tarde' : 'Ver más tarde'}</span>
                        </button>
                        {canEdit && (
                            <>
                                <div className="h-px bg-white/5 my-1"></div>
                                <Link to={`/edit/${video.id}`} className="w-full p-2.5 flex items-center gap-3 rounded-xl hover:bg-white/5 text-slate-300 hover:text-white transition-colors text-left">
                                    <Edit3 size={14} className="text-slate-500" />
                                    <span className="text-[10px] font-black uppercase tracking-widest">Editar</span>
                                </Link>
                                <button 
                                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowDeleteConfirm(true); setShowMenu(false); }}
                                    className="w-full p-2.5 flex items-center gap-3 rounded-xl hover:bg-red-500/10 text-red-400 transition-colors text-left"
                                >
                                    <Trash2 size={14} />
                                    <span className="text-[10px] font-black uppercase tracking-widest">Eliminar</span>
                                </button>
                            </>
                        )}
                    </div>
                </div>
            )}
          </div>
          <button className="p-1.5 rounded-full hover:bg-white/5 text-slate-400 transition-all">
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Text Content: Title & Description */}
      <div className="px-3 pb-2">
        <div className="relative">
            <div className={`text-xs font-normal text-slate-100 leading-snug ${!showFullTitle ? 'line-clamp-3' : ''} transition-colors`}>
              <span className="font-bold">{video.title}</span>
              {video.description && (
                  <span className="text-slate-300 ml-1">
                      {video.description}
                  </span>
              )}
            </div>
            {((video.title?.length || 0) + (video.description?.length || 0)) > 100 && !showFullTitle && (
                <button 
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowFullTitle(true); }}
                    className="text-slate-400 text-[10px] font-bold hover:text-white mt-1"
                >
                    Ver más
                </button>
            )}
        </div>
      </div>

      {/* Media Content */}
      <div className={`relative w-full ${video.isAlbum && video.albumItems && video.albumItems.length > 1 ? 'aspect-[4/3]' : 'aspect-video'} bg-black overflow-hidden border-y border-white/5`}>
        {video.isAlbum && video.albumItems && video.albumItems.length > 1 ? (
            <div className="grid grid-cols-4 h-full gap-0.5" onClick={handleImageClick}>
                {/* Main Image (Left) */}
                <div className="col-span-3 h-full relative">
                    <img 
                        src={db.getStreamerUrl(video.albumItems[0].id)} 
                        alt={video.albumItems[0].title}
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                    />
                </div>
                {/* Side Column (Right) */}
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
            </div>
        ) : (
            <Link 
                to={video.isCategoryCard ? '#' : (isImage ? '#' : watchUrl)} 
                onClick={video.isCategoryCard ? (e) => { e.preventDefault(); onCategoryClick?.(); } : (isImage ? handleImageClick : undefined)}
                className="absolute inset-0 z-0"
            >
                {displayThumb ? (
                    <img 
                    src={displayThumb} 
                    alt={video.title} 
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out animate-in fade-in"
                    loading="lazy" 
                    referrerPolicy="no-referrer"
                    onError={() => setImgError(true)}
                    />
                ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center bg-slate-950 text-slate-800 p-4">
                        <div className="relative">
                            {isAudio ? <Music size={48} className="opacity-20 mb-2" /> : isImage ? <ImageIcon size={48} className="opacity-20 mb-2" /> : <Play size={48} className="opacity-20 mb-2"/>}
                            {isProcessing && <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-full scale-150"><RefreshCw size={20} className="text-indigo-500 animate-spin" /></div>}
                        </div>
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
            <div className="absolute bottom-2 right-2 bg-black/80 text-white text-[10px] font-black px-2 py-0.5 rounded-lg backdrop-blur-md border border-white/5 pointer-events-none">
               {formatDuration(video.duration)}
            </div>
        )}

        {isImage && (
            <div className="absolute top-3 right-3 z-10 flex gap-2">
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
                {video.price} $
            </div>
        )}
      </div>

      {/* Footer: Interactions */}
      <div className="p-1">
        <div className="flex items-center justify-between px-3 py-2">
          <div className="flex items-center gap-1.5">
            <div className="flex items-center -space-x-1">
                <div className="w-4 h-4 bg-blue-500 rounded-full flex items-center justify-center border border-slate-900 shadow-sm">
                <ThumbsUp size={8} className="text-white fill-white" />
                </div>
                <div className="w-4 h-4 bg-red-500 rounded-full flex items-center justify-center border border-slate-900 shadow-sm">
                <Heart size={8} className="text-white fill-white" />
                </div>
            </div>
            <span className="text-[11px] text-slate-400 font-medium">Yunior Rodríguez y {likeCount} más</span>
          </div>
          <div className="flex items-center gap-3 text-[11px] text-slate-400 font-medium">
            <span>{video.views} vistas</span>
            <span>{video.dislikes || 0} compartido</span>
          </div>
        </div>
        
        <div className="h-px bg-white/5 mx-2 mb-1"></div>
        
        <div className="flex items-center gap-1 px-1 pb-1">
          <button 
            onClick={handleLike}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-full transition-all bg-white/5 hover:bg-white/10 ${liked ? 'text-blue-500' : 'text-slate-400'}`}
          >
            <ThumbsUp size={16} className={liked ? 'fill-current' : ''} />
            <span className="text-[11px] font-bold">Me gusta</span>
          </button>
          <Link to={watchUrl} className="flex-1 flex items-center justify-center gap-2 py-2 rounded-full bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-all">
            <MessageCircle size={16} />
            <span className="text-[11px] font-bold">Comentar</span>
          </Link>
          <button onClick={handleShare} className="flex-1 flex items-center justify-center gap-2 py-2 rounded-full bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-all">
            <Share2 size={16} />
            <span className="text-[11px] font-bold">Compartir</span>
          </button>
        </div>
      </div>

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
                          className="w-full py-4 bg-slate-800 hover:bg-slate-700 text-white font-black rounded-2xl transition-all"
                      >
                          CANCELAR
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* Image Modal */}
      {showImageModal && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/95 backdrop-blur-xl animate-in fade-in duration-300">
              <div className="relative w-full max-w-5xl max-h-[90vh] flex flex-col items-center animate-in zoom-in duration-300">
                  <button 
                      onClick={() => setShowImageModal(false)}
                      className="absolute -top-12 right-0 p-2 bg-white/10 hover:bg-white/20 text-white rounded-full transition-all"
                  >
                      <X size={24} />
                  </button>

                  {video.isAlbum && video.albumItems && video.albumItems.length > 1 && (
                      <>
                          <button 
                              onClick={prevAlbumImage}
                              className="absolute left-4 top-1/2 -translate-y-1/2 p-4 bg-white/10 hover:bg-white/20 text-white rounded-full transition-all z-10"
                          >
                              <ChevronLeft size={32} />
                          </button>
                          <button 
                              onClick={nextAlbumImage}
                              className="absolute right-4 top-1/2 -translate-y-1/2 p-4 bg-white/10 hover:bg-white/20 text-white rounded-full transition-all z-10"
                          >
                              <ChevronRight size={32} />
                          </button>
                          <div className="absolute -bottom-12 left-1/2 -translate-x-1/2 flex gap-2">
                              {video.albumItems.map((_, idx) => (
                                  <div 
                                      key={idx} 
                                      className={`w-2 h-2 rounded-full transition-all ${idx === currentAlbumIndex ? 'bg-indigo-500 w-6' : 'bg-white/20'}`}
                                  />
                              ))}
                          </div>
                      </>
                  )}

                  <div className="w-full h-full rounded-3xl overflow-hidden bg-slate-950 shadow-2xl border border-white/10 relative">
                      <img 
                          src={db.getStreamerUrl(video.isAlbum && video.albumItems ? video.albumItems[currentAlbumIndex].id : video.id)} 
                          alt={video.title} 
                          className="w-full h-full object-contain max-h-[80vh]" 
                          referrerPolicy="no-referrer"
                      />
                      <div className="p-6 bg-slate-900/80 backdrop-blur-md border-t border-white/5">
                          <h3 className="text-xl font-black text-white uppercase italic tracking-tighter mb-1">
                              {video.isAlbum && video.albumItems ? video.albumItems[currentAlbumIndex].title : video.title}
                          </h3>
                          <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 rounded-xl overflow-hidden bg-slate-800">
                                      {video.creatorAvatarUrl || settings?.defaultAvatar ? (
                                          <img src={video.creatorAvatarUrl || settings?.defaultAvatar} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                      ) : (
                                          <div className="w-full h-full flex items-center justify-center text-xs font-black text-white/20">{video.creatorName?.[0] || '?'}</div>
                                      )}
                                  </div>
                                  <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">@{video.creatorName}</span>
                              </div>
                              <div className="flex items-center gap-4">
                                  <button onClick={handleDownload} className="flex items-center gap-2 text-[10px] font-black text-indigo-400 uppercase tracking-widest hover:text-indigo-300 transition-colors">
                                      <Download size={14} /> Descargar
                                  </button>
                                  <button onClick={handleShare} className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-white transition-colors">
                                      <Share2 size={14} /> Compartir
                                  </button>
                              </div>
                          </div>
                      </div>
                  </div>
              </div>
          </div>
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
                          COMPRAR POR {video.price} $
                      </button>
                      <button onClick={() => setShowPurchaseModal(false)} className="w-full py-4 bg-slate-800 hover:bg-slate-700 text-white font-black rounded-2xl transition-all">
                          CANCELAR
                      </button>
                  </div>
                  
                  <div className="mt-6 flex items-center gap-2 text-[10px] text-slate-500 font-black uppercase tracking-widest">
                      Tu saldo: <span className="text-white">{Number(user?.balance || 0).toFixed(2)} $</span>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
});

export default VideoCard;