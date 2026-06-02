import React, { useState, useEffect } from 'react';
import { X, DollarSign, SortAsc, Loader2, Save } from 'lucide-react';

interface FolderEditModalProps {
    folder: any;
    initialPrice: number;
    initialSortOrder: string;
    onClose: () => void;
    onSave: (price: number, sortOrder: string, isUnified: boolean) => Promise<void>;
}

const FolderEditModal: React.FC<FolderEditModalProps> = ({ folder, initialPrice, initialSortOrder, onClose, onSave }) => {
    const [price, setPrice] = useState<number>(initialPrice);
    const [isAuto, setIsAuto] = useState<boolean>(initialPrice === -1);
    const [sortOrder, setSortOrder] = useState<string>(initialSortOrder);
    const [isUnified, setIsUnified] = useState<boolean>(!!folder.isUnified);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        setPrice(initialPrice);
        setIsAuto(initialPrice === -1);
        setSortOrder(initialSortOrder);
        setIsUnified(!!folder.isUnified);
    }, [folder.relativePath, initialPrice, initialSortOrder, folder.isUnified]);

    const handleToggleAuto = (checked: boolean) => {
        setIsAuto(checked);
        if (checked) {
            setPrice(-1);
        } else {
            setPrice(1.0);
        }
    };

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
                        <div className="flex items-center justify-between ml-1">
                            <label className="text-[10px] font-black text-slate-500 uppercase">Precio Sugerido ($)</label>
                            <label className="flex items-center gap-1 cursor-pointer">
                                <input 
                                    type="checkbox" 
                                    checked={isAuto} 
                                    onChange={(e) => handleToggleAuto(e.target.checked)}
                                    className="w-3.5 h-3.5 text-indigo-500 bg-slate-950 border-slate-800 rounded accent-indigo-500 cursor-pointer"
                                />
                                <span className="text-[10px] font-black text-indigo-400 uppercase">AUTO</span>
                            </label>
                        </div>
                        <div className="relative">
                            <DollarSign className="absolute left-4 top-3.5 text-emerald-500" size={18}/>
                            {isAuto ? (
                                <div className="w-full bg-slate-950 border border-slate-800 rounded-2xl pl-10 pr-4 py-4 text-indigo-400 font-extrabold text-xs flex items-center h-[62px]">
                                    Cálculo Automático (ETECSA)
                                </div>
                            ) : (
                                <input 
                                    type="number" step="0.1" value={price} onChange={e => setPrice(parseFloat(e.target.value) || 0)}
                                    className="w-full bg-slate-950 border border-slate-800 rounded-2xl pl-10 pr-4 py-4 text-white font-black text-2xl focus:border-emerald-500 outline-none transition-all shadow-inner"
                                />
                            )}
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
                    <div className="space-y-2">
                        <label className="flex items-center gap-2.5 cursor-pointer p-3 rounded-2xl bg-slate-950 border border-slate-800 hover:border-indigo-500 transition-all">
                            <input
                                type="checkbox"
                                checked={isUnified}
                                onChange={(e) => setIsUnified(e.target.checked)}
                                className="w-4 h-4 rounded text-[#1877f2] bg-slate-900 border-slate-800 cursor-pointer accent-[#1877f2]"
                            />
                            <div>
                                <span className="text-xs font-bold text-white block">Unificar como grupo</span>
                                <span className="text-[9px] text-slate-400 block">Todas las publicaciones en subcarpetas se integran como contenido unificado de este grupo.</span>
                            </div>
                        </label>
                    </div>
                    <div className="p-4 bg-indigo-500/10 rounded-2xl border border-indigo-500/20">
                         <p className="text-[9px] text-indigo-300 leading-snug font-bold uppercase">Esto aplicará recursivamente a todos los videos y subcarpetas dentro de: <span className="text-white italic">{folder.name}</span></p>
                    </div>
                    <button 
                        onClick={() => { setLoading(true); onSave(price, sortOrder, isUnified).finally(() => setLoading(false)); }} 
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
