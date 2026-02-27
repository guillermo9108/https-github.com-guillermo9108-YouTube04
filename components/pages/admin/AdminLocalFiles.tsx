import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../../../services/db';
import { Video, Category, SystemSettings, SmartCleanerResult } from '../../../types';
import { useToast } from '../../../context/ToastContext';
import { 
    HardDrive, Trash2, Wand2, Loader2, 
    PieChart, Database, Eye, ShieldAlert, Zap, AlertTriangle, X, Info, 
    FolderTree, CheckCircle, TrendingUp, Activity, Filter, Search,
    ArrowUpRight, BarChart3, Layers, FileVideo, Shield, RefreshCw,
    AlertCircle, Gauge, ChevronRight, Download, Server, Edit3, DollarSign, Save, Percent, Heart, ThumbsDown,
    Brush, Wrench, Settings, CheckCircle2
} from 'lucide-react';

interface CategoryEditModalProps {
    category: Category;
    onClose: () => void;
    onSave: (newPrice: number, syncVideos: boolean) => Promise<void>;
}

const CategoryPriceModal: React.FC<CategoryEditModalProps> = ({ category, onClose, onSave }) => {
    const [price, setPrice] = useState(category.price);
    const [sync, setSync] = useState(false);
    const [loading, setLoading] = useState(false);

    const handleSave = async () => {
        setLoading(true);
        try {
            await onSave(price, sync);
            onClose();
        } finally { setLoading(false); }
    };

    return (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in">
            <div className="bg-slate-900 border border-white/10 rounded-[32px] w-full max-w-sm overflow-hidden shadow-2xl animate-in zoom-in-95">
                <div className="p-6 bg-slate-950 border-b border-white/5 flex justify-between items-center">
                    <div>
                        <h3 className="font-black text-white uppercase text-xs tracking-widest">Ajustar Precio</h3>
                        <p className="text-[10px] text-indigo-400 font-bold uppercase">{category.name}</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-full text-slate-500"><X size={20}/></button>
                </div>
                <div className="p-6 space-y-6">
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase ml-1">Tarifa de Categoría ($)</label>
                        <div className="relative">
                            <DollarSign className="absolute left-4 top-3.5 text-emerald-500" size={18}/>
                            <input 
                                type="number" step="0.5" value={price} onChange={e => setPrice(parseFloat(e.target.value))}
                                className="w-full bg-slate-950 border border-slate-800 rounded-2xl pl-10 pr-4 py-4 text-white font-black text-2xl focus:border-emerald-500 outline-none transition-all shadow-inner"
                            />
                        </div>
                    </div>
                    <label className="flex items-center gap-3 p-4 bg-slate-950 rounded-2xl border border-slate-800 cursor-pointer group">
                        <input type="checkbox" checked={sync} onChange={e => setSync(e.target.checked)} className="w-5 h-5 rounded accent-indigo-500" />
                        <div className="flex-1">
                            <span className="text-[10px] font-black text-white uppercase group-hover:text-indigo-400 transition-colors">Sincronizar videos existentes</span>
                            <p className="text-[8px] text-slate-500 font-bold uppercase mt-0.5">Aplica este precio a todo lo que ya esté subido.</p>
                        </div>
                    </label>
                    <button onClick={handleSave} disabled={loading} className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 text-white font-black py-4 rounded-2xl shadow-xl flex items-center justify-center gap-2 active:scale-95 transition-all text-xs uppercase tracking-widest">
                        {loading ? <Loader2 size={16} className="animate-spin"/> : <Save size={16}/>} Guardar Cambios
                    </button>
                </div>
            </div>
        </div>
    );
};

