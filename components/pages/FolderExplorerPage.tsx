import React, { useState, useEffect, useMemo } from 'react';
import { 
    ChevronLeft, Folder, ChevronRight, Home, Play, Music, Download, 
    MoreVertical, Edit3, Eye, CheckSquare, Square, Trash2, List, Settings
} from 'lucide-react';
import { useNavigate } from '../Router';
import { UserRole } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../services/db';
import { useDownload } from '../../context/DownloadContext';
import { useToast } from '../../context/ToastContext';
import FolderEditModal from '../home/FolderEditModal';
import VideoCard from '../VideoCard';

interface FolderItem {
    name: string;
    count: number;
    thumbnailUrl: string;
    relativePath: string;
}

export default function FolderExplorerPage() {
    const navigate = useNavigate();
    const { user } = useAuth();
    const { addToQueue, addFolderToQueue, queue } = useDownload();
    const toast = useToast();
    
    const [folders, setFolders] = useState<FolderItem[]>([]);
    const [videos, setVideos] = useState<any[]>([]);
    const [navigationPath, setNavigationPath] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectionMode, setSelectionMode] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    
    // Admin features
    const isAdmin = user?.role === 'ADMIN' || user?.role === UserRole.ADMIN;
    const [editingFolder, setEditingFolder] = useState<any | null>(null);
    const [systemSettings, setSystemSettings] = useState<any>(null);

    useEffect(() => {
        loadData();
    }, [navigationPath]);

    useEffect(() => {
        if (isAdmin) {
            db.getSystemSettings().then(setSystemSettings);
        }
    }, [isAdmin]);

    const loadData = async () => {
        try {
            setLoading(true);
            const folderPath = navigationPath.join('/');
            
            // Parallel load folders and videos in this folder
            const [folderRes, videoRes] = await Promise.all([
                db.getFolders(folderPath),
                db.getVideos(0, 100, folderPath, '', 'TODOS', 'ALL', 'LATEST')
            ]);
            
            setFolders(folderRes);
            setVideos(videoRes.videos);
        } catch (err) {
            console.error('Error loading folders:', err);
            toast.error("Error al cargar contenido");
        } finally {
            setLoading(false);
        }
    };

    const handleFolderClick = (folder: FolderItem) => {
        setNavigationPath([...navigationPath, folder.name]);
    };

    const handleNavigateToPath = (index: number) => {
        if (index === -1) {
            setNavigationPath([]);
        } else {
            setNavigationPath(navigationPath.slice(0, index + 1));
        }
    };

    const handleDownloadAll = async (folder: FolderItem) => {
        toast.info(`Añadiendo ${folder.count} archivos a la cola...`);
        await addFolderToQueue(folder.relativePath);
        toast.success("Archivos añadidos a la cola de descarga");
    };

    const handleViewOnHome = (folder: FolderItem) => {
        navigate(`/?folder=${encodeURIComponent(folder.relativePath)}`);
    };

    const toggleSelection = (id: string) => {
        const newSet = new Set(selectedIds);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        setSelectedIds(newSet);
    };

    const addSelectedToQueue = () => {
        const toAdd = videos.filter(v => selectedIds.has(v.id));
        toAdd.forEach(v => addToQueue(v));
        toast.success(`${toAdd.length} archivos añadidos a la cola`);
        setSelectionMode(false);
        setSelectedIds(new Set());
    };

    const handleBulkEditFolder = async (price: number, sortOrder: string) => {
        if (!editingFolder) return;
        try {
            await db.request('action=admin_bulk_edit_folder', {
                method: 'POST',
                body: JSON.stringify({ folderPath: editingFolder.relativePath, price, sortOrder })
            });
            toast.success("Configuración aplicada");
            setEditingFolder(null);
            loadData();
        } catch (e: any) { toast.error("Error: " + e.message); }
    };

    const editingFolderConfig = useMemo(() => {
        if (!editingFolder || !systemSettings?.categories) return { price: 1.0, sortOrder: 'LATEST' };
        const found = systemSettings.categories.find((c: any) => c.name.toLowerCase() === editingFolder.name.toLowerCase());
        return {
            price: found ? Number(found.price) : 1.0,
            sortOrder: found ? (found.sortOrder || 'LATEST') : 'LATEST'
        };
    }, [editingFolder, systemSettings]);

    return (
        <div className="min-h-screen bg-[#18191a] text-[#e4e6eb] pb-24">
            {/* Header */}
            <header className="sticky top-0 z-50 bg-[#242526] border-b border-[#3e4042] shadow-md">
                <div className="flex items-center justify-between px-4 h-14">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => navigationPath.length > 0 ? handleNavigateToPath(navigationPath.length - 2) : navigate(-1)}
                            className="w-9 h-9 rounded-full bg-[#3a3b3c] flex items-center justify-center hover:bg-[#4e4f50] transition-colors"
                        >
                            <ChevronLeft size={22} />
                        </button>
                        <div>
                           <h1 className="text-sm font-bold truncate max-w-[150px]">
                               {navigationPath.length > 0 ? navigationPath[navigationPath.length-1] : 'Explorador'}
                           </h1>
                           <div className="text-[10px] text-[#b0b3b8] font-bold uppercase tracking-wider">
                               {folders.length} carpetas • {videos.length} archivos
                           </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        {videos.length > 0 && (
                            <button 
                                onClick={() => setSelectionMode(!selectionMode)}
                                className={`p-2 rounded-full transition-colors ${selectionMode ? 'bg-[#2e89ff] text-white' : 'bg-[#3a3b3c] text-[#e4e6eb]'}`}
                            >
                                <CheckSquare size={18} />
                            </button>
                        )}
                        {queue.length > 0 && (
                            <button 
                                onClick={() => navigate('/download-queue')}
                                className="relative p-2 rounded-full bg-[#3a3b3c] text-[#e4e6eb]"
                            >
                                <Download size={18} />
                                <span className="absolute -top-1 -right-1 bg-[#fa3e3e] text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                                    {queue.length}
                                </span>
                            </button>
                        )}
                    </div>
                </div>

                {/* Breadcrumb Independent */}
                <div className="px-4 py-2 flex items-center gap-2 overflow-x-auto scrollbar-hide bg-[#1c1e21] border-t border-[#3e4042]">
                    <button
                        onClick={() => handleNavigateToPath(-1)}
                        className={`flex items-center gap-1 px-3 py-1 rounded-full text-[11px] font-bold transition-colors shrink-0 ${navigationPath.length === 0 ? 'bg-[#2e89ff] text-white' : 'bg-[#3a3b3c] text-[#b0b3b8]'}`}
                    >
                        <Home size={12} />
                        <span>Raíz</span>
                    </button>
                    {navigationPath.map((folder, index) => (
                        <React.Fragment key={index}>
                            <ChevronRight size={12} className="text-[#3e4042] shrink-0" />
                            <button
                                onClick={() => handleNavigateToPath(index)}
                                className={`flex items-center gap-1 px-3 py-1 rounded-full text-[11px] font-bold transition-colors shrink-0 ${
                                    index === navigationPath.length - 1
                                        ? 'bg-[#2e89ff] text-white'
                                        : 'bg-[#3a3b3c] text-[#b0b3b8]'
                                }`}
                            >
                                <span>{folder}</span>
                            </button>
                        </React.Fragment>
                    ))}
                </div>
            </header>

            {/* Selection Toolbar */}
            {selectionMode && selectedIds.size > 0 && (
                <div className="sticky top-[93px] z-40 bg-[#2d88ff] text-white px-4 py-2 flex items-center justify-between animate-in slide-in-from-top duration-300">
                    <span className="text-xs font-bold">{selectedIds.size} seleccionados</span>
                    <div className="flex gap-2">
                        <button onClick={addSelectedToQueue} className="flex items-center gap-1 px-3 py-1 bg-white/20 rounded font-bold text-xs">
                            <Download size={14} /> Descargar
                        </button>
                        <button onClick={() => setSelectedIds(new Set())} className="text-xs font-bold px-2 py-1">Deshacer</button>
                    </div>
                </div>
            )}

            {/* Content */}
            <div className="max-w-4xl mx-auto p-2 space-y-4">
                {loading ? (
                    <div className="flex flex-col items-center justify-center py-20 gap-3">
                        <div className="animate-spin rounded-full h-10 w-10 border-2 border-t-transparent border-[#2e89ff]"></div>
                        <span className="text-[10px] font-bold uppercase tracking-widest text-[#b0b3b8]">Indexando archivos...</span>
                    </div>
                ) : (
                    <>
                        {/* Folders List */}
                        {folders.length > 0 && (
                            <div className="space-y-2">
                                <h2 className="px-2 text-[10px] font-bold text-[#b0b3b8] uppercase tracking-wider">Subcarpetas</h2>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    {folders.map((folder) => (
                                        <div key={folder.relativePath} className="bg-[#242526] border border-[#3e4042] rounded-xl overflow-hidden group hover:border-[#4e4f50] transition-all">
                                            <div className="flex p-2 gap-3">
                                                <div 
                                                    onClick={() => handleFolderClick(folder)}
                                                    className="w-16 h-16 rounded-lg bg-[#3a3b3c] overflow-hidden shrink-0 cursor-pointer border border-[#3e4042] group-hover:scale-105 transition-transform"
                                                >
                                                    {folder.thumbnailUrl ? (
                                                        <img src={folder.thumbnailUrl} className="w-full h-full object-cover" alt={folder.name} referrerPolicy="no-referrer" />
                                                    ) : (
                                                        <div className="w-full h-full flex items-center justify-center"><Folder size={24} className="text-[#2d88ff]" /></div>
                                                    )}
                                                </div>
                                                <div className="flex-1 min-w-0 flex flex-col justify-center">
                                                    <div onClick={() => handleFolderClick(folder)} className="text-[14px] font-bold truncate cursor-pointer hover:text-[#2d88ff] transition-colors">{folder.name}</div>
                                                    <div className="text-[11px] text-[#b0b3b8] font-medium">{folder.count} archivos</div>
                                                </div>
                                                <div className="flex flex-col gap-1">
                                                    <button onClick={() => handleDownloadAll(folder)} className="p-2 text-[#b0b3b8] hover:text-white hover:bg-white/10 rounded-full" title="Descargar todo">
                                                        <Download size={16} />
                                                    </button>
                                                    <button onClick={() => handleViewOnHome(folder)} className="p-2 text-[#b0b3b8] hover:text-white hover:bg-white/10 rounded-full" title="Ver en Home">
                                                        <Eye size={16} />
                                                    </button>
                                                </div>
                                            </div>
                                            {isAdmin && (
                                                <div className="bg-[#1c1e21] px-3 py-1.5 flex justify-end border-t border-[#3e4042]">
                                                    <button 
                                                        onClick={() => setEditingFolder(folder)}
                                                        className="flex items-center gap-1.5 text-[10px] font-bold text-[#b0b3b8] hover:text-[#2e89ff]"
                                                    >
                                                        <Edit3 size={12} /> GESTIONAR
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Videos List */}
                        {videos.length > 0 && (
                            <div className="space-y-3">
                                <div className="px-2 flex items-center justify-between">
                                    <h2 className="text-[10px] font-bold text-[#b0b3b8] uppercase tracking-wider">Archivos en esta carpeta</h2>
                                    {selectionMode && (
                                        <button onClick={() => setSelectedIds(new Set(videos.map(v => v.id)))} className="text-[10px] font-bold text-[#2d88ff]">Seleccionar todos</button>
                                    )}
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1">
                                    {videos.map((v) => (
                                        <div key={v.id} className="relative">
                                            {selectionMode && (
                                                <div 
                                                    onClick={() => toggleSelection(v.id)}
                                                    className="absolute top-2 left-2 z-30 cursor-pointer"
                                                >
                                                    {selectedIds.has(v.id) ? (
                                                        <CheckSquare size={24} className="text-[#2d88ff] fill-white" />
                                                    ) : (
                                                        <Square size={24} className="text-white/50" />
                                                    )}
                                                </div>
                                            )}
                                            <VideoCard 
                                                video={v}
                                                isUnlocked={isAdmin || user?.id === v.creatorId || !!(user?.vipExpiry && user.vipExpiry > Date.now() / 1000) || Number(v.price || 0) <= 0}
                                                showDownload={true}
                                                onDownload={() => addToQueue(v)}
                                            />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {folders.length === 0 && videos.length === 0 && (
                            <div className="py-32 flex flex-col items-center gap-4 text-[#b0b3b8]">
                                <Folder size={64} className="opacity-10" />
                                <div className="text-center">
                                    <p className="font-bold text-lg text-[#e4e6eb]">Carpeta vacía</p>
                                    <p className="text-sm">No hay contenido subido en esta ubicación</p>
                                </div>
                            </div>
                        )}
                    </>
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
