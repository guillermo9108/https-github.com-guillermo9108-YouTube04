import React, { useState, useEffect } from 'react';
import { Video, User, MarketplaceItem } from '../types';
import { db } from '../services/db';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { 
    X, Globe, ChevronDown, Users, Share2, Send, MoreHorizontal,
    Facebook, Link as LinkIcon, Loader2, Image as ImageIcon
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface ShareModalProps {
    video?: Video;
    item?: MarketplaceItem;
    onClose: () => void;
    onShared?: () => void;
}

export default function ShareModal({ video, item, onClose, onShared }: ShareModalProps) {
    const { user } = useAuth();
    const toast = useToast();
    const [description, setDescription] = useState('');
    const [isSharing, setIsSharing] = useState(false);
    const [recentUsers, setRecentUsers] = useState<User[]>([]);

    useEffect(() => {
        db.getAllUsers().then(users => {
            setRecentUsers(users.slice(0, 10));
        }).catch(() => {});
    }, []);

    const shareUrl = video 
        ? `${window.location.origin}/watch/${video.id}` 
        : (item ? `${window.location.origin}/marketplace/item/${item.id}` : window.location.origin);

    const title = video?.title || item?.title || 'Contenido';
    const thumb = video ? video.thumbnailUrl : (item?.images?.[0] || '');

    const handleShareNow = async () => {
        if (!user) {
            toast.error("Debes iniciar sesión para compartir");
            return;
        }

        setIsSharing(true);
        try {
            await db.reshareVideo(
                video?.id || null, 
                user.id, 
                description, 
                item?.id || null
            );
            toast.success("Publicado en tu perfil");
            if (onShared) onShared();
            onClose();
        } catch (err: any) {
            toast.error(err.message || "Error al compartir");
        } finally {
            setIsSharing(false);
        }
    };

    const handleFacebookShare = () => {
        window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`, '_blank');
        onClose();
    };

    const handleNativeShare = async () => {
        if (navigator.share) {
            try {
                await navigator.share({
                    title,
                    text: video?.description || item?.description || '',
                    url: shareUrl,
                });
            } catch (err) {}
        } else {
            navigator.clipboard.writeText(shareUrl);
            toast.success("Enlace copiado al portapapeles");
        }
        onClose();
    };

    const handleStoryShare = async () => {
        if (!user) return;
        setIsSharing(true);
        try {
            const formData = new FormData();
            formData.append('userId', user.id);
            if (video) formData.append('videoId', video.id);
            if (item) formData.append('productId', item.id);
            if (description) formData.append('overlayText', description);
            
            await db.uploadStory(formData);
            toast.success("Añadido a tu historia");
            onClose();
        } catch (err: any) {
            toast.error(err.message || "Error al subir historia");
        } finally {
            setIsSharing(false);
        }
    };

    const handleShareToUser = async (targetUser: User) => {
        if (!user) return;
        try {
            const isImage = video?.category?.toUpperCase() === 'IMAGES';
            await db.sendMessage({
                userId: user.id,
                receiverId: targetUser.id,
                text: `Te recomendé este contenido: ${title}${description ? ` - ${description}` : ''}`,
                videoUrl: video && !isImage ? video.videoUrl : undefined,
                imageUrl: (video && isImage) ? video.videoUrl : (item ? item.images?.[0] : undefined),
                mediaType: isImage || item ? 'IMAGE' : 'VIDEO'
            });
            toast.success(`Enviado a ${targetUser.username}`);
            onClose();
        } catch (err: any) {
            toast.error("Error al enviar mensaje");
        }
    };

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center">
                <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={onClose}
                    className="absolute inset-0 bg-black/70 backdrop-blur-sm"
                />
                
                <motion.div 
                    initial={{ y: "100%" }}
                    animate={{ y: 0 }}
                    exit={{ y: "100%" }}
                    transition={{ type: "spring", damping: 25, stiffness: 300 }}
                    className="relative bg-[#242526] w-full max-w-lg rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
                >
                    {/* Header */}
                    <div className="flex items-center justify-center p-4 border-b border-white/10 relative">
                        <h3 className="text-white font-bold">Compartir</h3>
                        <button 
                            onClick={onClose}
                            className="absolute right-4 p-2 bg-[#3a3b3c] hover:bg-[#4e4f50] rounded-full text-[#b0b3b8] transition-colors"
                        >
                            <X size={20} />
                        </button>
                    </div>

                    <div className="overflow-y-auto p-4 space-y-4">
                        {/* User Header */}
                        <div className="flex items-start gap-3">
                            <img 
                                src={user?.avatarUrl || 'https://via.placeholder.com/40'} 
                                alt={user?.username}
                                className="w-10 h-10 rounded-full object-cover"
                            />
                            <div className="flex-1">
                                <h4 className="text-white font-bold text-sm leading-tight">{user?.username}</h4>
                                <div className="flex items-center gap-2 mt-1">
                                    <button className="flex items-center gap-1 bg-[#3a3b3c] px-2 py-0.5 rounded-md text-[#e4e6eb] text-[xs] font-bold">
                                        <Users size={12} />
                                        <span>Feed</span>
                                        <ChevronDown size={12} />
                                    </button>
                                    <button className="flex items-center gap-1 bg-[#3a3b3c] px-2 py-0.5 rounded-md text-[#e4e6eb] text-[xs] font-bold">
                                        <Globe size={12} />
                                        <span>Público</span>
                                        <ChevronDown size={12} />
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Textarea */}
                        <textarea 
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Escribe algo..."
                            className="w-full bg-transparent border-none text-white text-[17px] placeholder-[#b0b3b8] outline-none resize-none min-h-[80px]"
                        />

                        {/* Content Preview (Facebook style) */}
                        <div className="border border-white/10 rounded-xl overflow-hidden bg-[#18191a]">
                            {(thumb) && (
                                <img 
                                    src={thumb} 
                                    alt={title}
                                    className="w-full aspect-video object-cover"
                                    referrerPolicy="no-referrer"
                                />
                            )}
                            <div className="p-3 border-t border-white/5">
                                <div className="text-[#b0b3b8] text-[12px] uppercase font-bold mb-1">
                                    {video ? 'STREAMPAY.APP' : (item ? 'MARKETPLACE' : 'STREAMPAY.APP')}
                                </div>
                                <h5 className="text-white font-bold text-sm line-clamp-2">{title}</h5>
                                <p className="text-[#b0b3b8] text-xs mt-1 line-clamp-1">{video?.description || item?.description}</p>
                            </div>
                        </div>

                        {/* Share Options Footer - Simplified layout */}
                        <div className="flex flex-col gap-4 pt-2">
                             <div className="flex flex-wrap gap-3 justify-center">
                                <button 
                                    onClick={handleFacebookShare}
                                    className="p-3 bg-[#1877f2]/10 text-[#1877f2] rounded-xl hover:bg-[#1877f2] hover:text-white transition-all transform active:scale-95 flex items-center gap-2"
                                >
                                    <Facebook size={18} />
                                    <span className="text-xs font-bold uppercase tracking-tight">Facebook</span>
                                </button>
                                <button 
                                    onClick={() => {
                                        navigator.clipboard.writeText(shareUrl);
                                        toast.success("Enlace copiado");
                                    }}
                                    className="p-3 bg-zinc-800 text-white rounded-xl hover:bg-zinc-700 transition-all transform active:scale-95 flex items-center gap-2"
                                >
                                    <LinkIcon size={18} />
                                    <span className="text-xs font-bold uppercase tracking-tight">Enlace</span>
                                </button>
                             </div>

                             <button 
                                onClick={handleShareNow}
                                disabled={isSharing}
                                className="w-full bg-[#1877f2] hover:bg-[#166fe5] text-white font-bold py-3 px-8 rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center shadow-lg shadow-blue-500/20"
                             >
                                {isSharing ? <Loader2 className="animate-spin mr-2" size={20} /> : null}
                                {isSharing ? "Compartiendo..." : "Publicar en Feed"}
                             </button>
                        </div>
                    </div>

                    {/* Horizontal Share List (Messenger style) */}
                    <div className="p-4 border-t border-white/10 bg-[#242526]">
                        <div className="flex gap-4 overflow-x-auto pb-2 no-scrollbar">
                            {recentUsers.map((u) => (
                                <div 
                                    key={u.id} 
                                    onClick={() => handleShareToUser(u)}
                                    className="flex flex-col items-center gap-1 shrink-0 group cursor-pointer"
                                >
                                    <div className="relative">
                                        <img 
                                            src={u.avatarUrl || 'https://via.placeholder.com/60'} 
                                            className="w-12 h-12 rounded-full object-cover border-2 border-transparent group-hover:border-[#1877f2]" 
                                            alt={u.username}
                                        />
                                        {u.isOnline && <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-[#242526] rounded-full"></div>}
                                    </div>
                                    <span className="text-[10px] text-[#b0b3b8] max-w-[60px] truncate">{(u.username || 'Usuario').split(' ')[0]}</span>
                                </div>
                            ))}
                        </div>

                        {/* Secondary Actions */}
                        <div className="grid grid-cols-4 gap-2 mt-4 pt-4 border-t border-white/5">
                            <button 
                                onClick={handleStoryShare}
                                disabled={isSharing}
                                className="flex flex-col items-center gap-2 group"
                            >
                                <div className="w-12 h-12 bg-pink-600 hover:bg-pink-500 rounded-full flex items-center justify-center text-white transition-colors shadow-lg shadow-pink-500/20">
                                    <ImageIcon size={24} />
                                </div>
                                <span className="text-[10px] text-[#b0b3b8] font-bold">Tu historia</span>
                            </button>
                            <button 
                                onClick={handleNativeShare}
                                className="flex flex-col items-center gap-2 group"
                            >
                                <div className="w-12 h-12 bg-[#3a3b3c] hover:bg-[#4e4f50] rounded-full flex items-center justify-center text-white transition-colors">
                                    <Send size={24} />
                                </div>
                                <span className="text-[10px] text-[#b0b3b8] font-bold">Enviar</span>
                            </button>
                            <button className="flex flex-col items-center gap-2 group">
                                <div className="w-12 h-12 bg-[#3a3b3c] hover:bg-[#4e4f50] rounded-full flex items-center justify-center text-white transition-colors">
                                    <MoreHorizontal size={24} />
                                </div>
                                <span className="text-[10px] text-[#b0b3b8] font-bold">Más</span>
                            </button>
                        </div>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
}
