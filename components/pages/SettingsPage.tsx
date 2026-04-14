import React, { useState, useEffect } from 'react';
import { ChevronLeft, Layers, Play, Music, ArrowDownUp, Clock, Zap, RefreshCw, SortAsc, Check, Folder } from 'lucide-react';
import { useNavigate } from '../Router';
import { useAuth } from '../../context/AuthContext';

export default function SettingsPage() {
    const navigate = useNavigate();
    const { user } = useAuth();

    // Filtros de Media
    const [mediaFilter, setMediaFilter] = useState<'ALL' | 'VIDEO' | 'AUDIO'>(() => {
        return (localStorage.getItem('sp_media_filter') as any) || 'ALL';
    });

    // Orden
    const [sortOrder, setSortOrder] = useState<string>(() => {
        return localStorage.getItem('sp_user_sort') || '';
    });

    // Mostrar carpetas
    const [showFolders, setShowFolders] = useState<boolean>(() => {
        const saved = localStorage.getItem('sp_show_folders');
        return saved === 'true' || saved === null; // Por defecto true
    });

    useEffect(() => {
        localStorage.setItem('sp_media_filter', mediaFilter);
    }, [mediaFilter]);

    useEffect(() => {
        localStorage.setItem('sp_user_sort', sortOrder);
    }, [sortOrder]);

    useEffect(() => {
        localStorage.setItem('sp_show_folders', showFolders.toString());
    }, [showFolders]);

    const mediaOptions = [
        { id: 'ALL', label: 'Todo', icon: Layers, description: 'Mostrar videos y audios' },
        { id: 'VIDEO', label: 'Solo Videos', icon: Play, description: 'Mostrar solo contenido de video' },
        { id: 'AUDIO', label: 'Solo Audio', icon: Music, description: 'Mostrar solo contenido de audio' }
    ];

    const sortOptions = [
        { id: '', label: 'Por Defecto', icon: RefreshCw, description: 'Orden natural de la biblioteca' },
        { id: 'LATEST', label: 'Recientes', icon: Clock, description: 'Los más nuevos primero' },
        { id: 'ALPHA', label: 'A-Z (Título)', icon: SortAsc, description: 'Orden alfabético' },
        { id: 'RANDOM', label: 'Aleatorio', icon: Zap, description: 'Orden aleatorio' }
    ];

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
                    <h1 className="text-xl font-bold text-[#e4e6eb]">Configuración</h1>
                </div>
            </header>

            {/* Content */}
            <div className="max-w-2xl mx-auto">
                {/* Filtro de Tipo de Media */}
                <div className="bg-[#242526] border-b border-white/5 p-4">
                    <div className="flex items-center gap-2 mb-3">
                        <Layers size={20} className="text-[#1877f2]" />
                        <h2 className="text-sm font-bold text-[#e4e6eb] uppercase tracking-wide">Tipo de Contenido</h2>
                    </div>
                    <div className="space-y-2">
                        {mediaOptions.map(option => (
                            <button
                                key={option.id}
                                onClick={() => setMediaFilter(option.id as any)}
                                className={`w-full p-4 rounded-xl flex items-center gap-3 transition-all ${
                                    mediaFilter === option.id
                                        ? 'bg-[#1877f2] border-2 border-[#1877f2]'
                                        : 'bg-[#3a3b3c] border-2 border-transparent hover:bg-[#4e4f50]'
                                }`}
                            >
                                <div
                                    className={`w-12 h-12 rounded-full flex items-center justify-center ${
                                        mediaFilter === option.id ? 'bg-white/20' : 'bg-[#242526]'
                                    }`}
                                >
                                    <option.icon
                                        size={20}
                                        className={mediaFilter === option.id ? 'text-white' : 'text-[#b0b3b8]'}
                                    />
                                </div>
                                <div className="flex-1 text-left">
                                    <div
                                        className={`text-sm font-bold ${
                                            mediaFilter === option.id ? 'text-white' : 'text-[#e4e6eb]'
                                        }`}
                                    >
                                        {option.label}
                                    </div>
                                    <div
                                        className={`text-xs ${
                                            mediaFilter === option.id ? 'text-white/70' : 'text-[#b0b3b8]'
                                        }`}
                                    >
                                        {option.description}
                                    </div>
                                </div>
                                {mediaFilter === option.id && <Check size={20} className="text-white" />}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Orden de Contenido */}
                <div className="bg-[#242526] border-b border-white/5 p-4 mt-2">
                    <div className="flex items-center gap-2 mb-3">
                        <ArrowDownUp size={20} className="text-[#1877f2]" />
                        <h2 className="text-sm font-bold text-[#e4e6eb] uppercase tracking-wide">Orden de Contenido</h2>
                    </div>
                    <div className="space-y-2">
                        {sortOptions.map(option => (
                            <button
                                key={option.id}
                                onClick={() => setSortOrder(option.id)}
                                className={`w-full p-4 rounded-xl flex items-center gap-3 transition-all ${
                                    sortOrder === option.id
                                        ? 'bg-[#1877f2] border-2 border-[#1877f2]'
                                        : 'bg-[#3a3b3c] border-2 border-transparent hover:bg-[#4e4f50]'
                                }`}
                            >
                                <div
                                    className={`w-12 h-12 rounded-full flex items-center justify-center ${
                                        sortOrder === option.id ? 'bg-white/20' : 'bg-[#242526]'
                                    }`}
                                >
                                    <option.icon
                                        size={20}
                                        className={sortOrder === option.id ? 'text-white' : 'text-[#b0b3b8]'}
                                    />
                                </div>
                                <div className="flex-1 text-left">
                                    <div
                                        className={`text-sm font-bold ${
                                            sortOrder === option.id ? 'text-white' : 'text-[#e4e6eb]'
                                        }`}
                                    >
                                        {option.label}
                                    </div>
                                    <div
                                        className={`text-xs ${
                                            sortOrder === option.id ? 'text-white/70' : 'text-[#b0b3b8]'
                                        }`}
                                    >
                                        {option.description}
                                    </div>
                                </div>
                                {sortOrder === option.id && <Check size={20} className="text-white" />}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Mostrar/Ocultar Carpetas */}
                <div className="bg-[#242526] border-b border-white/5 p-4 mt-2">
                    <div className="flex items-center gap-2 mb-3">
                        <Folder size={20} className="text-[#1877f2]" />
                        <h2 className="text-sm font-bold text-[#e4e6eb] uppercase tracking-wide">Visualización de Carpetas</h2>
                    </div>
                    <button
                        onClick={() => setShowFolders(!showFolders)}
                        className={`w-full p-4 rounded-xl flex items-center gap-3 transition-all ${
                            showFolders
                                ? 'bg-[#1877f2] border-2 border-[#1877f2]'
                                : 'bg-[#3a3b3c] border-2 border-transparent hover:bg-[#4e4f50]'
                        }`}
                    >
                        <div
                            className={`w-12 h-12 rounded-full flex items-center justify-center ${
                                showFolders ? 'bg-white/20' : 'bg-[#242526]'
                            }`}
                        >
                            <Folder size={20} className={showFolders ? 'text-white' : 'text-[#b0b3b8]'} />
                        </div>
                        <div className="flex-1 text-left">
                            <div className={`text-sm font-bold ${showFolders ? 'text-white' : 'text-[#e4e6eb]'}`}>
                                {showFolders ? 'Carpetas Visibles' : 'Carpetas Ocultas'}
                            </div>
                            <div className={`text-xs ${showFolders ? 'text-white/70' : 'text-[#b0b3b8]'}`}>
                                {showFolders
                                    ? 'Las carpetas se mostrarán en la página principal'
                                    : 'Las carpetas están ocultas en la página principal'}
                            </div>
                        </div>
                        {showFolders && <Check size={20} className="text-white" />}
                    </button>
                </div>

                {/* Info */}
                <div className="p-4">
                    <p className="text-xs text-[#b0b3b8] text-center">
                        Los cambios se aplican automáticamente a toda la aplicación
                    </p>
                </div>
            </div>
        </div>
    );
}
