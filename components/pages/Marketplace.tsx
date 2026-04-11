
import React, { useEffect, useState } from 'react';
import { db } from '../../services/db';
import { MarketplaceItem } from '../../types';
import { Link, useNavigate } from '../Router';
import { useCart } from '../../context/CartContext';
import { ShoppingBag, Tag, Loader2, Search, Star, Filter, ShoppingCart, X, ArrowDownUp, SlidersHorizontal, Bell } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export default function Marketplace() {
    const navigate = useNavigate();
    const { cart } = useCart();
    const [items, setItems] = useState<MarketplaceItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [showFilters, setShowFilters] = useState(false);
    const [selectedSection, setSelectedSection] = useState<'TODOS' | 'FLASH' | 'BEST' | 'RECENT' | 'POPULAR' | 'CHEAP'>('TODOS');
    const [visibleCount, setVisibleCount] = useState(20);
    const [pendingCount, setPendingCount] = useState(0);
    const { user } = useAuth();

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

        if (user) {
            db.getSellerOrders(user.id).then(orders => {
                setPendingCount(orders.length);
            });
        }
    }, [user]);

    // Derived Categories & Tags
    const baseCategories = ['TODOS', ...Array.from(new Set(items.map(i => i.category || 'OTRO')))];
    const allTags = Array.from(new Set(items.flatMap(i => i.tags || [])));
    const categories = Array.from(new Set([...baseCategories, ...allTags]));

    const filteredItems = items.filter(item => {
        const matchesSearch = item.title.toLowerCase().includes(search.toLowerCase());
        const matchesCategory = selectedCategory === 'TODOS' || 
                               item.category === selectedCategory || 
                               (item.tags && item.tags.includes(selectedCategory));
        const matchesCondition = condition === 'TODOS' || item.condition === condition;
        const matchesPrice = Number(item.price) >= priceRange.min && Number(item.price) <= priceRange.max;
        
        // Section Filters
        let matchesSection = true;
        if (selectedSection === 'FLASH') matchesSection = !!item.isFlashSale;
        if (selectedSection === 'BEST') matchesSection = (item.salesCount || 0) > 0;
        if (selectedSection === 'POPULAR') matchesSection = (item.popularity || 0) > 0;
        if (selectedSection === 'CHEAP') matchesSection = Number(item.price) < 50;
        if (selectedSection === 'RECENT') {
            const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
            matchesSection = (item.createdAt * 1000) > oneWeekAgo;
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
        <div className="pb-20 bg-[var(--bg-primary)] min-h-screen">
            
            {/* Marketplace Controls */}
            <div className="bg-[var(--bg-secondary)] border-b border-[var(--divider)] px-4 pt-3 pb-3">
                <div className="flex gap-2 mb-3">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" size={16}/>
                        <input 
                            type="text" 
                            placeholder="Buscar en Marketplace" 
                            value={search} 
                            onChange={e => setSearch(e.target.value)}
                            className="w-full bg-[#3a3b3c] border border-[var(--divider)] rounded-full pl-9 pr-4 py-1.5 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] transition-colors"
                        />
                    </div>
                    <button 
                        onClick={() => setShowFilters(true)}
                        className="bg-[#3a3b3c] border border-[var(--divider)] text-[var(--text-primary)] px-3 py-1.5 rounded-full flex items-center justify-center gap-2 hover:bg-[var(--bg-hover)] transition-colors"
                    >
                        <SlidersHorizontal size={16}/>
                        <span className="text-xs font-bold">Filtros</span>
                    </button>
                </div>

                {/* Section Tabs */}
                <div className="flex gap-2 overflow-x-auto scrollbar-hide">
                    {[
                        { id: 'TODOS', label: 'Todo', icon: <ShoppingBag size={14}/> },
                        { id: 'FLASH', label: 'Ofertas', icon: <Tag size={14}/> },
                        { id: 'BEST', label: 'Vendido', icon: <Star size={14}/> },
                        { id: 'RECENT', label: 'Nuevos', icon: <Loader2 size={14}/> },
                        { id: 'POPULAR', label: 'Popular', icon: <Filter size={14}/> },
                        { id: 'CHEAP', label: 'Baratos', icon: <ArrowDownUp size={14}/> },
                    ].map(section => (
                        <button
                            key={section.id}
                            onClick={() => {setSelectedSection(section.id as any); setVisibleCount(20);}}
                            className={`flex items-center gap-1.5 whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                                selectedSection === section.id 
                                ? 'bg-[var(--accent)] text-white' 
                                : 'bg-[#3a3b3c] text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
                            }`}
                        >
                            {section.icon}
                            {section.label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="px-2 pt-3">
                {/* Category Pills */}
                <div className="flex gap-2 overflow-x-auto pb-3 scrollbar-hide">
                    {categories.map(cat => (
                        <button 
                            key={cat}
                            onClick={() => setSelectedCategory(cat)}
                            className={`whitespace-nowrap px-4 py-1.5 rounded-full text-xs font-bold border transition-all ${
                                selectedCategory === cat 
                                ? 'bg-[var(--text-primary)] text-[var(--bg-primary)] border-[var(--text-primary)]' 
                                : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] border-[var(--divider)] hover:border-[var(--text-secondary)]'
                            }`}
                        >
                            {cat}
                        </button>
                    ))}
                </div>

                {/* Results Grid */}
                <div className="grid grid-cols-2 gap-2">
                    {displayedItems.map(item => (
                        <Link key={item.id} to={`/marketplace/${item.id}`} className="bg-[var(--bg-secondary)] rounded-md overflow-hidden border border-[var(--divider)] group flex flex-col">
                            <div className="relative aspect-square bg-[var(--bg-tertiary)] overflow-hidden">
                                {item.images && item.images.length > 0 ? (
                                    <img 
                                        src={item.images[0]} 
                                        className={`w-full h-full object-cover transition-transform duration-500 ${item.status === 'AGOTADO' || (item.stock === 0) ? 'grayscale opacity-50' : ''}`} 
                                        loading="lazy"
                                        referrerPolicy="no-referrer"
                                    />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-[var(--text-secondary)]"><ShoppingBag size={24}/></div>
                                )}
                                
                                {/* Tags Overlay */}
                                <div className="absolute top-1 left-1 flex flex-col gap-1 items-start">
                                    {item.discountPercent && item.discountPercent > 0 ? (
                                        <span className="bg-red-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-sm">
                                            -{item.discountPercent}%
                                        </span>
                                    ) : null}
                                    {item.isFlashSale && (
                                        <span className="bg-amber-500 text-black text-[8px] font-bold px-1 py-0.5 rounded-sm">
                                            ⚡ FLASH
                                        </span>
                                    )}
                                </div>

                                {/* Stock Status */}
                                {(item.stock === 0 || item.status === 'AGOTADO') && (
                                    <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                                        <span className="bg-white/90 text-red-600 font-bold text-[10px] px-2 py-1 rounded-sm uppercase tracking-tighter">
                                            Agotado
                                        </span>
                                    </div>
                                )}
                            </div>

                            <div className="p-2 flex flex-col gap-0.5">
                                <div className="flex items-baseline gap-1.5">
                                    <span className={`font-bold text-sm ${item.discountPercent ? 'text-red-500' : 'text-[var(--text-primary)]'}`}>
                                        {item.price} $
                                    </span>
                                    {item.discountPercent && item.discountPercent > 0 && (
                                        <span className="text-[10px] text-[var(--text-secondary)] line-through">
                                            {item.originalPrice}
                                        </span>
                                    )}
                                </div>
                                <h3 className="text-xs text-[var(--text-primary)] line-clamp-1 font-medium">
                                    {item.title}
                                </h3>
                                <div className="flex items-center gap-1 mt-0.5">
                                    <Star size={10} className="text-amber-500" fill="currentColor"/>
                                    <span className="text-[10px] text-[var(--text-secondary)]">{(item.rating || 0).toFixed(1)}</span>
                                </div>
                            </div>
                        </Link>
                    ))}
                </div>
            </div>
            
            {/* Floating Cart Button */}
            <Link 
                to="/cart" 
                className="fixed bottom-20 right-4 z-50 w-12 h-12 bg-[var(--accent)] text-white rounded-full flex items-center justify-center shadow-lg transition-all active:scale-90"
            >
                <ShoppingCart size={20} />
                {cart.length > 0 && (
                    <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 border-2 border-[var(--bg-primary)] rounded-full flex items-center justify-center text-[10px] font-bold">
                        {cart.length}
                    </span>
                )}
            </Link>

            {/* Pagination / Load More */}
            {filteredItems.length > visibleCount && (
                <div className="flex justify-center mt-6 px-4">
                    <button 
                        onClick={() => setVisibleCount(prev => prev + 20)}
                        className="w-full bg-[var(--bg-secondary)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)] py-2 rounded-md font-bold text-sm transition-all border border-[var(--divider)]"
                    >
                        Ver más
                    </button>
                </div>
            )}
            
            {filteredItems.length === 0 && (
                <div className="text-center py-20 text-[var(--text-secondary)] flex flex-col items-center">
                    <Search size={40} className="mb-3 opacity-20"/>
                    <p className="text-base font-bold text-[var(--text-primary)]">No hay resultados</p>
                    <p className="text-xs">Prueba con otros filtros o búsqueda.</p>
                    <button 
                        onClick={() => {setSearch(''); setSelectedCategory('TODOS'); setPriceRange({min:0, max:100000});}}
                        className="mt-3 text-[var(--accent)] hover:underline text-xs font-bold"
                    >
                        Limpiar filtros
                    </button>
                </div>
            )}

            {/* Filter Drawer */}
            {showFilters && (
                <div className="fixed inset-0 z-[100] flex justify-end bg-black/60 backdrop-blur-sm animate-in fade-in">
                    <div className="w-72 bg-[var(--bg-secondary)] h-full border-l border-[var(--divider)] p-6 overflow-y-auto animate-in slide-in-from-right shadow-2xl">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-lg font-bold text-[var(--text-primary)] flex items-center gap-2"><Filter size={20}/> Filtros</h3>
                            <button onClick={() => setShowFilters(false)} className="p-1 hover:bg-[var(--bg-hover)] rounded-full text-[var(--text-primary)]"><X/></button>
                        </div>

                        <div className="space-y-6">
                            <div>
                                <label className="text-[10px] font-bold text-[var(--text-secondary)] uppercase mb-2 block">Ordenar Por</label>
                                <select 
                                    value={sortOrder} 
                                    onChange={(e) => setSortOrder(e.target.value as any)}
                                    className="w-full bg-[var(--bg-tertiary)] border border-[var(--divider)] rounded-md px-3 py-2 text-sm text-[var(--text-primary)] focus:border-[var(--accent)] outline-none"
                                >
                                    <option value="NEWEST">Más Recientes</option>
                                    <option value="PRICE_ASC">Precio: Bajo a Alto</option>
                                    <option value="PRICE_DESC">Precio: Alto a Bajo</option>
                                </select>
                            </div>

                            <div>
                                <label className="text-[10px] font-bold text-[var(--text-secondary)] uppercase mb-2 block">Precio Máximo ({priceRange.max} $)</label>
                                <input 
                                    type="range" 
                                    min="0" 
                                    max="100000" 
                                    step="100"
                                    value={priceRange.max}
                                    onChange={(e) => setPriceRange({...priceRange, max: parseInt(e.target.value)})}
                                    className="w-full accent-[var(--accent)] h-1.5 bg-[var(--bg-tertiary)] rounded-lg appearance-none cursor-pointer"
                                />
                            </div>

                            <div>
                                <label className="text-[10px] font-bold text-[var(--text-secondary)] uppercase mb-2 block">Condición</label>
                                <div className="flex flex-wrap gap-2">
                                    {['TODOS', 'NUEVO', 'USADO', 'REACONDICIONADO'].map(c => (
                                        <button 
                                            key={c}
                                            onClick={() => setCondition(c)}
                                            className={`px-3 py-1 rounded-md text-xs font-bold border ${condition === c ? 'bg-[var(--accent)] border-[var(--accent)] text-white' : 'bg-[var(--bg-tertiary)] border-[var(--divider)] text-[var(--text-primary)]'}`}
                                        >
                                            {c}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="mt-10 pt-6 border-t border-[var(--divider)]">
                            <button 
                                onClick={() => setShowFilters(false)}
                                className="w-full bg-[var(--accent)] text-white font-bold py-2.5 rounded-md hover:opacity-90 transition-colors"
                            >
                                Ver {filteredItems.length} Resultados
                            </button>
                        </div>
                    </div>
                    <div className="flex-1" onClick={() => setShowFilters(false)}></div>
                </div>
            )}
        </div>
    );
}
