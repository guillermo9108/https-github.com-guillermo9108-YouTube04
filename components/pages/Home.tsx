import React, { useState, useEffect, useMemo, useRef } from 'react';
import VideoCard from '../VideoCard';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../services/db';
import { Video, Notification as AppNotification, User, SystemSettings, Category } from '../../types';
import { 
    RefreshCw, Search, X, ChevronRight, ChevronDown, Home as HomeIcon, Layers, Folder, Bell, Menu, Crown, User as UserIcon, LogOut, ShieldCheck, MessageSquare, Loader2, Tag, Play, Music, ShoppingBag, History, Edit3, DollarSign, SortAsc, Save, ArrowDownUp, Clock, Zap, Check, CheckCircle, TrendingUp
} from 'lucide-react';
import { useNavigate, Link, useLocation } from '../Router';
import AIConcierge from '../AIConcierge';
import { useToast } from '../../context/ToastContext';

// Helper de tiempo relativo para notificaciones
const formatTimeAgo = (timestamp: number) => {
    const diff = Math.floor(Date.now() / 1000 - timestamp);
    if (diff < 60) return 'ahora';
    if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`;
    if (diff < 86400) return `hace ${Math.floor(diff / 3600)} h`;
    return `hace ${Math.floor(diff / 86400)} d`;
};

const Sidebar: React.FC<{ isOpen: boolean, onClose: () => void, user: User | null, isAdmin: boolean, logout: () => void }> = ({ isOpen, onClose, user, isAdmin, logout }) => {
    const navigate = useNavigate();
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 z-[100] animate-in fade-in duration-300">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose}></div>
            <div className="absolute top-0 left-0 bottom-0 w-[280px] bg-slate-900 border-r border-white/5 shadow-2xl flex flex-col animate-in slide-in-from-left duration-500">
                <div className="p-6 bg-slate-950 border-b border-white/5 relative">
                    <button onClick={onClose} className="absolute top-4 right-4 text-slate-500 hover:text-white"><X size={20}/></button>
                    <div className="flex items-center gap-4 mb-6">
                        <div className="w-14 h-14 rounded-2xl bg-indigo-600 border-2 border-white/10 overflow-hidden shadow-lg">
                            {user?.avatarUrl ? <img src={user.avatarUrl} className="w-full h-full object-cover"/> : <div className="w-full h-full flex items-center justify-center font-black text-white text-xl">{user?.username?.[0] || '?'}</div>}
                        </div>
                        <div className="min-w-0">
                            <div className="font-black text-white truncate">@{user?.username || 'Usuario'}</div>
                            <div className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">{user?.role}</div>
                        </div>
                    </div>
                    <div className="bg-white/5 rounded-2xl p-4 border border-white/5">
                        <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Tu Saldo</p>
                        <div className="text-xl font-black text-emerald-400">{Number(user?.balance || 0).toFixed(2)} $</div>
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
                    <button onClick={() => { navigate('/'); onClose(); }} className="w-full flex items-center gap-4 p-4 rounded-2xl hover:bg-white/5 text-slate-300 hover:text-white transition-all group">
                        <HomeIcon size={20} className="text-slate-500 group-hover:text-indigo-400"/>
                        <span className="text-xs font-black uppercase tracking-widest">Inicio</span>
                    </button>
                    <button onClick={() => { navigate('/profile'); onClose(); }} className="w-full flex items-center gap-4 p-4 rounded-2xl hover:bg-white/5 text-slate-300 hover:text-white transition-all group">
                        <UserIcon size={20} className="text-slate-500 group-hover:text-indigo-400"/>
                        <span className="text-xs font-black uppercase tracking-widest">Mi Perfil</span>
                    </button>
                    <button onClick={() => { navigate('/watch-later'); onClose(); }} className="w-full flex items-center gap-4 p-4 rounded-2xl hover:bg-white/5 text-slate-300 hover:text-white transition-all group">
                        <Bell size={20} className="text-slate-500 group-hover:text-amber-400"/>
                        <span className="text-xs font-black uppercase tracking-widest">Ver más tarde</span>
                    </button>
                    <button onClick={() => { navigate('/vip'); onClose(); }} className="w-full flex items-center gap-4 p-4 rounded-2xl hover:bg-white/5 text-slate-300 hover:text-white transition-all group">
                        <Crown size={20} className="text-slate-500 group-hover:text-amber-500"/>
                        <span className="text-xs font-black uppercase tracking-widest">VIP & Recargas</span>
                    </button>
                    {isAdmin && (
                        <div className="pt-4 mt-4 border-t border-white/5">
                            <button onClick={() => { navigate('/admin'); onClose(); }} className="w-full flex items-center gap-4 p-4 rounded-2xl bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 transition-all border border-indigo-500/20">
                                <ShieldCheck size={20}/><span className="text-xs font-black uppercase tracking-widest">Panel Admin</span>
                            </button>
                        </div>
                    )}
                </div>
                <div className="p-4 bg-slate-950/50 border-t border-white/5">
                    <button onClick={() => { logout(); onClose(); }} className="w-full flex items-center gap-4 p-4 rounded-2xl text-red-400 hover:bg-red-500/10 transition-all">
                        <LogOut size={20}/><span className="text-xs font-black uppercase tracking-widest">Cerrar Sesión</span>
                    </button>
                </div>
            </div>
        </div>
    );
};

const Breadcrumbs: React.FC<{ 
    path: string[], 
    onNavigate: (index: number) => void
}> = ({ path, onNavigate }) => (
    <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide py-2 animate-in fade-in flex-1 min-w-0 [mask-image:linear-gradient(to_right,transparent,black_5%,black_95%,transparent)]">
        {path.map((segment, i) => (
            <React.Fragment key={`${segment}-${i}`}>
                {i > 0 && <ChevronRight size={10} className="text-white/20 shrink-0"/>}
                <button 
                    onClick={() => onNavigate(i)}
                    className={`whitespace-nowrap px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all shrink-0 ${i === path.length - 1 ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/40' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
                >
                    {segment}
                </button>
            </React.Fragment>
        ))}
    </div>
);

