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
    const [showNotifMenu, setShowNotifMenu] = useState(false);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [isFolderGridCollapsed, setIsFolderGridCollapsed] = useState(false); 
    const [showSortMenu, setShowSortMenu] = useState(false);
    const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
    const [navVisible, setNavVisible] = useState(true);
    const [editingFolder, setEditingFolder] = useState<any | null>(null);
    const [isListening, setIsListening] = useState(false);
    
    // Filtros Persistentes
    const [mediaFilter, setMediaFilter] = useState<'ALL' | 'VIDEO' | 'AUDIO'>(() => {
        return (localStorage.getItem('sp_media_filter') as any) || 'ALL';
    });

    const [userSortOrder, setUserSortOrder] = useState<string>(() => {
        return localStorage.getItem('sp_user_sort') || ''; 
    });

    // Data State
    const [videos, setVideos] = useState<Video[]>([]);
    const [folders, setFolders] = useState<{ name: string; count: number; thumbnailUrl: string; relativePath: string; sortOrder?: string }[]>([]);
    const [appliedSortOrder, setAppliedSortOrder] = useState<string>('');
    const [page, setPage] = useState(0);
    const [hasMore, setHasMore] = useState(true);
    const [loading, setLoading] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [systemSettings, setSystemSettings] = useState<SystemSettings | null>(null);
    
    // Filters State - Inicializar desde URL y Search Params
    const queryParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
    
    const initialQuery = queryParams.get('q') || '';
    const initialCategory = queryParams.get('cat') || 'TODOS';
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
    const [selectedCategory, setSelectedCategory] = useState(initialCategory);
    const [navigationPath, setNavigationPath] = useState<string[]>(initialPath);
    const [activeCategories, setActiveCategories] = useState<string[]>(['TODOS']);

    // Sincronizar estado con URL cuando cambia la búsqueda o navegación
    useEffect(() => {
        const q = queryParams.get('q') || '';
        const cat = queryParams.get('cat') || 'TODOS';
        const folderParam = queryParams.get('folder');
        const path = folderParam ? folderParam.split('/').filter(Boolean) : [];

        setSearchQuery(q);
        setSelectedCategory(cat);
        setNavigationPath(path);
    }, [location.search, queryParams]);
    
    // Secondary Data
    const { notifications: rtNotifications, unreadCount: rtUnreadCount, markAsRead } = useNotifications();
    const [watchedIds, setWatchedIds] = useState<string[]>([]);
    const [notifs, setNotifs] = useState<AppNotification[]>([]);
    const [suggestions, setSuggestions] = useState<any[]>([]);

    const searchContainerRef = useRef<HTMLFormElement>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);
    const sortMenuRef = useRef<HTMLDivElement>(null);
    const loadMoreRef = useRef<HTMLDivElement>(null);
    const searchTimeout = useRef<any>(null);
    const lastScrollY = useRef(0);

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

    // 3. Scroll Inteligente
    useEffect(() => {
        const handleScroll = () => {
            const currentScrollY = window.scrollY;
            if (currentScrollY < 120) { setNavVisible(true); lastScrollY.current = currentScrollY; return; }
            if (currentScrollY > lastScrollY.current + 25) { setNavVisible(false); } 
            else if (currentScrollY < lastScrollY.current - 25) { setNavVisible(true); }
            lastScrollY.current = currentScrollY;
        };
        window.addEventListener('scroll', handleScroll, { passive: true });
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    // 4. Trigger de carga
    useEffect(() => { 
        setSelectedCategory('TODOS');
        fetchVideos(0, true); 
    }, [mediaFilter]);

    useEffect(() => { fetchVideos(0, true); }, [currentFolder, searchQuery, selectedCategory, userSortOrder]);

    // 5. Infinite Scroll
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
        setIsFolderGridCollapsed(false); setNavVisible(true);
    };

    const handleCategoryClick = (cat: string) => {
        updateUrl({ cat });
        if (cat !== 'TODOS') { setNavVisible(true); }
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

            <div className={`fixed top-0 left-0 right-0 z-[60] transition-transform duration-500 ease-in-out transform ${navVisible ? 'translate-y-0' : '-translate-y-full'}`}>
                <div className="relative z-20 backdrop-blur-2xl bg-black/40 border-b border-white/5 pt-4 pb-2 px-1 shadow-xl">
                    <div className="flex gap-3 items-center max-w-7xl mx-auto px-2">
                        <button onClick={() => setIsSidebarOpen(true)} className="p-2.5 bg-white/5 border border-white/10 rounded-xl text-white active:scale-95 transition-transform shrink-0"><Menu size={20}/></button>
                        
                        <form className="relative flex-1 min-w-0" ref={searchContainerRef} onSubmit={handleSearchSubmit}>
                            <Search className="absolute left-4 top-3 text-slate-400" size={18} />
                            <input 
                                ref={searchInputRef} type="text" value={searchQuery} 
                                onChange={(e) => handleSearchChange(e.target.value)} 
                                onFocus={() => handleSearchChange(searchQuery)}
                                placeholder="Explorar biblioteca..." 
                                className={`w-full bg-white/5 border border-white/10 rounded-2xl pl-11 pr-20 py-2.5 text-sm text-white focus:bg-white/10 focus:border-indigo-500 outline-none transition-all shadow-inner ${isListening ? 'ring-2 ring-red-500 animate-pulse' : ''}`} 
                            />
                            <div className="absolute right-3 top-2 flex items-center gap-1">
                                {searchQuery && <button type="button" onClick={() => { setSearchQuery(''); updateUrl({ q: '' }); fetchVideos(0, true); }} className="p-1.5 text-slate-400 hover:text-white"><X size={16}/></button>}
                                <button type="button" onClick={toggleVoiceSearch} className={`p-1.5 rounded-lg transition-colors ${isListening ? 'text-red-500 bg-red-500/10' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>
                                    <Mic size={18}/>
                                </button>
                            </div>
                            {showSuggestions && suggestions.length > 0 && (
                                <div className="absolute top-full left-0 right-0 mt-2 bg-slate-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-50 animate-in fade-in zoom-in-95 origin-top">
                                    <div className="p-2 bg-slate-950 border-b border-white/5 flex items-center justify-between">
                                        <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-2">{searchQuery ? 'Sugerencias Inteligentes' : 'Tendencias de búsqueda'}</span>
                                        <button type="button" onClick={() => setShowSuggestions(false)} className="text-slate-600 hover:text-white"><X size={12}/></button>
                                    </div>
                                    <div className="max-h-[380px] overflow-y-auto custom-scrollbar">
                                        {suggestions.map((s, i) => (
                                            <button key={i} type="button" onClick={() => handleSuggestionClick(s)} className="w-full p-3.5 flex items-center gap-4 hover:bg-white/5 transition-colors text-left group border-b border-white/[0.03] last:border-0">
                                                <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-white/5 text-slate-400 group-hover:bg-indigo-500/20 group-hover:text-indigo-400 transition-colors">
                                                    {getSuggestionIcon(s.type)}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="text-sm font-bold text-white group-hover:text-indigo-400 transition-colors truncate uppercase tracking-tighter">{s.label}</div>
                                                    <div className="text-[8px] font-black text-slate-500 uppercase tracking-widest mt-0.5">
                                                        {s.type === 'HISTORY' ? 'RECUPERAR BÚSQUEDA' : (s.type === 'FOLDER' ? 'NAVEGAR A CARPETA' : s.type)}
                                                    </div>
                                                </div>
                                                <ChevronRight size={14} className="text-slate-700 opacity-0 group-hover:opacity-100 transition-all transform group-hover:translate-x-1" />
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </form>

                        <div className="relative shrink-0">
                            <button onClick={() => { setShowNotifMenu(!showNotifMenu); if (!showNotifMenu) markAsRead(); }} className="p-2.5 bg-white/5 border border-white/10 rounded-xl text-white relative active:scale-95 transition-transform">
                                <Bell size={22} className={totalUnreadCount > 0 ? "animate-bounce" : ""} />
                                {totalUnreadCount > 0 && <span className="absolute -top-1 -right-1 bg-red-600 text-white text-[10px] font-black w-5 h-5 flex items-center justify-center rounded-full border-2 border-black">{totalUnreadCount}</span>}
                            </button>
                            {showNotifMenu && (
                                <div className="absolute top-full right-0 mt-3 w-80 bg-slate-900 border border-white/10 rounded-[32px] shadow-2xl overflow-hidden z-[80] animate-in fade-in zoom-in-95 origin-top-right">
                                    <div className="p-5 bg-slate-950 border-b border-white/5 flex justify-between items-center"><h4 className="font-black text-white uppercase text-[10px] tracking-widest">Notificaciones</h4></div>
                                    <div className="max-h-[450px] overflow-y-auto custom-scrollbar">
                                        {allNotifications.length === 0 ? (
                                            <div className="py-12 text-center text-slate-600 flex flex-col items-center gap-3"><MessageSquare size={32} className="opacity-20" /><p className="text-[10px] font-black uppercase tracking-widest">Sin alertas</p></div>
                                        ) : allNotifications.map((n: any) => (
                                            <button key={n.id} onClick={() => handleNotifClick(n)} className={`w-full p-4 flex gap-4 text-left border-b border-white/5 transition-all hover:bg-white/5 ${Number(n.isRead) === 0 ? 'bg-indigo-500/[0.04]' : 'opacity-70'}`}>
                                                <div className={`shrink-0 overflow-hidden shadow-lg ${n.type === 'UPLOAD' ? 'w-20 aspect-video rounded-lg' : 'w-12 h-12 rounded-xl'} bg-slate-800 flex items-center justify-center border border-white/5`}>
                                                    {n.avatarUrl ? <img src={n.avatarUrl} className="w-full h-full object-cover" referrerPolicy="no-referrer" /> : <Bell size={16} className="text-slate-500" />}
                                                </div>
                                                <div className="flex-1 min-w-0 flex flex-col justify-center">
                                                    <div className="flex justify-between items-center mb-0.5">
                                                        <span className={`text-[8px] font-black px-1.5 py-0.5 rounded uppercase ${n.type === 'SALE' ? 'bg-emerald-500/20 text-emerald-400' : (n.type === 'UPLOAD' ? 'bg-indigo-500/20 text-indigo-400' : 'bg-slate-700 text-slate-400')}`}>
                                                            {n.type}
                                                        </span>
                                                        <span className="text-[8px] text-slate-600 font-bold">{formatTimeAgo(n.timestamp)}</span>
                                                    </div>
                                                    <p className="text-[11px] leading-snug text-white font-bold line-clamp-2">{n.text}</p>
                                                    {n.type === 'SALE' && n.metadata?.net && (
                                                        <div className="mt-1 flex items-center gap-1 text-[10px] font-black text-emerald-400">
                                                            <TrendingUp size={10}/> Ganaste: +{Number(n.metadata.net).toFixed(2)} $
                                                        </div>
                                                    )}
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                    <div className="p-3 bg-slate-950/50 border-t border-white/5">
                                        <button onClick={() => { db.markAllNotificationsRead(user!.id); setNotifs(p => p.map(x => ({...x, isRead: true}))); }} className="w-full py-2 text-[9px] font-black text-slate-500 hover:text-white uppercase tracking-widest transition-colors flex items-center justify-center gap-2">
                                            <CheckCircle size={12}/> Marcar todo como visto
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div className="relative z-10 backdrop-blur-xl bg-black/20 border-b border-white/5 pb-2 px-2 shadow-sm">
                    <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-2 w-full">
                            <div className="flex items-center gap-1 bg-white/10 backdrop-blur-md p-1 rounded-xl border border-white/10 shrink-0 z-30">
                                <button onClick={() => { handleNavigate(-1); updateUrl({ q: '', folder: [], cat: 'TODOS' }); }} className="p-2.5 hover:bg-white/10 rounded-lg text-white transition-colors active:scale-90" title="Ir al inicio"><HomeIcon size={16}/></button>
                                <button onClick={() => setIsFolderModalOpen(true)} className="p-2.5 hover:bg-white/10 rounded-lg text-white transition-colors active:scale-90" title="Explorar carpetas"><Folder size={16}/></button>
                                {folders.length > 0 && (
                                    <button onClick={() => { if (searchQuery) { updateUrl({ q: '' }); } setIsFolderGridCollapsed(!isFolderGridCollapsed); }} className={`p-2.5 rounded-lg transition-all duration-300 active:scale-90 ${!isFolderGridCollapsed ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/40' : 'text-slate-300 hover:text-white'}`} title={isFolderGridCollapsed ? "Mostrar carpetas" : "Ocultar carpetas"}><ChevronDown size={16} className={`transition-transform duration-300 ${!isFolderGridCollapsed ? 'rotate-180' : ''}`} /></button>
                                )}
                            </div>
                            <div className="flex-1 min-w-0 z-10"><Breadcrumbs path={navigationPath} onNavigate={(idx: number) => { handleNavigate(idx); if(searchQuery) { updateUrl({ q: '' }); } }} /></div>
                            <div className="flex items-center gap-1.5 shrink-0 ml-auto z-30">
                                <div className="flex bg-white/5 p-1 rounded-xl border border-white/10 shrink-0 shadow-inner">
                                    <button onClick={() => setMediaFilter('ALL')} className={`p-1.5 rounded-lg transition-all ${mediaFilter === 'ALL' ? 'bg-white text-black shadow-lg' : 'text-slate-500 hover:text-slate-300'}`} title="Todo"><Layers size={13}/></button>
                                    <button onClick={() => setMediaFilter('VIDEO')} className={`p-1.5 rounded-lg transition-all ${mediaFilter === 'VIDEO' ? 'bg-white text-black shadow-lg' : 'text-slate-500 hover:text-slate-300'}`} title="Video"><Play size={13}/></button>
                                    <button onClick={() => setMediaFilter('AUDIO')} className={`p-1.5 rounded-lg transition-all ${mediaFilter === 'AUDIO' ? 'bg-white text-black shadow-lg' : 'text-slate-500 hover:text-slate-300'}`} title="Audio"><Music size={13}/></button>
                                </div>
                                <div className="relative" ref={sortMenuRef}>
                                    <button onClick={() => setShowSortMenu(!showSortMenu)} className={`p-2.5 rounded-xl transition-all border active:scale-90 ${userSortOrder ? 'bg-indigo-600 text-white border-indigo-500 shadow-lg' : 'bg-white/5 border-white/10 text-slate-400 hover:text-white'}`}><ArrowDownUp size={15}/></button>
                                    {showSortMenu && (
                                        <div className="absolute top-full right-0 mt-2 w-48 bg-slate-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-[90] animate-in fade-in zoom-in-95 origin-top-right">
                                            <div className="p-2 bg-slate-950 border-b border-white/5"><span className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Ordenar por</span></div>
                                            <div className="p-1">
                                                {sortOptions.map(opt => (
                                                    <button key={opt.id} onClick={() => { setUserSortOrder(opt.id); setShowSortMenu(false); }} className={`w-full p-3 flex items-center gap-3 rounded-xl transition-colors text-left ${userSortOrder === opt.id ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-white'}`}><opt.icon size={14} className={userSortOrder === opt.id ? 'text-white' : 'text-slate-500'} /><span className="text-xs font-bold uppercase tracking-tight">{opt.label}</span>{userSortOrder === opt.id && <Check size={12} className="ml-auto" />}</button>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                        {!searchQuery && (
                            <div className="flex items-center gap-3 overflow-x-auto scrollbar-hide py-1 animate-in fade-in duration-300">
                                {parentFolderName && <div className="flex items-center gap-1 text-indigo-400 font-black text-[10px] uppercase tracking-tighter shrink-0 border-r border-white/10 pr-3"><Folder size={12}/> {parentFolderName}</div>}
                                <div className="flex gap-2">
                                    {activeCategories.map(cat => (
                                        <button key={cat} onClick={() => handleCategoryClick(cat)} className={`whitespace-nowrap px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all ${selectedCategory === cat ? 'bg-white text-black border-white shadow-lg' : 'bg-white/5 text-slate-300 border-white/10 hover:bg-white/10 hover:text-white'}`}>{cat === 'TODOS' ? (parentFolderName ? 'Todo en ' + parentFolderName : 'Todo') : cat}</button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="pt-44 px-0">
                {loading ? (
                    <div className="flex flex-col items-center justify-center py-40 gap-4"><Loader2 className="animate-spin text-indigo-500" size={48} /><p className="text-xs font-black text-slate-500 uppercase tracking-widest animate-pulse">Sincronizando contenido...</p></div>
                ) : (
                    <div className="space-y-12 animate-in fade-in duration-1000">
                        {folders.length > 0 && !isFolderGridCollapsed && (
                            <div className="space-y-6">
                                <div className="flex items-center gap-3 px-1"><div className="w-1.5 h-1.5 rounded-full bg-amber-500"></div><h2 className="text-[11px] font-black text-white uppercase tracking-[0.3em]">{searchQuery ? 'Carpetas coincidentes' : 'Explorar Carpetas'}</h2></div>
                                <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 animate-in slide-in-from-top-6 duration-500">
                                    {folders.map(folder => (
                                        <div key={folder.name} className="group relative aspect-[4/5] sm:aspect-video rounded-[32px] overflow-hidden bg-slate-900 border border-white/5 hover:border-indigo-500 shadow-2xl transition-all duration-300">
                                            <button onClick={() => { updateUrl({ q: '', folder: [...navigationPath, folder.name], cat: 'TODOS' }); setIsFolderGridCollapsed(false); }} className="absolute inset-0 z-0">{folder.thumbnailUrl ? ( <img src={folder.thumbnailUrl} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700 opacity-60" referrerPolicy="no-referrer" /> ) : ( <div className="w-full h-full flex items-center justify-center bg-slate-950 text-slate-800"> <Folder size={48} className="opacity-20" /> </div> )}<div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/20 to-indigo-500/10"></div></button>
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
                            {!searchQuery && ( <div className="flex items-center gap-3 px-1"><div className={`w-1.5 h-1.5 rounded-full ${mediaFilter === 'AUDIO' ? 'bg-emerald-500' : 'bg-indigo-500'}`}></div><h2 className="text-[11px] font-black text-white uppercase tracking-[0.3em] flex items-center gap-4">{selectedCategory !== 'TODOS' ? `Filtrando por: ${selectedCategory}` : (parentFolderName ? `Contenido en ${parentFolderName}` : 'Novedades')}{mediaFilter !== 'ALL' && <span className="text-slate-500 text-[9px] lowercase italic">({mediaFilter.toLowerCase()}s)</span>}{userSortOrder && <span className="text-indigo-400 text-[9px] lowercase border border-indigo-500/30 px-2 py-0.5 rounded-full">orden: {sortOptions.find(o => o.id === userSortOrder)?.label.toLowerCase()}</span>}<span className="w-12 h-px bg-white/10"></span></h2></div> )}
                            {searchQuery && ( 
                                <div className="flex items-center justify-between px-1">
                                    <div className="flex items-center gap-3">
                                        <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></div>
                                        <h2 className="text-[11px] font-black text-white uppercase tracking-[0.3em] flex items-center gap-4">
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
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1">
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
