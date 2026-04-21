import React, { useState, useEffect } from 'react';
import { ChevronLeft, MessageCircle, Search, UserPlus, MoreVertical, Circle, X, Settings, Plus, CheckCircle2 } from 'lucide-react';
import { useNavigate } from '../Router';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../services/db';
import { Chat, User } from '../../types';
import { motion } from 'motion/react';

import { useToast } from '../../context/ToastContext';

export default function ChatPage() {
    const navigate = useNavigate();
    const { user, socket, onlineUserIds } = useAuth();
    const toast = useToast();
    const [chats, setChats] = useState<Chat[]>([]);
    const [onlineFriends, setOnlineFriends] = useState<User[]>([]);
    const [allKnownUsers, setAllKnownUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [showNewChatModal, setShowNewChatModal] = useState(false);
    const [newChatSearch, setNewChatSearch] = useState('');
    const [userSuggestions, setUserSuggestions] = useState<User[]>([]);
    const [isSearching, setIsSearching] = useState(false);

    useEffect(() => {
        if (socket) {
            const handleMessage = (event: MessageEvent) => {
                try {
                    const data = JSON.parse(event.data);
                    if (data.type === 'CHAT_MESSAGE') {
                        const newMsg = data.payload;
                        const msgSenderId = String(newMsg.senderId || newMsg.sender_id || "");
                        const msgReceiverId = String(newMsg.receiverId || newMsg.receiver_id || "");
                        
                        setChats(prev => {
                            // Find the chat where the other user is either sender or receiver
                            const existingChatIndex = prev.findIndex(c => {
                                const chatUserId = String(c.user.id);
                                return chatUserId === msgSenderId || chatUserId === msgReceiverId;
                            });

                            if (existingChatIndex > -1) {
                                const newChats = [...prev];
                                const chat = { ...newChats[existingChatIndex] };
                                chat.lastMessage = newMsg;
                                if (msgSenderId !== String(user?.id)) {
                                    chat.unreadCount = (chat.unreadCount || 0) + 1;
                                }
                                // Mover al principio
                                newChats.splice(existingChatIndex, 1);
                                newChats.unshift(chat);
                                return newChats;
                            } else {
                                // Reload chats if it's a new conversation
                                loadChats();
                                return prev;
                            }
                        });
                    }
                    // USER_STATUS and ONLINE_USERS are now handled by onlineUserIds effect
                } catch (e) {}
            };
            socket.addEventListener('message', handleMessage);
            return () => socket.removeEventListener('message', handleMessage);
        }
    }, [socket, user?.id]);

    useEffect(() => {
        if (user) {
            loadChats();
            fetchAllUsers();
        }
    }, [user]);

    const fetchAllUsers = async () => {
        try {
            const users = await db.getAllUsers();
            setAllKnownUsers(users || []);
        } catch (e) {}
    };

    // Polling for online friends as fallback since WebSockets might not be available
    useEffect(() => {
        if (!user) return;
        
        const fetchOnline = async () => {
            try {
                const online = await db.request<User[]>('action=get_online_users');
                if (online && online.length > 0) {
                    // Update allKnownUsers with these users to ensure we have their latest lastActive
                    setAllKnownUsers(prev => {
                        const map = new Map(prev.map(u => [u.id, u]));
                        online.forEach(u => map.set(u.id, u));
                        return Array.from(map.values());
                    });
                }
            } catch (e) {}
        };

        fetchOnline();
        const interval = setInterval(fetchOnline, 30000); // Cada 30s
        return () => clearInterval(interval);
    }, [user?.id]);

    useEffect(() => {
        if (!user) return;
        const now = Date.now() / 1000;
        
        // 1. Get online users from known users
        const onlineFromKnown = allKnownUsers.filter(u => 
            u.id !== user.id && 
            (onlineUserIds.has(String(u.id)) || (u.lastActive && (now - Number(u.lastActive) < 300)))
        );

        // 2. Get online users from active chats
        const onlineFromChats = chats
            .filter(c => 
                c.user.id !== user.id && 
                (onlineUserIds.has(String(c.user.id)) || (c.user.lastActive && (now - Number(c.user.lastActive) < 300)))
            )
            .map(c => c.user);

        // Merge and deduplicate
        const combined = [...onlineFromChats, ...onlineFromKnown];
        const unique = Array.from(new Map(combined.map(u => [u.id, u])).values());
        
        setOnlineFriends(unique.sort((a, b) => Number(b.lastActive || 0) - Number(a.lastActive || 0)));
    }, [allKnownUsers, chats, onlineUserIds, user?.id]);

    const loadChats = async () => {
        try {
            const data = await db.getChats(user!.id);
            setChats(data || []);
        } catch (error) {
            console.error("Error loading chats", error);
        } finally {
            setLoading(false);
        }
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
        <div className="min-h-screen bg-[#111] text-white pb-24">
            {/* Messenger Lite Header */}
            <header className="sticky top-[104px] z-40 bg-[#111] border-b border-white/5">
                <div className="flex items-center justify-between px-4 h-14">
                    <div className="flex items-center gap-3">
                        <h1 className="text-xl font-bold tracking-tight">Messages</h1>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="relative">
                            <button className="w-10 h-10 flex items-center justify-center rounded-full bg-white/5 hover:bg-white/10 transition-colors">
                                <Settings size={22} className="text-white/80" />
                            </button>
                            {/* Static unread badge for the gear like in the pic */}
                            <div className="absolute top-0 right-0 w-4 h-4 bg-red-500 rounded-full border-2 border-[#111] flex items-center justify-center text-[8px] font-bold">1</div>
                        </div>
                        <button 
                            onClick={() => setShowNewChatModal(true)}
                            className="w-10 h-10 flex items-center justify-center rounded-full bg-white/5 hover:bg-white/10 transition-colors"
                        >
                            <Search size={22} className="text-white/80" />
                        </button>
                    </div>
                </div>
            </header>

            {/* Stories/Notes Row */}
            <div className="px-4 py-3 overflow-x-auto scrollbar-hide flex gap-5 items-start">
                {/* My Note */}
                <div className="flex flex-col items-center gap-1.5 shrink-0">
                    <div className="relative">
                        <div className="w-[60px] h-[60px] rounded-full overflow-hidden bg-white/5 border border-white/10">
                            <img 
                                src={user?.avatarUrl || 'https://picsum.photos/seed/mynote/200/200'}
                                className="w-full h-full object-cover blur-[1px] opacity-60"
                                referrerPolicy="no-referrer"
                            />
                            <div className="absolute inset-0 flex flex-col items-center justify-center p-1">
                                <span className="text-[8px] font-bold text-center leading-tight">Share a note...</span>
                            </div>
                        </div>
                    </div>
                    <span className="text-[11px] text-white/60 font-medium">Your note</span>
                </div>

                {/* Online Friends */}
                {!loading && onlineFriends.map(f => (
                    <button
                        key={f.id}
                        onClick={() => handleChatClick(f.id)}
                        className="flex flex-col items-center gap-1.5 shrink-0 group active:scale-95 transition-transform"
                    >
                        <div className="relative">
                            <div className="w-[64px] h-[64px] rounded-full p-[2px] border-2 border-[#2e89ff]/50 group-hover:border-[#2e89ff] transition-colors">
                                <div className="w-full h-full rounded-full overflow-hidden border-2 border-black/20">
                                    <img
                                        src={f.avatarUrl || `https://picsum.photos/seed/${f.id}/200/200`}
                                        className="w-full h-full object-cover group-hover:scale-110 transition-transform"
                                        alt={f.username}
                                        referrerPolicy="no-referrer"
                                    />
                                </div>
                            </div>
                            <div className="absolute bottom-0 right-1 w-[16px] h-[16px] bg-[#45bd62] border-[3px] border-[#18191a] rounded-full shadow-lg" />
                        </div>
                        <span className="text-[11px] text-[#e4e6eb] font-medium truncate w-[64px] text-center">
                            {f.username.split(' ')[0]}
                        </span>
                    </button>
                ))}
            </div>

            {/* Chat List */}
            <div className="mt-2">
                {loading ? (
                    <div className="flex items-center justify-center py-20">
                        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-500"></div>
                    </div>
                ) : filteredChats.length === 0 ? (
                    <div className="py-20 text-center px-10">
                        <MessageCircle size={48} className="mx-auto text-white/20 mb-4" />
                        <h2 className="text-lg font-bold">No hay mensajes</h2>
                        <p className="text-sm text-white/40 mt-1">Encuentra a alguien para chatear usando el buscador</p>
                    </div>
                ) : (
                    <div className="flex flex-col">
                        {filteredChats.map((chat, index) => {
                            const isOnline = chat.user.isOnline || (chat.user.lastActive && (Date.now() / 1000 - chat.user.lastActive < 300));
                            return (
                                <button
                                    key={chat.user.id}
                                    onClick={() => handleChatClick(chat.user.id)}
                                    className="w-full px-4 py-3 flex items-center gap-4 hover:bg-white/5 transition-colors active:bg-white/10"
                                >
                                    <div className="relative shrink-0">
                                        <img
                                            src={chat.user.avatarUrl || `https://picsum.photos/seed/${chat.user.id}/200/200`}
                                            className="w-14 h-14 rounded-full object-cover"
                                            alt={chat.user.username}
                                            referrerPolicy="no-referrer"
                                        />
                                        {isOnline && (
                                            <div className="absolute bottom-0.5 right-0.5 w-4 h-4 bg-green-500 border-[3px] border-[#111] rounded-full" />
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex justify-between items-baseline">
                                            <h3 className="text-[16px] font-bold text-white truncate pr-2">
                                                {chat.user.username}
                                            </h3>
                                            <span className="text-[11px] text-white/40 shrink-0">
                                                {formatTime(chat.lastMessage.timestamp)}
                                            </span>
                                        </div>
                                        <div className="flex items-center justify-between mt-0.5">
                                            <div className="flex items-center gap-1.5 min-w-0">
                                                {chat.unreadCount > 0 && (
                                                    <div className="shrink-0 w-4 h-4 bg-red-600 rounded-full flex items-center justify-center text-[9px] font-bold">
                                                        {chat.unreadCount}
                                                    </div>
                                                )}
                                                <p className={`text-[14px] truncate ${chat.unreadCount > 0 ? 'text-white font-bold' : 'text-white/60 font-medium'}`}>
                                                    {chat.lastMessage.senderId === user?.id ? 'You: ' : ''}
                                                    {chat.lastMessage.text || 
                                                     (chat.lastMessage.mediaType === 'IMAGE' ? 'sent a photo' : 
                                                      chat.lastMessage.mediaType === 'VIDEO' ? 'sent a video' : 
                                                      chat.lastMessage.mediaType === 'AUDIO' ? 'sent a voice message' : 
                                                      chat.lastMessage.mediaType === 'FILE' ? 'sent a file' : 
                                                      chat.lastMessage.imageUrl ? 'sent an attachment' : 'Live video ended')
                                                    }
                                                </p>
                                            </div>
                                            {chat.lastMessage.senderId === user?.id && (
                                                <CheckCircle2 size={14} className="text-blue-500 ml-2 shrink-0" />
                                            )}
                                        </div>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Plus FAB */}
            <button
                onClick={() => setShowNewChatModal(true)}
                className="fixed bottom-24 right-5 w-14 h-14 rounded-full bg-[#1877f2] flex items-center justify-center shadow-xl shadow-black/40 hover:scale-110 active:scale-95 transition-transform z-40"
            >
                <Plus size={32} className="text-white" />
            </button>

            {/* New Chat Modal */}
            {showNewChatModal && (
                <div className="fixed inset-0 z-[100] bg-black/95 flex flex-col p-4 animate-in fade-in slide-in-from-bottom-5">
                    <div className="flex items-center gap-4 mb-6">
                        <button onClick={() => setShowNewChatModal(false)} className="p-2 hover:bg-white/10 rounded-full">
                            <ChevronLeft size={28} />
                        </button>
                        <h2 className="text-xl font-bold">Nuevo Mensaje</h2>
                    </div>

                    <div className="relative mb-6">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40" size={20} />
                        <input
                            type="text"
                            autoFocus
                            placeholder="Buscar personas..."
                            value={newChatSearch}
                            onChange={(e) => handleSearchNewChat(e.target.value)}
                            className="w-full h-12 pl-12 pr-4 bg-white/5 border border-white/10 rounded-xl text-[16px] focus:outline-none focus:border-indigo-500 transition-all"
                        />
                    </div>

                    <div className="flex-1 overflow-y-auto space-y-4">
                        {isSearching ? (
                            <div className="flex justify-center py-10">
                                <Loader2 className="animate-spin text-indigo-500" size={32} />
                            </div>
                        ) : userSuggestions.length > 0 ? (
                            userSuggestions.map(u => (
                                <button
                                    key={u.id}
                                    onClick={() => {
                                        handleChatClick(u.id);
                                        setShowNewChatModal(false);
                                    }}
                                    className="w-full flex items-center gap-4 p-2 hover:bg-white/5 rounded-xl transition-colors"
                                >
                                    <div className="relative">
                                        <img src={u.avatarUrl || `https://picsum.photos/seed/${u.id}/200/200`} className="w-14 h-14 rounded-full object-cover" referrerPolicy="no-referrer" />
                                        {u.lastActive && (Date.now() / 1000 - u.lastActive < 300) && (
                                            <div className="absolute bottom-0.5 right-0.5 w-4 h-4 bg-green-500 border-[3px] border-[#000] rounded-full" />
                                        )}
                                    </div>
                                    <div className="text-left">
                                        <div className="font-bold text-[16px]">{u.username}</div>
                                        <div className="text-xs text-white/40">{u.lastActive && (Date.now() / 1000 - u.lastActive < 300) ? 'En línea' : 'Seguidor'}</div>
                                    </div>
                                </button>
                            ))
                        ) : (
                            <div className="px-2">
                                <p className="text-[11px] font-bold text-white/40 uppercase tracking-widest mb-4">Sugerencias</p>
                                <div className="space-y-4">
                                    {onlineFriends.map(f => (
                                        <button
                                            key={f.id}
                                            onClick={() => {
                                                handleChatClick(f.id);
                                                setShowNewChatModal(false);
                                            }}
                                            className="w-full flex items-center gap-4 group"
                                        >
                                            <img src={f.avatarUrl || `https://picsum.photos/seed/${f.id}/200/200`} className="w-12 h-12 rounded-full" referrerPolicy="no-referrer" />
                                            <span className="font-bold text-[16px] group-hover:text-indigo-400 transition-colors">{f.username}</span>
                                            <div className="ml-auto w-2.5 h-2.5 rounded-full bg-green-500" />
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

const Loader2 = ({ size, className }: any) => (
    <div className={`animate-spin ${className}`} style={{ width: size, height: size }}>
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
            <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" className="opacity-75" />
        </svg>
    </div>
);
