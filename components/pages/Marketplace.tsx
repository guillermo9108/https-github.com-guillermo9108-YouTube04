
import React, { useEffect, useState } from 'react';
import { db } from '../../services/db';
import { MarketplaceItem } from '../../types';
import { Link, useNavigate } from '../Router';
import { useCart } from '../../context/CartContext';
import { ShoppingBag, Tag, Loader2, Search, Star, Filter, ShoppingCart, X, ArrowDownUp, SlidersHorizontal } from 'lucide-react';

export default function Marketplace() {
    const navigate = useNavigate();
    const { cart } = useCart();
    const [items, setItems] = useState<MarketplaceItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [showFilters, setShowFilters] = useState(false);
    const [selectedSection, setSelectedSection] = useState<'TODOS' | 'FLASH' | 'BEST' | 'RECENT' | 'POPULAR' | 'CHEAP'>('TODOS');
    const [visibleCount, setVisibleCount] = useState(20);

    // Filters
    const [search, setSearch] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('TODOS');
    const [sortOrder, setSortOrder] = useState<'NEWEST' | 'PRICE_ASC' | 'PRICE_DESC'>('NEWEST');
    const [priceRange, setPriceRange] = useState({ min: 0, max: 100000 });
    const [condition, setCondition] = useState('TODOS');
    const [selectedTags, setSelectedTags] = useState<string[]>([]);

    useEffect(() => {
        db.getMarketplaceItems().then((data: MarketplaceItem[]) => {
            setItems(data);
            setLoading(false);
        });
    }, []);

    // Derived Categories & Tags
    const categories = ['TODOS', ...Array.from(new Set(items.map(i => i.category || 'OTRO')))];
    const allTags = Array.from(new Set(items.flatMap(i => i.tags || [])));

    const filteredItems = items.filter(item => {
        const matchesSearch = item.title.toLowerCase().includes(search.toLowerCase());
        const matchesCategory = selectedCategory === 'TODOS' || item.category === selectedCategory;
        const matchesCondition = condition === 'TODOS' || item.condition === condition;
        const matchesPrice = Number(item.price) >= priceRange.min && Number(item.price) <= priceRange.max;
        
        // Section Filters
        let matchesSection = true;
        if (selectedSection === 'FLASH') matchesSection = !!item.isFlashSale;
        if (selectedSection === 'BEST') matchesSection = (item.salesCount || 0) > 10;
        if (selectedSection === 'POPULAR') matchesSection = (item.popularity || 0) > 50;
        if (selectedSection === 'CHEAP') matchesSection = Number(item.price) < 50;
        if (selectedSection === 'RECENT') {
            const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
            matchesSection = item.createdAt > oneWeekAgo;
        }

        // Tag Filters
        const matchesTags = selectedTags.length === 0 || selectedTags.every(tag => item.tags?.includes(tag));

        return matchesSearch && matchesCategory && matchesCondition && matchesPrice && matchesSection && matchesTags;
    }).sort((a: MarketplaceItem, b: MarketplaceItem) => {
        if (sortOrder === 'PRICE_ASC') return a.price - b.price;
        if (sortOrder === 'PRICE_DESC') return b.price - a.price;
        return b.createdAt - a.createdAt; // NEWEST
    });

    const displayedItems = filteredItems.slice(0, visibleCount);

    if (loading) return <div className="flex justify-center p-20"><Loader2 className="animate-spin text-indigo-500" size={32}/></div>;

    return (
        <div className="pb-20 max-w-7xl mx-auto px-2 md:px-6 pt-4">
            
            {/* Header with Cart & Search */}
            <div className="sticky top-0 z-30 bg-black/95 backdrop-blur-md pb-4 pt-2 -mx-2 px-2 md:-mx-6 md:px-6 border-b border-slate-800/50 mb-4">
                <div className="flex justify-between items-center mb-4">
                    <div>
                        <h1 className="text-xl md:text-2xl font-bold text-white flex items-center gap-2 font-serif tracking-wide">
                            <ShoppingBag className="text-indigo-400" size={24}/> 
                            Marketplace
                        </h1>
                    </div>
                    <div className="flex items-center gap-3">
                        <Link to="/sell" className="bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-full font-bold text-xs md:text-sm border border-slate-700 transition-all">
                            + Vender
                        </Link>
                        <Link to="/cart" className="relative p-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-full transition-all shadow-lg shadow-indigo-500/20">
                            <ShoppingCart size={20} />
                            {cart.length > 0 && (
                                <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 border-2 border-black rounded-full flex items-center justify-center text-[10px] font-bold">
                                    {cart.length}
                                </span>
                            )}
                        </Link>
                    </div>
                </div>

                <div className="flex gap-2">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-2.5 text-slate-500" size={18}/>
                        <input 
                            type="text" 
                            placeholder="¿Qué estás buscando?" 
                            value={search} 
                            onChange={e => setSearch(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-800 rounded-full pl-10 pr-4 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
                        />
                    </div>
                    <button 
                        onClick={() => setShowFilters(true)}
                        className="bg-slate-900 border border-slate-800 text-slate-300 px-3 py-2 rounded-full flex items-center justify-center gap-2 hover:bg-slate-800 transition-colors"
                    >
                        <SlidersHorizontal size={18}/>
                        <span className="hidden md:inline text-xs font-bold">Filtros</span>
                    </button>
                </div>

                {/* Section Tabs */}
                <div className="flex gap-4 overflow-x-auto py-2 border-b border-slate-800/30 scrollbar-hide mb-2">
                    {[
                        { id: 'TODOS', label: 'Todo', icon: <ShoppingBag size={14}/> },
                        { id: 'FLASH', label: 'Ventas Flash', icon: <Tag size={14} className="text-red-500"/> },
                        { id: 'BEST', label: 'Lo más vendido', icon: <Star size={14} className="text-amber-400"/> },
                        { id: 'RECENT', label: 'Recientes', icon: <Loader2 size={14} className="text-blue-400"/> },
                        { id: 'POPULAR', label: 'Popular', icon: <Filter size={14} className="text-purple-400"/> },
                        { id: 'CHEAP', label: 'Económicos', icon: <ArrowDownUp size={14} className="text-green-400"/> },
                    ].map(section => (
                        <button
                            key={section.id}
                            onClick={() => {setSelectedSection(section.id as any); setVisibleCount(20);}}
                            className={`flex items-center gap-2 whitespace-nowrap px-3 py-2 rounded-lg text-xs font-bold transition-all ${
                                selectedSection === section.id 
                                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' 
                                : 'text-slate-400 hover:text-white hover:bg-slate-800'
                            }`}
                        >
                            {section.icon}
                            {section.label}
                        </button>
                    ))}
                </div>

                {/* Category Pills */}
                <div className="flex gap-2 overflow-x-auto py-3 scrollbar-hide">
                    {categories.map(cat => (
                        <button 
                            key={cat}
                            onClick={() => setSelectedCategory(cat)}
                            className={`whitespace-nowrap px-4 py-1.5 rounded-full text-xs font-bold border transition-all ${
                                selectedCategory === cat 
                                ? 'bg-white text-black border-white' 
                                : 'bg-slate-900 text-slate-400 border-slate-800 hover:border-slate-600'
                            }`}
                        >
                            {cat}
                        </button>
                    ))}
                </div>
            </div>

            {/* Filter Drawer (Mobile/Desktop Overlay) */}
            {showFilters && (
                <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm animate-in fade-in">
                    <div className="w-80 bg-slate-900 h-full border-l border-slate-800 p-6 overflow-y-auto animate-in slide-in-from-right shadow-2xl">
                        <div className="flex justify-between items-center mb-8">
                            <h3 className="text-lg font-bold text-white flex items-center gap-2"><Filter size={20}/> Filtros</h3>
                            <button onClick={() => setShowFilters(false)} className="p-1 hover:bg-slate-800 rounded-full"><X/></button>
                        </div>

                        <div className="space-y-6">
                            <div>
                                <label className="text-xs font-bold text-slate-500 uppercase mb-3 block">Ordenar Por</label>
                                <select 
                                    value={sortOrder} 
                                    onChange={(e) => setSortOrder(e.target.value as any)}
                                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 outline-none"
                                >
                                    <option value="NEWEST">Más Recientes</option>
                                    <option value="PRICE_ASC">Precio: Bajo a Alto</option>
                                    <option value="PRICE_DESC">Precio: Alto a Bajo</option>
                                </select>
                            </div>

                            <div>
                                <label className="text-xs font-bold text-slate-500 uppercase mb-3 block">Precio Máximo ({priceRange.max} $)</label>
                                <input 
                                    type="range" 
                                    min="0" 
                                    max="100000" 
                                    step="100"
                                    value={priceRange.max}
                                    onChange={(e) => setPriceRange({...priceRange, max: parseInt(e.target.value)})}
                                    className="w-full accent-indigo-500 h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer"
                                />
                                <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                                    <span>0 $</span>
                                    <span>100000+ $</span>
                                </div>
                            </div>

                            <div>
                                <label className="text-xs font-bold text-slate-500 uppercase mb-3 block">Etiquetas Personalizadas</label>
                                <div className="flex flex-wrap gap-2">
                                    {allTags.map(tag => (
                                        <button 
                                            key={tag}
                                            onClick={() => {
                                                if (selectedTags.includes(tag)) {
                                                    setSelectedTags(selectedTags.filter(t => t !== tag));
                                                } else {
                                                    setSelectedTags([...selectedTags, tag]);
                                                }
                                            }}
                                            className={`px-3 py-1 rounded-full text-[10px] font-bold border transition-all ${
                                                selectedTags.includes(tag) 
                                                ? 'bg-purple-600 border-purple-600 text-white' 
                                                : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-600'
                                            }`}
                                        >
                                            {tag}
                                        </button>
                                    ))}
                                    {allTags.length === 0 && <p className="text-[10px] text-slate-600 italic">No hay etiquetas disponibles</p>}
                                </div>
                            </div>

                            <div>
                                <label className="text-xs font-bold text-slate-500 uppercase mb-3 block">Condición</label>
                                <div className="flex flex-wrap gap-2">
                                    {['TODOS', 'NUEVO', 'USADO', 'REACONDICIONADO'].map(c => (
                                        <button 
                                            key={c}
                                            onClick={() => setCondition(c)}
                                            className={`px-3 py-1 rounded-md text-xs font-bold border ${condition === c ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-slate-950 border-slate-800 text-slate-400'}`}
                                        >
                                            {c}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="mt-10 pt-6 border-t border-slate-800">
                            <button 
                                onClick={() => setShowFilters(false)}
                                className="w-full bg-white text-black font-bold py-3 rounded-xl hover:bg-slate-200 transition-colors"
                            >
                                Ver {filteredItems.length} Resultados
                            </button>
                        </div>
                    </div>
                    <div className="flex-1" onClick={() => setShowFilters(false)}></div>
                </div>
            )}

            {/* Results Grid - High Density / Shein Style */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3 md:gap-6">
                {displayedItems.map(item => (
                    <Link key={item.id} to={`/marketplace/${item.id}`} className="group flex flex-col">
                        <div className="relative aspect-[3/4] bg-slate-800 rounded-lg overflow-hidden mb-2">
                            {item.images && item.images.length > 0 ? (
                                <img 
                                    src={item.images[0]} 
                                    className={`w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ${item.status === 'AGOTADO' || (item.stock === 0) ? 'grayscale opacity-50' : ''}`} 
                                    loading="lazy"
                                    referrerPolicy="no-referrer"
                                />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center text-slate-700"><ShoppingBag size={32}/></div>
                            )}
                            
                            {/* Tags Overlay */}
                            <div className="absolute top-0 left-0 p-1.5 flex flex-col gap-1 items-start">
                                {item.discountPercent && item.discountPercent > 0 ? (
                                    <span className="bg-red-600 text-white text-[10px] font-black px-2 py-1 rounded-md shadow-xl shadow-red-900/40 border border-red-500/30 animate-pulse">
                                        -{item.discountPercent}%
                                    </span>
                                ) : null}
                                {item.isFlashSale && (
                                    <span className="bg-amber-500 text-black text-[9px] font-black px-1.5 py-0.5 rounded-sm flex items-center gap-1">
                                        ⚡ FLASH
                                    </span>
                                )}
                                {item.condition === 'NUEVO' && (
                                    <span className="bg-black/70 backdrop-blur-sm text-white text-[9px] font-bold px-1.5 py-0.5 rounded-sm">
                                        NUEVO
                                    </span>
                                )}
                            </div>

                            {/* Stock Status */}
                            <div className="absolute bottom-0 left-0 right-0 p-1.5 pointer-events-none">
                                {item.stock === 0 || item.status === 'AGOTADO' ? (
                                    <div className="bg-black/80 backdrop-blur-md text-white text-[10px] font-black py-1 text-center rounded-md border border-white/10 uppercase tracking-tighter">
                                        Agotado
                                    </div>
                                ) : item.stock && item.stock <= 5 ? (
                                    <div className="bg-red-600/90 backdrop-blur-md text-white text-[9px] font-black py-1 text-center rounded-md border border-red-400/30 uppercase tracking-tighter animate-pulse">
                                        ¡Casi Agotado! ({item.stock})
                                    </div>
                                ) : null}
                            </div>
                        </div>

                        <div className="flex flex-col gap-0.5 px-1">
                            <div className="flex items-baseline gap-2">
                                <span className={`font-bold text-sm md:text-base ${item.discountPercent ? 'text-red-500' : 'text-white'}`}>
                                    {item.price} $
                                </span>
                                {item.discountPercent && item.discountPercent > 0 && (
                                    <span className="text-[10px] text-slate-500 line-through">
                                        {item.originalPrice}
                                    </span>
                                )}
                            </div>
                            <h3 className="text-xs text-slate-300 line-clamp-2 leading-tight min-h-[2.5em]">
                                {item.title}
                            </h3>
                            <div className="flex items-center gap-1 mt-1">
                                <Star size={10} className="text-amber-400" fill="currentColor"/>
                                <span className="text-[10px] text-slate-500">{(item.rating || 0).toFixed(1)} ({item.reviewCount || 0})</span>
                            </div>
                        </div>
                    </Link>
                ))}
            </div>
            
            {/* Pagination / Load More */}
            {filteredItems.length > visibleCount && (
                <div className="flex justify-center mt-10">
                    <button 
                        onClick={() => setVisibleCount(prev => prev + 20)}
                        className="bg-slate-800 hover:bg-slate-700 text-white px-8 py-3 rounded-xl font-bold text-sm transition-all border border-slate-700"
                    >
                        Cargar más artículos
                    </button>
                </div>
            )}
            
            {filteredItems.length === 0 && (
                <div className="text-center py-20 text-slate-500 flex flex-col items-center">
                    <Search size={48} className="mb-4 opacity-30"/>
                    <p className="text-lg font-medium">No encontramos resultados</p>
                    <p className="text-sm">Intenta ajustar los filtros o tu búsqueda.</p>
                    <button 
                        onClick={() => {setSearch(''); setSelectedCategory('TODOS'); setPriceRange({min:0, max:100000});}}
                        className="mt-4 text-indigo-400 hover:text-white underline text-sm"
                    >
                        Limpiar filtros
                    </button>
                </div>
            )}
        </div>
    );
}
