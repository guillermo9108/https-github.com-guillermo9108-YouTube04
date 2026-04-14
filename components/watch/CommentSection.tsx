import React, { useState, useEffect } from 'react';
import { MessageCircle, Send, Loader2 } from 'lucide-react';
import { db } from '../../services/db';
import { Comment, User } from '../../types';

interface CommentSectionProps {
    videoId: string;
    user: User | null;
    comments: Comment[];
    onCommentAdded: (comment: Comment) => void;
}

const CommentSection: React.FC<CommentSectionProps> = ({ videoId, user, comments, onCommentAdded }) => {
    const [newComment, setNewComment] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || !newComment.trim() || isSubmitting) return;
        setIsSubmitting(true);
        try {
            const c = await db.addComment(user.id, videoId, newComment.trim());
            onCommentAdded(c);
            setNewComment('');
        } catch(e) {
            console.error(e);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-3 mb-6">
                <MessageCircle size={20} className="text-indigo-400"/>
                <h3 className="text-sm font-black text-white uppercase tracking-widest">Conversación ({comments.length})</h3>
            </div>
            <form onSubmit={handleSubmit} className="flex gap-4 mb-8">
                <div className="w-10 h-10 rounded-full bg-slate-800 shrink-0 overflow-hidden">
                    {user?.avatarUrl ? <img src={user.avatarUrl} className="w-full h-full object-cover" referrerPolicy="no-referrer" /> : <div className="w-full h-full flex items-center justify-center font-black text-white bg-indigo-600">{user?.username?.[0]}</div>}
                </div>
                <div className="flex-1 flex gap-2">
                    <input 
                        type="text" 
                        value={newComment} 
                        onChange={e => setNewComment(e.target.value)} 
                        placeholder="Escribe un comentario público..." 
                        className="flex-1 bg-transparent border-b border-white/10 focus:border-indigo-500 outline-none text-sm text-white py-2 transition-all" 
                    />
                    <button 
                        type="submit" 
                        disabled={!newComment.trim() || isSubmitting} 
                        className="p-3 bg-indigo-600 text-white rounded-2xl disabled:opacity-30 active:scale-90 transition-all shadow-lg"
                    >
                        {isSubmitting ? <Loader2 className="animate-spin" size={18}/> : <Send size={18}/>}
                    </button>
                </div>
            </form>
            <div className="space-y-6">
                {comments.map(c => (
                    <div key={c.id} className="flex gap-4 group">
                        <div className="w-10 h-10 rounded-full bg-slate-800 shrink-0 overflow-hidden">
                            {c.userAvatarUrl ? <img src={c.userAvatarUrl} className="w-full h-full object-cover" referrerPolicy="no-referrer" /> : <div className="w-full h-full flex items-center justify-center text-xs font-bold text-slate-500">{c.username?.[0]}</div>}
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
    );
};

export default CommentSection;

