import React, { useState, useEffect, useMemo, useRef } from 'react';
import VideoCard from '../VideoCard';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../services/db';
import { Video, SystemSettings } from '../../types';
import { Loader2, Folder, Edit3, SortAsc, Zap } from 'lucide-react';
import { useNavigate, Link, useLocation } from '../Router';
import { useToast } from '../../context/ToastContext';

// Refactored Components
import FolderEditModal from '../home/FolderEditModal';

export default function Home() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const toast = useToast();

    // Filters State - Leer desde URL solo
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

    // UI State
    const [editingFolder, setEditingFolder] = useState<any | null>(null);

    // Data State
    const [videos, setVideos] = useState<Video[]>([]);
    const [folders, setFolders] = useState<{ name: string; count: number; thumbnailUrl: string; relativePath: string; sortOrder?: string }[]>([]);
    const [page, setPage] = useState(0);
    const [hasMore, setHasMore] = useState(true);
    const [loading, setLoading] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [systemSettings, setSystemSettings] = useState<SystemSettings | null>(null);
    const [watchedIds, setWatchedIds] = useState<string[]>([]);

    // FIJO: mediaFilter siempre en 'ALL' - se obtiene de la configuración del usuario
    const mediaFilter = (localStorage.getItem('sp_media_filter') as 'ALL' | 'VIDEO' | 'AUDIO') || 'ALL';
    const userSortOrder = localStorage.getItem('sp_user_sort') || '';
    const showFolderCards = localStorage.getItem('sp_show_folder_cards') === 'true';

    const loadMoreRef = useRef<HTMLDivElement>(null);
    const currentFolder = navigationPath.join('/');

    const editingFolderConfig = useMemo(() => {
        if (!editingFolder || !systemSettings?.categories) return { price: 1.0, sortOrder: 'LATEST' };
        const found = systemSettings.categories.find(c => c.name.toLowerCase() === editingFolder.name.toLowerCase());
        return {
            price: found ? Number(found.price) : 1.0,
            sortOrder: found ? (found.sortOrder || 'LATEST') : 'LATEST'
        };
    }, [editingFolder, systemSettings]);

    // Persistencia de preferencias
    useEffect(() => { localStorage.setItem('sp_nav_path', JSON.stringify(navigationPath)); }, [navigationPath]);

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

    // Cargar configuración inicial
    useEffect(() => {
        db.getSystemSettings().then(s => setSystemSettings(s));
        if (user) {
            db.getUserActivity(user.id).then(act => setWatchedIds(act?.watched || []));
        }
    }, [user?.id]);

    // Cargador de Videos (Paginado)
    const fetchVideos = async (p: number, reset: boolean = false) => {
        if (loading || (loadingMore && !reset)) return;
        if (reset) { setLoading(true); setVideos([]); setFolders([]); } else { setLoadingMore(true); }

        try {
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

                // LÓGICA DE CARPETAS MEJORADA
                let rawFolders = res.folders;
                let finalFolders: any[] = [];

                if (Array.isArray(rawFolders)) {
                    finalFolders = rawFolders;
                } else if (rawFolders && typeof rawFolders === 'object') {
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

                setFolders(finalFolders);
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

    // Trigger de carga
    useEffect(() => { fetchVideos(0, true); }, [currentFolder, searchQuery, selectedCategory, mediaFilter, userSortOrder]);

    // Infinite Scroll
    useEffect(() => {
        if (!hasMore || loading || loadingMore) return;
        const observer = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting) { fetchVideos(page + 1); }
        }, { threshold: 0.1, rootMargin: '400px' });
        if (loadMoreRef.current) observer.observe(loadMoreRef.current);
        return () => observer.disconnect();
    }, [page, hasMore, loading, loadingMore]);

    const handleBulkEditFolder = async (price: number, sortOrder: string) => {
        if (!editingFolder) return;
        try {
            await db.request('action=admin_bulk_edit_folder', {
                method: 'POST',
                body: JSON.stringify({ folderPath: editingFolder.relativePath, price, sortOrder })
            });
            toast.success("Configuración aplicada a toda la rama");
            setEditingFolder(null);
            const s = await db.getSystemSettings();
            setSystemSettings(s);
            fetchVideos(0, true);
        } catch (e: any) {
            toast.error("Error al aplicar cambios: " + e.message);
        }
    };

    const processedVideos = useMemo(() => {
        if (!videos || videos.length === 0) return [];

        const result: Video[] = [];
        const collectionsSeen = new Set<string>();

        videos.forEach(item => {
            if (!item) return;

            const itemCat = (item.category || '').toUpperCase();

            // Group Images by Collection (Album)
            if (item.collection && itemCat === 'IMAGES') {
                if (!collectionsSeen.has(item.collection)) {
                    collectionsSeen.add(item.collection);
                    const albumItems = videos.filter(v => v && v.collection === item.collection);
                    result.push({
                        ...item,
                        isAlbum: true,
                        albumItems: albumItems,
                    } as any);
                }
                return;
            }

            // All other items (Videos, Audios)
            result.push(item);
        });

        return result;
    }, [videos]);

    const isAdmin = user?.role?.trim().toUpperCase() === 'ADMIN';

    return (
        <div className="relative pb-4">
            {/* Contenido principal - sin panel superior */}
            <div className="px-0 pt-4">
                {loading ? (
                    <div className="flex flex-col items-center justify-center py-40 gap-4">
                        <Loader2 className="animate-spin text-[#1877f2]" size={48} />
                        <p className="text-xs font-bold text-[#b0b3b8] uppercase">Sincronizando contenido...</p>
                    </div>
                ) : (
                    <div className="space-y-8">
                        {/* Grid de Carpetas */}
                        {folders.length > 0 && showFolderCards && (
                            <div className="space-y-4 px-1">
                                <div className="flex items-center gap-3 px-2">
                                    <div className="w-1 h-1 rounded-full bg-amber-500"></div>
                                    <h2 className="text-xs font-bold text-[#e4e6eb] uppercase tracking-wider">
                                        {searchQuery ? 'Carpetas coincidentes' : 'Explorar Carpetas'}
                                    </h2>
                                </div>
                                <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                                    {folders.map(folder => (
                                        <div key={folder.name} className="group relative aspect-[4/5] sm:aspect-video rounded-2xl overflow-hidden bg-[#242526] border border-white/5 hover:border-[#1877f2] shadow-xl transition-all duration-300">
                                            <button
                                                onClick={() => navigate(`/?folder=${encodeURIComponent([...navigationPath, folder.name].join('/'))}`)}
                                                className="absolute inset-0 z-0"
                                            >
                                                {folder.thumbnailUrl ? (
                                                    <img src={folder.thumbnailUrl} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700 opacity-60" referrerPolicy="no-referrer" alt={folder.name} />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center bg-[#3a3b3c] text-[#b0b3b8]">
                                                        <Folder size={48} className="opacity-20" />
                                                    </div>
                                                )}
                                                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent"></div>
                                            </button>
                                            <div className="relative z-10 h-full flex flex-col p-4 pointer-events-none">
                                                <div className="flex justify-between items-start">
                                                    <div className="p-2 bg-[#3a3b3c]/80 rounded-xl border border-white/5 text-amber-500 group-hover:scale-110 transition-transform">
                                                        <Folder size={18}/>
                                                    </div>
                                                    <div className="flex flex-col items-end gap-1.5">
                                                        <div className="flex gap-1">
                                                            {folder.sortOrder && folder.sortOrder !== 'LATEST' && (
                                                                <div className="bg-amber-500/30 backdrop-blur-md px-1.5 py-0.5 rounded-lg border border-amber-500/30 flex items-center gap-1">
                                                                    {folder.sortOrder === 'ALPHA' ? <SortAsc size={8} className="text-amber-400" /> : <Zap size={8} className="text-amber-400" />}
                                                                    <span className="text-[7px] text-amber-200 font-bold uppercase">{folder.sortOrder}</span>
                                                                </div>
                                                            )}
                                                            <div className="bg-[#1877f2]/30 backdrop-blur-md px-1.5 py-0.5 rounded-lg border border-[#1877f2]/30">
                                                                <span className="text-[7px] text-[#1877f2] font-bold uppercase">{folder.count}</span>
                                                            </div>
                                                        </div>
                                                        {isAdmin && (
                                                            <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); setEditingFolder(folder); }} className="p-1.5 bg-[#242526]/80 hover:bg-[#1877f2] text-white rounded-lg border border-white/10 transition-all active:scale-90 pointer-events-auto">
                                                                <Edit3 size={12}/>
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="mt-auto">
                                                    <h3 className="text-sm font-bold text-white uppercase leading-tight line-clamp-2">{folder.name}</h3>
                                                    <div className="w-6 h-0.5 bg-amber-500 mt-1.5 rounded-full group-hover:w-full transition-all duration-700"></div>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Grid de Videos */}
                        <div className="space-y-4">
                            {searchQuery && (
                                <div className="flex items-center gap-3 px-2">
                                    <div className="w-1 h-1 rounded-full bg-[#1877f2] animate-pulse"></div>
                                    <h2 className="text-xs font-bold text-[#e4e6eb] uppercase tracking-wider">
                                        Resultados para: {searchQuery}
                                    </h2>
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
                                            onCategoryClick={() => navigate(`/?cat=${encodeURIComponent(v.category)}`)}
                                            context={{
                                                query: searchQuery,
                                                category: selectedCategory,
                                                folder: currentFolder,
                                                page: page,
                                                sort_order: userSortOrder
                                            }}
                                        />
                                    ))}
                                </div>
                            ) : (folders.length === 0 && !loading) && (
                                <div className="text-center py-40 opacity-20 flex flex-col items-center gap-4">
                                    <Folder size={80} />
                                    <p className="font-bold uppercase text-sm">Sin contenido disponible</p>
                                </div>
                            )}
                        </div>

                        {hasMore && (
                            <div ref={loadMoreRef} className="py-12 flex flex-col items-center justify-center gap-3">
                                <Loader2 className="animate-spin text-[#b0b3b8]" size={28} />
                                <p className="text-xs font-bold text-[#b0b3b8] uppercase">Cargando más...</p>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {editingFolder && (
                <FolderEditModal
                    folder={editingFolder}
                    initialPrice={editingFolderConfig.price}
                    initialSortOrder={editingFolderConfig.sortOrder}
                    onClose={() => setEditingFolder(null)}
                    onSave={handleBulkEditFolder}
                />
            )}
        </div>
    );
}
