import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Video } from '../types';
import { Link } from './Router';
import { CheckCircle2, Clock, MoreVertical, Play, Music, RefreshCw, Folder, Share2, Download, Edit3, Trash2, ExternalLink, Image as ImageIcon, X } from 'lucide-react';
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

const VideoCard: React.FC<VideoCardProps> = React.memo(({ video, isUnlocked, isWatched, context }) => {
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
  const cardRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

    const isAdmin = user?.role?.trim().toUpperCase() === 'ADMIN';
    const isOwner = user?.id === video.creatorId;
    const canEdit = isAdmin || isOwner;

  const isAudio = Boolean(video.is_audio);
  const isImage = useMemo(() => video.videoUrl?.match(/\.(jpg|jpeg|png|webp|gif|bmp|svg)(\?.*)?$/i), [video.videoUrl]);
  
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
          setShowImageModal(true);
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

  return (
    <div ref={cardRef} className={`flex flex-col gap-3 group relative ${isWatched ? 'opacity-70 hover:opacity-100 transition-opacity' : ''}`}>
      <div className="relative aspect-video rounded-2xl overflow-hidden bg-slate-900 shadow-sm hover:shadow-2xl hover:shadow-indigo-500/20 hover:scale-[1.03] transition-all duration-500 block ring-1 ring-white/5 hover:ring-indigo-500/40">
        <Link 
            to={isImage ? '#' : watchUrl} 
            onClick={isImage ? handleImageClick : undefined}
            className="absolute inset-0 z-0"
        >
            {displayThumb ? (
                <img 
                src={displayThumb} 
                alt={video.title} 
                className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700 ease-out animate-in fade-in"
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

        {isNew && !isWatched && !isAudio && (
            <div className="absolute top-2 left-2 bg-red-600 text-white text-[9px] font-black px-2 py-0.5 rounded-lg shadow-lg shadow-red-900/40 animate-pulse uppercase tracking-widest pointer-events-none">NUEVO</div>
        )}

        <button 
            onClick={handleWatchLater}
            className={`absolute top-2 right-2 p-2 rounded-xl backdrop-blur-md border border-white/10 transition-all duration-300 opacity-0 group-hover:opacity-100 z-10 ${inWatchLater ? 'bg-indigo-600 text-white' : 'bg-black/40 text-slate-300 hover:text-white'}`}
        >
            <Clock size={16} fill={inWatchLater ? "currentColor" : "none"} />
        </button>

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

      <div className="flex gap-3 px-1">
        <Link to={`/channel/${video.creatorId}`} className="shrink-0 mt-1">
            {video.creatorAvatarUrl || settings?.defaultAvatar ? (
                <img src={video.creatorAvatarUrl || settings?.defaultAvatar} className="w-10 h-10 rounded-2xl object-cover bg-slate-900 border border-white/5 group-hover:border-indigo-500 transition-colors shadow-md" alt={video.creatorName} loading="lazy" referrerPolicy="no-referrer" />
            ) : (
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-sm font-black text-white shadow-inner uppercase">{video.creatorName?.[0] || '?'}</div>
            )}
        </Link>

        <div className="flex-1 min-w-0 flex flex-col">
            <Link to={isImage ? '#' : watchUrl} onClick={isImage ? handleImageClick : undefined} title={video.title}>
                <h3 className="text-sm font-black text-white leading-tight line-clamp-2 mb-1 group-hover:text-indigo-400 transition-colors uppercase tracking-tighter italic">{video.title}</h3>
            </Link>
            <div className="text-[10px] text-slate-500 flex flex-col gap-0.5">
                <Link to={`/channel/${video.creatorId}`} className="hover:text-slate-200 transition-colors flex items-center gap-1 w-fit font-bold uppercase tracking-widest text-slate-400">
                    {video.creatorName || 'Usuario'}
                    <CheckCircle2 size={10} className="text-indigo-500" />
                </Link>
                <div className="flex items-center gap-2 font-bold">
                    <span>{video.views} vistas</span>
                    <span className="w-1 h-1 bg-slate-700 rounded-full"></span>
                    <span>{formatTimeAgo(video.createdAt)}</span>
                </div>
            </div>
        </div>
        <div className="relative" ref={menuRef}>
            <button 
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowMenu(!showMenu); }} 
                className={`shrink-0 text-slate-600 hover:text-white self-start transition-all p-1 rounded-lg hover:bg-white/5 ${showMenu ? 'opacity-100 text-white bg-white/10' : 'opacity-0 group-hover:opacity-100'}`}
            >
                <MoreVertical size={20} />
            </button>
            
            {showMenu && (
                <div className="absolute bottom-full right-0 mb-2 w-48 bg-slate-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-50 animate-in fade-in zoom-in-95 origin-bottom-right">
                    <div className="p-1">
                        <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleShare(e); }} className="w-full p-3 flex items-center gap-3 rounded-xl hover:bg-white/5 text-slate-300 hover:text-white transition-colors text-left">
                            <Share2 size={14} className="text-slate-500" />
                            <span className="text-[10px] font-black uppercase tracking-widest">Compartir</span>
                        </button>
                        <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDownload(e); }} className="w-full p-3 flex items-center gap-3 rounded-xl hover:bg-white/5 text-slate-300 hover:text-white transition-colors text-left">
                            <Download size={14} className="text-slate-500" />
                            <span className="text-[10px] font-black uppercase tracking-widest">Descargar</span>
                        </button>
                        <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleWatchLater(e); }} className="w-full p-3 flex items-center gap-3 rounded-xl hover:bg-white/5 text-slate-300 hover:text-white transition-colors text-left">
                            <Clock size={14} className={inWatchLater ? 'text-indigo-400' : 'text-slate-500'} />
                            <span className="text-[10px] font-black uppercase tracking-widest">{inWatchLater ? 'Quitar de ver más tarde' : 'Ver más tarde'}</span>
                        </button>
                        {canEdit && (
                            <>
                                <div className="h-px bg-white/5 my-1"></div>
                                <Link to={`/edit/${video.id}`} className="w-full p-3 flex items-center gap-3 rounded-xl hover:bg-white/5 text-slate-300 hover:text-white transition-colors text-left">
                                    <Edit3 size={14} className="text-slate-500" />
                                    <span className="text-[10px] font-black uppercase tracking-widest">Editar</span>
                                </Link>
                                <button 
                                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowDeleteConfirm(true); setShowMenu(false); }}
                                    className="w-full p-3 flex items-center gap-3 rounded-xl hover:bg-red-500/10 text-red-400 transition-colors text-left"
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
                  <div className="w-full h-full rounded-3xl overflow-hidden bg-slate-950 shadow-2xl border border-white/10">
                      <img 
                          src={db.getStreamerUrl(video.id)} 
                          alt={video.title} 
                          className="w-full h-full object-contain max-h-[80vh]" 
                          referrerPolicy="no-referrer"
                      />
                      <div className="p-6 bg-slate-900/80 backdrop-blur-md border-t border-white/5">
                          <h3 className="text-xl font-black text-white uppercase italic tracking-tighter mb-1">{video.title}</h3>
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