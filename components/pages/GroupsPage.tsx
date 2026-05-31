import React, { useState, useEffect, useMemo } from 'react';
import { 
    ChevronLeft, Folder, Users, Star, Plus, 
    Share2, Compass, CheckCircle, LogOut, ArrowLeft, Image, Zap, Loader2
} from 'lucide-react';
import { useNavigate } from '../Router';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../services/db';
import { useToast } from '../../context/ToastContext';
import { useDownload } from '../../context/DownloadContext';
import VideoCard from '../VideoCard';

export default function GroupsPage() {
    const navigate = useNavigate();
    const { user } = useAuth();
    const toast = useToast();
    const { addToQueue } = useDownload();
    
    const [groups, setGroups] = useState<any[]>([]);
    const [subscribedPaths, setSubscribedPaths] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const [tab, setTab] = useState<'MY_GROUPS' | 'EXPLORE'>('MY_GROUPS');
    const [activeGroup, setActiveGroup] = useState<any | null>(null);
    const [groupContent, setGroupContent] = useState<any[]>([]);
    const [loadingContent, setLoadingContent] = useState(false);

    // Load available groups & registrations
    useEffect(() => {
        loadGroups();
    }, [user?.id]);

    const loadGroups = async () => {
        try {
            setLoading(true);
            // Obtener carpetas raíz
            const result = await db.getFolders('');
            setGroups(result);

            if (user?.id) {
                const subs = await db.getGroupSubscriptions(user.id);
                setSubscribedPaths(subs);
                // Si hay grupos y no están suscritos a ninguno, proponer la pestaña Explora
                if (subs.length === 0) {
                    setTab('EXPLORE');
                }
            }
        } catch (err) {
            console.error('Error loading groups:', err);
            toast.error("Error al cargar grupos");
        } finally {
            setLoading(false);
        }
    };

    // Load active group's feed
    const loadGroupContent = async (groupName: string) => {
        try {
            setLoadingContent(true);
            const result = await db.getVideos(0, 100, groupName, '', 'TODOS', 'ALL', 'LATEST');
            setGroupContent(result.videos || []);
        } catch (err) {
            console.error('Error loading group content:', err);
            toast.error("Error al cargar contenido del grupo");
        } finally {
            setLoadingContent(false);
        }
    };

    const handleGroupClick = (group: any) => {
        setActiveGroup(group);
        loadGroupContent(group.name);
    };

    const handleBack = () => {
        setActiveGroup(null);
        setGroupContent([]);
    };

    const isSubscribed = (groupName: string) => {
        return subscribedPaths.some(p => p.toLowerCase() === groupName.toLowerCase());
    };

    const handleToggleSubscribe = async (e: React.MouseEvent, groupName: string) => {
        e.stopPropagation();
        if (!user?.id) {
            toast.error("Inicia sesión para unirte a grupos");
            return;
        }

        const currentlySubbed = isSubscribed(groupName);
        try {
            if (currentlySubbed) {
                await db.unsubscribeGroup(user.id, groupName);
                setSubscribedPaths(prev => prev.filter(p => p.toLowerCase() !== groupName.toLowerCase()));
                toast.success(`Has salido del grupo ${groupName}`);
            } else {
                await db.subscribeGroup(user.id, groupName);
                setSubscribedPaths(prev => [...prev, groupName]);
                toast.success(`Te has unido al grupo ${groupName}`);
            }
        } catch (err) {
            console.error('Group action failed:', err);
            toast.error("Error en la operación del grupo");
        }
    };

    const myGroups = useMemo(() => {
        return groups.filter(g => isSubscribed(g.name));
    }, [groups, subscribedPaths]);

    const exploreGroups = useMemo(() => {
        return groups.filter(g => !isSubscribed(g.name));
    }, [groups, subscribedPaths]);

    // Render Group feed view
    if (activeGroup) {
        const joined = isSubscribed(activeGroup.name);
        const isAdmin = user?.role === 'ADMIN';

        return (
            <div className="min-h-screen bg-[#18191a] text-[#e4e6eb] pb-24">
                {/* Header navbar */}
                <div className="sticky top-[calc(104px+env(safe-area-inset-top,24px))] z-50 bg-[#242526] border-b border-[#3e4042] px-4 h-14 flex items-center justify-between shadow-md">
                    <button onClick={handleBack} className="flex items-center gap-1 text-[#1877f2] font-bold text-sm">
                        <ArrowLeft size={20} />
                        <span>Volver</span>
                    </button>
                    <span className="font-bold text-sm truncate max-w-[200px]">Grupo: {activeGroup.name}</span>
                    <button 
                        onClick={(e) => handleToggleSubscribe(e, activeGroup.name)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                            joined 
                            ? 'bg-[#3a3b3c] hover:bg-[#4e4f50] text-[#e4e6eb]' 
                            : 'bg-[#1877f2] hover:bg-blue-600 text-white'
                        }`}
                    >
                        {joined ? 'Miembro ▼' : 'Unirse al grupo'}
                    </button>
                </div>

                {/* Group Cover Style Banner */}
                <div className="bg-[#242526] border-b border-[#3e4042]">
                    <div className="relative h-36 bg-slate-800 flex items-center justify-center overflow-hidden">
                        {activeGroup.thumbnailUrl ? (
                            <img src={activeGroup.thumbnailUrl} className="w-full h-full object-cover opacity-60 filter blur-sm" referrerPolicy="no-referrer" />
                        ) : (
                            <div className="absolute inset-0 bg-gradient-to-r from-blue-700 to-indigo-900 opacity-60" />
                        )}
                        <div className="absolute inset-0 bg-black/40"></div>
                        <div className="relative text-center p-4">
                            <h1 className="text-xl font-extrabold text-white tracking-tight">{activeGroup.name}</h1>
                            <p className="text-xs text-white/80 font-medium mt-1 uppercase tracking-wider">{activeGroup.count} publicaciones</p>
                        </div>
                    </div>
                </div>

                <div className="max-w-xl mx-auto p-4 space-y-4">
                    {/* FB Compositor Box for posting */}
                    {joined && (
                        <div onClick={() => navigate(`/upload?folder=${encodeURIComponent(activeGroup.name)}`)} className="bg-[#242526] rounded-xl p-3 border border-[#3e4042] shadow-md flex flex-col gap-3 cursor-pointer hover:bg-[#2d2e30] transition-colors">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-[#3a3b3c] overflow-hidden flex-shrink-0">
                                    {user?.avatarUrl ? (
                                        <img src={user.avatarUrl} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-white font-bold">{user?.username?.[0]?.toUpperCase()}</div>
                                    )}
                                </div>
                                <div className="flex-1 bg-[#3a3b3c] hover:bg-[#4e4f50] rounded-full px-4 h-10 flex items-center text-[#b0b3b8] text-sm transition-colors">
                                    Escribe algo en {activeGroup.name}...
                                </div>
                            </div>
                            <div className="border-t border-[#3e4042] pt-2 flex items-center justify-around text-xs text-[#b0b3b8] font-bold">
                                <span className="flex items-center gap-1.5 text-green-500"><Image size={18} />Foto/video de grupo</span>
                                <span className="flex items-center gap-1.5 text-pink-500"><Zap size={18} />Publicación express</span>
                            </div>
                        </div>
                    )}

                    {/* Feed Content */}
                    {loadingContent ? (
                        <div className="flex flex-col items-center justify-center py-20 gap-3">
                            <Loader2 className="animate-spin text-[#1877f2]" size={32} />
                            <p className="text-xs font-bold text-[#b0b3b8]">Cargando feed del grupo...</p>
                        </div>
                    ) : groupContent.length === 0 ? (
                        <div className="bg-[#242526] rounded-xl p-8 border border-[#3e4042] text-center max-w-sm mx-auto shadow-md">
                            <Folder size={48} className="mx-auto text-slate-600 mb-3" />
                            <h3 className="font-bold text-base text-[#e4e6eb]">Grupo sin publicaciones</h3>
                            <p className="text-xs text-[#b0b3b8] mt-1">Todavía nadie ha publicado nada en {activeGroup.name}. ¡Sé el primero!</p>
                            {joined && (
                                <button
                                    onClick={() => navigate(`/upload?folder=${encodeURIComponent(activeGroup.name)}`)}
                                    className="mt-4 bg-[#1877f2] text-white rounded-lg px-4 py-2 text-xs font-bold hover:bg-blue-600 active:scale-95 transition-all inline-flex items-center gap-1.5"
                                >
                                    <Plus size={16} />
                                    Publicar algo
                                </button>
                            )}
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 gap-4">
                            {groupContent.map((v) => (
                                <div key={v.id} className="bg-[#242526] rounded-xl border border-[#3e4042] overflow-hidden shadow-md">
                                    <VideoCard 
                                        video={v}
                                        isUnlocked={isAdmin || user?.id === v.creatorId || !!(user?.vipExpiry && user.vipExpiry > Date.now() / 1000) || Number(v.price || 0) <= 0}
                                        showDownload={true}
                                        onDownload={() => addToQueue(v)}
                                        onView={() => navigate(`/watch/${v.id}`)}
                                    />
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#18191a] text-[#e4e6eb] pb-24">
            {/* Header section styled elegantly like FB Groups */}
            <div className="sticky top-[calc(104px+env(safe-area-inset-top,24px))] z-40 bg-[#242526] border-b border-[#3e4042] shadow-md">
                <div className="px-4 pt-4 pb-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Users size={24} className="text-[#1877f2]" />
                        <h1 className="text-xl font-extrabold tracking-tight">Grupos</h1>
                    </div>
                </div>

                {/* FB styled tabs */}
                <div className="flex border-t border-[#3e4042] px-2 h-12">
                    <button 
                        onClick={() => setTab('MY_GROUPS')}
                        className={`flex-1 flex items-center justify-center gap-2 h-full text-xs font-bold border-b-4 transition-all ${
                            tab === 'MY_GROUPS' 
                            ? 'border-[#1877f2] text-[#1877f2]' 
                            : 'border-transparent text-[#b0b3b8] hover:text-white'
                        }`}
                    >
                        <Star size={16} />
                        Mis Grupos ({myGroups.length})
                    </button>
                    <button 
                        onClick={() => setTab('EXPLORE')}
                        className={`flex-1 flex items-center justify-center gap-2 h-full text-xs font-bold border-b-4 transition-all ${
                            tab === 'EXPLORE' 
                            ? 'border-[#1877f2] text-[#1877f2]' 
                            : 'border-transparent text-[#b0b3b8] hover:text-white'
                        }`}
                    >
                        <Compass size={16} />
                        Descubrir ({exploreGroups.length})
                    </button>
                </div>
            </div>

            {/* List directory content */}
            <div className="max-w-xl mx-auto p-4">
                {loading ? (
                    <div className="flex flex-col items-center justify-center py-32 gap-3">
                        <Loader2 className="animate-spin text-[#1877f2]" size={36} />
                        <p className="text-xs font-bold text-[#b0b3b8] uppercase tracking-wider">Cargando grupos...</p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {tab === 'MY_GROUPS' ? (
                            myGroups.length === 0 ? (
                                <div className="bg-[#242526] border border-[#3e4042] rounded-xl p-8 text-center max-w-sm mx-auto shadow-md">
                                    <Users size={48} className="mx-auto text-slate-600 mb-3" />
                                    <h3 className="font-bold text-base text-[#e4e6eb]">Sin unirse a grupos</h3>
                                    <p className="text-xs text-[#b0b3b8] mt-1 mb-4">No te has unido a ningún grupo todavía. ¡Explora las carpetas y únete para ver contenido en tu feed principal!</p>
                                    <button
                                        onClick={() => setTab('EXPLORE')}
                                        className="bg-[#1877f2] text-white rounded-lg px-4 py-2 text-xs font-bold hover:bg-blue-600 active:scale-95 transition-all inline-flex items-center gap-1.5"
                                    >
                                        <Compass size={16} />
                                        Examinar grupos
                                    </button>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    {myGroups.map((group) => (
                                        <GroupRow 
                                            key={group.name} 
                                            group={group} 
                                            joined={true}
                                            onClick={handleGroupClick} 
                                            onToggle={handleToggleSubscribe} 
                                        />
                                    ))}
                                </div>
                            )
                        ) : (
                            exploreGroups.length === 0 ? (
                                <div className="text-center py-20 text-[#b0b3b8]">
                                    <CheckCircle size={40} className="mx-auto text-green-500 mb-2 opacity-50" />
                                    <p className="text-sm font-semibold text-[#e4e6eb]">Te has unido a todos los grupos</p>
                                    <p className="text-xs">¡No quedan más grupos por descubrir!</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    {exploreGroups.map((group) => (
                                        <GroupRow 
                                            key={group.name} 
                                            group={group} 
                                            joined={false}
                                            onClick={handleGroupClick} 
                                            onToggle={handleToggleSubscribe} 
                                        />
                                    ))}
                                </div>
                            )
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

// Inner Component for Group Listing Card
interface GroupRowProps {
    group: any;
    joined: boolean;
    onClick: (g: any) => void;
    onToggle: (e: React.MouseEvent, n: string) => void;
}

function GroupRow({ group, joined, onClick, onToggle }: GroupRowProps) {
    return (
        <div 
            onClick={() => onClick(group)} 
            className="bg-[#242526] rounded-xl border border-[#3e4042] overflow-hidden shadow-md flex flex-col h-full cursor-pointer hover:border-[#4e4f50] transition-colors"
        >
            <div className="relative h-24 bg-slate-800 flex items-center justify-center overflow-hidden">
                {group.thumbnailUrl ? (
                    <img src={group.thumbnailUrl} className="w-full h-full object-cover opacity-65" referrerPolicy="no-referrer" />
                ) : (
                    <div className="absolute inset-0 bg-gradient-to-br from-blue-800 to-indigo-950 opacity-80" />
                )}
                <div className="absolute inset-0 bg-black/20" />
            </div>
            
            <div className="p-3 flex flex-col flex-1 justify-between gap-3">
                <div>
                    <h3 className="font-extrabold text-sm text-[#e4e6eb] truncate leading-tight">{group.name}</h3>
                    <span className="text-[10px] text-[#b0b3b8] font-bold uppercase tracking-wide">{group.count} posts</span>
                </div>
                
                <button
                    onClick={(e) => onToggle(e, group.name)}
                    className={`w-full py-1.5 rounded-lg text-xs font-bold transition-all ${
                        joined 
                        ? 'bg-[#3a3b3c] hover:bg-[#4e4f50] text-[#e4e6eb]' 
                        : 'bg-[#1877f2] hover:bg-blue-600 text-white'
                    }`}
                >
                    {joined ? 'Salir del Grupo' : 'Unirse al Grupo'}
                </button>
            </div>
        </div>
    );
}
