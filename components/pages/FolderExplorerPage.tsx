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
        <div className="min-h-screen bg-[var(--bg-primary)] pb-20">
            {/* Header */}
            <header className="sticky top-0 z-50 bg-[var(--bg-secondary)] border-b border-[var(--divider)] shadow-sm">
                <div className="flex items-center gap-3 px-4 h-14">
                    <button
                        onClick={() => navigate(-1)}
                        className="w-9 h-9 rounded-full bg-[var(--bg-tertiary)] flex items-center justify-center hover:bg-[var(--bg-hover)] transition-colors"
                    >
                        <ChevronLeft size={24} className="text-[var(--text-primary)]" />
                    </button>
                    <h1 className="text-lg font-bold text-[var(--text-primary)]">Explorar Carpetas</h1>
                </div>

                {/* Breadcrumb */}
                {navigationPath.length > 0 && (
                    <div className="px-4 pb-3 flex items-center gap-2 overflow-x-auto scrollbar-hide">
                        <button
                            onClick={() => handleNavigateToPath(-1)}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-md bg-[var(--bg-tertiary)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors shrink-0"
                        >
                            <Home size={14} />
                            <span className="text-xs font-bold">Inicio</span>
                        </button>
                        {navigationPath.map((folder, index) => (
                            <React.Fragment key={index}>
                                <ChevronRight size={14} className="text-[var(--text-secondary)] shrink-0" />
                                <button
                                    onClick={() => handleNavigateToPath(index)}
                                    className={`flex items-center gap-1 px-3 py-1.5 rounded-md transition-colors shrink-0 ${
                                        index === navigationPath.length - 1
                                            ? 'bg-[var(--accent)] text-white'
                                            : 'bg-[var(--bg-tertiary)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                                    }`}
                                >
                                    <Folder size={14} />
                                    <span className="text-xs font-bold">{folder}</span>
                                </button>
                            </React.Fragment>
                        ))}
                    </div>
                )}
            </header>

            {/* Content */}
            <div className="max-w-2xl mx-auto p-3">
                {loading ? (
                    <div className="flex items-center justify-center py-20">
                        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[var(--accent)]"></div>
                    </div>
                ) : folders.length === 0 ? (
                    <div className="py-20 text-center">
                        <div className="flex flex-col items-center gap-4">
                            <div className="w-16 h-16 rounded-full bg-[var(--bg-tertiary)] flex items-center justify-center">
                                <Folder size={32} className="text-[var(--text-secondary)]" />
                            </div>
                            <div>
                                <h2 className="text-base font-bold text-[var(--text-primary)] mb-1">No hay carpetas</h2>
                                <p className="text-xs text-[var(--text-secondary)]">Esta ubicación está vacía</p>
                            </div>
                            {navigationPath.length > 0 && (
                                <button
                                    onClick={() => handleNavigateToPath(-1)}
                                    className="mt-4 px-6 py-2 bg-[var(--accent)] hover:opacity-90 text-white rounded-md font-bold transition-colors text-sm"
                                >
                                    Volver al inicio
                                </button>
                            )}
                        </div>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-2">
                        {folders.map((folder, index) => (
                            <button
                                key={folder.relativePath}
                                onClick={() => handleFolderClick(folder)}
                                className="w-full p-3 rounded-md bg-[var(--bg-secondary)] border border-[var(--divider)] hover:bg-[var(--bg-hover)] transition-all flex items-center gap-3 group"
                            >
                                {/* Thumbnail */}
                                <div className="w-16 h-16 rounded-md bg-[var(--bg-tertiary)] overflow-hidden shrink-0 border border-[var(--divider)]">
                                    {folder.thumbnailUrl ? (
                                        <img
                                            src={folder.thumbnailUrl}
                                            className="w-full h-full object-cover"
                                            alt={folder.name}
                                            referrerPolicy="no-referrer"
                                        />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center">
                                            <Folder size={24} className="text-[var(--text-secondary)]" />
                                        </div>
                                    )}
                                </div>

                                {/* Info */}
                                <div className="flex-1 text-left min-w-0">
                                    <div className="text-sm font-bold text-[var(--text-primary)] group-hover:text-[var(--accent)] transition-colors truncate">
                                        {folder.name}
                                    </div>
                                    <div className="flex items-center gap-2 mt-0.5">
                                        <div className="flex items-center gap-1 text-[10px] text-[var(--text-secondary)] font-bold uppercase">
                                            <Play size={10} />
                                            <span>{folder.count || 0} items</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Arrow */}
                                <ChevronRight
                                    size={18}
                                    className="text-[var(--text-secondary)] group-hover:text-[var(--accent)] group-hover:translate-x-1 transition-all shrink-0"
                                />
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
