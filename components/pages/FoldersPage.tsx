import React, { useState, useEffect } from 'react';
import { ChevronLeft, Folder, ChevronRight, Home, Loader2, FolderOpen } from 'lucide-react';
import { useNavigate } from '../Router';
import { db } from '../../services/db';
import { useAuth } from '../../context/AuthContext';

interface FolderItem {
    name: string;
    count: number;
    thumbnailUrl: string;
    relativePath: string;
    sortOrder?: string;
}

export default function FoldersPage() {
    const navigate = useNavigate();
    const { user } = useAuth();
    const [currentPath, setCurrentPath] = useState<string[]>([]);
    const [folders, setFolders] = useState<FolderItem[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadFolders();
    }, [currentPath]);

    const loadFolders = async () => {
        setLoading(true);
        try {
            const folderPath = currentPath.join('/');
            const res = await db.getVideos(0, 50, folderPath, '', 'TODOS', 'ALL', '', user?.id);

            let finalFolders: FolderItem[] = [];
            if (Array.isArray(res.folders)) {
                finalFolders = res.folders;
            } else if (res.folders && typeof res.folders === 'object') {
                finalFolders = Object.values(res.folders);
            }

            setFolders(finalFolders);
        } catch (e) {
            console.error('Error loading folders:', e);
            setFolders([]);
        } finally {
            setLoading(false);
        }
    };

    const handleFolderClick = (folderName: string) => {
        navigate(`/?folder=${encodeURIComponent([...currentPath, folderName].join('/'))}`);
    };

    const handleNavigate = (index: number) => {
        if (index === -1) {
            setCurrentPath([]);
        } else {
            setCurrentPath(currentPath.slice(0, index + 1));
        }
    };

    const handleGoToRoot = () => {
        navigate('/');
    };

    return (
        <div className="min-h-screen bg-[#18191a] pb-20">
            {/* Header */}
            <header className="sticky top-0 z-50 bg-[#242526] border-b border-white/5 shadow-lg">
                <div className="flex items-center justify-between px-4 h-14">
                    <button
                        onClick={() => navigate(-1)}
                        className="flex items-center gap-2 text-[#e4e6eb] hover:text-white transition-colors"
                    >
                        <ChevronLeft size={24} />
                        <span className="font-semibold">Explorador de Carpetas</span>
                    </button>
                    <button
                        onClick={handleGoToRoot}
                        className="p-2 rounded-full bg-[#3a3b3c] hover:bg-[#4e4f50] transition-colors"
                    >
                        <Home size={20} className="text-[#e4e6eb]" />
                    </button>
                </div>
            </header>

            {/* Breadcrumbs */}
            {currentPath.length > 0 && (
                <div className="bg-[#242526] border-b border-white/5 px-4 py-3">
                    <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide">
                        <button
                            onClick={() => handleNavigate(-1)}
                            className="shrink-0 px-3 py-1.5 rounded-full bg-[#3a3b3c] hover:bg-[#4e4f50] text-xs font-semibold text-[#e4e6eb] transition-colors flex items-center gap-1"
                        >
                            <Home size={12} />
                            Inicio
                        </button>
                        {currentPath.map((folder, index) => (
                            <React.Fragment key={index}>
                                <ChevronRight size={14} className="text-[#b0b3b8] shrink-0" />
                                <button
                                    onClick={() => handleNavigate(index)}
                                    className="shrink-0 px-3 py-1.5 rounded-full bg-[#3a3b3c] hover:bg-[#4e4f50] text-xs font-semibold text-[#e4e6eb] transition-colors"
                                >
                                    {folder}
                                </button>
                            </React.Fragment>
                        ))}
                    </div>
                </div>
            )}

            <div className="max-w-2xl mx-auto px-4 py-6">
                {currentPath.length === 0 && (
                    <p className="text-sm text-[#b0b3b8] mb-6">
                        Explora las carpetas de tu biblioteca de contenido
                    </p>
                )}

                {loading ? (
                    <div className="flex flex-col items-center justify-center py-20 gap-4">
                        <Loader2 size={32} className="animate-spin text-[#1877f2]" />
                        <p className="text-sm text-[#b0b3b8]">Cargando carpetas...</p>
                    </div>
                ) : folders.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 gap-4">
                        <FolderOpen size={48} className="text-[#3a3b3c]" />
                        <p className="text-sm text-[#b0b3b8] font-semibold">No hay carpetas en esta ubicación</p>
                        {currentPath.length > 0 && (
                            <button
                                onClick={() => handleNavigate(-1)}
                                className="mt-4 px-4 py-2 bg-[#1877f2] text-white rounded-lg font-semibold hover:bg-[#1664d8] transition-colors"
                            >
                                Volver al inicio
                            </button>
                        )}
                    </div>
                ) : (
                    <div>
                        {/* Vista de cuadrícula para carpetas */}
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
                            {folders.map((folder) => (
                                <button
                                    key={folder.name}
                                    onClick={() => handleFolderClick(folder.name)}
                                    className="group relative aspect-square rounded-2xl overflow-hidden bg-[#242526] border border-white/5 hover:border-[#1877f2] shadow-xl transition-all duration-300"
                                >
                                    {/* Thumbnail */}
                                    {folder.thumbnailUrl ? (
                                        <img
                                            src={folder.thumbnailUrl}
                                            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700 opacity-60"
                                            referrerPolicy="no-referrer"
                                            alt={folder.name}
                                        />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center bg-[#3a3b3c]">
                                            <Folder size={48} className="text-[#b0b3b8] opacity-20" />
                                        </div>
                                    )}

                                    {/* Gradient overlay */}
                                    <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent"></div>

                                    {/* Content */}
                                    <div className="absolute inset-0 p-4 flex flex-col justify-between">
                                        <div className="flex justify-end">
                                            <div className="bg-[#1877f2]/90 backdrop-blur-sm px-2 py-1 rounded-lg">
                                                <span className="text-xs text-white font-bold">{folder.count}</span>
                                            </div>
                                        </div>
                                        <div>
                                            <h3 className="text-sm font-bold text-white line-clamp-2 mb-1">{folder.name}</h3>
                                            <div className="w-6 h-0.5 bg-[#1877f2] rounded-full group-hover:w-full transition-all duration-500"></div>
                                        </div>
                                    </div>
                                </button>
                            ))}
                        </div>

                        {/* Vista de lista como alternativa */}
                        <div className="bg-[#242526] border-y border-white/5 divide-y divide-white/5 mt-8">
                            <div className="px-4 py-3 bg-[#3a3b3c]/30">
                                <h3 className="text-xs font-bold text-[#b0b3b8] uppercase">Lista de Carpetas</h3>
                            </div>
                            {folders.map((folder) => (
                                <button
                                    key={`list-${folder.name}`}
                                    onClick={() => handleFolderClick(folder.name)}
                                    className="w-full flex items-center gap-4 p-4 hover:bg-[#3a3b3c] transition-colors text-left group"
                                >
                                    <div className="w-12 h-12 rounded-xl overflow-hidden bg-[#3a3b3c] flex items-center justify-center shrink-0 border border-white/5">
                                        {folder.thumbnailUrl ? (
                                            <img
                                                src={folder.thumbnailUrl}
                                                className="w-full h-full object-cover"
                                                referrerPolicy="no-referrer"
                                                alt={folder.name}
                                            />
                                        ) : (
                                            <Folder size={20} className="text-[#b0b3b8]" />
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm font-bold text-[#e4e6eb] truncate">{folder.name}</div>
                                        <div className="text-xs text-[#b0b3b8]">{folder.count} elementos</div>
                                    </div>
                                    <ChevronRight size={20} className="text-[#b0b3b8] opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
