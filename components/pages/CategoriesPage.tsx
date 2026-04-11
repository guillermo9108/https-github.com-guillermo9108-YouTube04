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
                    <h1 className="text-xl font-bold text-[#e4e6eb]">Categorías</h1>
                </div>
            </header>

            {/* Content */}
            <div className="max-w-2xl mx-auto">
                {loading ? (
                    <div className="flex items-center justify-center py-20">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#1877f2]"></div>
                    </div>
                ) : categories.length === 0 ? (
                    <div className="py-20 text-center">
                        <div className="flex flex-col items-center gap-4">
                            <div className="w-20 h-20 rounded-full bg-[#3a3b3c] flex items-center justify-center">
                                <Tag size={40} className="text-[#b0b3b8]" />
                            </div>
                            <div>
                                <h2 className="text-lg font-bold text-[#e4e6eb] mb-2">No hay categorías</h2>
                                <p className="text-sm text-[#b0b3b8]">Las categorías aparecerán aquí cuando agregues contenido</p>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="p-4">
                        {/* Categoría "TODOS" especial */}
                        <button
                            onClick={() => handleCategoryClick('TODOS')}
                            className="w-full mb-4 p-4 rounded-xl flex items-center gap-3 bg-gradient-to-r from-[#1877f2] to-[#1a5dbd] hover:from-[#1a66d6] hover:to-[#1550a8] transition-all border-2 border-[#1877f2] shadow-lg"
                        >
                            <div className="w-14 h-14 rounded-full bg-white/20 flex items-center justify-center">
                                <Tag size={24} className="text-white" />
                            </div>
                            <div className="flex-1 text-left">
                                <div className="text-base font-bold text-white">Todo</div>
                                <div className="text-xs text-white/70">Ver todo el contenido</div>
                            </div>
                            <ChevronRight size={20} className="text-white/70" />
                        </button>

                        {/* Grid de Categorías */}
                        <div className="grid grid-cols-2 gap-3">
                            {categories.map((cat, index) => (
                                <button
                                    key={cat.name}
                                    onClick={() => handleCategoryClick(cat.name)}
                                    className={`p-4 rounded-xl flex flex-col items-center gap-2 transition-all border-2 hover:scale-105 ${getCategoryColor(
                                        index
                                    )}`}
                                >
                                    <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center">
                                        <Tag size={20} />
                                    </div>
                                    <div className="text-center">
                                        <div className="text-sm font-bold uppercase tracking-tight line-clamp-1">
                                            {cat.name}
                                        </div>
                                        <div className="text-xs opacity-70 mt-1">{cat.count || 0} videos</div>
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
