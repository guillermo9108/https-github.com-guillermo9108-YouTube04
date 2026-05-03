import React, { useState, useEffect, useRef } from 'react';
import { ChevronLeft, Search, X, ChevronRight, Mic, Tag, Folder, History, TrendingUp, Music } from 'lucide-react';
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
            navigate(`/?cat=${encodeURIComponent(suggestion.label || suggestion.value)}`);
        } else if (suggestion.type === 'FOLDER') {
            navigate(`/?folder=${encodeURIComponent(suggestion.label || suggestion.value)}`);
        } else if (suggestion.type === 'HISTORY') {
            setSearchQuery(suggestion.label || suggestion.value);
            navigate(`/?q=${encodeURIComponent(suggestion.label || suggestion.value)}`);
        } else if (suggestion.type === 'USER') {
            navigate(`/channel/${suggestion.id}`);
        } else if (suggestion.type === 'VIDEO' || suggestion.type === 'AUDIO') {
            navigate(`/watch/${suggestion.id}?q=${encodeURIComponent(searchQuery)}`);
        } else {
            setSearchQuery(suggestion.label || suggestion.value);
            navigate(`/?q=${encodeURIComponent(suggestion.label || suggestion.value)}`);
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

    const getSuggestionIcon = (s: any) => {
        switch (s.type) {
            case 'CATEGORY': return <Tag size={16} />;
            case 'FOLDER': return <Folder size={16} />;
            case 'HISTORY': return <History size={16} />;
            case 'USER': 
                return s.avatarUrl ? (
                    <img src={s.avatarUrl} className="w-full h-full object-cover rounded-md" />
                ) : (
                    <div className="w-full h-full bg-[var(--accent)] text-white flex items-center justify-center font-bold text-xs rounded-md">
                        {s.label?.[0]?.toUpperCase()}
                    </div>
                );
            case 'AUDIO': return <Music size={16} />;
            default: return <Search size={16} />;
        }
    };

    const clearHistory = () => {
        setSearchHistory([]);
        localStorage.removeItem('sp_search_history');
        loadSuggestions('');
    };

    return (
        <div className="min-h-screen bg-[var(--bg-primary)] pb-20">
            {/* Header */}
            <header className="sticky top-[calc(104px+env(safe-area-inset-top,24px))] z-50 bg-[var(--bg-secondary)] border-b border-[var(--divider)] shadow-sm">
                <div className="flex items-center gap-3 px-4 h-14">
                    <button
                        onClick={() => navigate(-1)}
                        className="w-9 h-9 rounded-full bg-[var(--bg-tertiary)] flex items-center justify-center hover:bg-[var(--bg-hover)] transition-colors shrink-0"
                    >
                        <ChevronLeft size={24} className="text-[var(--text-primary)]" />
                    </button>

                    {/* Search Input */}
                    <form onSubmit={handleSearchSubmit} className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" size={16} />
                        <input
                            ref={searchInputRef}
                            type="text"
                            value={searchQuery}
                            onChange={(e) => handleSearchChange(e.target.value)}
                            placeholder="Buscar..."
                            className={`w-full bg-[var(--bg-tertiary)] border border-[var(--divider)] rounded-md pl-9 pr-16 py-1.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-secondary)] focus:bg-[var(--bg-secondary)] focus:border-[var(--accent)] outline-none transition-all ${
                                isListening ? 'ring-2 ring-red-500 animate-pulse' : ''
                            }`}
                        />
                        <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
                            {searchQuery && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setSearchQuery('');
                                        handleSearchChange('');
                                        searchInputRef.current?.focus();
                                    }}
                                    className="p-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                                >
                                    <X size={16} />
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={toggleVoiceSearch}
                                className={`p-1.5 rounded-md transition-colors ${
                                    isListening
                                        ? 'bg-red-500 text-white'
                                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
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
                    <div className="bg-[var(--bg-secondary)] border-b border-[var(--divider)]">
                        <div className="flex items-center justify-between px-4 py-3">
                            <h2 className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider">Búsquedas recientes</h2>
                            <button
                                onClick={clearHistory}
                                className="text-xs text-[var(--accent)] hover:underline font-bold"
                            >
                                Borrar todo
                            </button>
                        </div>
                        <div className="divide-y divide-[var(--divider)]">
                            {searchHistory.map((item, i) => (
                                <button
                                    key={i}
                                    onClick={() => handleSuggestionClick({ type: 'HISTORY', value: item })}
                                    className="w-full px-4 py-3 flex items-center gap-3 hover:bg-[var(--bg-hover)] transition-colors text-left"
                                >
                                    <div className="w-8 h-8 rounded-md bg-[var(--bg-tertiary)] flex items-center justify-center">
                                        <History size={16} className="text-[var(--text-secondary)]" />
                                    </div>
                                    <span className="flex-1 text-sm text-[var(--text-primary)]">{item}</span>
                                    <ChevronRight size={14} className="text-[var(--text-secondary)]" />
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Suggestions */}
                {showSuggestions && suggestions.length > 0 && (
                    <div className="bg-[var(--bg-secondary)]">
                        <div className="px-4 py-3">
                            <h2 className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider">
                                {searchQuery ? 'Sugerencias' : 'Explorar'}
                            </h2>
                        </div>
                        <div className="divide-y divide-[var(--divider)]">
                            {suggestions.map((s, i) => (
                                <button
                                    key={i}
                                    onClick={() => handleSuggestionClick(s)}
                                    className="w-full px-4 py-3 flex items-center gap-3 hover:bg-[var(--bg-hover)] transition-colors text-left group"
                                >
                                    <div
                                        className={`w-8 h-8 rounded-md flex items-center justify-center ${
                                            s.type === 'CATEGORY'
                                                ? 'bg-green-500/10 text-green-500'
                                                : s.type === 'FOLDER'
                                                ? 'bg-yellow-500/10 text-yellow-500'
                                                : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]'
                                        }`}
                                    >
                                        {getSuggestionIcon(s)}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm font-bold text-[var(--text-primary)] group-hover:text-[var(--accent)] transition-colors truncate">
                                            {s.label}
                                        </div>
                                        <div className="text-[10px] text-[var(--text-secondary)] uppercase font-bold">
                                            {s.type === 'HISTORY' ? 'Búsqueda anterior' : s.type}
                                        </div>
                                    </div>
                                    <ChevronRight size={14} className="text-[var(--text-secondary)] opacity-0 group-hover:opacity-100 transition-opacity" />
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Empty State */}
                {showSuggestions && suggestions.length === 0 && searchQuery && (
                    <div className="py-20 text-center">
                        <div className="flex flex-col items-center gap-4">
                            <div className="w-16 h-16 rounded-full bg-[var(--bg-tertiary)] flex items-center justify-center">
                                <Search size={32} className="text-[var(--text-secondary)]" />
                            </div>
                            <div>
                                <h2 className="text-base font-bold text-[var(--text-primary)] mb-1">No se encontraron resultados</h2>
                                <p className="text-xs text-[var(--text-secondary)]">Intenta con otros términos de búsqueda</p>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
