
import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../services/db';
import { useNavigate } from '../Router';
import { Upload, X, Tag, DollarSign, Image as ImageIcon, Loader2, Archive, AlertTriangle, ShieldCheck, ChevronRight } from 'lucide-react';

export default function MarketplaceCreate() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    
    const [title, setTitle] = useState('');
    const [desc, setDesc] = useState('');
    const [price, setPrice] = useState('');
    const [stock, setStock] = useState('1');
    const [condition, setCondition] = useState('NUEVO');
    const [category, setCategory] = useState('ELECTRONICA');
    const [images, setImages] = useState<File[]>([]);
    const [previews, setPreviews] = useState<string[]>([]);

    const isVerified = Number(user?.is_verified_seller) === 1;

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            const newFiles = Array.from(e.target.files) as File[];
            setImages([...images, ...newFiles]);
            
            const newPreviews = newFiles.map(file => URL.createObjectURL(file));
            setPreviews([...previews, ...newPreviews]);
        }
    };

    const removeImage = (index: number) => {
        setImages(images.filter((_, i) => i !== index));
        setPreviews(previews.filter((_, i) => i !== index));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return;
        if (images.length === 0) { alert("Por favor añade al menos una imagen"); return; }
        
        setLoading(true);
        try {
            const formData = new FormData();
            formData.append('title', title);
            formData.append('description', desc);
            formData.append('price', price);
            formData.append('stock', stock);
            formData.append('category', category);
            formData.append('condition', condition);
            formData.append('sellerId', user.id);
            images.forEach(img => formData.append('images[]', img));
            
            await db.createListing(formData);
            navigate('/marketplace');
        } catch (e: any) {
            alert("Error: " + e.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="max-w-2xl mx-auto px-4 pt-6 pb-20 animate-in fade-in">
            <h1 className="text-2xl font-black text-white mb-6 uppercase italic tracking-tighter flex items-center gap-3">
                <Archive className="text-indigo-400" /> Vender Artículo
            </h1>

            {/* Aviso de Verificación */}
            {!isVerified && (
                <div className="mb-6 bg-amber-500/10 border border-amber-500/30 p-6 rounded-[32px] flex flex-col md:flex-row items-center justify-between gap-4">
                    <div className="flex items-center gap-4 text-center md:text-left">
                        <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center shrink-0">
                            <AlertTriangle size={24}/>
                        </div>
                        <div>
                            <h4 className="text-amber-500 font-black text-xs uppercase tracking-widest">Cuenta no verificada</h4>
                            <p className="text-slate-400 text-[9px] font-bold uppercase tracking-tight mt-1 max-w-sm">Tus artículos mostrarán una advertencia de riesgo a los compradores hasta que valides tu identidad.</p>
                        </div>
                    </div>
                    <button 
                        type="button"
                        onClick={() => navigate('/profile')}
                        className="flex items-center gap-2 text-amber-500 font-black text-[10px] uppercase hover:underline"
                    >
                        Solicitar Verificación <ChevronRight size={14}/>
                    </button>
                </div>
            )}
            
            <form onSubmit={handleSubmit} className="bg-slate-900 p-8 rounded-[40px] border border-slate-800 space-y-8 shadow-2xl relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none group-hover:scale-110 transition-transform duration-700"><ImageIcon size={140}/></div>
                
                {/* Images */}
                <div className="relative z-10">
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3 ml-1">Fotos del Producto</label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {previews.map((src, i) => (
                            <div key={i} className="relative aspect-square rounded-[24px] overflow-hidden border border-slate-700 group shadow-lg">
                                <img src={src} className="w-full h-full object-cover" />
                                <button type="button" onClick={() => removeImage(i)} className="absolute top-2 right-2 bg-black/60 text-white rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition-all"><X size={14}/></button>
                            </div>
                        ))}
                        <label className="aspect-square bg-slate-950 rounded-[24px] flex flex-col items-center justify-center cursor-pointer hover:bg-slate-800 hover:border-indigo-500/50 transition-all border-2 border-dashed border-slate-800 group shadow-inner">
                            <ImageIcon className="text-slate-600 mb-2 group-hover:scale-110 transition-transform" />
                            <span className="text-[9px] font-black text-slate-500 uppercase">Añadir</span>
                            <input type="file" multiple accept="image/*" onChange={handleImageChange} className="hidden" />
                        </label>
                    </div>
                </div>

                {/* Details */}
                <div className="relative z-10">
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1 ml-1">Nombre del Artículo</label>
                    <input required type="text" value={title} onChange={e => setTitle(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-6 py-4 text-white font-bold outline-none focus:border-indigo-500 transition-all shadow-inner" placeholder="Ej: PlayStation 5 con 2 mandos" />
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 relative z-10">
                    <div>
                         <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1 ml-1">Precio sugerido ($)</label>
                         <div className="relative">
                             <DollarSign size={18} className="absolute left-4 top-3.5 text-emerald-500"/>
                             <input required type="number" min="0" value={price} onChange={e => setPrice(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-2xl pl-11 pr-4 py-4 text-white font-black text-xl outline-none focus:border-indigo-500 transition-all shadow-inner" />
                         </div>
                    </div>
                    <div>
                         <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1 ml-1">Stock Disponible</label>
                         <div className="relative">
                            <Archive size={18} className="absolute left-4 top-3.5 text-slate-600"/>
                            <input required type="number" min="1" value={stock} onChange={e => setStock(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-2xl pl-11 pr-4 py-4 text-white font-bold outline-none focus:border-indigo-500 transition-all shadow-inner" />
                         </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 relative z-10">
                    <div>
                         <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1 ml-1">Categoría</label>
                         <div className="relative">
                            <Tag size={16} className="absolute left-4 top-4 text-slate-600 pointer-events-none"/>
                            <select value={category} onChange={e => setCategory(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-2xl pl-11 pr-4 py-4 text-white font-black text-xs uppercase appearance-none outline-none focus:border-indigo-500 transition-all cursor-pointer">
                                <option value="ELECTRONICA">Electrónica</option>
                                <option value="ROPA">Ropa</option>
                                <option value="HOGAR">Hogar</option>
                                <option value="JUGUETES">Juguetes</option>
                                <option value="OTRO">Otro</option>
                            </select>
                         </div>
                    </div>
                    <div>
                         <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1 ml-1">Estado Físico</label>
                         <div className="relative">
                            <ShieldCheck size={16} className="absolute left-4 top-4 text-slate-600 pointer-events-none"/>
                            <select value={condition} onChange={e => setCondition(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-2xl pl-11 pr-4 py-4 text-white font-black text-xs uppercase appearance-none outline-none focus:border-indigo-500 transition-all cursor-pointer">
                                <option value="NUEVO">Nuevo de Paquete</option>
                                <option value="USADO">Usado (Buen estado)</option>
                                <option value="REACONDICIONADO">Reacondicionado</option>
                            </select>
                         </div>
                    </div>
                </div>

                <div className="relative z-10">
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1 ml-1">Descripción Detallada</label>
                    <textarea required rows={4} value={desc} onChange={e => setDesc(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-[24px] px-6 py-5 text-white text-sm outline-none focus:border-indigo-500 transition-all shadow-inner resize-none" placeholder="Habla sobre el producto, garantía, detalles..." />
                </div>

                <button type="submit" disabled={loading} className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-black py-5 rounded-[24px] shadow-xl flex items-center justify-center gap-3 uppercase text-xs tracking-[0.2em] active:scale-95 transition-all mt-4">
                    {loading ? <Loader2 className="animate-spin" /> : <Upload size={20} />}
                    Publicar Anuncio
                </button>
            </form>
        </div>
    );
}