const FolderEditModal: React.FC<{ 
    folder: any, 
    initialPrice: number,
    initialSortOrder: string,
    onClose: () => void, 
    onSave: (price: number, sortOrder: string) => Promise<void> 
}> = ({ folder, initialPrice, initialSortOrder, onClose, onSave }) => {
    const [price, setPrice] = useState<number>(initialPrice);
    const [sortOrder, setSortOrder] = useState<string>(initialSortOrder);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        setPrice(initialPrice);
        setSortOrder(initialSortOrder);
    }, [folder.relativePath, initialPrice, initialSortOrder]);

    return (
        <div className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in">
            <div className="bg-slate-900 border border-white/10 rounded-[32px] w-full max-w-sm overflow-hidden shadow-2xl animate-in zoom-in-95">
                <div className="p-6 bg-slate-950 border-b border-white/5 flex justify-between items-center">
                    <div>
                        <h3 className="font-black text-white uppercase text-xs tracking-widest">Configurar Carpeta</h3>
                        <p className="text-[10px] text-indigo-400 font-bold uppercase truncate max-w-[200px]">{folder.name}</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-full text-slate-500"><X size={20}/></button>
                </div>
                <div className="p-6 space-y-6">
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase ml-1">Precio Sugerido ($)</label>
                        <div className="relative">
                            <DollarSign className="absolute left-4 top-3.5 text-emerald-500" size={18}/>
                            <input 
                                type="number" step="0.1" value={price} onChange={e => setPrice(parseFloat(e.target.value))}
                                className="w-full bg-slate-950 border border-slate-800 rounded-2xl pl-10 pr-4 py-4 text-white font-black text-2xl focus:border-emerald-500 outline-none transition-all shadow-inner"
                            />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase ml-1">Orden de la Colección</label>
                        <div className="relative">
                            <SortAsc className="absolute left-4 top-3.5 text-indigo-400" size={18}/>
                            <select 
                                value={sortOrder} onChange={e => setSortOrder(e.target.value)}
                                className="w-full bg-slate-950 border border-slate-800 rounded-2xl pl-10 pr-4 py-4 text-white font-black text-xs uppercase focus:border-indigo-500 outline-none transition-all shadow-inner appearance-none"
                            >
                                <option value="LATEST">Recientes (Default)</option>
                                <option value="ALPHA">Alfabético (A-Z)</option>
                                <option value="RANDOM">Aleatorio</option>
                            </select>
                        </div>
                    </div>
                    <div className="p-4 bg-indigo-500/10 rounded-2xl border border-indigo-500/20">
                         <p className="text-[9px] text-indigo-300 leading-snug font-bold uppercase">Esto aplicará recursivamente a todos los videos y subcarpetas dentro de: <span className="text-white italic">{folder.name}</span></p>
                    </div>
                    <button 
                        onClick={() => { setLoading(true); onSave(price, sortOrder).finally(() => setLoading(false)); }} 
                        disabled={loading} 
                        className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 text-white font-black py-4 rounded-2xl shadow-xl flex items-center justify-center gap-2 active:scale-95 transition-all text-xs uppercase tracking-widest"
                    >
                        {loading ? <Loader2 size={16} className="animate-spin"/> : <Save size={16}/>} Aplicar a Jerarquía
                    </button>
                </div>
            </div>
        </div>
    );
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
    const [showFolderGrid, setShowFolderGrid] = useState(true); 
    const [showSortMenu, setShowSortMenu] = useState(false);
    const [navVisible, setNavVisible] = useState(true);
    const [editingFolder, setEditingFolder] = useState<any | null>(null);
    
    // Filtros Persistentes
    const [mediaFilter, setMediaFilter] = useState<'ALL' | 'VIDEO' | 'AUDIO'>(() => {
        return (localStorage.getItem('sp_media_filter') as any) || 'ALL';
    });

    const [userSortOrder, setUserSortOrder] = useState<string>(() => {
        return localStorage.getItem('sp_user_sort') || ''; 
    });

    // Data State
    const [videos, setVideos] = useState<Video[]>([]);
    const [folders, setFolders] = useState<{ name: string; count: number; thumbnailUrl: string; relativePath: string }[]>([]);
    const [page, setPage] = useState(0);
    const [hasMore, setHasMore] = useState(true);
    const [loading, setLoading] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [systemSettings, setSystemSettings] = useState<SystemSettings | null>(null);
    
    // Filters State - Inicializar desde URL
    const initialQuery = useMemo(() => {
        const hash = window.location.hash;
        if (!hash.includes('?')) return '';
        const params = new URLSearchParams(hash.split('?')[1]);
        return params.get('q') || '';
    }, []);

    const [searchQuery, setSearchQuery] = useState(initialQuery);
    const [selectedCategory, setSelectedCategory] = useState('TODOS');
    const [navigationPath, setNavigationPath] = useState<string[]>([]);
    const [activeCategories, setActiveCategories] = useState<string[]>(['TODOS']);
    
    // Secondary Data
    const [watchedIds, setWatchedIds] = useState<string[]>([]);
    const [notifs, setNotifs] = useState<AppNotification[]>([]);
    const [suggestions, setSuggestions] = useState<any[]>([]);
    const [geminiActive, setGeminiActive] = useState(false);

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

    // 1. Cargar configuración inicial
    useEffect(() => {
        db.getSystemSettings().then(s => {
            setSystemSettings(s);
            setGeminiActive(!!s.geminiKey);
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
            const res = await db.getVideos(p, 40, currentFolder, searchQuery, selectedCategory, mediaFilter, userSortOrder);
            if (reset) {
                setVideos(res.videos);
                setFolders(res.folders as any);
                setActiveCategories(['TODOS', ...res.activeCategories]);
                if (selectedCategory !== 'TODOS' && navigationPath.length === 0 && res.videos.length > 0 && systemSettings) {
                    const firstVid = res.videos[0];
                    const rawPath = (firstVid as any).rawPath || firstVid.videoUrl;
                    const rootPath = systemSettings.localLibraryPath || '';
                    if (rawPath.startsWith(rootPath)) {
                        const relative = rawPath.substring(rootPath.length).replace(/^[\\/]+/, '');
                        const segments = relative.split(/[\\/]/).filter(Boolean);
                        if (segments.length > 1) {
                            const newPath = segments.slice(0, -1);
                            if (newPath.length > 0) {
                                const finalPath = (newPath[newPath.length-1].toLowerCase() === selectedCategory.toLowerCase()) ? newPath.slice(0, -1) : newPath;
                                if (finalPath.length > 0) { setNavigationPath(finalPath); setShowFolderGrid(true); setNavVisible(true); }
                            }
                        }
                    }
                }
            } else { setVideos(prev => [...prev, ...res.videos]); }
            setHasMore(res.hasMore); setPage(p);
        } catch (e) { toast.error("Error al sincronizar catálogo"); } 
        finally { setLoading(false); setLoadingMore(false); }
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
    useEffect(() => { fetchVideos(0, true); }, [currentFolder, searchQuery, selectedCategory, mediaFilter, userSortOrder]);

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

    const updateUrlSearch = (term: string) => {
        const hashBase = '/';
        if (term.trim()) { navigate(`${hashBase}?q=${encodeURIComponent(term.trim())}`, { replace: true }); }
        else { navigate(hashBase, { replace: true }); }
    };

    const handleSearchChange = (val: string) => {
        setSearchQuery(val);
        if (searchTimeout.current) clearTimeout(searchTimeout.current);
        searchTimeout.current = setTimeout(async () => {
            try { const res = await db.getSearchSuggestions(val); setSuggestions(res || []); setShowSuggestions(true); } catch(e) {}
        }, 300);
    };

    const handleSearchSubmit = (e: React.FormEvent) => {
        e.preventDefault(); const term = searchQuery.trim();
        if (term.length >= 2) { db.saveSearch(term); }
        updateUrlSearch(term); setShowSuggestions(false);
        if (searchInputRef.current) { searchInputRef.current.blur(); }
    };

    const handleSuggestionClick = (s: any) => {
        setShowSuggestions(false);
        if (searchInputRef.current) { searchInputRef.current.blur(); }
        if (s.type === 'HISTORY' || s.type === 'CATEGORY') {
            setSearchQuery(s.label); updateUrlSearch(s.label);
            if (s.type === 'CATEGORY') setSelectedCategory(s.label);
            db.saveSearch(s.label);
        } else if (s.type === 'FOLDER') {
            setSearchQuery(''); updateUrlSearch(''); setNavigationPath(prev => [...prev, s.label]);
            setSelectedCategory('TODOS'); setShowFolderGrid(true); setVideos([]); 
        } else {
            db.saveSearch(searchQuery || s.label);
            const contextParam = searchQuery ? `?q=${encodeURIComponent(searchQuery)}` : '';
            if (s.type === 'VIDEO' || s.type === 'AUDIO') navigate(`/watch/${s.id}${contextParam}`);
            else if (s.type === 'MARKET') navigate(`/marketplace/${s.id}`);
            else if (s.type === 'USER') navigate(`/channel/${s.id}`);
        }
    };

    const handleNavigate = (index: number) => {
        if (index === -1) { setNavigationPath([]); } 
        else { setNavigationPath(navigationPath.slice(0, index + 1)); }
        setSelectedCategory('TODOS'); setShowFolderGrid(true); setNavVisible(true);
    };

    const handleCategoryClick = (cat: string) => {
        setSelectedCategory(cat);
        if (cat !== 'TODOS') { setShowFolderGrid(true); setNavVisible(true); }
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

    const unreadCount = useMemo(() => notifs.filter(n => Number(n.isRead) === 0).length, [notifs]);
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
                <div className="relative z-20 backdrop-blur-2xl bg-black/40 border-b border-white/5 pt-4 pb-2 px-4 md:px-8 shadow-xl">
                    <div className="flex gap-3 items-center max-w-7xl mx-auto">
                        <button onClick={() => setIsSidebarOpen(true)} className="p-2.5 bg-white/5 border border-white/10 rounded-xl text-white active:scale-95 transition-transform shrink-0"><Menu size={20}/></button>
                        
                        <form className="relative flex-1 min-w-0" ref={searchContainerRef} onSubmit={handleSearchSubmit}>
                            <Search className="absolute left-4 top-3 text-slate-400" size={18} />
                            <input 
                                ref={searchInputRef} type="text" value={searchQuery} 
                                onChange={(e) => handleSearchChange(e.target.value)} 
                                onFocus={() => handleSearchChange(searchQuery)}
                                placeholder="Explorar biblioteca..." 
                                className="w-full bg-white/5 border border-white/10 rounded-2xl pl-11 pr-10 py-2.5 text-sm text-white focus:bg-white/10 focus:border-indigo-500 outline-none transition-all shadow-inner" 
                            />
                            {searchQuery && <button type="button" onClick={() => { setSearchQuery(''); updateUrlSearch(''); fetchVideos(0, true); }} className="absolute right-3 top-3 text-slate-400 hover:text-white"><X size={16}/></button>}
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
                                                    <div className="text-[8px] font-black text-slate-500 uppercase tracking-widest mt-0.5">{s.type === 'HISTORY' ? 'RECUPERAR BÚSQUEDA' : (s.type === 'FOLDER' ? 'NAVEGAR A CARPETA' : s.type)}</div>
                                                </div>
                                                <ChevronRight size={14} className="text-slate-700 opacity-0 group-hover:opacity-100 transition-all transform group-hover:translate-x-1" />
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </form>

                        <div className="relative shrink-0">
                            <button onClick={() => setShowNotifMenu(!showNotifMenu)} className="p-2.5 bg-white/5 border border-white/10 rounded-xl text-white relative active:scale-95 transition-transform">
                                <Bell size={22} className={unreadCount > 0 ? "animate-bounce" : ""} />
                                {unreadCount > 0 && <span className="absolute -top-1 -right-1 bg-red-600 text-white text-[10px] font-black w-5 h-5 flex items-center justify-center rounded-full border-2 border-black">{unreadCount}</span>}
                            </button>
                            {showNotifMenu && (
                                <div className="absolute top-full right-0 mt-3 w-80 bg-slate-900 border border-white/10 rounded-[32px] shadow-2xl overflow-hidden z-[80] animate-in fade-in zoom-in-95 origin-top-right">
                                    <div className="p-5 bg-slate-950 border-b border-white/5 flex justify-between items-center"><h4 className="font-black text-white uppercase text-[10px] tracking-widest">Notificaciones</h4></div>
                                    <div className="max-h-[450px] overflow-y-auto custom-scrollbar">
                                        {notifs.length === 0 ? (
                                            <div className="py-12 text-center text-slate-600 flex flex-col items-center gap-3"><MessageSquare size={32} className="opacity-20" /><p className="text-[10px] font-black uppercase tracking-widest">Sin alertas</p></div>
                                        ) : notifs.map(n => (
                                            <button key={n.id} onClick={() => handleNotifClick(n)} className={`w-full p-4 flex gap-4 text-left border-b border-white/5 transition-all hover:bg-white/5 ${Number(n.isRead) === 0 ? 'bg-indigo-500/[0.04]' : 'opacity-70'}`}>
                                                <div className={`shrink-0 overflow-hidden shadow-lg ${n.type === 'UPLOAD' ? 'w-20 aspect-video rounded-lg' : 'w-12 h-12 rounded-xl'} bg-slate-800 flex items-center justify-center border border-white/5`}>
                                                    {n.avatarUrl ? <img src={n.avatarUrl} className="w-full h-full object-cover" /> : <Bell size={16} className="text-slate-500" />}
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

                <div className="relative z-10 backdrop-blur-xl bg-black/20 border-b border-white/5 pb-2 px-4 md:px-8 shadow-sm">
                    <div className="flex flex-col gap-2 max-w-7xl mx-auto">
                        <div className="flex items-center gap-2 w-full">
                            <div className="flex items-center gap-1 bg-white/10 backdrop-blur-md p-1 rounded-xl border border-white/10 shrink-0 z-30">
                                <button onClick={() => { handleNavigate(-1); setSearchQuery(''); updateUrlSearch(''); }} className="p-2.5 hover:bg-white/10 rounded-lg text-white transition-colors active:scale-90"><HomeIcon size={16}/></button>
                                <button onClick={() => { if (searchQuery) { setSearchQuery(''); updateUrlSearch(''); } setShowFolderGrid(!showFolderGrid); }} className={`p-2.5 rounded-lg transition-all duration-300 active:scale-90 ${showFolderGrid ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/40' : 'text-slate-300 hover:text-white'}`}><ChevronDown size={16} className={`transition-transform duration-300 ${showFolderGrid ? 'rotate-180' : ''}`} /></button>
                            </div>
                            <div className="flex-1 min-w-0 z-10"><Breadcrumbs path={navigationPath} onNavigate={(idx) => { handleNavigate(idx); if(searchQuery) {setSearchQuery(''); updateUrlSearch('');} }} /></div>
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

            <div className="pt-44 px-4 md:px-8 max-w-7xl mx-auto">
                {loading ? (
                    <div className="flex flex-col items-center justify-center py-40 gap-4"><Loader2 className="animate-spin text-indigo-500" size={48} /><p className="text-xs font-black text-slate-500 uppercase tracking-widest animate-pulse">Sincronizando contenido...</p></div>
                ) : (
                    <div className="space-y-12 animate-in fade-in duration-1000">
                        {showFolderGrid && folders.length > 0 && (
                            <div className="space-y-6">
                                <div className="flex items-center gap-3 px-1"><div className="w-1.5 h-1.5 rounded-full bg-amber-500"></div><h2 className="text-[11px] font-black text-white uppercase tracking-[0.3em]">{searchQuery ? 'Carpetas coincidentes' : 'Explorar Carpetas'}</h2></div>
                                <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 animate-in slide-in-from-top-6 duration-500">
                                    {folders.map(folder => (
                                        <div key={folder.name} className="group relative aspect-[4/5] sm:aspect-video rounded-[32px] overflow-hidden bg-slate-900 border border-white/5 hover:border-indigo-500 shadow-2xl transition-all duration-300">
                                            <button onClick={() => { setSearchQuery(''); updateUrlSearch(''); setNavigationPath([...navigationPath, folder.name]); setSelectedCategory('TODOS'); setShowFolderGrid(true); }} className="absolute inset-0 z-0">{folder.thumbnailUrl ? ( <img src={folder.thumbnailUrl} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700 opacity-60" /> ) : ( <div className="w-full h-full flex items-center justify-center bg-slate-950 text-slate-800"> <Folder size={48} className="opacity-20" /> </div> )}<div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/20 to-indigo-500/10"></div></button>
                                            <div className="relative z-10 h-full flex flex-col p-5 pointer-events-none"><div className="flex justify-between items-start"><div className="p-2.5 bg-slate-800/80 rounded-xl border border-white/5 text-indigo-400 group-hover:scale-110 transition-transform shadow-lg"><Folder size={20}/></div><div className="flex flex-col items-end gap-2"><div className="bg-indigo-600/30 backdrop-blur-md px-2 py-0.5 rounded-lg border border-indigo-500/30"><span className="text-[8px] text-indigo-200 font-black uppercase tracking-widest">{folder.count} ITEMS</span></div>{isAdmin && (<button onClick={(e) => { e.preventDefault(); e.stopPropagation(); setEditingFolder(folder); }} className="p-2 bg-slate-950/80 hover:bg-indigo-600 text-white rounded-xl border border-white/10 shadow-xl transition-all active:scale-90 pointer-events-auto"><Edit3 size={14}/></button>)}</div></div><div className="mt-auto"><h3 className="text-base font-black text-white uppercase tracking-tight text-left leading-tight drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] group-hover:text-indigo-300 transition-colors line-clamp-2">{folder.name}</h3><div className="w-6 h-1 bg-indigo-500 mt-2 rounded-full group-hover:w-full transition-all duration-700"></div></div></div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="space-y-8">
                            {!searchQuery && ( <div className="flex items-center gap-3 px-1"><div className={`w-1.5 h-1.5 rounded-full ${mediaFilter === 'AUDIO' ? 'bg-emerald-500' : 'bg-indigo-500'}`}></div><h2 className="text-[11px] font-black text-white uppercase tracking-[0.3em] flex items-center gap-4">{selectedCategory !== 'TODOS' ? `Filtrando por: ${selectedCategory}` : (parentFolderName ? `Contenido en ${parentFolderName}` : 'Novedades')}{mediaFilter !== 'ALL' && <span className="text-slate-500 text-[9px] lowercase italic">({mediaFilter.toLowerCase()}s)</span>}{userSortOrder && <span className="text-indigo-400 text-[9px] lowercase border border-indigo-500/30 px-2 py-0.5 rounded-full">orden: {sortOptions.find(o => o.id === userSortOrder)?.label.toLowerCase()}</span>}<span className="w-12 h-px bg-white/10"></span></h2></div> )}
                            {searchQuery && ( <div className="flex items-center justify-between px-1"><div className="flex items-center gap-3"><div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></div><h2 className="text-[11px] font-black text-white uppercase tracking-[0.3em] flex items-center gap-4">Resultados para: {searchQuery}<span className="w-12 h-px bg-white/10"></span></h2></div><button onClick={() => { setSearchQuery(''); updateUrlSearch(''); fetchVideos(0, true); }} className="text-[10px] font-black text-slate-500 hover:text-white uppercase tracking-widest transition-colors flex items-center gap-1.5"><X size={12}/> Limpiar</button></div> )}
                            {videos.length > 0 ? ( <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-12">{videos.map(v => ( <VideoCard key={v.id} video={v} isUnlocked={isAdmin || user?.id === v.creatorId} isWatched={watchedIds.includes(v.id)} context={{ query: searchQuery, category: selectedCategory, folder: currentFolder, page: page }} /> ))}</div> ) : (folders.length === 0 && !loading) && ( <div className="text-center py-40 opacity-20 flex flex-col items-center gap-4"><Folder size={80} /><p className="font-black uppercase tracking-widest">Sin contenido disponible</p></div> )}
                        </div>

                        {hasMore && ( <div ref={loadMoreRef} className="py-20 flex flex-col items-center justify-center gap-3"><Loader2 className="animate-spin text-slate-700" size={32} /><p className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Cargando más resultados...</p></div> )}
                    </div>
                )}
            </div>

            {editingFolder && ( <FolderEditModal folder={editingFolder} initialPrice={editingFolderConfig.price} initialSortOrder={editingFolderConfig.sortOrder} onClose={() => setEditingFolder(null)} onSave={handleBulkEditFolder} /> )}
            <AIConcierge videos={videos} isVisible={geminiActive} />
        </div>
    );
}
