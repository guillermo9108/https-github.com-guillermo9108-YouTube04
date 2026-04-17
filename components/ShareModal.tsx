import React, { useState, useRef, useEffect } from 'react';
import { X, Search, Share2, ArrowRightCircle, RefreshCw, Layers, UserPlus } from 'lucide-react';
import { db } from '../services/db';
import { User, Video } from '../types';
import { useNotifications } from '../context/NotificationContext';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import { getThumbnailUrl } from '../utils/image';

interface ShareModalProps {
    video: Video;
    user: User | null;
    onClose: () => void;
    onShareSuccess: (targetUsername: string) => void;
}

const ShareModal: React.FC<ShareModalProps> = ({ video, user, onClose, onShareSuccess }) => {
    const { sendShareNotification } = useNotifications();
    const { socketRef } = useAuth();
    const toast = useToast();
    const [shareSearch, setShareSearch] = useState('');
    const [shareSuggestions, setShareSuggestions] = useState<any[]>([]);
    const [followers, setFollowers] = useState<User[]>([]);
    const [loadingFollowers, setLoadingFollowers] = useState(false);
    const shareTimeout = useRef<any>(null);

    useEffect(() => {
        loadFollowers();
    }, []);

    const loadFollowers = async () => {
        if (!user) return;
        setLoadingFollowers(true);
        try {
            const res = await db.getUserFollowers(user.id);
            setFollowers(res);
        } catch (e) {
            console.error("Failed to load followers:", e);
        } finally {
            setLoadingFollowers(false);
        }
    };

    const handleShareSearch = (val: string) => {
        setShareSearch(val);
        if (shareTimeout.current) clearTimeout(shareTimeout.current);
        if (val.length < 2) { setShareSuggestions([]); return; }
        shareTimeout.current = setTimeout(async () => {
            if (!user) return;
            const hits = await db.searchUsers(val);
            setShareSuggestions(hits);
        }, 300);
    };

    const sendVideoToUser = async (targetUser: any) => {
        if (!user || !video) return;
        try {
            const res = await db.request(`action=share_video`, {
                method: 'POST',
                body: JSON.stringify({ videoId: video.id, senderId: user.id, targetUsername: targetUser.username })
            });
            
            // Increment shares count locally
            await db.incrementShare(video.id);
            
            // Send real-time notification
            if (targetUser.id) {
                sendShareNotification(targetUser.id, video.title, video.id);
                
                // Real-time chat message via WebSocket
                if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
                    const isAudio = Number(video.is_audio) === 1;
                    const streamUrl = db.getStreamerUrl(video.id);
                    
                    socketRef.current.send(JSON.stringify({ 
                        type: 'CHAT_MESSAGE', 
                        payload: {
                            id: 'SH' + Date.now(),
                            senderId: user.id,
                            receiverId: targetUser.id,
                            text: `He compartido un video contigo: ${video.title}`,
                            videoUrl: !isAudio ? streamUrl : null,
                            audioUrl: isAudio ? streamUrl : null,
                            videoId: video.id,
                            mediaType: (isAudio ? 'AUDIO' : 'VIDEO') as any,
                            timestamp: Math.floor(Date.now() / 1000)
                        }
                    }));
                }
            }
            
            onShareSuccess(targetUser.username);
        } catch (e: any) {
            toast.error(e.message || "Error al compartir");
        }
    };

    const handleCopyLink = () => {
        const url = `${window.location.origin}/#/watch/${video.id}`;
        navigator.clipboard.writeText(url);
        toast.success("Enlace copiado al portapapeles");
    };

    const displayList = shareSearch.length >= 2 ? shareSuggestions : followers;

    return (
        <div className="fixed inset-0 z-[300] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-300">
            <div className="bg-slate-900 border border-white/10 rounded-[40px] w-full max-w-md overflow-hidden shadow-2xl animate-in zoom-in-95">
                <div className="p-6 bg-slate-950 border-b border-white/5 flex justify-between items-center">
                    <div>
                        <h3 className="font-black text-white uppercase tracking-widest text-sm flex items-center gap-2">
                            <Share2 size={18} className="text-indigo-400"/> Compartir
                        </h3>
                        <p className="text-[10px] text-slate-500 font-bold uppercase mt-1">Recomendar a un amigo</p>
                    </div>
                    <button onClick={() => { onClose(); setShareSearch(''); setShareSuggestions([]); }} className="p-2.5 bg-slate-800 text-slate-500 hover:text-white rounded-2xl transition-all">
                        <X size={20}/>
                    </button>
                </div>
                
                <div className="p-6 space-y-4">
                    <div className="relative">
                        <Search className="absolute left-4 top-4 text-slate-500" size={18}/>
                        <input 
                            type="text" 
                            value={shareSearch} 
                            onChange={e => handleShareSearch(e.target.value)}
                            placeholder="Buscar por @nombre_usuario..."
                            className="w-full bg-slate-950 border border-white/5 rounded-[24px] pl-12 pr-4 py-4 text-white focus:border-indigo-500 outline-none transition-all shadow-inner font-bold text-sm"
                        />
                    </div>
                    
                    <div className="space-y-2 max-h-[40vh] overflow-y-auto custom-scrollbar pr-2">
                        {loadingFollowers && shareSearch.length < 2 ? (
                            <div className="flex flex-col items-center justify-center py-12 gap-3">
                                <RefreshCw size={32} className="text-indigo-500 animate-spin" />
                                <span className="text-xs text-slate-500 font-bold uppercase tracking-widest">Cargando...</span>
                            </div>
                        ) : displayList.length > 0 ? (
                            displayList.map(s => (
                                <button 
                                    key={s.username || s.id} 
                                    onClick={() => sendVideoToUser(s)}
                                    className="w-full p-4 flex items-center gap-4 hover:bg-white/5 rounded-[24px] transition-all group active:scale-95"
                                >
                                    <div className="w-12 h-12 rounded-2xl overflow-hidden bg-slate-800 shrink-0 border border-white/5 shadow-lg">
                                        {s.avatarUrl ? (
                                            <img src={getThumbnailUrl(s.avatarUrl)} className="w-full h-full object-cover" referrerPolicy="no-referrer" alt={s.username} />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-sm font-black text-white bg-slate-700 uppercase">
                                                {s.username?.[0] || '?'}
                                            </div>
                                        )}
                                    </div>
                                    <div className="text-left flex-1 min-w-0">
                                        <span className="text-sm font-black text-white group-hover:text-indigo-400 block truncate transition-colors">@{s.username}</span>
                                        <span className="text-[9px] text-slate-500 uppercase font-black tracking-widest">Enviar instantáneo</span>
                                    </div>
                                    <div className="p-2 bg-indigo-600/10 text-indigo-400 rounded-full group-hover:bg-indigo-600 group-hover:text-white transition-all">
                                        <ArrowRightCircle size={18} />
                                    </div>
                                </button>
                            ))
                        ) : (
                            <div className="flex flex-col items-center justify-center py-12 text-center opacity-40">
                                {shareSearch.length >= 2 ? (
                                    <>
                                        <Search size={40} className="mb-3"/>
                                        <p className="text-[9px] font-black uppercase tracking-[0.2em]">No se encontraron usuarios</p>
                                    </>
                                ) : (
                                    <>
                                        <UserPlus size={40} className="mb-3"/>
                                        <p className="text-[9px] font-black uppercase tracking-[0.2em]">No tienes seguidores aún</p>
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                <div className="p-6 bg-slate-950/50 border-t border-white/5">
                    <button 
                        onClick={handleCopyLink}
                        className="w-full py-4 bg-white/5 hover:bg-white/10 text-white text-[10px] font-black uppercase tracking-[0.2em] rounded-[24px] transition-all flex items-center justify-center gap-3 border border-white/5"
                    >
                        <Layers size={16} className="text-indigo-400" /> Copiar enlace directo
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ShareModal;
