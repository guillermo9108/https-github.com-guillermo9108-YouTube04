import React, { useState, useEffect } from 'react';
import { ChevronLeft, Tag, ChevronRight } from 'lucide-react';
import { useNavigate } from '../Router';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../services/db';
import { Category } from '../../types';

export default function CategoriesPage() {
    const navigate = useNavigate();
    const { user } = useAuth();
    const [categories, setCategories] = useState<Category[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadCategories();
    }, []);

    const loadCategories = async () => {
        try {
            const cats = await db.getCategories();
            setCategories(cats);
        } catch (err) {
            console.error('Error loading categories:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleCategoryClick = (category: string) => {
        navigate(`/?cat=${encodeURIComponent(category)}`);
    };

    const getCategoryColor = (index: number) => {
        const colors = [
            'bg-red-500/20 text-red-400 border-red-500/30',
            'bg-blue-500/20 text-blue-400 border-blue-500/30',
            'bg-green-500/20 text-green-400 border-green-500/30',
            'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
            'bg-purple-500/20 text-purple-400 border-purple-500/30',
            'bg-pink-500/20 text-pink-400 border-pink-500/30',
            'bg-indigo-500/20 text-indigo-400 border-indigo-500/30',
            'bg-orange-500/20 text-orange-400 border-orange-500/30',
        ];
        return colors[index % colors.length];
    };

    return (
        <div className="min-h-screen bg-[var(--bg-primary)] pb-20">
            {/* Header */}
            <header className="sticky top-[calc(104px+env(safe-area-inset-top,24px))] z-50 bg-[var(--bg-secondary)] border-b border-[var(--divider)] shadow-sm">
                <div className="flex items-center gap-3 px-4 h-14">
                    <button
                        onClick={() => navigate(-1)}
                        className="w-9 h-9 rounded-full bg-[var(--bg-tertiary)] flex items-center justify-center hover:bg-[var(--bg-hover)] transition-colors"
                    >
                        <ChevronLeft size={24} className="text-[var(--text-primary)]" />
                    </button>
                    <h1 className="text-lg font-bold text-[var(--text-primary)]">Categorías</h1>
                </div>
            </header>

            {/* Content */}
            <div className="max-w-2xl mx-auto">
                {loading ? (
                    <div className="flex items-center justify-center py-20">
                        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[var(--accent)]"></div>
                    </div>
                ) : categories.length === 0 ? (
                    <div className="py-20 text-center">
                        <div className="flex flex-col items-center gap-4">
                            <div className="w-16 h-16 rounded-full bg-[var(--bg-tertiary)] flex items-center justify-center">
                                <Tag size={32} className="text-[var(--text-secondary)]" />
                            </div>
                            <div>
                                <h2 className="text-base font-bold text-[var(--text-primary)] mb-1">No hay categorías</h2>
                                <p className="text-xs text-[var(--text-secondary)]">Las categorías aparecerán aquí cuando agregues contenido</p>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="p-3">
                        {/* Categoría "TODOS" especial */}
                        <button
                            onClick={() => handleCategoryClick('TODOS')}
                            className="w-full mb-3 p-3 rounded-md flex items-center gap-3 bg-[var(--accent)] hover:opacity-90 transition-all border border-[var(--divider)] shadow-sm"
                        >
                            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                                <Tag size={20} className="text-white" />
                            </div>
                            <div className="flex-1 text-left">
                                <div className="text-sm font-bold text-white">Todo</div>
                                <div className="text-[10px] text-white/70 font-bold uppercase">Ver todo el contenido</div>
                            </div>
                            <ChevronRight size={18} className="text-white/70" />
                        </button>

                        {/* Grid de Categorías */}
                        <div className="grid grid-cols-2 gap-2">
                            {categories.map((cat, index) => (
                                <button
                                    key={cat.name}
                                    onClick={() => handleCategoryClick(cat.name)}
                                    className="p-3 rounded-md flex flex-col items-center gap-2 transition-all border border-[var(--divider)] bg-[var(--bg-secondary)] hover:bg-[var(--bg-hover)]"
                                >
                                    <div className="w-10 h-10 rounded-full bg-[var(--bg-tertiary)] flex items-center justify-center">
                                        <Tag size={18} className="text-[var(--accent)]" />
                                    </div>
                                    <div className="text-center">
                                        <div className="text-xs font-bold uppercase tracking-tight line-clamp-1 text-[var(--text-primary)]">
                                            {cat.name}
                                        </div>
                                        <div className="text-[10px] text-[var(--text-secondary)] font-bold mt-0.5">{cat.count || 0} videos</div>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
