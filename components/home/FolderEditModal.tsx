import React, { useState, useEffect } from 'react';
import { X, DollarSign, SortAsc, Loader2, Save } from 'lucide-react';

interface FolderEditModalProps {
    folder: any;
    initialPrice: number;
    initialSortOrder: string;
    onClose: () => void;
    onSave: (price: number, sortOrder: string) => Promise<void>;
}

const FolderEditModal: React.FC<FolderEditModalProps> = ({ folder, initialPrice, initialSortOrder, onClose, onSave }) => {
    const [price, setPrice] = useState<number>(initialPrice);
    const [sortOrder, setSortOrder] = useState<string>(initialSortOrder);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        setPrice(initialPrice);
        setSortOrder(initialSortOrder);
    }, [folder.relativePath, initialPrice, initialSortOrder]);

    return (
        <div className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in">
            <div className="bg-slate-900 border border-white/10 rounded-[32px] w-full max-w-sm overflow-hidden shadow-2xl animate-in zoom-in-95">
                <div className="p-6 bg-slate-950 border-b border-white/5 flex justify-between items-center">
                    <div>
                        <h3 className="font-black text-white uppercase text-xs tracking-widest">Configurar Carpeta</h3>
                        <p className="text-[10px] text-indigo-400 font-bold uppercase truncate max-w-[200px]">{folder.name}</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-full text-slate-500"><X size={20}/></button>
                </div>
                <div className="p-6 space-y-6">
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase ml-1">Precio Sugerido ($)</label>
                        <div className="relative">
                            < DollarSign className="absolute left-4 top-3.5 text-emerald-500" size={18}/>
                            <input 
                                type="number" step="0.1" value={price} onChange={e => setPrice(parseFloat(e.target.value))}
                                className="w-full bg-slate-950 border border-slate-800 rounded-2xl pl-10 pr-4 py-4 text-white font-black text-2xl focus:border-emerald-500 outline-none transition-all shadow-inner"
                            />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase ml-1">Orden de la Colección</label>
                        <div className="relative">
                            <SortAsc className="absolute left-4 top-3.5 text-indigo-400" size={18}/>
                            <select 
                                value={sortOrder} onChange={e => setSortOrder(e.target.value)}
                                className="w-full bg-slate-950 border border-slate-800 rounded-2xl pl-10 pr-4 py-4 text-white font-black text-xs uppercase focus:border-indigo-500 outline-none transition-all shadow-inner appearance-none"
                            >
                                <option value="LATEST">Recientes (Default)</option>
                                <option value="ALPHA">Alfabético (A-Z)</option>
                                <option value="RANDOM">Aleatorio</option>
                            </select>
                        </div>
                    </div>
                    <div className="p-4 bg-indigo-500/10 rounded-2xl border border-indigo-500/20">
                         <p className="text-[9px] text-indigo-300 leading-snug font-bold uppercase">Esto aplicará recursivamente a todos los videos y subcarpetas dentro de: <span className="text-white italic">{folder.name}</span></p>
                    </div>
                    <button 
                        onClick={() => { setLoading(true); onSave(price, sortOrder).finally(() => setLoading(false)); }} 
                        disabled={loading} 
                        className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 text-white font-black py-4 rounded-2xl shadow-xl flex items-center justify-center gap-2 active:scale-95 transition-all text-xs uppercase tracking-widest"
                    >
                        {loading ? <Loader2 size={16} className="animate-spin"/> : <Save size={16}/>} Aplicar a Jerarquía
                    </button>
                </div>
            </div>
        </div>
    );
};

export default FolderEditModal;
