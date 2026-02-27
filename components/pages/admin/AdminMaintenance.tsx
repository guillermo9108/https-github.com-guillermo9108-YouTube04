import React, { useState, useEffect, useMemo, useRef } from 'react';
import { db } from '../../../services/db';
import { VideoCategory, SmartCleanerResult } from '../../../types';
import { useToast } from '../../../context/ToastContext';
import { 
    Wrench, Trash2, Database, Brush, Activity, Server, 
    HardDrive, CheckCircle, Percent, Clock, Eye, ThumbsDown, 
    Settings2, Info, AlertTriangle, Loader2, Play, Check, X, ShieldAlert, Zap, FileText, RefreshCw, BarChart3, HardDriveDownload, Terminal, Copy, Cpu
} from 'lucide-react';

const SystemHealthCard = ({ icon: Icon, label, status, color }: any) => (
    <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 flex flex-col items-center text-center gap-2">
        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${color} bg-opacity-20`}>
            <Icon size={20} className={color.replace('bg-', 'text-')} />
        </div>
        <div>
            <div className="text-xs text-slate-500 uppercase font-bold">{label}</div>
            <div className="text-sm font-bold text-white flex items-center justify-center gap-1">
                {status} <CheckCircle size={12} className="text-emerald-500"/>
            </div>
        </div>
    </div>
);

export default function AdminMaintenance() {
    const toast = useToast();
    const [cleaning, setCleaning] = useState(false);
    const [cleanerPreview, setCleanerPreview] = useState<SmartCleanerResult | null>(null);
    const [logs, setLogs] = useState<string[]>([]);
    const [loadingLogs, setLoadingLogs] = useState(false);
    const [categories, setCategories] = useState<any[]>([]);
    const [stats, setStats] = useState<any>(null);
    
    // Configuración Janitor V7 (Extreme)
    const [config, setConfig] = useState({
        category: 'ALL',
        minDays: 30,
        maxViews: 5,
        minDuration: 0,
        maxGbLimit: 10, 
        maxDeleteLimit: 100
    });

    const [execution, setExecution] = useState<{ progress: number, current: string, total: number } | null>(null);

    const fetchData = async () => {
        setLoadingLogs(true);
        try {
            const [logsRes, adminStats, settings] = await Promise.all([
                db.request<string[]>('action=admin_get_logs'),
                db.getAdminLibraryStats(),
                db.getSystemSettings()
            ]);
            setLogs(logsRes || []);
            setStats(adminStats);
            if (settings.categories) setCategories(settings.categories);
        } catch (e) {} finally {
            setLoadingLogs(false);
        }
    };

    useEffect(() => {
        fetchData();
        const interval = setInterval(() => fetchData(), 20000);
        return () => clearInterval(interval);
    }, []);

    const handleCleanupOrphans = async () => {
        if (!confirm("Esto eliminará físicamente archivos huérfanos del disco. ¿Continuar?")) return;
        setCleaning(true);
        try {
            const res = await db.adminCleanupSystemFiles();
            toast.success(`Limpieza OK: ${res.videos} videos liberados.`);
            fetchData();
        } catch (e: any) { toast.error(e.message); }
        finally { setCleaning(false); }
    };

    const handleRepairDb = async () => {
        setCleaning(true);
        try {
            await db.adminRepairDb();
            toast.success("Estructura de MariaDB sincronizada.");
            fetchData();
        } catch (e: any) { toast.error(e.message); }
        finally { setCleaning(false); }
    };

    const handlePreviewCleaner = async () => {
        setCleaning(true);
        try {
            const res = await db.request<SmartCleanerResult>(`action=admin_smart_cleaner_preview`, {
                method: 'POST',
                body: JSON.stringify(config)
            });
            setCleanerPreview(res);
            if (res.preview.length === 0) toast.info("No se hallaron videos bajo estos criterios.");
        } catch (e: any) { toast.error(e.message); }
        finally { setCleaning(false); }
    };

    const handleExecuteCleaner = async () => {
        if (!cleanerPreview || cleanerPreview.preview.length === 0) return;
        if (!confirm(`Purga Irreversible: ¿Eliminar ${cleanerPreview.preview.length} videos ahora?`)) return;
        
        setCleaning(true);
        const ids = cleanerPreview.preview.map(v => v.id);
        setExecution({ progress: 0, current: 'Iniciando purga física...', total: ids.length });

        try {
            const res = await db.request<{deleted: number}>(`action=admin_smart_cleaner_execute`, {
                method: 'POST',
                body: JSON.stringify({ videoIds: ids })
            });
            toast.success(`Purga terminada: ${res.deleted} eliminados.`);
        } catch (e: any) { toast.error(e.message); }
        finally {
            setExecution(null);
            setCleanerPreview(null);
            setCleaning(false);
            fetchData();
        }
    };

    const copyCronCommand = () => {
        const cmd = `* * * * * php ${window.location.pathname.replace('index.html', '')}api/video_worker.php >> ${window.location.pathname.replace('index.html', '')}api/worker_log.txt 2>&1`;
        navigator.clipboard.writeText(cmd);
        toast.success("Comando copiado al portapapeles");
    };

    return (
        <div className="space-y-6 animate-in fade-in pb-20">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <SystemHealthCard icon={Activity} label="Estado API" status="Online" color="bg-emerald-500" />
                <SystemHealthCard icon={Database} label="Base de Datos" status="Conectado" color="bg-blue-500" />
                <SystemHealthCard icon={Cpu} label="FFmpeg Server" status="Disponible" color="bg-purple-500" />
                <SystemHealthCard icon={Clock} label="Cola Pendiente" status={stats?.pending || 0} color="bg-amber-500" />
            </div>

            {/* SECCIÓN VIDEO WORKER AUTOMÁTICO */}
            <div className="bg-slate-900 border border-indigo-500/30 rounded-[32px] p-6 md:p-8 shadow-2xl relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-6 opacity-5 pointer-events-none group-hover:rotate-12 transition-transform duration-700">
                    <Zap size={140} className="text-indigo-400" />
                </div>
                
                <div className="relative z-10 flex flex-col md:flex-row gap-8">
                    <div className="flex-1 space-y-4">
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center text-white shadow-lg shadow-indigo-900/40">
                                <Server size={28}/>
                            </div>
                            <div>
                                <h3 className="text-xl font-black text-white uppercase italic tracking-tighter">Video Worker Autónomo</h3>
                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Automatización de Servidor (FFmpeg + PHP)</p>
                            </div>
                        </div>
                        
                        <p className="text-xs text-slate-300 leading-relaxed max-w-xl">
                            Para que el servidor procese los videos automáticamente sin que nadie esté conectado, configura una <strong>Tarea Programada (Cron Job)</strong> en tu NAS o Servidor Web con el siguiente comando:
                        </p>

                        <div className="bg-black/60 rounded-2xl p-4 border border-white/5 flex items-center justify-between group/cmd">
                            <code className="text-[10px] font-mono text-indigo-300 break-all leading-tight">
                                php api/video_worker.php
                            </code>
                            <button onClick={copyCronCommand} className="p-2 bg-slate-800 hover:bg-indigo-600 text-slate-400 hover:text-white rounded-xl transition-all active:scale-90">
                                <Copy size={16}/>
                            </button>
                        </div>

                        <div className="flex flex-wrap gap-3">
                            <div className="bg-slate-950 px-4 py-2 rounded-xl border border-white/5 flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Modo CLI: Activo</span>
                            </div>
                            <div className="bg-slate-950 px-4 py-2 rounded-xl border border-white/5 flex items-center gap-2">
                                <Check size={14} className="text-indigo-400"/>
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Auto-Limpieza: OK</span>
                            </div>
                        </div>
                    </div>

                    <div className="w-full md:w-64 bg-slate-950/50 rounded-3xl border border-white/5 p-6 flex flex-col items-center justify-center text-center gap-4">
                        <div className="relative">
                            <div className="w-20 h-20 rounded-full border-4 border-slate-800 border-t-indigo-500 animate-spin"></div>
                            <div className="absolute inset-0 flex items-center justify-center">
                                <Zap size={24} className="text-indigo-400" />
                            </div>
                        </div>
                        <div>
                            <div className="text-2xl font-black text-white">{stats?.pending || 0}</div>
                            <div className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">Videos en espera</div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-1 space-y-4">
                    <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-xl">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="w-10 h-10 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center"><Brush size={20}/></div>
                            <h3 className="font-bold text-white uppercase text-xs tracking-widest">Janitor Engine V7</h3>
                        </div>

                        <div className="space-y-5">
                            <div>
                                <label className="text-[10px] uppercase font-bold text-slate-500 block mb-2">Categoría a Analizar</label>
                                <select value={config.category} onChange={e => setConfig({...config, category: e.target.value})} className="w-full bg-slate-950 border border-slate-800 text-white text-sm rounded-xl p-3 outline-none">
                                    <option value="ALL">Toda la Librería</option>
                                    {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                                    {(Object.values(VideoCategory) as string[]).map(c => (
                                        !categories.find(cat => cat.name === c) && <option key={c} value={c}>{c.replace('_', ' ')}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-4">
                                <div>
                                    <div className="flex justify-between mb-1">
                                        <label className="text-[10px] font-bold text-slate-500 uppercase">Antigüedad</label>
                                        <span className="text-[10px] font-bold text-indigo-400">{config.minDays} días</span>
                                    </div>
                                    <input type="range" min="1" max="365" value={config.minDays} onChange={e => setConfig({...config, minDays: parseInt(e.target.value)})} className="w-full accent-indigo-500 h-1 bg-slate-800 rounded-full appearance-none" />
                                </div>

                                <div>
                                    <div className="flex justify-between mb-1">
                                        <label className="text-[10px] font-bold text-slate-500 uppercase">Límite Purga GB</label>
                                        <span className="text-[10px] font-bold text-red-400">{config.maxGbLimit} GB</span>
                                    </div>
                                    <input type="range" min="1" max="500" step="5" value={config.maxGbLimit} onChange={e => setConfig({...config, maxGbLimit: parseInt(e.target.value)})} className="w-full accent-red-500 h-1 bg-slate-800 rounded-full appearance-none" />
                                </div>
                            </div>

                            <button onClick={handlePreviewCleaner} disabled={cleaning} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-4 rounded-2xl shadow-xl flex items-center justify-center gap-2 transition-all">
                                {cleaning ? <Loader2 className="animate-spin" size={20}/> : <Zap size={20}/>} Escanear Desperdicios
                            </button>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3">
                        <button onClick={handleCleanupOrphans} className="flex items-center gap-3 p-4 bg-slate-900 border border-slate-800 hover:border-red-500/50 rounded-xl transition-all">
                             <Trash2 size={18} className="text-red-500" />
                             <div className="text-left"><span className="block text-xs font-bold text-white uppercase">Borrar Huérfanos</span><span className="block text-[9px] text-slate-500">LIMPIEZA DE DISCO</span></div>
                        </button>
                        <button onClick={handleRepairDb} className="flex items-center gap-3 p-4 bg-slate-900 border border-slate-800 hover:border-indigo-500/50 rounded-xl transition-all">
                             <Database size={18} className="text-indigo-500" />
                             <div className="text-left"><span className="block text-xs font-bold text-white uppercase">Reparar MariaDB</span><span className="block text-[9px] text-slate-500">SINCRONIZACIÓN</span></div>
                        </button>
                    </div>
                </div>

                <div className="lg:col-span-2 space-y-6">
                    {execution ? (
                        <div className="bg-slate-900 border border-indigo-500/30 rounded-2xl p-8 text-center animate-in zoom-in-95">
                            <Loader2 size={48} className="animate-spin text-indigo-500 mx-auto mb-6" />
                            <h3 className="text-xl font-black text-white mb-2 uppercase tracking-tighter">Ejecutando Purga...</h3>
                            <p className="text-slate-400 text-sm mb-6">{execution.current}</p>
                        </div>
                    ) : cleanerPreview ? (
                        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col h-[600px] animate-in slide-in-from-right-4">
                            <div className="p-5 bg-slate-950 border-b border-slate-800 flex justify-between items-center">
                                <div>
                                    <h4 className="text-sm font-black text-white uppercase tracking-widest">Plan de Ejecución V7</h4>
                                    <p className="text-[10px] text-slate-500 uppercase mt-0.5">Recuperación estimada: <span className="text-emerald-400">{cleanerPreview.stats.spaceReclaimed}</span></p>
                                </div>
                                <div className="flex gap-2">
                                    <button onClick={() => setCleanerPreview(null)} className="p-2 hover:bg-slate-800 rounded-full text-slate-500"><X size={20}/></button>
                                    <button onClick={handleExecuteCleaner} className="bg-red-600 hover:bg-red-500 text-white px-6 py-2 rounded-xl font-bold text-sm shadow-lg flex items-center gap-2">
                                        <Trash2 size={16}/> Purgar Ahora
                                    </button>
                                </div>
                            </div>
                            <div className="flex-1 overflow-y-auto bg-slate-900/50">
                                <table className="w-full text-left border-collapse">
                                    <thead className="bg-slate-950/80 sticky top-0 z-10 text-[9px] font-black text-slate-500 uppercase">
                                        <tr><th className="p-4">Video</th><th className="p-4">Vistas</th><th className="p-4">Peso</th><th className="p-4">Razón</th></tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-800/50">
                                        {cleanerPreview.preview.map((v: any) => (
                                            <tr key={v.id} className="hover:bg-slate-800/30">
                                                <td className="p-4 text-xs font-bold text-white truncate max-w-[150px]">{v.title}</td>
                                                <td className="p-4 text-[10px] text-slate-400">{v.views}</td>
                                                <td className="p-4 text-[10px] font-mono text-indigo-300">{v.size_fmt || 'N/A'}</td>
                                                <td className="p-4"><span className="text-[9px] font-black text-amber-500 uppercase">{v.reason}</span></td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    ) : (
                        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden h-[600px] flex flex-col">
                            <div className="p-4 bg-slate-950 border-b border-slate-800 flex justify-between items-center">
                                <div className="flex items-center gap-2"><FileText size={18} className="text-indigo-400" /><h4 className="text-sm font-black text-white uppercase">Incidentes Recientes</h4></div>
                                <button onClick={() => db.request('action=admin_clear_logs')} className="text-[9px] font-black text-slate-500 hover:text-white uppercase px-3 py-1 bg-slate-800 rounded-lg">Borrar Logs</button>
                            </div>
                            <div className="flex-1 bg-black/40 overflow-y-auto p-4 font-mono text-[10px] space-y-1.5 custom-scrollbar">
                                {logs.map((log, i) => {
                                    const isError = log.includes('ERROR') || log.includes('FATAL') || log.includes('fail');
                                    return <div key={i} className={`pb-1 border-b border-white/5 ${isError ? 'text-red-400' : 'text-slate-400'}`}>{log}</div>
                                })}
                                {logs.length === 0 && <p className="italic opacity-30 text-center py-20 uppercase tracking-widest text-[10px]">Sin incidentes registrados</p>}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}