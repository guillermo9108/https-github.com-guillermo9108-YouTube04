import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { db } from '../../services/db';
import { useNavigate, useParams } from '../Router';
import { Save, Tag, Percent, Archive, ArrowLeft, AlertCircle, ShoppingBag } from 'lucide-react';
import { MarketplaceItem } from '../../types';

export default function MarketplaceEdit() {
    const { id } = useParams();
    const { user } = useAuth();
    const navigate = useNavigate();
    const toast = useToast();
    const [loading, setLoading] = useState(true);
    const [item, setItem] = useState<MarketplaceItem | null>(null);

    // Form State
    const [basePrice, setBasePrice] = useState<number | string>(0); 
    const [stock, setStock] = useState<number | string>(1);
    const [discount, setDiscount] = useState<number | string>(0);
    const [title, setTitle] = useState('');
    const [desc, setDesc] = useState('');

    useEffect(() => {
        if (id) {
            db.getMarketplaceItem(id).then((data: MarketplaceItem | null) => {
                if (data) {
                    setItem(data);
                    // Use originalPrice if set (showing discount logic was used), else price
                    const initialPrice = (data.originalPrice && Number(data.originalPrice) > 0) ? Number(data.originalPrice) : Number(data.price);
                    setBasePrice(initialPrice);
                    setStock(data.stock ?? 1);
                    setDiscount(data.discountPercent ?? 0);
                    setTitle(data.title);
                    setDesc(data.description);
                }
                setLoading(false);
            });
        }
    }, [id]);

    const handleSave = async () => {
        if (!user || !item || !id) return;
        
        // Calculamos el precio final que el servidor debe cobrar
        const numBase = Number(basePrice) || 0;
        const numDisc = Number(discount) || 0;
        const finalCalculatedPrice = numBase - (numBase * (numDisc / 100));

        try {
            await db.editListing(id, user.id, {
                title: title,
                description: desc,
                price: finalCalculatedPrice, // IMPORTANTE: Este es el precio de cobro real
                originalPrice: numBase,
                discountPercent: numDisc,
                stock: Number(stock),
            });
            toast.success("Artículo actualizado correctamente");
            navigate(`/marketplace/${id}`);
        } catch (e: any) {
            toast.error("Error: " + e.message);
        }
    };

    if (loading) return <div className="p-10 text-center text-slate-500">Cargando...</div>;
    if (!item || (user && item.sellerId !== user.id)) return <div className="p-10 text-center text-red-500">No autorizado</div>;

    // Calculate preview of final price for UI only
    const numBase = Number(basePrice) || 0;
    const numDisc = Number(discount) || 0;
    const finalPricePreview = numBase - (numBase * (numDisc / 100));

    return (
        <div className="max-w-md mx-auto px-4 pt-6 pb-24 md:pb-10">
            <button onClick={() => navigate(`/marketplace/${id}`)} className="flex items-center gap-2 text-slate-400 hover:text-white mb-6 bg-slate-900 px-3 py-1.5 rounded-full border border-slate-800 text-sm">
                <ArrowLeft size={16}/> Volver
            </button>
            
            <h1 className="text-2xl font-bold text-white mb-6 flex items-center gap-2">
                <ShoppingBag className="text-indigo-400"/> Editar Artículo
            </h1>
            
            <div className="bg-slate-900/50 p-4 md:p-6 rounded-2xl border border-slate-800 space-y-6 shadow-xl">
                
                {/* Header Preview */}
                <div className="flex items-start gap-4 border-b border-slate-800 pb-4">
                    <div className="w-20 h-20 rounded-lg overflow-hidden border border-slate-700 shrink-0 bg-black">
                        {item.images && item.images[0] && <img src={item.images[0]} className="w-full h-full object-cover" alt="" />}
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="text-[10px] uppercase font-bold text-slate-500 mb-1">Título del Producto</div>
                        <input 
                            type="text" 
                            value={title} 
                            onChange={(e) => setTitle(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white font-bold mb-2 focus:border-indigo-500 outline-none"
                        />
                        <span className={`text-[10px] px-2 py-1 rounded-md font-bold uppercase tracking-wider ${item.status === 'ACTIVO' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                            {item.status}
                        </span>
                    </div>
                </div>

                {/* Price Management - Mobile Optimized Grid */}
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                    <h3 className="text-sm font-bold text-slate-300 mb-4 flex items-center gap-2"><Tag size={16}/> Gestión de Precio</h3>
                    
                    <div className="mb-4">
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Precio Base ($)</label>
                        <input 
                            type="number" 
                            min="0"
                            value={basePrice} 
                            onChange={e => setBasePrice(e.target.value)} 
                            className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white font-mono font-bold text-lg focus:border-indigo-500 outline-none"
                        />
                    </div>

                    <div className="mb-4">
                        <div className="flex justify-between mb-2">
                            <label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-1"><Percent size={12}/> Descuento</label>
                            <span className="text-xs font-bold text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded">{numDisc}% OFF</span>
                        </div>
                        <input 
                            type="range" 
                            min="0" 
                            max="90" 
                            step="5"
                            value={numDisc} 
                            onChange={e => setDiscount(e.target.value)} 
                            className="w-full h-4 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500 touch-none"
                        />
                    </div>

                    <div className="flex flex-col items-center bg-indigo-600/10 p-4 rounded-xl border border-indigo-500/20 mt-2">
                        <span className="text-xs text-indigo-300 font-bold uppercase tracking-widest mb-1">Precio Final de Venta</span>
                        <span className="text-3xl font-black text-white tracking-tight">{finalPricePreview.toFixed(2)} $</span>
                        {numDisc > 0 && <span className="text-xs text-slate-400 line-through mt-1">{Number(basePrice).toFixed(2)} $</span>}
                    </div>
                </div>

                {/* Stock - Big Buttons for Touch */}
                <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-2 flex items-center gap-2">
                        <Archive size={14}/> Stock Disponible
                    </label>
                    <div className="flex items-center gap-4 bg-slate-950 p-2 rounded-xl border border-slate-800">
                        <button onClick={() => setStock(Math.max(0, Number(stock) - 1))} className="w-14 h-12 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-bold text-xl active:bg-slate-600 transition-colors">-</button>
                        <input 
                            type="number" 
                            min="0"
                            value={stock} 
                            onChange={e => setStock(e.target.value)} 
                            className="flex-1 bg-transparent border-none text-center text-white font-bold text-xl outline-none"
                        />
                        <button onClick={() => setStock(Number(stock) + 1)} className="w-14 h-12 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-bold text-xl active:bg-slate-600 transition-colors">+</button>
                    </div>
                    {Number(stock) === 0 && <div className="text-[10px] text-red-400 mt-2 flex items-center gap-1 bg-red-900/10 p-2 rounded justify-center font-bold"><AlertCircle size={12}/> Se marcará como AGOTADO</div>}
                </div>

                <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Descripción</label>
                    <textarea 
                        rows={5}
                        value={desc}
                        onChange={(e) => setDesc(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl p-4 text-sm text-slate-300 focus:border-indigo-500 outline-none leading-relaxed"
                    />
                </div>

                <div className="pt-4 sticky bottom-4 z-20">
                    <button onClick={handleSave} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2 shadow-xl shadow-indigo-900/30 transition-transform active:scale-95 text-lg">
                        <Save size={20}/> Guardar Cambios
                    </button>
                </div>
            </div>
        </div>
    );
}