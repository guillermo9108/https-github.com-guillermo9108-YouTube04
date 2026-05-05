import React, { useState, useEffect } from 'react';
import { Video, User } from '../types';
import { db } from '../services/db';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { X, Globe, ChevronDown, UserSquare2, Users, MessageCircle, Heart, Share2, Send, Bookmark, MoreHorizontal } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface ShareModalProps {
    video: Video;
    onClose: () => void;
    onShared?: () => void;
}

export default function ShareModal({ video, onClose, onShared }: ShareModalProps) {
    const { user } = useAuth();
    const toast = useToast();
    const [description, setDescription] = useState('');
    const [isSharing, setIsSharing] = useState(false);
    const [recentUsers, setRecentUsers] = useState<User[]>([]);

    useEffect(() => {
        // Load some users to show in the sharing list
        db.getAllUsers().then(users => {
            setRecentUsers(users.slice(0, 10));
        }).catch(() => {});
    }, []);

    const shareUrl = `${window.location.origin}/watch/${video.id}`;

    const handleShareNow = async () => {
        if (!user) {
            toast.error("Debes iniciar sesión para compartir");
            return;
        }

        setIsSharing(true);
        try {
            await db.reshareVideo(video.id, user.id, description);
            toast.success("Publicado en tu perfil");
            if (onShared) onShared();
            onClose();
        } catch (err: any) {
            toast.error(err.message || "Error al compartir");
        } finally {
            setIsSharing(false);
        }
    };

    const handleWhatsAppShare = () => {
        const text = encodeURIComponent(`${video.title}\n${shareUrl}`);
        window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank');
        onClose();
    };

    const handleNativeShare = async () => {
        if (navigator.share) {
            try {
                await navigator.share({
                    title: video.title,
                    text: video.description,
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
            formData.append('title', video.title);
            formData.append('mediaUrl', video.videoUrl || '');
            formData.append('thumbnailUrl', video.thumbnailUrl || '');
            formData.append('videoId', video.id); // Reference to original video
            
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
            const isImage = video.category?.toUpperCase() === 'IMAGES';
            await db.sendMessage({
                userId: user.id,
                receiverId: targetUser.id,
                text: `Te recomendé este contenido: ${video.title}`,
                videoUrl: !isImage ? video.videoUrl : undefined,
                imageUrl: isImage ? video.videoUrl : undefined,
                mediaType: isImage ? 'IMAGE' : 'VIDEO'
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
                            {(video.thumbnailUrl || video.videoUrl) && (
                                <img 
                                    src={video.thumbnailUrl} 
                                    alt={video.title}
                                    className="w-full aspect-video object-cover"
                                />
                            )}
                            <div className="p-3 border-t border-white/5">
                                <div className="text-[#b0b3b8] text-[12px] uppercase font-bold mb-1">STREAMPAY.APP</div>
                                <h5 className="text-white font-bold text-sm line-clamp-2">{video.title}</h5>
                                <p className="text-[#b0b3b8] text-xs mt-1 line-clamp-1">{video.description}</p>
                            </div>
                        </div>

                        {/* Share Options Footer */}
                        <div className="flex items-center justify-end pt-2">
                             <button 
                                onClick={handleShareNow}
                                disabled={isSharing}
                                className="bg-[#1877f2] hover:bg-[#166fe5] text-white font-bold py-2 px-8 rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center min-w-[150px]"
                             >
                                {isSharing ? "Compartiendo..." : "Compartir ahora"}
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
                                    <span className="text-[10px] text-[#b0b3b8] max-w-[60px] truncate">{u.username.split(' ')[0]}</span>
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
                                <div className="w-12 h-12 bg-[#3a3b3c] hover:bg-[#4e4f50] rounded-full flex items-center justify-center text-white transition-colors">
                                    <Users size={24} />
                                </div>
                                <span className="text-[10px] text-[#b0b3b8] font-bold">Tu historia</span>
                            </button>
                            <button 
                                onClick={handleNativeShare}
                                className="flex flex-col items-center gap-2 group"
                            >
                                <div className="w-12 h-12 bg-[#3a3b3c] hover:bg-[#4e4f50] rounded-full flex items-center justify-center text-white transition-colors">
                                    <MessageCircle size={24} />
                                </div>
                                <span className="text-[10px] text-[#b0b3b8] font-bold">Messenger</span>
                            </button>
                            <button 
                                onClick={handleWhatsAppShare}
                                className="flex flex-col items-center gap-2 group"
                            >
                                <div className="w-12 h-12 bg-[#3a3b3c] hover:bg-[#4e4f50] rounded-full flex items-center justify-center text-white transition-colors">
                                    <Share2 size={24} />
                                </div>
                                <span className="text-[10px] text-[#b0b3b8] font-bold">WhatsApp</span>
                            </button>
                            <button className="flex flex-col items-center gap-2 group">
                                <div className="w-12 h-12 bg-[#3a3b3c] hover:bg-[#4e4f50] rounded-full flex items-center justify-center text-white transition-colors">
                                    <MoreHorizontal size={24} />
                                </div>
                                <span className="text-[10px] text-[#b0b3b8] font-bold">Grupo</span>
                            </button>
                        </div>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
}
