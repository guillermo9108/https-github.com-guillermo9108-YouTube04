import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Video } from '../types';
import { Link } from './Router';
import { CheckCircle2, Clock, MoreVertical, Play, Music, RefreshCw, Folder } from 'lucide-react';
import { db } from '../services/db';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { generateThumbnail } from '../utils/videoGenerator';

// Sistema de control global para no saturar el servidor
let isAnyCardProcessing = false;
const failedExtractions = new Set<string>();

interface VideoCardProps {
  video: Video;
  isUnlocked: boolean;
  isWatched?: boolean;
  context?: { query?: string, category?: string, folder?: string, page?: number };
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
  const toast = useToast();
  const isNew = (Date.now() / 1000 - video.createdAt) < 86400;
  
  const [imgError, setImgError] = useState(false);
  const [localThumb, setLocalThumb] = useState<string | null>(null);
  const [inWatchLater, setInWatchLater] = useState(user?.watchLater?.includes(video.id) || false);
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [shouldLoadImg, setShouldLoadImg] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const isAudio = Boolean(video.is_audio);
  const hasDefaultThumb = !video.thumbnailUrl || video.thumbnailUrl.includes('default.jpg');

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
      const canProcess = isAudio && hasDefaultThumb && isVisible && !isProcessing && !localThumb && !isAnyCardProcessing && !failedExtractions.has(video.id);
      if (canProcess) {
          isAnyCardProcessing = true;
          setIsProcessing(true);
          const process = async () => {
              try {
                  const streamUrl = video.videoUrl.includes('action=stream') ? video.videoUrl : `api/index.php?action=stream&id=${video.id}`;
                  const result = await generateThumbnail(streamUrl, true, true);
                  if (!isMounted) return;
                  if (result.duration > 0) {
                      const fd = new FormData();
                      fd.append('id', video.id);
                      fd.append('duration', String(result.duration || video.duration));
                      fd.append('success', '1');
                      await db.request('action=update_video_metadata', { method: 'POST', body: fd });
                      db.setHomeDirty();
                  } else { failedExtractions.add(video.id); }
              } catch (e) { failedExtractions.add(video.id); } 
              finally { if (isMounted) { setIsProcessing(false); isAnyCardProcessing = false; } }
          };
          const t = setTimeout(process, 1000);
          return () => { isMounted = false; clearTimeout(t); };
      }
  }, [video.id, isAudio, hasDefaultThumb, isVisible, isProcessing, localThumb]);

  useEffect(() => {
      return () => {
          if (localThumb) URL.revokeObjectURL(localThumb);
          if (isProcessing) isAnyCardProcessing = false;
      };
  }, [localThumb, isProcessing]);

  const handleWatchLater = async (e: React.MouseEvent) => {
      e.preventDefault(); e.stopPropagation();
      if (!user) return;
      try {
          await db.toggleWatchLater(user.id, video.id);
          setInWatchLater(!inWatchLater);
          toast.success(!inWatchLater ? "Añadido a Ver más tarde" : "Eliminado de Ver más tarde");
          refreshUser();
      } catch (e) {}
  };

  const displayThumb = useMemo(() => {
      if (!shouldLoadImg) return null; // No retornamos nada hasta ser visibles
      return localThumb || (!imgError && video.thumbnailUrl && !video.thumbnailUrl.includes('default.jpg') ? video.thumbnailUrl : (isAudio ? "api/uploads/thumbnails/defaultaudio.jpg" : null));
  }, [shouldLoadImg, localThumb, imgError, video.thumbnailUrl, isAudio]);

  return (
    <div ref={cardRef} className={`flex flex-col gap-3 group ${isWatched ? 'opacity-70 hover:opacity-100 transition-opacity' : ''}`}>
      <Link 
        to={watchUrl} 
        className="relative aspect-video rounded-2xl overflow-hidden bg-slate-900 shadow-sm hover:shadow-2xl hover:shadow-indigo-500/20 hover:scale-[1.03] transition-all duration-500 block ring-1 ring-white/5 hover:ring-indigo-500/40"
      >
        {displayThumb ? (
            <img 
              src={displayThumb} 
              alt={video.title} 
              className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700 ease-out animate-in fade-in"
              loading="lazy" 
              onError={() => setImgError(true)}
            />
        ) : (
            <div className="w-full h-full flex flex-col items-center justify-center bg-slate-950 text-slate-800 p-4">
                <div className="relative">
                    {isAudio ? <Music size={48} className="opacity-20 mb-2" /> : <Play size={48} className="opacity-20 mb-2"/>}
                    {isProcessing && <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-full scale-150"><RefreshCw size={20} className="text-indigo-500 animate-spin" /></div>}
                </div>
            </div>
        )}
        
        {locationLabel && (
            <div className="absolute top-2 left-2 bg-black/60 backdrop-blur-md text-[8px] font-black text-slate-300 px-2 py-0.5 rounded-lg border border-white/10 uppercase tracking-widest flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                <Folder size={8} className="text-indigo-400" /> {locationLabel}
            </div>
        )}

        <div className="absolute bottom-2 right-2 bg-black/80 text-white text-[10px] font-black px-2 py-0.5 rounded-lg backdrop-blur-md border border-white/5">
           {formatDuration(video.duration)}
        </div>

        {isNew && !isWatched && !isAudio && (
            <div className="absolute top-2 left-2 bg-red-600 text-white text-[9px] font-black px-2 py-0.5 rounded-lg shadow-lg shadow-red-900/40 animate-pulse uppercase tracking-widest">NUEVO</div>
        )}

        <button 
            onClick={handleWatchLater}
            className={`absolute top-2 right-2 p-2 rounded-xl backdrop-blur-md border border-white/10 transition-all duration-300 opacity-0 group-hover:opacity-100 ${inWatchLater ? 'bg-indigo-600 text-white' : 'bg-black/40 text-slate-300 hover:text-white'}`}
        >
            <Clock size={16} fill={inWatchLater ? "currentColor" : "none"} />
        </button>

        {isWatched && (
             <div className="absolute inset-0 bg-black/60 flex items-center justify-center backdrop-blur-[2px]">
                 <div className="flex items-center gap-2 text-slate-200 bg-indigo-600/80 px-3 py-1 rounded-full backdrop-blur-md border border-white/10 shadow-xl">
                    <CheckCircle2 size={14} /> <span className="text-[10px] font-black tracking-widest uppercase">VISTO</span>
                 </div>
             </div>
        )}
        
        {!isUnlocked && !isWatched && (
            <div className="absolute bottom-2 left-2 bg-amber-400 text-black text-[10px] font-black px-2 py-0.5 rounded-lg shadow-lg flex items-center gap-1.5 border border-amber-500/20">
                {video.price} $
            </div>
        )}
      </Link>

      <div className="flex gap-3 px-1">
        <Link to={`/channel/${video.creatorId}`} className="shrink-0 mt-1">
            {video.creatorAvatarUrl ? (
                <img src={video.creatorAvatarUrl} className="w-10 h-10 rounded-2xl object-cover bg-slate-900 border border-white/5 group-hover:border-indigo-500 transition-colors shadow-md" alt={video.creatorName} loading="lazy" />
            ) : (
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-sm font-black text-white shadow-inner uppercase">{video.creatorName?.[0] || '?'}</div>
            )}
        </Link>

        <div className="flex-1 min-w-0 flex flex-col">
            <Link to={watchUrl} title={video.title}>
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
        <button className="shrink-0 text-slate-600 hover:text-white self-start opacity-0 group-hover:opacity-100 transition-opacity p-1"><MoreVertical size={20} /></button>
      </div>
    </div>
  );
});

export default VideoCard;