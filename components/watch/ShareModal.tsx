import React, { useState, useRef } from 'react';
import { X, Search, Share2, ArrowRightCircle } from 'lucide-react';
import { db } from '../../services/db';
import { User, Video } from '../../types';
import { useNotifications } from '../../context/NotificationContext';

interface ShareModalProps {
    video: Video;
    user: User | null;
    onClose: () => void;
    onShareSuccess: (targetUsername: string) => void;
}

const ShareModal: React.FC<ShareModalProps> = ({ video, user, onClose, onShareSuccess }) => {
    const { sendShareNotification } = useNotifications();
    const [shareSearch, setShareSearch] = useState('');
    const [shareSuggestions, setShareSuggestions] = useState<any[]>([]);
    const shareTimeout = useRef<any>(null);

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
            await db.request(`action=share_video`, {
                method: 'POST',
                body: JSON.stringify({ videoId: video.id, senderId: user.id, targetUsername: targetUser.username })
            });
            
            // Send real-time notification
            if (targetUser.id) {
                sendShareNotification(targetUser.id, video.title, video.id);
            }
            
            onShareSuccess(targetUser.username);
        } catch (e: any) {
            console.error(e);
        }
    };

    return (
        <div className="fixed inset-0 z-[200] bg-black/90 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in">
            <div className="bg-slate-900 border border-white/10 rounded-[40px] w-full max-w-md overflow-hidden shadow-2xl animate-in zoom-in-95">
                <div className="p-8 bg-slate-950 border-b border-white/5 flex justify-between items-center">
                    <div>
                        <h3 className="font-black text-white uppercase tracking-widest text-sm flex items-center gap-2"><Share2 size={18} className="text-indigo-400"/> Compartir Video</h3>
                        <p className="text-[10px] text-slate-500 font-bold uppercase mt-1">Recomendar a un amigo</p>
                    </div>
                    <button onClick={() => { onClose(); setShareSearch(''); setShareSuggestions([]); }} className="p-2.5 bg-slate-800 text-slate-500 hover:text-white rounded-2xl transition-all"><X/></button>
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
                                onClick={() => sendVideoToUser(s)}
                                className="w-full p-4 flex items-center gap-4 hover:bg-indigo-600 rounded-[24px] transition-all group active:scale-95"
                            >
                                <div className="w-12 h-12 rounded-2xl overflow-hidden bg-slate-800 shrink-0 border border-white/5 shadow-lg">
                                    {s.avatarUrl ? <img src={s.avatarUrl} className="w-full h-full object-cover" referrerPolicy="no-referrer" /> : <div className="w-full h-full flex items-center justify-center text-sm font-black text-white bg-slate-700">{s.username?.[0]}</div>}
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
    );
};

export default ShareModal;
