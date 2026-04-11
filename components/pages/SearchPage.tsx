import React, { useState, useEffect, useRef } from 'react';
import { ChevronLeft, Search, X, ChevronRight, Mic, Tag, Folder, History, TrendingUp } from 'lucide-react';
import { useNavigate } from '../Router';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../services/db';
import { Video, Category } from '../../types';

export default function SearchPage() {
    const navigate = useNavigate();
    const { user } = useAuth();
    const searchInputRef = useRef<HTMLInputElement>(null);

    const [searchQuery, setSearchQuery] = useState('');
    const [suggestions, setSuggestions] = useState<any[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(true);
    const [isListening, setIsListening] = useState(false);
    const [searchHistory, setSearchHistory] = useState<string[]>([]);

    useEffect(() => {
        // Auto-focus en el campo de búsqueda
        searchInputRef.current?.focus();

        // Cargar historial de búsqueda
        const history = localStorage.getItem('sp_search_history');
        if (history) {
            try {
                setSearchHistory(JSON.parse(history));
            } catch (e) {}
        }

        // Cargar sugerencias iniciales
        loadSuggestions('');
    }, []);

    const loadSuggestions = async (query: string) => {
        try {
            const results = await db.getSearchSuggestions(query, 20);
            setSuggestions(results);
        } catch (err) {
            console.error('Error loading suggestions:', err);
        }
    };

    const handleSearchChange = (value: string) => {
        setSearchQuery(value);
        setShowSuggestions(true);
        loadSuggestions(value);
    };

    const handleSearchSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!searchQuery.trim()) return;

        // Guardar en historial
        const newHistory = [searchQuery, ...searchHistory.filter(h => h !== searchQuery)].slice(0, 20);
        setSearchHistory(newHistory);
        localStorage.setItem('sp_search_history', JSON.stringify(newHistory));

        // Navegar a Home con búsqueda
        navigate(`/?q=${encodeURIComponent(searchQuery)}`);
    };

    const handleSuggestionClick = (suggestion: any) => {
        if (suggestion.type === 'CATEGORY') {
            navigate(`/?cat=${encodeURIComponent(suggestion.value)}`);
        } else if (suggestion.type === 'FOLDER') {
            navigate(`/?folder=${encodeURIComponent(suggestion.value)}`);
        } else if (suggestion.type === 'HISTORY') {
            setSearchQuery(suggestion.value);
            navigate(`/?q=${encodeURIComponent(suggestion.value)}`);
        } else {
            setSearchQuery(suggestion.value);
            navigate(`/?q=${encodeURIComponent(suggestion.value)}`);
        }
    };

    const toggleVoiceSearch = () => {
        if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
            alert('La búsqueda por voz no está disponible en este navegador');
            return;
        }

        if (isListening) {
            setIsListening(false);
            return;
        }

        const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
        const recognition = new SpeechRecognition();
        recognition.lang = 'es-ES';
        recognition.continuous = false;
        recognition.interimResults = false;

        recognition.onstart = () => setIsListening(true);
        recognition.onend = () => setIsListening(false);
        recognition.onerror = () => setIsListening(false);

        recognition.onresult = (event: any) => {
            const transcript = event.results[0][0].transcript;
            setSearchQuery(transcript);
            handleSearchChange(transcript);
        };

        recognition.start();
    };

    const getSuggestionIcon = (type: string) => {
        switch (type) {
            case 'CATEGORY': return <Tag size={16} />;
            case 'FOLDER': return <Folder size={16} />;
            case 'HISTORY': return <History size={16} />;
            default: return <Search size={16} />;
        }
    };

    const clearHistory = () => {
        setSearchHistory([]);
        localStorage.removeItem('sp_search_history');
        loadSuggestions('');
    };

    return (
        <div className="min-h-screen bg-[#18191a]">
            {/* Header */}
            <header className="sticky top-0 z-50 bg-[#242526] border-b border-white/5 shadow-lg">
                <div className="flex items-center gap-3 px-4 h-14">
                    <button
                        onClick={() => navigate(-1)}
                        className="w-10 h-10 rounded-full bg-[#3a3b3c] flex items-center justify-center hover:bg-[#4e4f50] transition-colors shrink-0"
                    >
                        <ChevronLeft size={24} className="text-[#e4e6eb]" />
                    </button>

                    {/* Search Input */}
                    <form onSubmit={handleSearchSubmit} className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#b0b3b8]" size={18} />
                        <input
                            ref={searchInputRef}
                            type="text"
                            value={searchQuery}
                            onChange={(e) => handleSearchChange(e.target.value)}
                            placeholder="Buscar videos, categorías, carpetas..."
                            className={`w-full bg-[#3a3b3c] border border-white/10 rounded-full pl-10 pr-20 py-2.5 text-sm text-[#e4e6eb] placeholder-[#b0b3b8] focus:bg-[#4e4f50] focus:border-[#1877f2] outline-none transition-all ${
                                isListening ? 'ring-2 ring-red-500 animate-pulse' : ''
                            }`}
                        />
                        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                            {searchQuery && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setSearchQuery('');
                                        handleSearchChange('');
                                        searchInputRef.current?.focus();
                                    }}
                                    className="w-8 h-8 rounded-full bg-[#4e4f50] flex items-center justify-center hover:bg-[#5a5b5c] transition-colors"
                                >
                                    <X size={16} className="text-[#e4e6eb]" />
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={toggleVoiceSearch}
                                className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
                                    isListening
                                        ? 'bg-red-500 text-white'
                                        : 'bg-[#4e4f50] hover:bg-[#5a5b5c] text-[#e4e6eb]'
                                }`}
                            >
                                <Mic size={16} />
                            </button>
                        </div>
                    </form>
                </div>
            </header>

            {/* Content */}
            <div className="max-w-2xl mx-auto">
                {/* Search History */}
                {!searchQuery && searchHistory.length > 0 && (
                    <div className="bg-[#242526] border-b border-white/5">
                        <div className="flex items-center justify-between px-4 py-3">
                            <h2 className="text-sm font-bold text-[#e4e6eb] uppercase tracking-wide">Búsquedas recientes</h2>
                            <button
                                onClick={clearHistory}
                                className="text-xs text-[#1877f2] hover:underline font-semibold"
                            >
                                Borrar todo
                            </button>
                        </div>
                        <div className="divide-y divide-white/5">
                            {searchHistory.map((item, i) => (
                                <button
                                    key={i}
                                    onClick={() => handleSuggestionClick({ type: 'HISTORY', value: item })}
                                    className="w-full px-4 py-3 flex items-center gap-3 hover:bg-[#3a3b3c] transition-colors text-left"
                                >
                                    <div className="w-10 h-10 rounded-full bg-[#3a3b3c] flex items-center justify-center">
                                        <History size={18} className="text-[#b0b3b8]" />
                                    </div>
                                    <span className="flex-1 text-sm text-[#e4e6eb]">{item}</span>
                                    <ChevronRight size={16} className="text-[#b0b3b8]" />
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Suggestions */}
                {showSuggestions && suggestions.length > 0 && (
                    <div className="bg-[#242526]">
                        <div className="px-4 py-3">
                            <h2 className="text-sm font-bold text-[#e4e6eb] uppercase tracking-wide">
                                {searchQuery ? 'Sugerencias' : 'Explorar'}
                            </h2>
                        </div>
                        <div className="divide-y divide-white/5">
                            {suggestions.map((s, i) => (
                                <button
                                    key={i}
                                    onClick={() => handleSuggestionClick(s)}
                                    className="w-full px-4 py-3 flex items-center gap-3 hover:bg-[#3a3b3c] transition-colors text-left group"
                                >
                                    <div
                                        className={`w-10 h-10 rounded-full flex items-center justify-center ${
                                            s.type === 'CATEGORY'
                                                ? 'bg-green-500/20 text-green-400'
                                                : s.type === 'FOLDER'
                                                ? 'bg-yellow-500/20 text-yellow-400'
                                                : 'bg-[#3a3b3c] text-[#b0b3b8]'
                                        }`}
                                    >
                                        {getSuggestionIcon(s.type)}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm font-semibold text-[#e4e6eb] group-hover:text-[#1877f2] transition-colors truncate">
                                            {s.label}
                                        </div>
                                        <div className="text-xs text-[#b0b3b8] uppercase">
                                            {s.type === 'HISTORY' ? 'Búsqueda anterior' : s.type}
                                        </div>
                                    </div>
                                    <ChevronRight size={16} className="text-[#b0b3b8] opacity-0 group-hover:opacity-100 transition-opacity" />
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Empty State */}
                {showSuggestions && suggestions.length === 0 && searchQuery && (
                    <div className="py-20 text-center">
                        <div className="flex flex-col items-center gap-4">
                            <div className="w-20 h-20 rounded-full bg-[#3a3b3c] flex items-center justify-center">
                                <Search size={40} className="text-[#b0b3b8]" />
                            </div>
                            <div>
                                <h2 className="text-lg font-bold text-[#e4e6eb] mb-2">No se encontraron resultados</h2>
                                <p className="text-sm text-[#b0b3b8]">Intenta con otros términos de búsqueda</p>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
