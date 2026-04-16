import React, { useState, useEffect } from 'react';
import { ChevronLeft, MessageCircle, Search, UserPlus, MoreVertical, Circle, X } from 'lucide-react';
import { useNavigate } from '../Router';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../services/db';
import { Chat, User } from '../../types';
import { motion } from 'motion/react';

import { useToast } from '../../context/ToastContext';

export default function ChatPage() {
    const navigate = useNavigate();
    const { user } = useAuth();
    const toast = useToast();
    const [chats, setChats] = useState<Chat[]>([]);
    const [onlineFriends, setOnlineFriends] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [showNewChatModal, setShowNewChatModal] = useState(false);
    const [newChatSearch, setNewChatSearch] = useState('');
    const [userSuggestions, setUserSuggestions] = useState<User[]>([]);
    const [isSearching, setIsSearching] = useState(false);

    useEffect(() => {
        if (user) {
            loadChats();
            loadOnlineFriends();
        }
    }, [user]);

    const loadChats = async () => {
        try {
            const data = await db.getChats(user!.id);
            setChats(data);
        } catch (error) {
            console.error("Error loading chats", error);
        } finally {
            setLoading(false);
        }
    };

    const loadOnlineFriends = async () => {
        if (!user) return;
        try {
            // Usuarios seguidos que estén activos en los últimos 5 minutos
            const allUsers = await db.getAllUsers();
            const now = Date.now() / 1000;
            const online = allUsers.filter(u => 
                u.id !== user.id && 
                u.lastActive && 
                (now - u.lastActive < 300)
            );
            setOnlineFriends(online);
        } catch (error) {}
    };

    const handleSearchNewChat = async (val: string) => {
        setNewChatSearch(val);
        if (val.length < 2) {
            setUserSuggestions([]);
            return;
        }
        setIsSearching(true);
        try {
            const hits = await db.searchUsers(val);
            setUserSuggestions(hits.filter(u => u.id !== user?.id));
        } catch (error) {
            console.error(error);
        } finally {
            setIsSearching(false);
        }
    };

    const handleChatClick = (otherUserId: string) => {
        navigate(`/chat/${otherUserId}`);
    };

    const formatTime = (timestamp: number) => {
        const date = new Date(timestamp * 1000);
        const now = new Date();
        const diff = now.getTime() - date.getTime();
        
        if (diff < 86400000) {
            return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }
        if (diff < 604800000) {
            const days = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
            return days[date.getDay()];
        }
        return date.toLocaleDateString([], { day: '2-digit', month: '2-digit' });
    };

    const filteredChats = chats.filter(chat => 
        chat.user.username.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="min-h-screen bg-[var(--bg-primary)] pb-20">
            {/* Header */}
            <header className="sticky top-0 z-50 bg-[var(--bg-secondary)] border-b border-[var(--divider)] shadow-sm">
                <div className="flex items-center justify-between px-4 h-14">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => navigate(-1)}
                            className="w-9 h-9 rounded-full bg-[var(--bg-tertiary)] flex items-center justify-center hover:bg-[var(--bg-hover)] transition-colors"
                        >
                            <ChevronLeft size={24} className="text-[var(--text-primary)]" />
                        </button>
                        <h1 className="text-lg font-bold text-[var(--text-primary)]">Chats</h1>
                    </div>
                    <div className="flex items-center gap-2">
                        <button 
                            onClick={() => setShowNewChatModal(true)}
                            className="w-9 h-9 rounded-full bg-[var(--bg-tertiary)] flex items-center justify-center text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
                        >
                            <UserPlus size={20} />
                        </button>
                        <button className="w-9 h-9 rounded-full bg-[var(--bg-tertiary)] flex items-center justify-center text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors">
                            <MoreVertical size={20} />
                        </button>
                    </div>
                </div>

                {/* Search */}
                <div className="px-4 pb-3">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" size={16} />
                        <input
                            type="text"
                            placeholder="Buscar chats..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full h-10 pl-10 pr-4 bg-[var(--bg-tertiary)] border border-[var(--divider)] rounded-full text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] transition-colors"
                        />
                    </div>
                </div>
            </header>

            {/* Content */}
            <div className="max-w-2xl mx-auto">
                {/* Active People Bar */}
                {!loading && onlineFriends.length > 0 && (
                    <div className="px-4 py-3 border-b border-[var(--divider)]/50 overflow-x-auto scrollbar-hide flex gap-4">
                        {onlineFriends.map(f => (
                            <button
                                key={f.id}
                                onClick={() => handleChatClick(f.id)}
                                className="flex flex-col items-center gap-1 shrink-0 group"
                            >
                                <div className="relative">
                                    <img
                                        src={f.avatarUrl || 'https://picsum.photos/seed/avatar/100/100'}
                                        className="w-14 h-14 rounded-full object-cover border-2 border-green-500 p-0.5 group-hover:scale-105 transition-transform"
                                        alt={f.username}
                                        referrerPolicy="no-referrer"
                                    />
                                    <div className="absolute bottom-0.5 right-0.5 w-3.5 h-3.5 bg-green-500 border-2 border-[var(--bg-secondary)] rounded-full shadow-sm" />
                                </div>
                                <span className="text-[10px] font-bold text-[var(--text-secondary)] truncate w-14 text-center">
                                    {f.username}
                                </span>
                            </button>
                        ))}
                    </div>
                )}

                {loading ? (
                    <div className="flex items-center justify-center py-20">
                        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[var(--accent)]"></div>
                    </div>
                ) : filteredChats.length === 0 ? (
                    <div className="py-20 text-center">
                        <MessageCircle size={48} className="mx-auto text-[var(--text-secondary)] mb-4 opacity-20" />
                        <h2 className="text-base font-bold text-[var(--text-primary)]">No hay mensajes</h2>
                        <p className="text-xs text-[var(--text-secondary)] mt-1">Envía un mensaje a tus seguidores para empezar</p>
                    </div>
                ) : (
                    <div className="flex flex-col">
                        {filteredChats.map((chat, index) => (
                            <motion.button
                                key={chat.user.id}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: index * 0.03 }}
                                onClick={() => handleChatClick(chat.user.id)}
                                className="w-full px-4 py-3 flex items-center gap-3 hover:bg-[var(--bg-hover)] transition-colors border-b border-[var(--divider)]/30 group"
                            >
                                <div className="relative shrink-0">
                                    <img
                                        src={chat.user.avatarUrl || 'https://picsum.photos/seed/avatar/100/100'}
                                        className="w-14 h-14 rounded-full object-cover border border-[var(--divider)]"
                                        alt={chat.user.username}
                                        referrerPolicy="no-referrer"
                                    />
                                    {chat.user.lastActive && (Date.now() / 1000 - chat.user.lastActive < 300) && (
                                        <div className="absolute bottom-0 right-0 w-4 h-4 bg-green-500 border-2 border-[var(--bg-secondary)] rounded-full" />
                                    )}
                                </div>
                                <div className="flex-1 min-w-0 text-left">
                                    <div className="flex items-center justify-between mb-0.5">
                                        <span className="text-sm font-bold text-[var(--text-primary)] group-hover:text-[var(--accent)] transition-colors truncate">
                                            {chat.user.username}
                                        </span>
                                        <span className={`text-[10px] font-bold uppercase ${chat.unreadCount > 0 ? 'text-[var(--accent)]' : 'text-[var(--text-secondary)]'}`}>
                                            {formatTime(chat.lastMessage.timestamp)}
                                        </span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <p className={`text-xs truncate ${chat.unreadCount > 0 ? 'text-[var(--text-primary)] font-bold' : 'text-[var(--text-secondary)] font-medium'}`}>
                                            {chat.lastMessage.senderId === user?.id ? 'Tú: ' : ''}
                                            {chat.lastMessage.text || '📷 Imagen'}
                                        </p>
                                        {chat.unreadCount > 0 && (
                                            <div className="min-w-[18px] h-[18px] px-1 bg-[var(--accent)] rounded-full flex items-center justify-center text-[10px] font-bold text-white shadow-sm">
                                                {chat.unreadCount}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </motion.button>
                        ))}
                    </div>
                )}
            </div>

            {/* New Chat Modal */}
            {showNewChatModal && (
                <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in">
                    <motion.div 
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="bg-[var(--bg-secondary)] border border-[var(--divider)] rounded-[32px] w-full max-w-md overflow-hidden shadow-2xl"
                    >
                        <div className="p-4 border-b border-[var(--divider)] flex justify-between items-center bg-[var(--bg-primary)]">
                            <h3 className="font-bold text-[var(--text-primary)]">Nuevo mensaje</h3>
                            <button 
                                onClick={() => {
                                    setShowNewChatModal(false);
                                    setNewChatSearch('');
                                    setUserSuggestions([]);
                                }} 
                                className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)]"
                            >
                                <X size={20} />
                            </button>
                        </div>
                        <div className="p-4 space-y-4">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" size={18} />
                                <input
                                    type="text"
                                    autoFocus
                                    placeholder="Buscar personas..."
                                    value={newChatSearch}
                                    onChange={(e) => handleSearchNewChat(e.target.value)}
                                    className="w-full h-11 pl-10 pr-4 bg-[var(--bg-tertiary)] border border-[var(--divider)] rounded-2xl text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] transition-all"
                                />
                            </div>

                            <div className="space-y-1 max-h-80 overflow-y-auto pr-1">
                                {isSearching ? (
                                    <div className="flex justify-center py-8">
                                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[var(--accent)]"></div>
                                    </div>
                                ) : userSuggestions.length === 0 && newChatSearch.length >= 2 ? (
                                    <div className="py-8 text-center text-[var(--text-secondary)] text-sm font-medium">
                                        No se encontraron resultados
                                    </div>
                                ) : userSuggestions.length > 0 ? (
                                    userSuggestions.map(u => (
                                        <button
                                            key={u.id}
                                            onClick={() => {
                                                handleChatClick(u.id);
                                                setShowNewChatModal(false);
                                            }}
                                            className="w-full p-2 flex items-center gap-3 hover:bg-[var(--bg-tertiary)] rounded-2xl transition-colors group"
                                        >
                                            <div className="relative shrink-0">
                                                <img 
                                                    src={u.avatarUrl || 'https://picsum.photos/seed/avatar/100/100'} 
                                                    className="w-11 h-11 rounded-full object-cover border border-[var(--divider)]" 
                                                    alt={u.username}
                                                    referrerPolicy="no-referrer"
                                                />
                                                {u.lastActive && (Date.now() / 1000 - u.lastActive < 300) && (
                                                    <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-[var(--bg-secondary)] rounded-full" />
                                                )}
                                            </div>
                                            <div className="flex-1 text-left">
                                                <div className="text-sm font-bold text-[var(--text-primary)] group-hover:text-[var(--accent)] transition-colors">
                                                    {u.username}
                                                </div>
                                                <div className="text-[10px] text-[var(--text-secondary)] font-bold uppercase">
                                                    {u.lastActive && (Date.now() / 1000 - u.lastActive < 300) ? 'En línea ahora' : 'Seguidor de StreamPay'}
                                                </div>
                                            </div>
                                        </button>
                                    ))
                                ) : (
                                    <div className="py-4 px-2">
                                        <p className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-3">Sugerencias</p>
                                        <div className="space-y-2">
                                            {onlineFriends.slice(0, 5).map(u => (
                                                <button
                                                    key={u.id}
                                                    onClick={() => {
                                                        handleChatClick(u.id);
                                                        setShowNewChatModal(false);
                                                    }}
                                                    className="w-full flex items-center gap-3 p-1 rounded-xl hover:bg-[var(--bg-tertiary)]"
                                                >
                                                    <img src={u.avatarUrl || 'https://picsum.photos/seed/avatar/100/100'} className="w-8 h-8 rounded-full" alt={u.username} referrerPolicy="no-referrer" />
                                                    <span className="text-xs font-bold text-[var(--text-primary)]">{u.username}</span>
                                                    <div className="w-2 h-2 rounded-full bg-green-500 ml-auto" />
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </motion.div>
                </div>
            )}
        </div>
    );
}
