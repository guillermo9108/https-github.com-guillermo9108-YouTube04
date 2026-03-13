
import React, { useState, useEffect } from 'react';
import { X, Folder, ChevronRight, ChevronLeft, Loader2, Home } from 'lucide-react';
import { db } from '../../services/db';

interface FolderNavigationModalProps {
    isOpen: boolean;
    onClose: () => void;
    currentPath: string[];
    onNavigate: (path: string[]) => void;
}

export default function FolderNavigationModal({ isOpen, onClose, currentPath, onNavigate }: FolderNavigationModalProps) {
    const [modalPath, setModalPath] = useState<string[]>(currentPath);
    const [folders, setFolders] = useState<{ name: string; count: number; thumbnailUrl: string; relativePath: string }[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setModalPath(currentPath);
        }
    }, [isOpen, currentPath]);

    useEffect(() => {
        if (!isOpen) return;

        const fetchFolders = async () => {
            setLoading(true);
            try {
                const pathStr = modalPath.join('/');
                const res = await db.getVideos(0, 1, pathStr, '', 'TODOS', 'ALL', '', '');
                
                let rawFolders = res.folders;
                let finalFolders: any[] = [];
                
                if (Array.isArray(rawFolders)) {
                    finalFolders = rawFolders;
                } else if (rawFolders && typeof rawFolders === 'object') {
                    finalFolders = Object.values(rawFolders);
                }
                
                setFolders(finalFolders);
            } catch (e) {
                console.error("Error fetching folders for modal:", e);
            } finally {
                setLoading(false);
            }
        };

        fetchFolders();
    }, [isOpen, modalPath]);

    if (!isOpen) return null;

    const handleFolderClick = (folderName: string) => {
        const newPath = [...modalPath, folderName];
        setModalPath(newPath);
        onNavigate(newPath);
    };

    const handleBack = () => {
        if (modalPath.length === 0) return;
        const newPath = modalPath.slice(0, -1);
        setModalPath(newPath);
        onNavigate(newPath);
    };

    const handleGoHome = () => {
        setModalPath([]);
        onNavigate([]);
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="bg-slate-900 border border-white/10 rounded-[32px] w-full max-w-lg max-h-[80vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
                {/* Header */}
                <div className="p-6 border-b border-white/5 flex items-center justify-between bg-slate-950/50">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-indigo-500/20 rounded-xl text-indigo-400">
                            <Folder size={20} />
                        </div>
                        <div>
                            <h3 className="text-sm font-black text-white uppercase tracking-widest">Explorador de Carpetas</h3>
                            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-tighter">Navega por tu biblioteca local</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-full text-slate-400 hover:text-white transition-colors">
                        <X size={20} />
                    </button>
                </div>

                {/* Navigation Bar */}
                <div className="px-6 py-3 bg-white/5 border-b border-white/5 flex items-center gap-2 overflow-x-auto scrollbar-hide">
                    <button 
                        onClick={handleGoHome}
                        className={`p-2 rounded-lg transition-colors ${modalPath.length === 0 ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-white/5'}`}
                    >
                        <Home size={16} />
                    </button>
                    {modalPath.length > 0 && <ChevronRight size={14} className="text-slate-600 shrink-0" />}
                    {modalPath.map((part, idx) => (
                        <React.Fragment key={idx}>
                            <button 
                                onClick={() => {
                                    const newPath = modalPath.slice(0, idx + 1);
                                    setModalPath(newPath);
                                    onNavigate(newPath);
                                }}
                                className="whitespace-nowrap text-[10px] font-black uppercase tracking-widest text-indigo-400 hover:text-white transition-colors"
                            >
                                {part}
                            </button>
                            {idx < modalPath.length - 1 && <ChevronRight size={14} className="text-slate-600 shrink-0" />}
                        </React.Fragment>
                    ))}
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-4 custom-scrollbar min-h-[300px]">
                    {loading ? (
                        <div className="h-full flex flex-col items-center justify-center gap-3 opacity-50">
                            <Loader2 size={32} className="animate-spin text-indigo-500" />
                            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Cargando carpetas...</span>
                        </div>
                    ) : folders.length > 0 ? (
                        <div className="grid grid-cols-1 gap-2">
                            {modalPath.length > 0 && (
                                <button 
                                    onClick={handleBack}
                                    className="w-full p-4 flex items-center gap-4 hover:bg-white/5 rounded-2xl transition-all group border border-transparent hover:border-white/5"
                                >
                                    <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center text-slate-500 group-hover:text-white transition-colors">
                                        <ChevronLeft size={20} />
                                    </div>
                                    <span className="text-xs font-black uppercase tracking-widest text-slate-400 group-hover:text-white">Volver</span>
                                </button>
                            )}
                            {folders.map((folder) => (
                                <button 
                                    key={folder.name}
                                    onClick={() => handleFolderClick(folder.name)}
                                    className="w-full p-4 flex items-center gap-4 hover:bg-white/5 rounded-2xl transition-all group border border-transparent hover:border-white/5 text-left"
                                >
                                    <div className="w-12 h-12 rounded-xl overflow-hidden bg-slate-800 border border-white/5 shrink-0">
                                        {folder.thumbnailUrl ? (
                                            <img src={folder.thumbnailUrl} className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-opacity" referrerPolicy="no-referrer" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-slate-700 group-hover:text-indigo-500 transition-colors">
                                                <Folder size={24} />
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h4 className="text-sm font-black text-white uppercase tracking-tight truncate group-hover:text-indigo-400 transition-colors">{folder.name}</h4>
                                        <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">{folder.count} elementos</p>
                                    </div>
                                    <ChevronRight size={16} className="text-slate-700 group-hover:text-white group-hover:translate-x-1 transition-all" />
                                </button>
                            ))}
                        </div>
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center gap-4 opacity-20 py-20">
                            <Folder size={48} />
                            <p className="text-[10px] font-black uppercase tracking-widest">No hay subcarpetas</p>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 bg-slate-950/50 border-t border-white/5 flex justify-end">
                    <button 
                        onClick={onClose}
                        className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-black uppercase tracking-widest rounded-xl transition-all active:scale-95 shadow-lg shadow-indigo-900/20"
                    >
                        Cerrar Explorador
                    </button>
                </div>
            </div>
        </div>
    );
}
