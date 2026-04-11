import React, { useState, useEffect, useMemo, useRef } from 'react';
import VideoCard from '../VideoCard';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../services/db';
import { Video, Notification as AppNotification, User, SystemSettings, Category } from '../../types';
import { useNotifications } from '../../context/NotificationContext';
import { 
    RefreshCw, Search, X, ChevronRight, ChevronDown, Home as HomeIcon, Layers, Folder, Bell, Menu, Crown, User as UserIcon, LogOut, ShieldCheck, MessageSquare, Loader2, Tag, Play, Music, ShoppingBag, History, Edit3, DollarSign, SortAsc, Save, ArrowDownUp, Clock, Zap, Check, CheckCircle, TrendingUp, Mic
} from 'lucide-react';
import { useNavigate, Link, useLocation } from '../Router';
import { useToast } from '../../context/ToastContext';

// Refactored Components
import Sidebar from '../home/Sidebar';
import Breadcrumbs from '../home/Breadcrumbs';
import FolderEditModal from '../home/FolderEditModal';
import FolderNavigationModal from '../home/FolderNavigationModal';

// Helper de tiempo relativo para notificaciones
const formatTimeAgo = (timestamp: number) => {
    const diff = Math.floor(Date.now() / 1000 - timestamp);
    if (diff < 60) return 'ahora';
    if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`;
    if (diff < 86400) return `hace ${Math.floor(diff / 3600)} h`;
    return `hace ${Math.floor(diff / 86400)} d`;
};

export default function Home() {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const toast = useToast();
    
    // UI State
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
    const [editingFolder, setEditingFolder] = useState<any | null>(null);

    // Filtros Persistentes - Leer desde configuración
    const mediaFilter: 'ALL' | 'VIDEO' | 'AUDIO' = (localStorage.getItem('sp_media_filter') as any) || 'ALL';
    const userSortOrder: string = localStorage.getItem('sp_user_sort') || '';
    const showFoldersGrid: boolean = localStorage.getItem('sp_show_folders') === 'true' || localStorage.getItem('sp_show_folders') === null;

    // Data State
    const [videos, setVideos] = useState<Video[]>([]);
    const [folders, setFolders] = useState<{ name: string; count: number; thumbnailUrl: string; relativePath: string; sortOrder?: string }[]>([]);
    const [appliedSortOrder, setAppliedSortOrder] = useState<string>('');
    const [page, setPage] = useState(0);
    const [hasMore, setHasMore] = useState(true);
    const [loading, setLoading] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [systemSettings, setSystemSettings] = useState<SystemSettings | null>(null);
    
    // UI Interaction State
    const [showSortMenu, setShowSortMenu] = useState(false);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [suggestions, setSuggestions] = useState<any[]>([]);
    const [isListening, setIsListening] = useState(false);
    const [isFolderGridCollapsed, setIsFolderGridCollapsed] = useState(false);
    const [showNotifMenu, setShowNotifMenu] = useState(false);
    
    // Filters State - Inicializar desde URL y Search Params
    const queryParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
    
    const initialQuery = queryParams.get('q') || '';
    const initialPath = useMemo(() => {
        const folderParam = queryParams.get('folder');
        if (folderParam) return folderParam.split('/').filter(Boolean);
        try {
            const saved = localStorage.getItem('sp_nav_path');
            return saved ? JSON.parse(saved) : [];
        } catch (e) {
            return [];
        }
    }, [queryParams]);

    const [searchQuery, setSearchQuery] = useState(initialQuery);
    const [navigationPath, setNavigationPath] = useState<string[]>(initialPath);

    // Categoría fija en TODOS
    const selectedCategory = 'TODOS';
    const [activeCategories, setActiveCategories] = useState<string[]>(['TODOS']);

    // Sincronizar estado con URL cuando cambia la búsqueda o navegación
    useEffect(() => {
        const q = queryParams.get('q') || '';
        const folderParam = queryParams.get('folder');
        const path = folderParam ? folderParam.split('/').filter(Boolean) : [];

        setSearchQuery(q);
        setNavigationPath(path);
    }, [location.search, queryParams]);

    // Secondary Data
    const { notifications: rtNotifications, unreadCount: rtUnreadCount, markAsRead } = useNotifications();
    const [watchedIds, setWatchedIds] = useState<string[]>([]);
    const [notifs, setNotifs] = useState<AppNotification[]>([]);

    const searchContainerRef = useRef<HTMLFormElement>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);
    const sortMenuRef = useRef<HTMLDivElement>(null);
    const loadMoreRef = useRef<HTMLDivElement | null>(null);
    const searchTimeout = useRef<any>(null);

    const currentFolder = navigationPath.join('/');
    const parentFolderName = navigationPath.length > 0 ? navigationPath[navigationPath.length - 1] : null;

    const editingFolderConfig = useMemo(() => {
        if (!editingFolder || !systemSettings?.categories) return { price: 1.0, sortOrder: 'LATEST' };
        const found = systemSettings.categories.find(c => c.name.toLowerCase() === editingFolder.name.toLowerCase());
        return {
            price: found ? Number(found.price) : 1.0,
            sortOrder: found ? (found.sortOrder || 'LATEST') : 'LATEST'
        };
    }, [editingFolder, systemSettings]);

    // Persistencia de preferencias
    useEffect(() => { localStorage.setItem('sp_media_filter', mediaFilter); }, [mediaFilter]);
    useEffect(() => { localStorage.setItem('sp_user_sort', userSortOrder); }, [userSortOrder]);
    useEffect(() => { localStorage.setItem('sp_nav_path', JSON.stringify(navigationPath)); }, [navigationPath]);

    // 1. Cargar configuración inicial
    useEffect(() => {
        db.getSystemSettings().then(s => {
            setSystemSettings(s);
        });
        if (user) {
            db.getUserActivity(user.id).then(act => setWatchedIds(act?.watched || []));
            db.getNotifications(user.id).then(setNotifs);
        }
    }, [user?.id]);

    // 2. Cargador de Videos (Paginado)
    const fetchVideos = async (p: number, reset: boolean = false) => {
        if (loading || (loadingMore && !reset)) return;
        if (reset) { setLoading(true); setVideos([]); setFolders([]); } else { setLoadingMore(true); }
        try {
            // Petición principal de videos y carpetas
            const res = await db.getVideos(p, 40, currentFolder, searchQuery, selectedCategory, mediaFilter, userSortOrder, user?.id);
            
            if (reset) {
                let finalVideos = res.videos;
                
                // Refuerzo de búsqueda multi-término local
                if (searchQuery.trim().includes(' ')) {
                    const terms = searchQuery.toLowerCase().trim().split(/\s+/);
                    finalVideos = res.videos.filter(v => {
                        const title = v.title.toLowerCase();
                        return terms.every(term => title.includes(term));
                    });
                    
                    if (finalVideos.length === 0 && res.videos.length > 0) {
                        finalVideos = res.videos;
                    }
                }

                setVideos(finalVideos);
                
                // LÓGICA DE CARPETAS MEJORADA - Asegurar que sea un array
                let rawFolders = res.folders;
                let finalFolders: any[] = [];
                
                if (Array.isArray(rawFolders)) {
                    finalFolders = rawFolders;
                } else if (rawFolders && typeof rawFolders === 'object') {
                    // Si es un objeto, convertirlo a array si tiene sentido
                    finalFolders = Object.values(rawFolders);
                }
                
                // Si estamos en una ruta y no hay carpetas, intentamos recuperarlas
                if (finalFolders.length === 0 && !searchQuery) {
                    try {
                        const structureRes = await db.getVideos(0, 50, currentFolder, '', 'TODOS', 'ALL', '', user?.id);
                        const recovered = structureRes.folders;
                        if (Array.isArray(recovered)) {
                            finalFolders = recovered;
                        } else if (recovered && typeof recovered === 'object') {
                            finalFolders = Object.values(recovered);
                        }
                    } catch(e) {
                        console.error("Error recovering folder structure:", e);
                    }
                }

                // Si hay búsqueda, el backend filtra. Mostramos las del nivel actual como fallback si no hay coincidencias.
                if (searchQuery && finalFolders.length === 0) {
                    try {
                        const currentLevelRes = await db.getVideos(0, 1, currentFolder, '', 'TODOS', 'ALL', '', user?.id);
                        const recovered = currentLevelRes.folders;
                        if (Array.isArray(recovered) && recovered.length > 0) {
                            finalFolders = recovered;
                        } else if (recovered && typeof recovered === 'object' && Object.keys(recovered).length > 0) {
                            finalFolders = Object.values(recovered);
                        }
                    } catch(e) {}
                }

                setFolders(finalFolders);
                setAppliedSortOrder(res.appliedSortOrder || '');
                setActiveCategories(['TODOS', ...res.activeCategories]);
            } else { 
                setVideos(prev => [...prev, ...res.videos]); 
            }
            setHasMore(res.hasMore); 
            setPage(p);
        } catch (e) { 
            toast.error("Error al sincronizar catálogo"); 
        } 
        finally { 
            setLoading(false); 
            setLoadingMore(false); 
        }
    };

    // 3. Trigger de carga
    useEffect(() => {
        fetchVideos(0, true);
    }, [mediaFilter]);

    useEffect(() => { fetchVideos(0, true); }, [currentFolder, searchQuery, userSortOrder]);

    // 4. Infinite Scroll
    useEffect(() => {
        if (!hasMore || loading || loadingMore) return;
        const observer = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting) { fetchVideos(page + 1); }
        }, { threshold: 0.1, rootMargin: '400px' });
        if (loadMoreRef.current) observer.observe(loadMoreRef.current);
        return () => observer.disconnect();
    }, [page, hasMore, loading, loadingMore]);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) setShowSuggestions(false);
            if (sortMenuRef.current && !sortMenuRef.current.contains(e.target as Node)) setShowSortMenu(false);
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const updateUrl = (params: { q?: string; folder?: string[]; cat?: string }, replace = false) => {
        const newParams = new URLSearchParams(location.search);
        
        if (params.q !== undefined) {
            if (params.q) newParams.set('q', params.q);
            else newParams.delete('q');
        }
        
        if (params.folder !== undefined) {
            const pathStr = params.folder.join('/');
            if (pathStr) newParams.set('folder', pathStr);
            else newParams.delete('folder');
        }
        
        if (params.cat !== undefined) {
            if (params.cat !== 'TODOS') newParams.set('cat', params.cat);
            else newParams.delete('cat');
        }

        const searchStr = newParams.toString();
        const to = searchStr ? `/?${searchStr}` : '/';
        navigate(to, { replace });
    };

    const handleSearchChange = (val: string) => {
        setSearchQuery(val);
        if (searchTimeout.current) clearTimeout(searchTimeout.current);
        searchTimeout.current = setTimeout(async () => {
            if (!val.trim()) {
                setSuggestions([]);
                return;
            }

            try { 
                // 1. Obtener sugerencias base del servidor (historial, etc)
                const dbRes = await db.getSearchSuggestions(val); 
                let finalSuggestions = dbRes || [];
                
                // 2. Búsqueda Multi-término Local (Ej: "amor 7")
                // Buscamos en TODOS los videos si es posible, o al menos en los actuales
                const terms = val.toLowerCase().trim().split(/\s+/);
                
                // Intentar encontrar coincidencias en los videos actuales
                const localMatches = videos.filter(v => {
                    const title = v.title.toLowerCase();
                    return terms.every(term => title.includes(term));
                }).slice(0, 5).map(v => ({
                    id: v.id,
                    label: v.title,
                    type: v.is_audio ? 'AUDIO' : 'VIDEO'
                }));

                // También buscar en carpetas
                const folderMatches = folders.filter(f => {
                    const name = f.name.toLowerCase();
                    return terms.every(term => name.includes(term));
                }).slice(0, 3).map(f => ({
                    label: f.name,
                    type: 'FOLDER'
                }));

                // Combinar y evitar duplicados
                const existingLabels = new Set(finalSuggestions.map(s => s.label.toLowerCase()));
                const extra = [...localMatches, ...folderMatches].filter(m => !existingLabels.has(m.label.toLowerCase()));
                
                finalSuggestions = [...extra, ...finalSuggestions];
                
                setSuggestions(finalSuggestions); 
                setShowSuggestions(true); 
            } catch(e) {}
        }, 300);
    };

    const toggleVoiceSearch = () => {
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SpeechRecognition) {
            toast.error("Tu navegador no soporta búsqueda por voz");
            return;
        }
        
        const recognition = new SpeechRecognition();
        recognition.lang = 'es-ES';
        recognition.onstart = () => setIsListening(true);
        recognition.onend = () => setIsListening(false);
        recognition.onresult = (event: any) => {
            const transcript = event.results[0][0].transcript;
            setSearchQuery(transcript);
            handleSearchChange(transcript);
        };
        recognition.start();
    };

    const handleSearchSubmit = (e: React.FormEvent) => {
        e.preventDefault(); 
        const term = searchQuery.trim();
        if (term.length >= 2) { 
            db.saveSearch(term); 
        }
        updateUrl({ q: term }); 
        setShowSuggestions(false);
        if (searchInputRef.current) { 
            searchInputRef.current.blur(); 
        }
        // Forzar recarga con el nuevo término
        fetchVideos(0, true);
    };

    const handleSuggestionClick = (s: any) => {
        setShowSuggestions(false);
        if (searchInputRef.current) { searchInputRef.current.blur(); }
        if (s.type === 'HISTORY' || s.type === 'CATEGORY') {
            setSearchQuery(s.label); 
            updateUrl({ q: s.label, cat: s.type === 'CATEGORY' ? s.label : undefined });
            db.saveSearch(s.label);
        } else if (s.type === 'FOLDER') {
            setSearchQuery(''); 
            updateUrl({ q: '', folder: [...navigationPath, s.label], cat: 'TODOS' });
            setIsFolderGridCollapsed(false); setVideos([]); 
        } else {
            db.saveSearch(searchQuery || s.label);
            const contextParam = searchQuery ? `?q=${encodeURIComponent(searchQuery)}` : '';
            if (s.type === 'VIDEO' || s.type === 'AUDIO') navigate(`/watch/${s.id}${contextParam}`);
            else if (s.type === 'MARKET') navigate(`/marketplace/${s.id}`);
            else if (s.type === 'USER') navigate(`/channel/${s.id}`);
        }
    };

    const handleNavigate = (index: number) => {
        const newPath = index === -1 ? [] : navigationPath.slice(0, index + 1);
        updateUrl({ folder: newPath, cat: 'TODOS' });
    };

    const handleCategoryClick = (cat: string) => {
        // Ya no se necesita - las categorías se manejan en CategoriesPage
    };

    const handleBulkEditFolder = async (price: number, sortOrder: string) => {
        if (!editingFolder) return;
        try {
            await db.request('action=admin_bulk_edit_folder', {
                method: 'POST',
                body: JSON.stringify({ folderPath: editingFolder.relativePath, price, sortOrder })
            });
            toast.success("Configuración aplicada a toda la rama");
            setEditingFolder(null); const s = await db.getSystemSettings();
            setSystemSettings(s); fetchVideos(0, true);
        } catch (e: any) { toast.error("Error al aplicar cambios: " + e.message); }
    };

    const handleNotifClick = async (n: AppNotification) => {
        if (Number(n.isRead) === 0) {
            try { await db.markNotificationRead(n.id); setNotifs(prev => prev.map(p => p.id === n.id ? { ...p, isRead: true } : p)); } 
            catch(e) {}
        }
        setShowNotifMenu(false); navigate(n.link);
    };

    const totalUnreadCount = useMemo(() => {
        const dbUnread = notifs.filter(n => Number(n.isRead) === 0).length;
        return dbUnread + rtUnreadCount;
    }, [notifs, rtUnreadCount]);

    const allNotifications = useMemo(() => {
        // Convert real-time notifications to the format expected by the UI
        const formattedRt = rtNotifications.map(rn => ({
            id: rn.id,
            userId: user?.id || '',
            text: rn.message,
            type: 'SHARE' as any,
            timestamp: rn.timestamp,
            link: rn.videoId ? `/watch/${rn.videoId}` : '/',
            isRead: false as any,
            metadata: { videoId: rn.videoId }
        }));
        return [...formattedRt, ...notifs].sort((a, b) => b.timestamp - a.timestamp);
    }, [rtNotifications, notifs, user?.id]);

    const processedVideos = useMemo(() => {
        if (!videos || videos.length === 0) return [];
        
        const result: Video[] = [];
        const collectionsSeen = new Set<string>();

        // Pre-calculate counts for all categories
        const categoryCounts: Record<string, number> = {};
        videos.forEach(v => {
            if (v) {
                const cat = (v.category || '').toUpperCase();
                categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
            }
        });

        videos.forEach(item => {
            if (!item) return;
            
            const itemCat = (item.category || '').toUpperCase();

            // 1. Group Images by Collection (Album)
            if (item.collection && itemCat === 'IMAGES') {
                if (!collectionsSeen.has(item.collection)) {
                    collectionsSeen.add(item.collection);
                    const albumItems = videos.filter(v => v && v.collection === item.collection);
                    result.push({
                        ...item,
                        isAlbum: true,
                        albumItems: albumItems,
                        categoryCount: categoryCounts[itemCat]
                    } as any);
                }
                return;
            }

            // All other items (Videos, Audios) are shown independently
            result.push({
                ...item,
                categoryCount: categoryCounts[itemCat]
            });
        });

        return result;
    }, [videos]);

    const isAdmin = user?.role?.trim().toUpperCase() === 'ADMIN';

    const getSuggestionIcon = (type: string) => {
        switch (type) {
            case 'HISTORY': return <History size={14} className="text-slate-500" />;
            case 'CATEGORY': return <Tag size={14} className="text-pink-400" />;
            case 'FOLDER': return <Folder size={14} className="text-amber-500" />;
            case 'VIDEO': return <Play size={14} className="text-indigo-400" />;
            case 'AUDIO': return <Music size={14} className="text-emerald-400" />;
            case 'MARKET': return <ShoppingBag size={14} className="text-amber-400" />;
            case 'USER': return <UserIcon size={14} className="text-blue-400" />;
            default: return <Layers size={14} className="text-slate-400" />;
        }
    };

    const sortOptions = [
        { id: '', label: 'Por Defecto', icon: RefreshCw },
        { id: 'LATEST', label: 'Recientes', icon: Clock },
        { id: 'ALPHA', label: 'A-Z (Título)', icon: SortAsc },
        { id: 'RANDOM', label: 'Aleatorio', icon: Zap }
    ];

    return (
        <div className="relative pb-20">
            <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} user={user} isAdmin={isAdmin} logout={logout}/>

            <div className="pt-4 px-0">
                {loading ? (
                    <div className="flex flex-col items-center justify-center py-40 gap-4"><Loader2 className="animate-spin text-indigo-500" size={48} /><p className="text-xs font-black text-slate-500 uppercase tracking-widest animate-pulse">Sincronizando contenido...</p></div>
                ) : (
                    <div className="space-y-12 animate-in fade-in duration-1000">
                        {folders.length > 0 && showFoldersGrid && (
                            <div className="space-y-6 px-1">
                                <div className="flex items-center gap-3 px-0"><div className="w-1.5 h-1.5 rounded-full bg-amber-500"></div><h2 className="text-[11px] font-black text-white uppercase tracking-[0.3em]">{searchQuery ? 'Carpetas coincidentes' : 'Explorar Carpetas'}</h2></div>
                                <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 animate-in slide-in-from-top-6 duration-500">
                                    {folders.map(folder => (
                                        <div key={folder.name} className="group relative aspect-[4/5] sm:aspect-video rounded-[32px] overflow-hidden bg-slate-900 border border-white/5 hover:border-indigo-500 shadow-2xl transition-all duration-300">
                                            <button onClick={() => { updateUrl({ q: '', folder: [...navigationPath, folder.name], cat: 'TODOS' }); }} className="absolute inset-0 z-0">{folder.thumbnailUrl ? ( <img src={folder.thumbnailUrl} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700 opacity-60" referrerPolicy="no-referrer" /> ) : ( <div className="w-full h-full flex items-center justify-center bg-slate-950 text-slate-800"> <Folder size={48} className="opacity-20" /> </div> )}<div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/20 to-indigo-500/10"></div></button>
                                            <div className="relative z-10 h-full flex flex-col p-5 pointer-events-none">
                                                <div className="flex justify-between items-start">
                                                    <div className="p-2.5 bg-slate-800/80 rounded-xl border border-white/5 text-indigo-400 group-hover:scale-110 transition-transform shadow-lg"><Folder size={20}/></div>
                                                    <div className="flex flex-col items-end gap-2">
                                                        <div className="flex gap-1.5">
                                                            {folder.sortOrder && folder.sortOrder !== 'LATEST' && (
                                                                <div className="bg-amber-500/30 backdrop-blur-md px-2 py-0.5 rounded-lg border border-amber-500/30 flex items-center gap-1">
                                                                    {folder.sortOrder === 'ALPHA' ? <SortAsc size={10} className="text-amber-400" /> : <Zap size={10} className="text-amber-400" />}
                                                                    <span className="text-[8px] text-amber-200 font-black uppercase tracking-widest">{folder.sortOrder}</span>
                                                                </div>
                                                            )}
                                                            <div className="bg-indigo-600/30 backdrop-blur-md px-2 py-0.5 rounded-lg border border-indigo-500/30">
                                                                <span className="text-[8px] text-indigo-200 font-black uppercase tracking-widest">{folder.count} ITEMS</span>
                                                            </div>
                                                        </div>
                                                        {isAdmin && (<button onClick={(e) => { e.preventDefault(); e.stopPropagation(); setEditingFolder(folder); }} className="p-2 bg-slate-950/80 hover:bg-indigo-600 text-white rounded-xl border border-white/10 shadow-xl transition-all active:scale-90 pointer-events-auto"><Edit3 size={14}/></button>)}
                                                    </div>
                                                </div>
                                                <div className="mt-auto"><h3 className="text-base font-black text-white uppercase tracking-tight text-left leading-tight drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] group-hover:text-indigo-300 transition-colors line-clamp-2">{folder.name}</h3><div className="w-6 h-1 bg-indigo-500 mt-2 rounded-full group-hover:w-full transition-all duration-700"></div></div></div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="space-y-8">
                            {!searchQuery && ( <div className="flex items-center gap-3 px-3"><div className={`w-1.5 h-1.5 rounded-full ${mediaFilter === 'AUDIO' ? 'bg-emerald-500' : 'bg-indigo-500'}`}></div><h2 className="text-[11px] font-black text-white uppercase tracking-[0.3em] flex items-center gap-2 flex-wrap">{selectedCategory !== 'TODOS' ? `Filtrando por: ${selectedCategory}` : (parentFolderName ? `Contenido en ${parentFolderName}` : 'Novedades')}{mediaFilter !== 'ALL' && <span className="text-slate-500 text-[9px] lowercase italic">({mediaFilter.toLowerCase()}s)</span>}{userSortOrder && <span className="text-indigo-400 text-[9px] lowercase border border-indigo-500/30 px-2 py-0.5 rounded-full whitespace-nowrap">orden: {sortOptions.find(o => o.id === userSortOrder)?.label.toLowerCase()}</span>}<span className="flex-1 h-px bg-white/10 min-w-[20px]"></span></h2></div> )}
                            {searchQuery && ( 
                                <div className="flex items-center justify-between px-3">
                                    <div className="flex items-center gap-3">
                                        <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></div>
                                        <h2 className="text-[11px] font-black text-white uppercase tracking-[0.3em] flex items-center gap-2 flex-wrap">
                                            Resultados para: {searchQuery}
                                            <span className="w-12 h-px bg-white/10"></span>
                                        </h2>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <button 
                                            onClick={() => setShowSortMenu(!showSortMenu)} 
                                            className={`p-2 rounded-xl transition-all border flex items-center gap-2 ${userSortOrder ? 'bg-indigo-600 text-white border-indigo-500' : 'bg-white/5 border-white/10 text-slate-400 hover:text-white'}`}
                                        >
                                            <ArrowDownUp size={12}/>
                                            <span className="text-[9px] font-black uppercase tracking-widest hidden sm:inline">
                                                {userSortOrder ? sortOptions.find(o => o.id === userSortOrder)?.label : 'Ordenar'}
                                            </span>
                                        </button>
                                        <button onClick={() => { updateUrl({ q: '' }); fetchVideos(0, true); }} className="text-[10px] font-black text-slate-500 hover:text-white uppercase tracking-widest transition-colors flex items-center gap-1.5"><X size={12}/> Limpiar</button>
                                    </div>
                                </div> 
                            )}
                            {videos.length > 0 ? ( 
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-0 sm:gap-1">
                                    {processedVideos.map(v => ( 
                                        <VideoCard 
                                            key={v.id} 
                                            video={v} 
                                            isUnlocked={isAdmin || user?.id === v.creatorId || !!(user?.vipExpiry && user.vipExpiry > Date.now() / 1000)} 
                                            isWatched={watchedIds.includes(v.id)} 
                                            onCategoryClick={() => handleCategoryClick(v.category)}
                                            context={{ 
                                                query: searchQuery, 
                                                category: selectedCategory, 
                                                folder: currentFolder, 
                                                page: page, 
                                                sort_order: userSortOrder || appliedSortOrder 
                                            }} 
                                        /> 
                                    ))}
                                </div> 
                            ) : (folders.length === 0 && !loading) && ( 
                                <div className="text-center py-40 opacity-20 flex flex-col items-center gap-4">
                                    <Folder size={80} />
                                    <p className="font-black uppercase tracking-widest">Sin contenido disponible</p>
                                </div> 
                            )}
                        </div>

                        {hasMore && ( <div ref={loadMoreRef} className="py-20 flex flex-col items-center justify-center gap-3"><Loader2 className="animate-spin text-slate-700" size={32} /><p className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Cargando más resultados...</p></div> )}
                    </div>
                )}
            </div>

            {editingFolder && ( <FolderEditModal folder={editingFolder} initialPrice={editingFolderConfig.price} initialSortOrder={editingFolderConfig.sortOrder} onClose={() => setEditingFolder(null)} onSave={handleBulkEditFolder} /> )}
            
            <FolderNavigationModal 
                isOpen={isFolderModalOpen} 
                onClose={() => setIsFolderModalOpen(false)} 
                currentPath={navigationPath} 
                onNavigate={(path) => {
                    updateUrl({ q: '', folder: path, cat: 'TODOS' });
                    setIsFolderGridCollapsed(false);
                }} 
            />
        </div>
    );
}
