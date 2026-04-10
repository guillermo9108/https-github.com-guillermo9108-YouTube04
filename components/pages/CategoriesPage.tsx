import React, { useState, useEffect } from 'react';
import { ChevronLeft, Tag, Loader2, ChevronRight } from 'lucide-react';
import { useNavigate } from '../Router';
import { db } from '../../services/db';

export default function CategoriesPage() {
    const navigate = useNavigate();
    const [categories, setCategories] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadCategories();
    }, []);

    const loadCategories = async () => {
        try {
            const settings = await db.getSystemSettings();
            if (settings?.categories) {
                const categoryNames = settings.categories.map((c: any) => c.name);
                setCategories(['TODOS', ...categoryNames]);
            }
        } catch (e) {
            console.error('Error loading categories:', e);
        } finally {
            setLoading(false);
        }
    };

    const handleCategoryClick = (category: string) => {
        if (category === 'TODOS') {
            navigate('/');
        } else {
            navigate(`/?cat=${encodeURIComponent(category)}`);
        }
    };

    const getCategoryColor = (index: number) => {
        const colors = [
            'text-[#1877f2]',
            'text-pink-500',
            'text-amber-500',
            'text-green-500',
            'text-purple-500',
            'text-red-500',
            'text-blue-500',
            'text-cyan-500',
            'text-orange-500',
            'text-indigo-500'
        ];
        return colors[index % colors.length];
    };

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
                        <span className="font-semibold">Categorías</span>
                    </button>
                </div>
            </header>

            <div className="max-w-2xl mx-auto px-4 py-6">
                <p className="text-sm text-[#b0b3b8] mb-6">
                    Explora el contenido organizado por categorías
                </p>

                {loading ? (
                    <div className="flex flex-col items-center justify-center py-20 gap-4">
                        <Loader2 size={32} className="animate-spin text-[#1877f2]" />
                        <p className="text-sm text-[#b0b3b8]">Cargando categorías...</p>
                    </div>
                ) : categories.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 gap-4">
                        <Tag size={48} className="text-[#3a3b3c]" />
                        <p className="text-sm text-[#b0b3b8]">No hay categorías disponibles</p>
                    </div>
                ) : (
                    <div className="bg-[#242526] border-y border-white/5 divide-y divide-white/5">
                        {categories.map((category, index) => (
                            <button
                                key={category}
                                onClick={() => handleCategoryClick(category)}
                                className="w-full flex items-center gap-4 p-4 hover:bg-[#3a3b3c] transition-colors text-left group"
                            >
                                <div className={`w-12 h-12 rounded-full bg-[#3a3b3c] group-hover:bg-[#4e4f50] flex items-center justify-center transition-colors`}>
                                    <Tag size={20} className={getCategoryColor(index)} />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="text-base font-bold text-[#e4e6eb] uppercase">{category}</div>
                                    <div className="text-xs text-[#b0b3b8]">
                                        {category === 'TODOS' ? 'Ver todo el contenido' : `Ver contenido de ${category}`}
                                    </div>
                                </div>
                                <ChevronRight size={20} className="text-[#b0b3b8] opacity-0 group-hover:opacity-100 transition-opacity" />
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
