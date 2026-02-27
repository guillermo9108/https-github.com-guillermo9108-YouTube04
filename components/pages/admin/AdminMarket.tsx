
import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../../../services/db';
import { MarketplaceItem } from '../../../types';
import { useToast } from '../../../context/ToastContext';
import { Trash2, Search, Filter, Package, Tag, AlertCircle } from 'lucide-react';

export default function AdminMarket() {
    const toast = useToast();
    const [marketItems, setMarketItems] = useState<MarketplaceItem[]>([]);
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState<'ALL' | 'ACTIVO' | 'AGOTADO' | 'ELIMINADO'>('ALL');

    const loadItems = () => {
        db.adminGetMarketplaceItems().then(setMarketItems);
    };

    useEffect(() => {
        loadItems();
    }, []);

    const handleDeleteListing = async (itemId: string) => {
        if(!confirm("¿Estás seguro de eliminar este artículo?")) return;
        try {
            await db.adminDeleteListing(itemId);
            toast.success("Artículo eliminado");
            loadItems();
        } catch(e: any) {
            toast.error("Error: " + e.message);
        }
    };

    const filteredItems = useMemo(() => {
        return marketItems.filter(item => {
            const matchesSearch = item.title.toLowerCase().includes(search.toLowerCase()) || 
                                  item.sellerName.toLowerCase().includes(search.toLowerCase());
            const matchesFilter = filter === 'ALL' || item.status === filter;
            return matchesSearch && matchesFilter;
        });
    }, [marketItems, search, filter]);

    return (
        <div className="space-y-6 animate-in fade-in">
            {/* Header Controls */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-900 p-4 rounded-xl border border-slate-800">
                <div>
                    <h3 className="text-xl font-bold text-white flex items-center gap-2"><Package size={22} className="text-indigo-400"/> Gestión Marketplace</h3>
                    <p className="text-xs text-slate-400">{marketItems.length} artículos totales</p>
                </div>
                
                <div className="flex flex-col md:flex-row gap-3 w-full md:w-auto">
                    <div className="relative">
                        <Search size={16} className="absolute left-3 top-2.5 text-slate-500"/>
                        <input 
                            type="text" 
                            placeholder="Buscar producto o vendedor..." 
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="bg-slate-950 border border-slate-700 rounded-lg pl-9 pr-4 py-2 text-sm text-white focus:border-indigo-500 outline-none w-full md:w-64"
                        />
                    </div>
                    
                    <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-700">
                        {['ALL', 'ACTIVO', 'AGOTADO'].map((f: any) => (
                            <button 
                                key={f}
                                onClick={() => setFilter(f)}
                                className={`px-3 py-1.5 rounded-md text-xs font-bold transition-colors ${filter === f ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
                            >
                                {f === 'ALL' ? 'Todos' : f}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Grid */}
            {filteredItems.length === 0 ? (
                <div className="text-center py-20 text-slate-500 bg-slate-900/50 rounded-xl border border-slate-800 border-dashed">
                    <Package size={48} className="mx-auto mb-4 opacity-50"/>
                    <p>No se encontraron artículos con estos filtros.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredItems.map(item => (
                        <div key={item.id} className={`bg-slate-900 p-4 rounded-xl border flex items-start gap-4 transition-all hover:bg-slate-800/50 ${item.status === 'ELIMINADO' ? 'border-red-900/30 opacity-60' : 'border-slate-800'}`}>
                            <div className="relative w-20 h-20 bg-black rounded-lg overflow-hidden shrink-0 border border-slate-700">
                                {item.images && item.images[0] ? (
                                    <img src={item.images[0]} className="w-full h-full object-cover"/>
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-slate-600"><Package size={24}/></div>
                                )}
                                {item.discountPercent && item.discountPercent > 0 ? (
                                    <div className="absolute top-0 right-0 bg-red-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-bl">-{item.discountPercent}%</div>
                                ) : null}
                            </div>
                            
                            <div className="flex-1 min-w-0">
                                <div className="flex justify-between items-start">
                                    <h4 className="font-bold text-white truncate text-sm" title={item.title}>{item.title}</h4>
                                    {item.status !== 'ELIMINADO' && (
                                        <button onClick={() => handleDeleteListing(item.id)} className="text-slate-500 hover:text-red-500 p-1 -mt-1 -mr-2" title="Eliminar"><Trash2 size={16}/></button>
                                    )}
                                </div>
                                
                                <div className="text-xs text-slate-400 mt-0.5 mb-2 flex items-center gap-1">
                                    <span className="font-medium text-indigo-300">@{item.sellerName}</span>
                                    <span className="text-slate-600">•</span>
                                    <span>Stock: {item.stock}</span>
                                </div>

                                <div className="flex justify-between items-center mt-2">
                                    <div className="font-mono text-emerald-400 font-bold">{item.price} $</div>
                                    <span className={`text-[9px] font-bold px-2 py-0.5 rounded uppercase ${
                                        item.status === 'ACTIVO' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 
                                        item.status === 'AGOTADO' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' : 
                                        'bg-red-500/10 text-red-400 border border-red-500/20'
                                    }`}>
                                        {item.status}
                                    </span>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
