import React, { useState, useEffect, useRef } from 'react';
import { ChevronLeft, Send, Image as ImageIcon, MoreVertical, Phone, Video, Info } from 'lucide-react';
import { useNavigate, useParams } from '../Router';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../services/db';
import { ChatMessage, User } from '../../types';
import { motion, AnimatePresence } from 'motion/react';

export default function ChatDetailPage() {
    const { id: otherId } = useParams();
    const navigate = useNavigate();
    const { user, socket } = useAuth();
    const [otherUser, setOtherUser] = useState<User | null>(null);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [inputText, setInputText] = useState('');
    const [loading, setLoading] = useState(true);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (user && otherId) {
            loadChatData();
        }
    }, [user, otherId]);

    useEffect(() => {
        if (socket) {
            const handleMessage = (event: MessageEvent) => {
                try {
                    const data = JSON.parse(event.data);
                    if (data.type === 'CHAT_MESSAGE' && data.payload.senderId === otherId) {
                        setMessages(prev => [...prev, data.payload]);
                    }
                } catch (e) {}
            };
            socket.addEventListener('message', handleMessage);
            return () => socket.removeEventListener('message', handleMessage);
        }
    }, [socket, otherId]);

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const loadChatData = async () => {
        try {
            const [userData, msgData] = await Promise.all([
                db.getUser(otherId!),
                db.getMessages(user!.id, otherId!)
            ]);
            setOtherUser(userData);
            setMessages(msgData);
        } catch (error) {
            console.error("Error loading chat data", error);
        } finally {
            setLoading(false);
        }
    };

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    const handleSendMessage = async (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!inputText.trim() || !user || !otherId) return;

        const text = inputText.trim();
        setInputText('');

        try {
            const newMsg = await db.sendMessage({
                userId: user.id,
                receiverId: otherId,
                text
            });

            setMessages(prev => [...prev, newMsg]);

            // Enviar por WebSocket para tiempo real
            if (socket && socket.readyState === WebSocket.OPEN) {
                socket.send(JSON.stringify({
                    type: 'CHAT_MESSAGE',
                    payload: newMsg
                }));
            }
        } catch (error) {
            console.error("Error sending message", error);
        }
    };

    const formatTime = (timestamp: number) => {
        return new Date(timestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[var(--accent)]"></div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-screen bg-[var(--bg-primary)]">
            {/* Header */}
            <header className="sticky top-0 z-50 bg-[var(--bg-secondary)] border-b border-[var(--divider)] shadow-sm">
                <div className="flex items-center justify-between px-2 h-14">
                    <div className="flex items-center gap-1">
                        <button
                            onClick={() => navigate(-1)}
                            className="w-9 h-9 rounded-full flex items-center justify-center text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors"
                        >
                            <ChevronLeft size={24} />
                        </button>
                        <div 
                            className="flex items-center gap-2 cursor-pointer p-1 rounded-lg hover:bg-[var(--bg-tertiary)] transition-colors"
                            onClick={() => navigate(`/profile/${otherId}`)}
                        >
                            <div className="relative">
                                <img
                                    src={otherUser?.avatarUrl || 'https://picsum.photos/seed/avatar/100/100'}
                                    className="w-9 h-9 rounded-full object-cover border border-[var(--divider)]"
                                    alt={otherUser?.username}
                                    referrerPolicy="no-referrer"
                                />
                                {otherUser?.lastActive && (Date.now() / 1000 - otherUser.lastActive < 300) && (
                                    <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 border-2 border-[var(--bg-secondary)] rounded-full" />
                                )}
                            </div>
                            <div className="flex flex-col">
                                <span className="text-sm font-bold text-[var(--text-primary)] leading-none">
                                    {otherUser?.username}
                                </span>
                                <span className="text-[10px] text-green-500 font-bold uppercase mt-0.5">
                                    {otherUser?.lastActive && (Date.now() / 1000 - otherUser.lastActive < 300) ? 'En línea' : 'Desconectado'}
                                </span>
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-1">
                        <button className="w-9 h-9 rounded-full flex items-center justify-center text-[var(--accent)] hover:bg-[var(--bg-tertiary)] transition-colors">
                            <Phone size={18} />
                        </button>
                        <button className="w-9 h-9 rounded-full flex items-center justify-center text-[var(--accent)] hover:bg-[var(--bg-tertiary)] transition-colors">
                            <Video size={18} />
                        </button>
                        <button className="w-9 h-9 rounded-full flex items-center justify-center text-[var(--accent)] hover:bg-[var(--bg-tertiary)] transition-colors">
                            <Info size={18} />
                        </button>
                    </div>
                </div>
            </header>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-hide">
                <div className="flex flex-col items-center py-6">
                    <img
                        src={otherUser?.avatarUrl || 'https://picsum.photos/seed/avatar/100/100'}
                        className="w-20 h-20 rounded-full object-cover border-2 border-[var(--divider)] mb-3 shadow-lg"
                        alt={otherUser?.username}
                        referrerPolicy="no-referrer"
                    />
                    <h2 className="text-base font-bold text-[var(--text-primary)]">{otherUser?.username}</h2>
                    <p className="text-[10px] text-[var(--text-secondary)] font-bold uppercase mt-1">Seguidor de StreamPay</p>
                    <button 
                        onClick={() => navigate(`/profile/${otherId}`)}
                        className="mt-4 px-4 py-1.5 bg-[var(--bg-tertiary)] text-[var(--text-primary)] text-xs font-bold rounded-full hover:bg-[var(--bg-hover)] transition-colors"
                    >
                        Ver Perfil
                    </button>
                </div>

                <AnimatePresence initial={false}>
                    {messages.map((msg, index) => {
                        const isMe = msg.senderId === user?.id;
                        const showTime = index === messages.length - 1 || messages[index + 1].senderId !== msg.senderId;

                        return (
                            <motion.div
                                key={msg.id}
                                initial={{ opacity: 0, scale: 0.9, x: isMe ? 20 : -20 }}
                                animate={{ opacity: 1, scale: 1, x: 0 }}
                                className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}
                            >
                                <div className={`max-w-[75%] flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                                    <div
                                        className={`px-4 py-2.5 rounded-2xl text-sm shadow-sm ${
                                            isMe
                                                ? 'bg-[var(--accent)] text-white rounded-tr-none'
                                                : 'bg-[var(--bg-tertiary)] text-[var(--text-primary)] rounded-tl-none border border-[var(--divider)]'
                                        }`}
                                    >
                                        {msg.text}
                                    </div>
                                    {showTime && (
                                        <span className="text-[9px] text-[var(--text-secondary)] font-bold mt-1 px-1">
                                            {formatTime(msg.timestamp)}
                                        </span>
                                    )}
                                </div>
                            </motion.div>
                        );
                    })}
                </AnimatePresence>
                <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="p-3 bg-[var(--bg-secondary)] border-t border-[var(--divider)]">
                <form 
                    onSubmit={handleSendMessage}
                    className="flex items-center gap-2 max-w-2xl mx-auto"
                >
                    <button 
                        type="button"
                        className="w-10 h-10 rounded-full flex items-center justify-center text-[var(--accent)] hover:bg-[var(--bg-tertiary)] transition-colors shrink-0"
                    >
                        <ImageIcon size={20} />
                    </button>
                    <div className="flex-1 relative">
                        <input
                            type="text"
                            value={inputText}
                            onChange={(e) => setInputText(e.target.value)}
                            placeholder="Escribe un mensaje..."
                            className="w-full h-10 pl-4 pr-4 bg-[var(--bg-tertiary)] border border-[var(--divider)] rounded-full text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] transition-colors"
                        />
                    </div>
                    <button
                        type="submit"
                        disabled={!inputText.trim()}
                        className={`w-10 h-10 rounded-full flex items-center justify-center transition-all shrink-0 ${
                            inputText.trim() 
                                ? 'bg-[var(--accent)] text-white shadow-md scale-105' 
                                : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]'
                        }`}
                    >
                        <Send size={18} />
                    </button>
                </form>
            </div>
        </div>
    );
}