export default function AdminLocalFiles() {
    const toast = useToast();
    const [stats, setStats] = useState<any>(null);
    const [settings, setSettings] = useState<SystemSettings | null>(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'HEALTH' | 'EXPLORER' | 'LIBRARIAN'>('HEALTH');
    
    const [editingCategory, setEditingCategory] = useState<Category | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);

    // Advanced Janitor State
    const [cleanupPreview, setCleanupPreview] = useState<SmartCleanerResult | null>(null);
    const [isSearching, setIsSearching] = useState(false);
    const [purgeConfig, setPurgeConfig] = useState({
        category: 'ALL',
        minDays: 30,
        maxViews: 2,
        minLikes: 0,
        maxDislikes: 10,
        maxGbLimit: 50
    });

    const loadData = async () => {
        setLoading(true);
        try {
            const [statRes, setts] = await Promise.all([
                db.request<any>('action=admin_get_local_stats'),
                db.getSystemSettings()
            ]);
            setStats(statRes);
            setSettings(setts);
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    };

    useEffect(() => { loadData(); }, []);

    // Solo mostrar categorías que tengan conteo real de archivos en el disco
    const activeCategories = useMemo(() => {
        if (!settings?.categories || !stats?.category_stats) return [];
        const statsArray = Array.isArray(stats.category_stats) ? stats.category_stats : [];
        const counts = new Map<string, number>(
            statsArray.map((s: any) => [String(s.category).toLowerCase(), Number(s.count)])
        );
        return settings.categories.filter(c => {
            const count = counts.get(c.name.toLowerCase()) || 0;
            return count > 0;
        });
    }, [settings, stats]);

    const handlePriceSave = async (newPrice: number, sync: boolean) => {
        if (!editingCategory) return;
        setIsProcessing(true);
        try {
            await db.updateCategoryPrice(editingCategory.id, newPrice, sync);
            db.invalidateCache('get_videos');
            db.setHomeDirty();
            toast.success("Precio actualizado y caché invalidada");
            loadData();
        } catch (e: any) { toast.error(e.message); }
        finally { setIsProcessing(false); }
    };

    const handleLibrarianAction = async (action: string) => {
        setIsProcessing(true);
        try {
            // @ts-ignore
            await db[action]();
            toast.success("Operación completada");
            db.invalidateCache('get_videos');
            db.setHomeDirty();
            loadData();
        } catch (e: any) { toast.error(e.message); }
        finally { setIsProcessing(false); }
    };

    const handlePreviewPurge = async () => {
        setIsSearching(true);
        try {
            const res = await db.request<SmartCleanerResult>(`action=admin_smart_cleaner_preview`, {
                method: 'POST',
                body: JSON.stringify(purgeConfig)
            });
            setCleanupPreview(res);
            if (res.preview.length === 0) toast.info("No se hallaron videos críticos.");
        } catch (e: any) { toast.error(e.message); }
        finally { setIsSearching(false); }
    };

    const executePurge = async () => {
        if (!cleanupPreview || cleanupPreview.preview.length === 0) return;
        if (!confirm(`¿Eliminar definitivamente ${cleanupPreview.preview.length} videos?`)) return;

        setIsSearching(true);
        try {
            const ids = cleanupPreview.preview.map(v => v.id);
            await db.request(`action=admin_smart_cleaner_execute`, {
                method: 'POST',
                body: JSON.stringify({ videoIds: ids })
            });
            toast.success("Purga masiva terminada");
            setCleanupPreview(null);
            loadData();
        } catch (e: any) { toast.error(e.message); }
        finally { setIsSearching(false); }
    };

    const alerts = useMemo(() => {
        const list: any[] = [];
        if (stats?.volumes) {
            stats.volumes.forEach((v: any) => {
                const usage = (v.total - v.free) / v.total;
                if (usage > 0.9) list.push({ level: 'CRITICAL', text: `Disco '${v.name}' al ${Math.round(usage*100)}%. LIBERAR ESPACIO.` });
            });
        }
        return list;
    }, [stats]);

    const TabBtn = ({ id, label, icon: Icon }: any) => (
        <button 
            onClick={() => { setActiveTab(id); setCleanupPreview(null); }} 
            className={`flex-1 py-4 flex flex-col items-center gap-1.5 transition-all border-b-2 font-black text-[9px] uppercase tracking-tighter ${activeTab === id ? 'border-indigo-500 text-indigo-400 bg-indigo-500/[0.03]' : 'border-transparent text-slate-500 hover:text-slate-300'}`}
        >
            <Icon size={18} className={activeTab === id ? 'animate-pulse' : ''} />
            {label}
        </button>
    );

    if (loading) return <div className="flex justify-center p-20"><Loader2 className="animate-spin text-indigo-500" size={32}/></div>;

    return (
        <div className="space-y-6 animate-in fade-in pb-24 max-w-7xl mx-auto px-1">
            
            <div className="flex flex-col md:row justify-between items-center gap-4 bg-slate-900 border border-slate-800 p-6 rounded-[32px] shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none"><Server size={100}/></div>
                <div>
                    <h2 className="text-2xl font-black text-white uppercase italic tracking-tighter flex items-center gap-2">
                        <HardDrive size={24} className="text-indigo-400"/> Monitor de Storage
                    </h2>
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-[0.2em] mt-1">Gestión avanzada de cuotas y precios</p>
                </div>
                <button onClick={loadData} className="p-3 bg-slate-800 hover:bg-slate-700 rounded-xl text-slate-400 active:scale-90 transition-all">
                    <RefreshCw size={18}/>
                </button>
            </div>

            <div className="flex bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl sticky top-[74px] z-30">
                <TabBtn id="HEALTH" label="Estado" icon={Activity} />
                <TabBtn id="EXPLORER" label="Limpieza" icon={Brush} />
                <TabBtn id="LIBRARIAN" label="Janitor" icon={Zap} />
            </div>

            {activeTab === 'HEALTH' && (
                <div className="space-y-6 animate-in zoom-in-95 duration-500">
                    {alerts.map((a, i) => (
                        <div key={i} className="p-4 bg-red-600/10 border border-red-500/30 text-red-400 rounded-2xl flex items-center gap-3 animate-pulse">
                            <AlertTriangle size={20} />
                            <p className="text-[11px] font-black uppercase tracking-widest">{a.text}</p>
                        </div>
                    ))}

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
                            <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2 mb-4"><HardDrive size={14}/> Volúmenes Activos</h4>
                            {stats?.volumes?.map((vol: any, idx: number) => {
                                const usedPercent = Math.round(((vol.total - vol.free) / vol.total) * 100);
                                return (
                                    <div key={idx} className="bg-slate-950 p-4 rounded-2xl border border-slate-800">
                                        <div className="flex justify-between items-center mb-2">
                                            <span className="text-xs font-black text-white uppercase">{vol.name}</span>
                                            <span className={`text-[10px] font-black ${usedPercent > 90 ? 'text-red-500' : 'text-emerald-500'}`}>{usedPercent}%</span>
                                        </div>
                                        <div className="h-2 w-full bg-slate-900 rounded-full overflow-hidden border border-white/5">
                                            <div className={`h-full transition-all duration-1000 ${usedPercent > 90 ? 'bg-red-500' : 'bg-indigo-500'}`} style={{ width: `${usedPercent}%` }}></div>
                                        </div>
                                        <div className="flex justify-between mt-2 text-[9px] font-bold text-slate-500 uppercase tracking-widest">
                                            <span>{vol.free} GB LIBRES</span>
                                            <span className="text-indigo-400">{vol.video_count} Archivos</span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl">
                            <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2 mb-4"><BarChart3 size={14}/> Top Categorías Activas</h4>
                            <div className="space-y-2">
                                {activeCategories.length === 0 ? (
                                    <div className="text-center py-10 opacity-20"><Database size={40} className="mx-auto mb-2"/><p className="text-[10px] font-black uppercase">Sin archivos indexados</p></div>
                                ) : activeCategories.map(cat => (
                                    <div key={cat.id} className="bg-slate-950 p-3 rounded-2xl border border-slate-800 flex items-center justify-between group hover:border-indigo-500/30 transition-all">
                                        <div className="min-w-0">
                                            <span className="text-xs font-black text-white uppercase truncate block">{cat.name}</span>
                                            <div className="flex items-center gap-2 mt-0.5">
                                                <span className="text-[10px] font-mono text-emerald-400 font-bold">{cat.price} $</span>
                                                <span className="text-[8px] text-slate-600 font-black uppercase">Tarifa Base</span>
                                            </div>
                                        </div>
                                        <button 
                                            onClick={() => setEditingCategory(cat)}
                                            className="p-2 bg-slate-900 rounded-xl text-slate-500 hover:text-white hover:bg-indigo-600 transition-all opacity-0 group-hover:opacity-100"
                                        >
                                            <Edit3 size={16}/>
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'EXPLORER' && (
                <div className="space-y-6 animate-in slide-in-from-right-10">
                    <div className="bg-slate-900 border border-slate-800 rounded-[32px] p-6 md:p-8 shadow-xl">
                        <div className="flex items-center gap-3 mb-8">
                            <div className="w-12 h-12 rounded-2xl bg-red-500/10 text-red-500 flex items-center justify-center"><Trash2 size={24}/></div>
                            <div>
                                <h3 className="text-xl font-black text-white uppercase italic tracking-tighter">Purga por Rendimiento</h3>
                                <p className="text-[10px] text-slate-500">Elimina contenido pesado que no genera ingresos.</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                            <div className="space-y-1">
                                <label className="text-[9px] font-black text-slate-500 uppercase ml-1">Vistas Máximas</label>
                                <input type="number" value={purgeConfig.maxViews} onChange={e => setPurgeConfig({...purgeConfig, maxViews: parseInt(e.target.value)})} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white font-black text-sm outline-none" />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[9px] font-black text-slate-500 uppercase ml-1">Límite de Purga (GB)</label>
                                <input type="number" value={purgeConfig.maxGbLimit} onChange={e => setPurgeConfig({...purgeConfig, maxGbLimit: parseInt(e.target.value)})} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-red-400 font-black text-sm outline-none" />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[9px] font-black text-slate-500 uppercase ml-1">Antigüedad (Días)</label>
                                <input type="number" value={purgeConfig.minDays} onChange={e => setPurgeConfig({...purgeConfig, minDays: parseInt(e.target.value)})} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white font-black text-sm outline-none" />
                            </div>
                            <button onClick={handlePreviewPurge} disabled={isSearching} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-3 rounded-2xl font-black text-xs uppercase tracking-widest mt-auto shadow-lg shadow-indigo-900/40 active:scale-95 transition-all">
                                {isSearching ? <Loader2 size={18} className="animate-spin" /> : <RefreshCw size={18} />} Analizar ROI
                            </button>
                        </div>
                    </div>

                    {cleanupPreview && (
                        <div className="bg-slate-900 border border-slate-800 rounded-[32px] overflow-hidden shadow-2xl animate-in fade-in">
                            <div className="p-6 bg-slate-950 border-b border-white/5 flex flex-col md:flex-row justify-between items-center gap-4">
                                <div className="flex items-center gap-6">
                                    <div>
                                        <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest block">Recuperación estimada</span>
                                        <span className="text-2xl font-black text-emerald-400">{cleanupPreview.stats.spaceReclaimed}</span>
                                    </div>
                                    <div className="w-px h-10 bg-white/5"></div>
                                    <div>
                                        <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest block">Archivos Marcados</span>
                                        <span className="text-2xl font-black text-white">{cleanupPreview.preview.length}</span>
                                    </div>
                                </div>
                                <div className="flex gap-2 w-full md:w-auto">
                                    <button onClick={() => setCleanupPreview(null)} className="flex-1 md:flex-none px-6 py-3 bg-slate-800 text-slate-400 font-black text-[10px] uppercase rounded-xl">Cancelar</button>
                                    <button onClick={executePurge} className="flex-1 md:flex-none px-8 py-3 bg-red-600 hover:bg-red-500 text-white font-black text-[10px] uppercase rounded-xl shadow-lg shadow-red-900/40 active:scale-95 transition-all">Ejecutar Purga</button>
                                </div>
                            </div>
                            <div className="max-h-[500px] overflow-y-auto custom-scrollbar">
                                <table className="w-full text-left">
                                    <thead className="bg-slate-950/50 sticky top-0 z-10">
                                        <tr className="text-[9px] font-black text-slate-600 uppercase tracking-widest border-b border-white/5">
                                            <th className="px-6 py-4">Video</th>
                                            <th className="px-6 py-4">Vistas</th>
                                            <th className="px-6 py-4">Peso</th>
                                            <th className="px-6 py-4">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/5">
                                        {cleanupPreview.preview.map((v: any) => (
                                            <tr key={v.id} className="hover:bg-slate-800/30 transition-colors">
                                                <td className="px-6 py-4">
                                                    <span className="text-xs font-bold text-white block truncate max-w-[250px]">{v.title}</span>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-1.5 text-slate-400">
                                                        <Eye size={12}/> <span className="font-mono text-[10px]">{v.views}</span>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <span className="text-[10px] font-mono text-indigo-400 font-bold">{v.size_fmt}</span>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <span className="text-[8px] font-black bg-red-500/10 text-red-400 px-2 py-0.5 rounded uppercase">{v.reason}</span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {activeTab === 'LIBRARIAN' && (
                <div className="space-y-6 animate-in slide-in-from-right-10">
                    <div className="bg-slate-900 border border-slate-800 rounded-[32px] p-6 md:p-10 shadow-2xl relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none"><Zap size={140} className="text-indigo-400" /></div>
                        <div className="flex items-center gap-3 mb-8">
                            <div className="w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center text-white shadow-lg shadow-indigo-900/40"><Zap size={28}/></div>
                            <div>
                                <h3 className="text-xl font-black text-white uppercase italic tracking-tighter">Janitor Librarian V8</h3>
                                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">Sincronización masiva de metadatos y precios</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <button 
                                onClick={() => handleLibrarianAction('smartOrganizeLibrary')} 
                                disabled={isProcessing}
                                className="p-6 bg-slate-950 border border-slate-800 rounded-3xl text-left hover:border-indigo-500/50 transition-all group shadow-xl"
                            >
                                <div className="flex justify-between items-center mb-3">
                                    <div className="p-3 rounded-2xl bg-indigo-500/10 text-indigo-400 group-hover:scale-110 transition-transform"><Wand2 size={24}/></div>
                                    {isProcessing && <Loader2 size={16} className="animate-spin text-indigo-500"/>}
                                </div>
                                <h4 className="text-xs font-black text-white uppercase tracking-widest mb-1">Publicación Inteligente</h4>
                                <p className="text-[10px] text-slate-500 leading-relaxed uppercase font-bold">Mueve videos de PROCESSING a sus categorías finales basándose en la estructura del disco.</p>
                            </button>

                            <button 
                                onClick={() => handleLibrarianAction('reorganizeAllVideos')} 
                                disabled={isProcessing}
                                className="p-6 bg-slate-950 border border-slate-800 rounded-3xl text-left hover:border-emerald-500/50 transition-all group shadow-xl"
                            >
                                <div className="flex justify-between items-center mb-3">
                                    <div className="p-3 rounded-2xl bg-emerald-500/10 text-emerald-400 group-hover:scale-110 transition-transform"><Layers size={24}/></div>
                                    {isProcessing && <Loader2 size={16} className="animate-spin text-emerald-500"/>}
                                </div>
                                <h4 className="text-xs font-black text-white uppercase tracking-widest mb-1">Sincronizar Todo</h4>
                                <p className="text-[10px] text-slate-500 leading-relaxed uppercase font-bold">Recorre TODA la base de datos y actualiza nombres y precios según la configuración actual de Admin.</p>
                            </button>

                            <button 
                                onClick={() => handleLibrarianAction('fixLibraryMetadata')} 
                                disabled={isProcessing}
                                className="p-6 bg-slate-950 border border-slate-800 rounded-3xl text-left hover:border-amber-500/50 transition-all group shadow-xl"
                            >
                                <div className="flex justify-between items-center mb-3">
                                    <div className="p-3 rounded-2xl bg-amber-500/10 text-amber-400 group-hover:scale-110 transition-transform"><AlertCircle size={24}/></div>
                                </div>
                                <h4 className="text-xs font-black text-white uppercase tracking-widest mb-1">Mantenimiento de Rotos</h4>
                                <p className="text-[10px] text-slate-500 leading-relaxed uppercase font-bold">Detecta videos sin miniatura o duración y los devuelve al PASO 2 para ser re-escaneados.</p>
                            </button>

                            <button 
                                onClick={() => handleLibrarianAction('adminRepairDb')} 
                                disabled={isProcessing}
                                className="p-6 bg-slate-950 border border-slate-800 rounded-3xl text-left hover:border-red-500/50 transition-all group shadow-xl"
                            >
                                <div className="flex justify-between items-center mb-3">
                                    <div className="p-3 rounded-2xl bg-red-500/10 text-red-400 group-hover:scale-110 transition-transform"><Database size={24}/></div>
                                </div>
                                <h4 className="text-xs font-black text-white uppercase tracking-widest mb-1">Reparar MariaDB</h4>
                                <p className="text-[10px] text-slate-500 leading-relaxed uppercase font-bold">Asegura que todas las tablas y columnas existan. Vital tras actualizaciones de sistema.</p>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {editingCategory && (
                <CategoryPriceModal 
                    category={editingCategory} 
                    onClose={() => setEditingCategory(null)} 
                    onSave={handlePriceSave} 
                />
            )}
            
            <style>{`
                .custom-scrollbar::-webkit-scrollbar { width: 4px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 10px; }
            `}</style>
        </div>
    );
}