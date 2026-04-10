import React, { useState, useEffect } from 'react';
import { ChevronLeft, Layers, Play, Music, Check, SortAsc, Clock, Zap, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import { useNavigate } from '../Router';
import { useToast } from '../../context/ToastContext';

export default function SettingsPage() {
    const navigate = useNavigate();
    const toast = useToast();

    // Estados de configuración
    const [mediaFilter, setMediaFilter] = useState<'ALL' | 'VIDEO' | 'AUDIO'>('ALL');
    const [sortOrder, setSortOrder] = useState<string>('');
    const [showFolderCards, setShowFolderCards] = useState(false);

    // Cargar configuración guardada
    useEffect(() => {
        try {
            const savedMedia = localStorage.getItem('sp_media_filter') || 'ALL';
            const savedSort = localStorage.getItem('sp_user_sort') || '';
            const savedFolderCards = localStorage.getItem('sp_show_folder_cards') === 'true';

            setMediaFilter(savedMedia as any);
            setSortOrder(savedSort);
            setShowFolderCards(savedFolderCards);
        } catch (e) {
            console.error('Error loading settings:', e);
        }
    }, []);

    const handleMediaFilterChange = (filter: 'ALL' | 'VIDEO' | 'AUDIO') => {
        setMediaFilter(filter);
        localStorage.setItem('sp_media_filter', filter);
        toast.success(`Filtro de media: ${filter === 'ALL' ? 'Todo' : filter === 'VIDEO' ? 'Videos' : 'Audios'}`);
    };

    const handleSortOrderChange = (order: string) => {
        setSortOrder(order);
        localStorage.setItem('sp_user_sort', order);
        const sortLabels: any = {
            '': 'Por defecto',
            'LATEST': 'Recientes',
            'ALPHA': 'A-Z (Título)',
            'RANDOM': 'Aleatorio'
        };
        toast.success(`Orden: ${sortLabels[order]}`);
    };

    const handleFolderCardsToggle = (enabled: boolean) => {
        setShowFolderCards(enabled);
        localStorage.setItem('sp_show_folder_cards', enabled.toString());
        toast.success(enabled ? 'Tarjetas de carpetas activadas' : 'Tarjetas de carpetas desactivadas');
    };

    const sortOptions = [
        { id: '', label: 'Por Defecto', icon: RefreshCw, description: 'Orden natural del sistema' },
        { id: 'LATEST', label: 'Recientes', icon: Clock, description: 'Primero los más nuevos' },
        { id: 'ALPHA', label: 'A-Z (Título)', icon: SortAsc, description: 'Orden alfabético' },
        { id: 'RANDOM', label: 'Aleatorio', icon: Zap, description: 'Orden aleatorio' }
    ];

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
                        <span className="font-semibold">Configuración</span>
                    </button>
                </div>
            </header>

            <div className="max-w-2xl mx-auto">
                {/* Filtro de Tipo de Media */}
                <div className="mt-6">
                    <h3 className="px-4 text-lg font-bold text-[#e4e6eb] mb-2">Filtro de Tipo de Media</h3>
                    <div className="bg-[#242526] border-y border-white/5 p-4">
                        <p className="text-sm text-[#b0b3b8] mb-4">
                            Selecciona qué tipo de contenido quieres ver en la página principal
                        </p>
                        <div className="grid grid-cols-3 gap-3">
                            <button
                                onClick={() => handleMediaFilterChange('ALL')}
                                className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                                    mediaFilter === 'ALL'
                                        ? 'bg-[#1877f2] border-[#1877f2] text-white'
                                        : 'bg-[#3a3b3c] border-white/10 text-[#b0b3b8] hover:border-[#1877f2]'
                                }`}
                            >
                                <Layers size={24} />
                                <span className="text-xs font-bold">Todo</span>
                                {mediaFilter === 'ALL' && <Check size={16} />}
                            </button>
                            <button
                                onClick={() => handleMediaFilterChange('VIDEO')}
                                className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                                    mediaFilter === 'VIDEO'
                                        ? 'bg-[#1877f2] border-[#1877f2] text-white'
                                        : 'bg-[#3a3b3c] border-white/10 text-[#b0b3b8] hover:border-[#1877f2]'
                                }`}
                            >
                                <Play size={24} />
                                <span className="text-xs font-bold">Videos</span>
                                {mediaFilter === 'VIDEO' && <Check size={16} />}
                            </button>
                            <button
                                onClick={() => handleMediaFilterChange('AUDIO')}
                                className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                                    mediaFilter === 'AUDIO'
                                        ? 'bg-[#1877f2] border-[#1877f2] text-white'
                                        : 'bg-[#3a3b3c] border-white/10 text-[#b0b3b8] hover:border-[#1877f2]'
                                }`}
                            >
                                <Music size={24} />
                                <span className="text-xs font-bold">Audios</span>
                                {mediaFilter === 'AUDIO' && <Check size={16} />}
                            </button>
                        </div>
                    </div>
                </div>

                {/* Orden de Contenido */}
                <div className="mt-6">
                    <h3 className="px-4 text-lg font-bold text-[#e4e6eb] mb-2">Orden de Contenido</h3>
                    <div className="bg-[#242526] border-y border-white/5">
                        <p className="px-4 pt-4 text-sm text-[#b0b3b8] mb-4">
                            Define cómo se ordenarán los videos y audios
                        </p>
                        {sortOptions.map((option) => (
                            <button
                                key={option.id}
                                onClick={() => handleSortOrderChange(option.id)}
                                className={`w-full flex items-center gap-4 px-4 py-4 hover:bg-[#3a3b3c] transition-colors border-b border-white/5 last:border-b-0 ${
                                    sortOrder === option.id ? 'bg-[#1877f2]/10' : ''
                                }`}
                            >
                                <div
                                    className={`w-12 h-12 rounded-full flex items-center justify-center ${
                                        sortOrder === option.id ? 'bg-[#1877f2] text-white' : 'bg-[#3a3b3c] text-[#b0b3b8]'
                                    }`}
                                >
                                    <option.icon size={20} />
                                </div>
                                <div className="flex-1 text-left">
                                    <div className="text-sm font-bold text-[#e4e6eb]">{option.label}</div>
                                    <div className="text-xs text-[#b0b3b8]">{option.description}</div>
                                </div>
                                {sortOrder === option.id && (
                                    <Check size={20} className="text-[#1877f2]" />
                                )}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Mostrar Tarjetas de Carpetas */}
                <div className="mt-6">
                    <h3 className="px-4 text-lg font-bold text-[#e4e6eb] mb-2">Visualización</h3>
                    <div className="bg-[#242526] border-y border-white/5">
                        <div className="px-4 py-4">
                            <div className="flex items-center justify-between">
                                <div className="flex-1">
                                    <div className="text-sm font-bold text-[#e4e6eb] mb-1">Mostrar Tarjetas de Carpetas</div>
                                    <div className="text-xs text-[#b0b3b8]">
                                        Muestra las carpetas como tarjetas visuales en la página principal
                                    </div>
                                </div>
                                <button
                                    onClick={() => handleFolderCardsToggle(!showFolderCards)}
                                    className={`ml-4 w-14 h-8 rounded-full transition-all relative ${
                                        showFolderCards ? 'bg-[#1877f2]' : 'bg-[#3a3b3c]'
                                    }`}
                                >
                                    <div
                                        className={`absolute top-1 w-6 h-6 bg-white rounded-full transition-all ${
                                            showFolderCards ? 'right-1' : 'left-1'
                                        }`}
                                    ></div>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Información */}
                <div className="mt-8 px-4 py-6">
                    <div className="bg-[#242526] border border-white/5 rounded-2xl p-4">
                        <p className="text-xs text-[#b0b3b8] text-center">
                            <strong className="text-[#e4e6eb]">Nota:</strong> Estos ajustes se aplican globalmente a tu experiencia de navegación.
                            Los cambios se guardan automáticamente.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
