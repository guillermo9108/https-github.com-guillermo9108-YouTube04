import React, { useState, useRef, useEffect } from 'react';
import { ChevronLeft, Search, X, Mic, ChevronRight, History, Tag, Folder, Play, Music, ShoppingBag, User as UserIcon, Layers } from 'lucide-react';
import { useNavigate } from '../Router';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../services/db';
import { useToast } from '../../context/ToastContext';

export default function SearchPage() {
    const navigate = useNavigate();
    const { user } = useAuth();
    const toast = useToast();
    const [searchQuery, setSearchQuery] = useState('');
    const [suggestions, setSuggestions] = useState<any[]>([]);
    const [isListening, setIsListening] = useState(false);
    const [recentSearches, setRecentSearches] = useState<string[]>([]);
    const searchInputRef = useRef<HTMLInputElement>(null);
    const searchTimeout = useRef<any>(null);

    useEffect(() => {
        // Auto-focus en el input al cargar
        searchInputRef.current?.focus();

        // Cargar búsquedas recientes del localStorage
        try {
            const recent = JSON.parse(localStorage.getItem('sp_recent_searches') || '[]');
            setRecentSearches(recent.slice(0, 10));
        } catch (e) {
            setRecentSearches([]);
        }
    }, []);

    const handleSearchChange = (val: string) => {
        setSearchQuery(val);
        if (searchTimeout.current) clearTimeout(searchTimeout.current);

        searchTimeout.current = setTimeout(async () => {
            if (!val.trim()) {
                setSuggestions([]);
                return;
            }

            try {
                const dbRes = await db.getSearchSuggestions(val);
                setSuggestions(dbRes || []);
            } catch (e) {
                console.error('Error fetching suggestions:', e);
            }
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
            // Guardar en localStorage
            try {
                const recent = JSON.parse(localStorage.getItem('sp_recent_searches') || '[]');
                const updated = [term, ...recent.filter((s: string) => s !== term)].slice(0, 10);
                localStorage.setItem('sp_recent_searches', JSON.stringify(updated));
            } catch (e) {
                console.error('Error saving recent search:', e);
            }
            navigate(`/?q=${encodeURIComponent(term)}`);
        }
    };

    const handleSuggestionClick = (s: any) => {
        if (s.type === 'HISTORY' || s.type === 'CATEGORY') {
            db.saveSearch(s.label);
            navigate(`/?q=${encodeURIComponent(s.label)}`);
        } else if (s.type === 'FOLDER') {
            navigate(`/?folder=${encodeURIComponent(s.label)}`);
        } else {
            db.saveSearch(searchQuery || s.label);
            if (s.type === 'VIDEO' || s.type === 'AUDIO') navigate(`/watch/${s.id}`);
            else if (s.type === 'MARKET') navigate(`/marketplace/${s.id}`);
            else if (s.type === 'USER') navigate(`/channel/${s.id}`);
        }
    };

    const handleRecentSearch = (term: string) => {
        setSearchQuery(term);
        db.saveSearch(term);
        navigate(`/?q=${encodeURIComponent(term)}`);
    };

    const clearRecentSearches = () => {
        localStorage.setItem('sp_recent_searches', '[]');
        setRecentSearches([]);
        toast.success('Historial de búsqueda eliminado');
    };

    const getSuggestionIcon = (type: string) => {
        switch (type) {
            case 'HISTORY': return <History size={18} className="text-[#b0b3b8]" />;
            case 'CATEGORY': return <Tag size={18} className="text-pink-400" />;
            case 'FOLDER': return <Folder size={18} className="text-amber-500" />;
            case 'VIDEO': return <Play size={18} className="text-[#1877f2]" />;
            case 'AUDIO': return <Music size={18} className="text-[#31a24c]" />;
            case 'MARKET': return <ShoppingBag size={18} className="text-amber-400" />;
            case 'USER': return <UserIcon size={18} className="text-blue-400" />;
            default: return <Layers size={18} className="text-[#b0b3b8]" />;
        }
    };

    return (
        <div className="min-h-screen bg-[#18191a] pb-20">
            {/* Header */}
            <header className="sticky top-0 z-50 bg-[#242526] border-b border-white/5 shadow-lg">
                <div className="flex items-center gap-3 px-4 h-14">
                    <button
                        onClick={() => navigate(-1)}
                        className="text-[#e4e6eb] hover:text-white transition-colors"
                    >
                        <ChevronLeft size={24} />
                    </button>

                    <form onSubmit={handleSearchSubmit} className="flex-1">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#b0b3b8]" size={18} />
                            <input
                                ref={searchInputRef}
                                type="text"
                                value={searchQuery}
                                onChange={(e) => handleSearchChange(e.target.value)}
                                placeholder="Buscar videos, audios, carpetas..."
                                className={`w-full bg-[#3a3b3c] border border-white/10 rounded-full pl-10 pr-20 py-2.5 text-sm text-[#e4e6eb] placeholder-[#b0b3b8] focus:bg-[#4e4f50] focus:border-[#1877f2] outline-none transition-all ${
                                    isListening ? 'ring-2 ring-red-500 animate-pulse' : ''
                                }`}
                            />
                            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                                {searchQuery && (
                                    <button
                                        type="button"
                                        onClick={() => setSearchQuery('')}
                                        className="p-1.5 text-[#b0b3b8] hover:text-white rounded-full hover:bg-white/5 transition-colors"
                                    >
                                        <X size={16} />
                                    </button>
                                )}
                                <button
                                    type="button"
                                    onClick={toggleVoiceSearch}
                                    className={`p-1.5 rounded-full transition-colors ${
                                        isListening
                                            ? 'text-red-500 bg-red-500/10'
                                            : 'text-[#b0b3b8] hover:text-white hover:bg-white/5'
                                    }`}
                                >
                                    <Mic size={18} />
                                </button>
                            </div>
                        </div>
                    </form>
                </div>
            </header>

            <div className="max-w-2xl mx-auto px-4 py-6">
                {/* Sugerencias activas */}
                {searchQuery && suggestions.length > 0 && (
                    <div className="mb-6">
                        <h3 className="text-sm font-bold text-[#e4e6eb] mb-3">Sugerencias</h3>
                        <div className="bg-[#242526] border border-white/5 rounded-2xl overflow-hidden divide-y divide-white/5">
                            {suggestions.map((s, i) => (
                                <button
                                    key={i}
                                    onClick={() => handleSuggestionClick(s)}
                                    className="w-full flex items-center gap-4 p-4 hover:bg-[#3a3b3c] transition-colors text-left group"
                                >
                                    <div className="w-10 h-10 rounded-full bg-[#3a3b3c] group-hover:bg-[#4e4f50] flex items-center justify-center transition-colors">
                                        {getSuggestionIcon(s.type)}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm font-semibold text-[#e4e6eb] truncate">{s.label}</div>
                                        <div className="text-xs text-[#b0b3b8] uppercase">
                                            {s.type === 'FOLDER' ? 'Carpeta' : s.type}
                                        </div>
                                    </div>
                                    <ChevronRight size={18} className="text-[#b0b3b8] opacity-0 group-hover:opacity-100 transition-opacity" />
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Búsquedas recientes */}
                {!searchQuery && recentSearches.length > 0 && (
                    <div>
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="text-sm font-bold text-[#e4e6eb]">Búsquedas recientes</h3>
                            <button
                                onClick={clearRecentSearches}
                                className="text-xs text-[#1877f2] hover:underline font-semibold"
                            >
                                Limpiar
                            </button>
                        </div>
                        <div className="bg-[#242526] border border-white/5 rounded-2xl overflow-hidden divide-y divide-white/5">
                            {recentSearches.map((term, i) => (
                                <button
                                    key={i}
                                    onClick={() => handleRecentSearch(term)}
                                    className="w-full flex items-center gap-4 p-4 hover:bg-[#3a3b3c] transition-colors text-left group"
                                >
                                    <div className="w-10 h-10 rounded-full bg-[#3a3b3c] group-hover:bg-[#4e4f50] flex items-center justify-center transition-colors">
                                        <History size={18} className="text-[#b0b3b8]" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm font-medium text-[#e4e6eb] truncate">{term}</div>
                                    </div>
                                    <ChevronRight size={18} className="text-[#b0b3b8] opacity-0 group-hover:opacity-100 transition-opacity" />
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Estado vacío */}
                {!searchQuery && recentSearches.length === 0 && (
                    <div className="text-center py-20">
                        <Search size={48} className="mx-auto text-[#3a3b3c] mb-4" />
                        <p className="text-sm text-[#b0b3b8]">Busca videos, audios, carpetas y más</p>
                    </div>
                )}
            </div>
        </div>
    );
}
