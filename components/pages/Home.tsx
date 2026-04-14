import React, { useState, useEffect, useMemo, useRef } from 'react';
import VideoCard from '../VideoCard';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../services/db';
import { Video, Notification as AppNotification, User, SystemSettings, Category, Story } from '../../types';
import { useNotifications } from '../../context/NotificationContext';
import { 
    RefreshCw, Search, X, ChevronRight, ChevronDown, Home as HomeIcon, Layers, Folder, Bell, Menu, Crown, User as UserIcon, LogOut, ShieldCheck, MessageSquare, Loader2, Tag, Play, Music, ShoppingBag, History, Edit3, DollarSign, SortAsc, Save, ArrowDownUp, Clock, Zap, Check, CheckCircle, TrendingUp, Mic, Image, Plus
} from 'lucide-react';
import { useNavigate, Link, useLocation } from '../Router';
import { useToast } from '../../context/ToastContext';

// Refactored Components
import Sidebar from '../home/Sidebar';
import Breadcrumbs from '../home/Breadcrumbs';
import FolderEditModal from '../home/FolderEditModal';
import FolderNavigationModal from '../home/FolderNavigationModal';
import ShortsGrid from '../ShortsGrid';

// Helper de tiempo relativo para notificaciones
const formatTimeAgo = (timestamp: number) => {
    const diff = Math.floor(Date.now() / 1000 - timestamp);
    if (diff < 60) return 'ahora';
    if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`;
    if (diff < 86400) return `hace ${Math.floor(diff / 3600)} h`;
    return `hace ${Math.floor(diff / 86400)} d`;
};

// Helper for seeded random
function seededRandom(seed: string) {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
        hash = ((hash << 5) - hash) + seed.charCodeAt(i);
        hash |= 0;
    }
    return function() {
        hash = (hash * 16807) % 2147483647;
        return (hash - 1) / 2147483646;
    };
}

function shuffleWithSeed<T>(array: T[], seed: string): T[] {
    const rng = seededRandom(seed);
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
}

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
    const [stories, setStories] = useState<Story[]>([]);
    const [showAllFolders, setShowAllFolders] = useState(false);

    // Group stories by user for display
    const groupedStories = useMemo(() => {
        const groups: Record<string, Story[]> = {};
        stories.forEach(s => {
            if (!groups[s.userId]) groups[s.userId] = [];
            groups[s.userId].push(s);
        });
        return Object.values(groups).map(group => group[0]); // Show first story of each user
    }, [stories]);

    // Fetch stories
    useEffect(() => {
        const fetchStories = async () => {
            try {
                const data = await db.getStories();
                setStories(data);
            } catch (error) {
                console.error("Error fetching stories", error);
            }
        };
        fetchStories();
    }, []);
    
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
    const isInitialMount = useRef(true);

    const fetchVideos = async (p: number, reset: boolean = false) => {
        if (loading || (loadingMore && !reset)) return;
        
        // Evitar múltiples peticiones simultáneas de reset
        if (reset && loading) return;

        if (reset) { 
            setLoading(true); 
            setVideos([]); 
            setFolders([]); 
        } else { 
            setLoadingMore(true); 
        }

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
                    finalFolders = Object.values(rawFolders);
                }
                
                // Si estamos en una ruta y no hay carpetas, intentamos recuperarlas (solo si no es búsqueda)
                if (finalFolders.length === 0 && !searchQuery && currentFolder) {
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

                setFolders(finalFolders);
                setAppliedSortOrder(res.appliedSortOrder || '');
                setActiveCategories(['TODOS', ...res.activeCategories]);
            } else { 
                setVideos(prev => [...prev, ...res.videos]); 
            }
            setHasMore(res.hasMore); 
            setPage(p);
        } catch (e) { 
            console.error("Fetch videos error:", e);
            toast.error("Error al sincronizar catálogo"); 
        } 
        finally { 
            setLoading(false); 
            setLoadingMore(false); 
        }
    };

    // 3. Trigger de carga consolidado
    useEffect(() => {
        // En el primer montaje, esperamos a que todo esté listo
        if (isInitialMount.current) {
            isInitialMount.current = false;
            fetchVideos(0, true);
            return;
        }

        const timer = setTimeout(() => {
            fetchVideos(0, true);
        }, 100);

        return () => clearTimeout(timer);
    }, [currentFolder, searchQuery, userSortOrder, mediaFilter, selectedCategory]);

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
        
        const isShort = (v: any) => {
            if (!v) return false;
            const path = (v.videoUrl || '').toLowerCase();
            const category = (v.category || '').toLowerCase();
            const isMusic = category.includes('music') || path.includes('music');
            if (isMusic) return false;
            const isUnder10Min = v.duration > 0 && v.duration < 600;
            const shortsPath = systemSettings?.shortsPath;
            const isInShortsPath = shortsPath && path.replace(/\\/g, '/').includes(shortsPath.toLowerCase().replace(/\\/g, '/'));
            return !v.is_audio && category !== 'IMAGES' && (isUnder10Min || isInShortsPath);
        };

        const getItemType = (v: any) => {
            if (!v) return 'video';
            if (isShort(v)) return 'short';
            if (v.is_audio) return 'audio';
            if (v.category?.toUpperCase() === 'IMAGES') return 'imagen';
            return 'video';
        };

        const validVideos = videos.filter(v => 
            v && 
            v.id && 
            v.videoUrl && 
            v.creatorId && 
            v.creatorName && 
            !isNaN(Number(v.duration))
        );

        const isOnRoot = !searchQuery && currentFolder.length === 0 && selectedCategory === 'TODOS';

        if (!isOnRoot) {
            // Standard Logic for Search/Folders/Categories
            const result: any[] = [];
            let i = 0;
            while (i < validVideos.length) {
                const item = validVideos[i];
                if (!item) { i++; continue; }
                if (isShort(item)) {
                    const group: any[] = [];
                    while (i < validVideos.length && validVideos[i] && isShort(validVideos[i])) {
                        group.push(validVideos[i]);
                        i++;
                    }
                    result.push({ isShortsGroup: true, shorts: group, id: `shorts-group-${i}` });
                    continue;
                }
                result.push(item);
                i++;
            }
            return result;
        }

        // --- ARCHITECT HIERARCHICAL LOGIC ---
        
        // 1. Phase 1: Recents (1-10)
        const sortedVideos = [...validVideos].sort((a, b) => (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0));
        const phase1Source = sortedVideos.slice(0, 10);
        const phase2Source = sortedVideos.slice(10);
        
        const result: any[] = [];

        let i = 0;
        while (i < phase1Source.length) {
            const item = phase1Source[i];
            const type = getItemType(item);
            
            if (type === 'short') {
                const group: any[] = [item];
                let j = i + 1;
                while (j < phase1Source.length && j < i + 10 && getItemType(phase1Source[j]) === 'short' && phase1Source[j].creatorId === item.creatorId) {
                    group.push(phase1Source[j]);
                    j++;
                }
                
                if (group.length > 1) {
                    result.push({
                        id: `group-user-${item.creatorId}-${i}`,
                        tipo: 'short_group_user',
                        isShortsGroup: true,
                        shorts: group,
                        items: group
                    });
                    i = j;
                } else {
                    result.push({ ...item, tipo: 'short_individual', isShort: true });
                    i++;
                }
            } else {
                result.push({ ...item, tipo: type });
                i++;
            }
        }

        // 2. Phase 2: Discovery (11+)
        if (phase2Source.length > 0) {
            const seed = "discovery-" + (new Date().toDateString());
            const shuffled = shuffleWithSeed(phase2Source, seed);
            
            const poolShorts = shuffled.filter(v => getItemType(v) === 'short');
            const poolOthers = shuffled.filter(v => getItemType(v) !== 'short');
            
            let discoveryResult: any[] = [];
            let lastTypes: string[] = [];
            let countSinceTopicGroup = 0;

            const getNextItem = () => {
                const forbiddenType = lastTypes.length === 2 && lastTypes[0] === lastTypes[1] ? lastTypes[0] : null;
                
                // Try to interleave
                for (let k = 0; k < poolOthers.length; k++) {
                    const type = getItemType(poolOthers[k]);
                    if (type !== forbiddenType) {
                        const item = poolOthers.splice(k, 1)[0];
                        return { ...item, tipo: type };
                    }
                }
                
                for (let k = 0; k < poolShorts.length; k++) {
                    if ('short' !== forbiddenType) {
                        const item = poolShorts.splice(k, 1)[0];
                        return { ...item, tipo: 'short_individual', isShort: true };
                    }
                }
                
                if (poolOthers.length > 0) return { ...poolOthers.shift(), tipo: getItemType(poolOthers[0]) };
                if (poolShorts.length > 0) return { ...poolShorts.shift(), tipo: 'short_individual', isShort: true };
                return null;
            };

            while (poolOthers.length > 0 || poolShorts.length > 0) {
                // Every 10 positions, insert short_group_topic
                if (countSinceTopicGroup === 10 && poolShorts.length >= 2) {
                    const firstShort = poolShorts[0];
                    const cat = firstShort.category;
                    const group = poolShorts.filter(s => s.category === cat).slice(0, 10);
                    
                    if (group.length >= 2) {
                        discoveryResult.push({
                            id: `group-topic-${cat}-${discoveryResult.length}`,
                            tipo: 'short_group_topic',
                            isShortsGroup: true,
                            shorts: group,
                            items: group
                        });
                        const groupedIds = new Set(group.map(g => g.id));
                        for (let k = poolShorts.length - 1; k >= 0; k--) {
                            if (groupedIds.has(poolShorts[k].id)) poolShorts.splice(k, 1);
                        }
                        countSinceTopicGroup = 0;
                        lastTypes = ['short_group_topic'];
                        continue;
                    }
                }

                const next = getNextItem();
                if (next) {
                    discoveryResult.push(next);
                    lastTypes.push(getItemType(next));
                    if (lastTypes.length > 2) lastTypes.shift();
                    countSinceTopicGroup++;
                } else break;
            }
            result.push(...discoveryResult);
        }

        return result;
    }, [videos, searchQuery, currentFolder, selectedCategory, systemSettings]);

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
        <div className="flex flex-col min-h-screen bg-[var(--bg-primary)]">
            <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} user={user} isAdmin={isAdmin} logout={logout}/>
            
            {/* Main Content Area */}
            <div className="flex-1 w-full max-w-5xl mx-auto pb-24">
                {/* What's on your mind? Section */}
                <div className="bg-[var(--bg-secondary)] p-3 flex items-center gap-3">
                    <div className="relative shrink-0">
                        <div className="w-10 h-10 rounded-full overflow-hidden bg-indigo-600">
                            {user?.avatarUrl ? <img src={user.avatarUrl} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-white font-bold">{user?.username?.[0] || '?'}</div>}
                        </div>
                        <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-[var(--bg-secondary)]"></div>
                    </div>
                    <button onClick={() => navigate('/create-post')} className="flex-1 h-10 bg-[#3a3b3c] rounded-full px-4 text-left text-[var(--text-secondary)] text-[15px]">
                        ¿Qué estás pensando?
                    </button>
                    <button onClick={() => navigate('/create-post')} className="flex flex-col items-center gap-0.5 text-[var(--text-secondary)] px-2">
                        <div className="text-[#45bd62]"><Image size={24} /></div>
                        <span className="text-[11px] font-medium">Foto</span>
                    </button>
                </div>

                {/* Gutter */}
                <div className="h-2 bg-[var(--bg-primary)]"></div>

                {/* Stories Section */}
                <div className="bg-[var(--bg-secondary)] py-3 overflow-hidden">
                    <div className="flex gap-2 px-3 overflow-x-auto scrollbar-hide">
                        {/* Create Story */}
                        <div 
                            onClick={() => navigate('/create-story')}
                            className="relative w-[105px] h-44 bg-[#3a3b3c] rounded-xl overflow-hidden shrink-0 cursor-pointer active:scale-95 transition-transform"
                        >
                            <div className="h-[70%] overflow-hidden">
                                {user?.avatarUrl ? <img src={user.avatarUrl} className="w-full h-full object-cover" /> : <div className="w-full h-full bg-slate-800" />}
                            </div>
                            <div className="absolute top-[62%] left-1/2 -translate-x-1/2 w-9 h-9 bg-[#1877f2] rounded-full border-4 border-[#242526] flex items-center justify-center text-white">
                                <Plus size={24} strokeWidth={3} />
                            </div>
                            <div className="absolute bottom-2 left-0 right-0 text-center px-1">
                                <span className="text-[11px] font-bold text-white">Crear historia</span>
                            </div>
                        </div>

                        {/* Real Stories */}
                        {groupedStories.map(story => (
                            <div 
                                key={story.id} 
                                onClick={() => navigate(`/stories?userId=${story.userId}`)}
                                className="relative w-[105px] h-44 bg-slate-800 rounded-xl overflow-hidden shrink-0 cursor-pointer active:scale-95 transition-transform"
                            >
                                {story.type === 'IMAGE' ? (
                                    <img src={story.contentUrl} className="w-full h-full object-cover opacity-90" referrerPolicy="no-referrer" />
                                ) : (
                                    <video src={story.contentUrl} className="w-full h-full object-cover opacity-90" muted />
                                )}
                                <div className="absolute top-2 left-2 w-9 h-9 rounded-full border-[3px] border-[#1877f2] p-0.5 overflow-hidden bg-indigo-600">
                                    {story.avatarUrl ? (
                                        <img src={story.avatarUrl} className="w-full h-full object-cover rounded-full" referrerPolicy="no-referrer" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-[10px] font-bold text-white">
                                            {story.username?.[0]?.toUpperCase()}
                                        </div>
                                    )}
                                </div>
                                <div className="absolute bottom-2 left-2 right-2">
                                    <span className="text-[11px] font-bold text-white drop-shadow-md line-clamp-2">{story.username}</span>
                                </div>
                                
                                {/* Overlay Text Preview */}
                                {story.overlayText && (
                                    <div className="absolute inset-0 flex items-center justify-center p-2 pointer-events-none">
                                        <p 
                                            className="text-[10px] font-bold text-center line-clamp-3 px-1 rounded"
                                            style={{ 
                                                color: story.overlayColor || '#ffffff',
                                                backgroundColor: story.overlayBg || 'transparent'
                                            }}
                                        >
                                            {story.overlayText}
                                        </p>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Gutter */}
                <div className="h-2 bg-[var(--bg-primary)]"></div>

                {loading ? (
                    <div className="flex flex-col items-center justify-center py-20 gap-3"><Loader2 className="animate-spin text-[var(--accent)]" size={32} /><p className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider">Cargando...</p></div>
                ) : (
                    <div className="animate-in fade-in duration-500">
                        {folders.length > 0 && showFoldersGrid && (
                            <div className="bg-[var(--bg-secondary)] border-b border-[var(--divider)]">
                                <div className="flex items-center justify-between p-3">
                                    <h2 className="text-sm font-bold text-[var(--text-primary)]">{searchQuery ? 'Carpetas' : 'Explorar Carpetas'}</h2>
                                </div>
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-0.5 bg-[var(--divider)]">
                                    {(showAllFolders ? folders : folders.slice(0, 2)).map(folder => (
                                        <div key={folder.name} className="relative aspect-square bg-[var(--bg-secondary)] group overflow-hidden">
                                            <button onClick={() => { updateUrl({ q: '', folder: [...navigationPath, folder.name], cat: 'TODOS' }); }} className="absolute inset-0 z-0">
                                                {folder.thumbnailUrl ? ( 
                                                    <img src={folder.thumbnailUrl} className="w-full h-full object-cover opacity-80" referrerPolicy="no-referrer" /> 
                                                ) : ( 
                                                    <div className="w-full h-full flex items-center justify-center bg-[var(--bg-tertiary)] text-[var(--text-secondary)]"> 
                                                        <Folder size={32} className="opacity-40" /> 
                                                    </div> 
                                                )}
                                                <div className="absolute inset-0 bg-black/20"></div>
                                            </button>
                                            <div className="absolute bottom-0 left-0 right-0 p-2 bg-black/40 backdrop-blur-sm pointer-events-none">
                                                <h3 className="text-[11px] font-bold text-white truncate leading-tight">{folder.name}</h3>
                                                <p className="text-[9px] text-white/80 font-medium">{folder.count} items</p>
                                            </div>
                                            {isAdmin && (
                                                <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); setEditingFolder(folder); }} className="absolute top-1 right-1 p-1.5 bg-black/40 text-white rounded-md border border-white/20 z-10">
                                                    <Edit3 size={12}/>
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                                {folders.length > 2 && (
                                    <button 
                                        onClick={() => setShowAllFolders(!showAllFolders)}
                                        className="w-full py-3 text-sm font-bold text-[#1877f2] hover:bg-[#3a3b3c] transition-colors flex items-center justify-center gap-2"
                                    >
                                        {showAllFolders ? 'Ver menos' : 'Ver más carpetas'}
                                        <ChevronDown size={16} className={`transition-transform ${showAllFolders ? 'rotate-180' : ''}`} />
                                    </button>
                                )}
                            </div>
                        )}

                        <div className="bg-[var(--bg-secondary)]">
                            {!searchQuery && ( 
                                <div className="p-3 border-b border-[var(--divider)]">
                                    <h2 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
                                        {selectedCategory !== 'TODOS' ? selectedCategory : (parentFolderName ? parentFolderName : 'Novedades')}
                                        {mediaFilter !== 'ALL' && <span className="text-[var(--text-secondary)] text-[10px] font-normal">({mediaFilter.toLowerCase()}s)</span>}
                                    </h2>
                                </div> 
                            )}
                            {searchQuery && ( 
                                <div className="flex items-center justify-between p-3 border-b border-[var(--divider)]">
                                    <h2 className="text-sm font-bold text-[var(--text-primary)]">Resultados: {searchQuery}</h2>
                                    <div className="flex items-center gap-2">
                                        <button 
                                            onClick={() => setShowSortMenu(!showSortMenu)} 
                                            className={`p-1.5 rounded border text-[10px] font-bold uppercase ${userSortOrder ? 'bg-[var(--accent)] text-white border-[var(--accent)]' : 'bg-[var(--bg-primary)] border-[var(--divider)] text-[var(--text-secondary)]'}`}
                                        >
                                            {userSortOrder ? sortOptions.find(o => o.id === userSortOrder)?.label : 'Ordenar'}
                                        </button>
                                        <button onClick={() => { updateUrl({ q: '' }); fetchVideos(0, true); }} className="p-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
                                            <X size={14}/>
                                        </button>
                                    </div>
                                </div> 
                            )}
                            {processedVideos.length > 0 ? ( 
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1 bg-[var(--divider)]">
                                    {processedVideos.map((v, idx) => ( 
                                        v.isShortsGroup ? (
                                            <div key={v.id} className="col-span-full">
                                                <ShortsGrid shorts={v.shorts} isSingle={v.shorts.length === 1} />
                                            </div>
                                        ) : (
                                            <div key={v.id} className="bg-[var(--bg-secondary)]">
                                                <VideoCard 
                                                    video={v} 
                                                    isUnlocked={isAdmin || user?.id === v.creatorId || !!(user?.vipExpiry && user.vipExpiry > Date.now() / 1000) || Number(v.price || 0) <= 0} 
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
                                            </div>
                                        )
                                    ))}
                                </div> 
                            ) : (folders.length === 0 && !loading) && ( 
                                <div className="text-center py-20 text-[var(--text-secondary)] flex flex-col items-center gap-2">
                                    <Folder size={48} className="opacity-20" />
                                    <p className="text-sm font-bold">Sin contenido</p>
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
