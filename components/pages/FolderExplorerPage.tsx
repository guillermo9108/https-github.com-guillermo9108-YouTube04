import React, { useState, useEffect } from 'react';
import { ChevronLeft, Folder, ChevronRight, Home, Play, Music } from 'lucide-react';
import { useNavigate } from '../Router';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../services/db';

interface FolderItem {
    name: string;
    count: number;
    thumbnailUrl: string;
    relativePath: string;
}

export default function FolderExplorerPage() {
    const navigate = useNavigate();
    const { user } = useAuth();
    const [folders, setFolders] = useState<FolderItem[]>([]);
    const [navigationPath, setNavigationPath] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadFolders();
    }, [navigationPath]);

    const loadFolders = async () => {
        try {
            setLoading(true);
            const folderPath = navigationPath.join('/');
            const result = await db.getFolders(folderPath);
            setFolders(result);
        } catch (err) {
            console.error('Error loading folders:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleFolderClick = (folder: FolderItem) => {
        const newPath = [...navigationPath, folder.name];
        navigate(`/?folder=${encodeURIComponent(newPath.join('/'))}`);
    };

    const handleNavigateToPath = (index: number) => {
        if (index === -1) {
            setNavigationPath([]);
        } else {
            setNavigationPath(navigationPath.slice(0, index + 1));
        }
    };

    const handleNavigateHome = () => {
        navigate('/');
    };

    return (
        <div className="min-h-screen bg-[#18191a]">
            {/* Header */}
            <header className="sticky top-0 z-50 bg-[#242526] border-b border-white/5 shadow-lg">
                <div className="flex items-center gap-3 px-4 h-14">
                    <button
                        onClick={() => navigate(-1)}
                        className="w-10 h-10 rounded-full bg-[#3a3b3c] flex items-center justify-center hover:bg-[#4e4f50] transition-colors"
                    >
                        <ChevronLeft size={24} className="text-[#e4e6eb]" />
                    </button>
                    <h1 className="text-xl font-bold text-[#e4e6eb]">Explorar Carpetas</h1>
                </div>

                {/* Breadcrumb */}
                {navigationPath.length > 0 && (
                    <div className="px-4 pb-3 flex items-center gap-2 overflow-x-auto scrollbar-hide">
                        <button
                            onClick={() => handleNavigateToPath(-1)}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#3a3b3c] hover:bg-[#4e4f50] text-[#b0b3b8] hover:text-[#e4e6eb] transition-colors shrink-0"
                        >
                            <Home size={14} />
                            <span className="text-xs font-semibold">Inicio</span>
                        </button>
                        {navigationPath.map((folder, index) => (
                            <React.Fragment key={index}>
                                <ChevronRight size={14} className="text-[#b0b3b8] shrink-0" />
                                <button
                                    onClick={() => handleNavigateToPath(index)}
                                    className={`flex items-center gap-1 px-3 py-1.5 rounded-lg transition-colors shrink-0 ${
                                        index === navigationPath.length - 1
                                            ? 'bg-[#1877f2] text-white'
                                            : 'bg-[#3a3b3c] hover:bg-[#4e4f50] text-[#b0b3b8] hover:text-[#e4e6eb]'
                                    }`}
                                >
                                    <Folder size={14} />
                                    <span className="text-xs font-semibold">{folder}</span>
                                </button>
                            </React.Fragment>
                        ))}
                    </div>
                )}
            </header>

            {/* Content */}
            <div className="max-w-2xl mx-auto p-4">
                {loading ? (
                    <div className="flex items-center justify-center py-20">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#1877f2]"></div>
                    </div>
                ) : folders.length === 0 ? (
                    <div className="py-20 text-center">
                        <div className="flex flex-col items-center gap-4">
                            <div className="w-20 h-20 rounded-full bg-[#3a3b3c] flex items-center justify-center">
                                <Folder size={40} className="text-[#b0b3b8]" />
                            </div>
                            <div>
                                <h2 className="text-lg font-bold text-[#e4e6eb] mb-2">No hay carpetas</h2>
                                <p className="text-sm text-[#b0b3b8]">Esta ubicación está vacía</p>
                            </div>
                            {navigationPath.length > 0 && (
                                <button
                                    onClick={() => handleNavigateToPath(-1)}
                                    className="mt-4 px-6 py-2 bg-[#1877f2] hover:bg-[#1a66d6] text-white rounded-lg font-semibold transition-colors"
                                >
                                    Volver al inicio
                                </button>
                            )}
                        </div>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-3">
                        {folders.map((folder, index) => (
                            <button
                                key={folder.relativePath}
                                onClick={() => handleFolderClick(folder)}
                                className="w-full p-4 rounded-xl bg-[#242526] border border-white/5 hover:bg-[#3a3b3c] transition-all flex items-center gap-4 group"
                            >
                                {/* Thumbnail */}
                                <div className="w-20 h-20 rounded-lg bg-[#3a3b3c] overflow-hidden shrink-0 border border-white/5">
                                    {folder.thumbnailUrl ? (
                                        <img
                                            src={folder.thumbnailUrl}
                                            className="w-full h-full object-cover"
                                            alt={folder.name}
                                            referrerPolicy="no-referrer"
                                        />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center">
                                            <Folder size={32} className="text-[#b0b3b8]" />
                                        </div>
                                    )}
                                </div>

                                {/* Info */}
                                <div className="flex-1 text-left min-w-0">
                                    <div className="text-base font-bold text-[#e4e6eb] group-hover:text-[#1877f2] transition-colors truncate">
                                        {folder.name}
                                    </div>
                                    <div className="flex items-center gap-2 mt-1">
                                        <div className="flex items-center gap-1 text-xs text-[#b0b3b8]">
                                            <Play size={12} />
                                            <span>{folder.count || 0} items</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Arrow */}
                                <ChevronRight
                                    size={20}
                                    className="text-[#b0b3b8] group-hover:text-[#1877f2] group-hover:translate-x-1 transition-all shrink-0"
                                />
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
