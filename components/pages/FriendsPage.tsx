import React, { useState, useEffect, useMemo } from 'react';
import { ArrowLeft, Search, Users, UserPlus, UserMinus, Loader2, MoreHorizontal } from 'lucide-react';
import { useNavigate } from '../Router';
import { db } from '../../services/db';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { User } from '../../types';

export default function FriendsPage() {
    const navigate = useNavigate();
    const { user, refreshUser } = useAuth();
    const toast = useToast();
    
    const [users, setUsers] = useState<User[]>([]);
    const [subscriptions, setSubscriptions] = useState<string[]>([]);
    const [mutualFriendsMap, setMutualFriendsMap] = useState<Record<string, User[]>>({});
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [activeTab, setActiveTab] = useState<'suggestions' | 'your_friends'>('suggestions');

    useEffect(() => {
        const fetchData = async () => {
            if (!user) return;
            setLoading(true);
            try {
                const [allUsers, subs] = await Promise.all([
                    db.getAllUsers(),
                    db.getSubscriptions(user.id)
                ]);
                
                const filtered = allUsers.filter(u => u.id !== user.id);
                setUsers(filtered);
                setSubscriptions(subs);

                // Fetch mutual friends for each user (limited to avoid too many requests)
                // In a real app, this would be done in the backend or on demand
                const mutuals: Record<string, User[]> = {};
                const topUsers = filtered.slice(0, 20); // Only for the first 20 to avoid saturation
                await Promise.all(topUsers.map(async (u) => {
                    try {
                        const m = await db.getMutualFriends(user.id, u.id);
                        mutuals[u.id] = m;
                    } catch (e) {}
                }));
                setMutualFriendsMap(mutuals);
            } catch (error) {
                console.error("Failed to fetch friends data:", error);
                toast.error("Error al cargar usuarios");
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [user]);

    const filteredUsers = useMemo(() => {
        let list = users;
        if (activeTab === 'your_friends') {
            list = users.filter(u => subscriptions.includes(u.id));
        } else {
            // Suggestions: users not followed yet
            list = users.filter(u => !subscriptions.includes(u.id));
        }

        if (searchQuery) {
            list = list.filter(u => u.username.toLowerCase().includes(searchQuery.toLowerCase()));
        }
        return list;
    }, [users, subscriptions, activeTab, searchQuery]);

    const handleToggleFollow = async (creatorId: string) => {
        if (!user) return;
        try {
            const res = await db.toggleSubscribe(user.id, creatorId);
            if (res.isSubscribed) {
                setSubscriptions(prev => [...prev, creatorId]);
                toast.success("Siguiendo");
            } else {
                setSubscriptions(prev => prev.filter(id => id !== creatorId));
                toast.success("Dejaste de seguir");
            }
            refreshUser();
        } catch (error) {
            toast.error("Error al actualizar seguimiento");
        }
    };

    return (
        <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)]">
            {/* Header */}
            <header className="sticky top-[calc(104px+env(safe-area-inset-top,24px))] z-50 bg-[var(--bg-secondary)] border-b border-[var(--divider)]">
                <div className="flex items-center justify-between px-4 h-14">
                    <div className="flex items-center gap-4">
                        <button onClick={() => navigate(-1)} className="p-1 hover:bg-[var(--bg-hover)] rounded-full transition-colors">
                            <ArrowLeft size={24} />
                        </button>
                        <h1 className="text-xl font-bold">Amigos</h1>
                    </div>
                    <button className="w-10 h-10 flex items-center justify-center bg-[#3a3b3c] rounded-full hover:bg-[#4e4f50] transition-colors">
                        <Search size={20} />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex gap-2 px-4 pb-3">
                    <button 
                        onClick={() => setActiveTab('suggestions')}
                        className={`px-4 py-2 rounded-full text-sm font-bold transition-colors ${activeTab === 'suggestions' ? 'bg-[#1877f2] text-white' : 'bg-[#3a3b3c] text-[var(--text-primary)]'}`}
                    >
                        Sugerencias
                    </button>
                    <button 
                        onClick={() => setActiveTab('your_friends')}
                        className={`px-4 py-2 rounded-full text-sm font-bold transition-colors ${activeTab === 'your_friends' ? 'bg-[#1877f2] text-white' : 'bg-[#3a3b3c] text-[var(--text-primary)]'}`}
                    >
                        Tus amigos
                    </button>
                </div>
            </header>

            {/* Content */}
            <div className="p-4">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-bold">
                        {activeTab === 'suggestions' ? 'Personas que quizá conozcas' : `Amigos (${filteredUsers.length})`}
                    </h2>
                    {activeTab === 'suggestions' && (
                        <button className="text-[#1877f2] font-medium text-sm hover:underline">Ver todo</button>
                    )}
                </div>

                {loading ? (
                    <div className="flex flex-col items-center justify-center py-20 gap-4">
                        <Loader2 className="animate-spin text-[#1877f2]" size={40} />
                        <span className="text-[var(--text-secondary)]">Cargando usuarios...</span>
                    </div>
                ) : filteredUsers.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-center">
                        <Users size={64} className="text-[var(--text-secondary)] opacity-20 mb-4" />
                        <p className="text-[var(--text-secondary)]">No se encontraron usuarios</p>
                    </div>
                ) : (
                    <div className="flex flex-col gap-4">
                        {filteredUsers.map(u => (
                            <div key={u.id} className="flex items-center gap-3 group">
                                <div className="relative shrink-0">
                                    <div 
                                        onClick={() => navigate(`/channel/${u.id}`)}
                                        className="w-20 h-20 rounded-full overflow-hidden bg-slate-800 cursor-pointer border border-[var(--divider)]"
                                    >
                                        {u.avatarUrl ? (
                                            <img src={u.avatarUrl} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-2xl font-bold text-white uppercase">
                                                {u.username?.[0]}
                                            </div>
                                        )}
                                    </div>
                                    {u.lastActive && (Date.now() / 1000 - u.lastActive < 60) && (
                                        <div className="absolute bottom-1 right-1 w-5 h-5 bg-green-500 border-4 border-[#242526] rounded-full" />
                                    )}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between">
                                        <span 
                                            onClick={() => navigate(`/channel/${u.id}`)}
                                            className="font-bold text-[17px] truncate cursor-pointer hover:underline"
                                        >
                                            {u.username}
                                        </span>
                                        <span className="text-[var(--text-secondary)] text-xs">
                                            {u.lastActive ? 'Activo recientemente' : ''}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-1 mb-2">
                                        {mutualFriendsMap[u.id] && mutualFriendsMap[u.id].length > 0 ? (
                                            <>
                                                <div className="flex -space-x-2">
                                                    {mutualFriendsMap[u.id].slice(0, 2).map(m => (
                                                        <div key={m.id} className="w-5 h-5 rounded-full border-2 border-[var(--bg-primary)] bg-slate-700 overflow-hidden">
                                                            {m.avatarUrl ? (
                                                                <img src={m.avatarUrl} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                                            ) : (
                                                                <div className="w-full h-full flex items-center justify-center text-[8px] font-bold text-white uppercase">
                                                                    {m.username?.[0]}
                                                                </div>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                                <span className="text-[var(--text-secondary)] text-[13px] ml-1">
                                                    {mutualFriendsMap[u.id].length} amigo{mutualFriendsMap[u.id].length !== 1 ? 's' : ''} en común
                                                </span>
                                            </>
                                        ) : (
                                            <span className="text-[var(--text-secondary)] text-[13px]">Sin amigos en común</span>
                                        )}
                                    </div>
                                    <div className="flex gap-2">
                                        <button 
                                            onClick={() => handleToggleFollow(u.id)}
                                            className={`flex-1 py-2 rounded-lg font-bold text-sm transition-all active:scale-95 ${
                                                subscriptions.includes(u.id) 
                                                ? 'bg-[#3a3b3c] text-[var(--text-primary)] hover:bg-[#4e4f50]' 
                                                : 'bg-[#1877f2] text-white hover:bg-[#166fe5]'
                                            }`}
                                        >
                                            {subscriptions.includes(u.id) ? 'Siguiendo' : 'Seguir'}
                                        </button>
                                        <button className="px-4 py-2 bg-[#3a3b3c] text-[var(--text-primary)] font-bold text-sm rounded-lg hover:bg-[#4e4f50] transition-all active:scale-95">
                                            Eliminar
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
