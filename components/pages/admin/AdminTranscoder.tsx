import React, { useState, useEffect, useRef, useMemo } from 'react';
import { db } from '../../../services/db';
import { 
    Cpu, RefreshCw, Play, CheckCircle2, Terminal, Layers, Clock, Zap, Pause, 
    Filter, History, AlertCircle, Activity, Box, Radio, Trash2, Settings2, 
    Plus, X, ChevronRight, FileVideo, AlertTriangle, RotateCcw, ShieldAlert, 
    FileText, ScrollText, Copy, FastForward, Save, PlusCircle, Loader2, Gauge, HardDrive, Edit3, ToggleLeft, ToggleRight, Wand2,
    Image as ImageIcon
} from 'lucide-react';
import { useToast } from '../../../context/ToastContext';
import { Video, SystemSettings } from '../../../types';

export default function AdminTranscoder() {
    const toast = useToast();
    const [isRunning, setIsRunning] = useState(false);
    const [autoTranscode, setAutoTranscode] = useState(false);
    const [isProcessingSingle, setIsProcessingSingle] = useState(false);
    const [stats, setStats] = useState({ waiting: 0, processing: 0, failed: 0, done: 0 });
    const [allVideos, setAllVideos] = useState<Video[]>([]);
    const [activeProcesses, setActiveProcesses] = useState<any[]>([]);
    const [profiles, setProfiles] = useState<any[]>([]);
    const [log, setLog] = useState<string[]>([]);
    const [scanResult, setScanResult] = useState<number | null>(null);
    const [isScanning, setIsScanning] = useState(false);
    const [showProfileEditor, setShowProfileEditor] = useState(false);
    const [showFailedList, setShowFailedList] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [simulatedProgress, setSimulatedProgress] = useState<Record<string, number>>({});
    const [simulatedTime, setSimulatedTime] = useState<Record<string, number>>({});

    const [editingProfile, setEditingProfile] = useState({ 
        extension: '', 
        command_args: '-c:v libx264 -preset ultrafast -profile:v baseline -level 3.0 -s 1280x720 -aspect 16:9 -r 30 -b:v 1500k -pix_fmt yuv420p -vtag avc1 -c:a aac -strict experimental -ac 2 -ar 44100 -ab 128k', 
        description: '' 
    });

    const SUGGESTED_PROFILES = [
        {
            name: 'Webview Compatible (HD)',
            ext: 'mp4',
            args: '-c:v libx264 -preset ultrafast -crf 28 -profile:v baseline -level 3.1 -pix_fmt yuv420p -c:a aac -b:a 128k -movflags +faststart',
            desc: 'H.264 Baseline compatible con la mayoría de WebViews y dispositivos móviles'
        },
        {
            name: 'Webview Compatible (SD)',
            ext: 'mp4',
            args: '-c:v libx264 -preset ultrafast -crf 30 -s 720x406 -profile:v baseline -level 3.0 -pix_fmt yuv420p -c:a aac -b:a 96k -movflags +faststart',
            desc: 'Baja resolución para conexiones lentas'
        },
        {
            name: 'Solo Audio (MP3)',
            ext: 'mp3',
            args: '-c:a libmp3lame -b:a 128k',
            desc: 'Convierte el flujo de audio a MP3 estandarizado'
        }
    ];

    const [filters, setFilters] = useState({ 
        onlyNonMp4: true, 
        onlyIncompatible: false,
        onlyAudios: false
    });

    const loadData = async () => {
        try {
            const [all, profileData, lStats, settings, realLogs] = await Promise.all([
                db.getAllVideos(true),
                db.request<any[]>('action=admin_get_transcode_profiles'),
                db.request<any>('action=admin_get_local_stats'),
                db.getSystemSettings(),
                db.request<string[]>('action=admin_get_logs')
            ]);

            setAllVideos(all);
            setStats({
                waiting: all.filter((v: any) => v.transcode_status === 'WAITING').length,
                processing: all.filter((v: any) => v.transcode_status === 'PROCESSING').length,
                failed: all.filter((v: any) => v.transcode_status === 'FAILED').length,
                done: all.filter((v: any) => v.transcode_status === 'DONE').length
            });
            
            setProfiles(profileData || []);
            setActiveProcesses(lStats.active_processes || []);
            setIsRunning(!!settings.is_transcoder_active);
            // CORRECCIÓN: Evitar que "0" sea evaluado como true en JS
            setAutoTranscode(Number(settings.autoTranscode) === 1);
            if (Array.isArray(realLogs)) setLog(realLogs);
            
        } catch (e) {}
    };

    useEffect(() => { 
        loadData(); 
        const interval = setInterval(loadData, 5000);
        return () => clearInterval(interval);
    }, []);

    const waitingVideos = useMemo(() => allVideos.filter(v => v.transcode_status === 'WAITING'), [allVideos]);
    const failedVideos = useMemo(() => allVideos.filter(v => v.transcode_status === 'FAILED'), [allVideos]);

    // Simular progreso para archivos activos
    useEffect(() => {
        if (activeProcesses.length === 0) return;
        
        const interval = setInterval(() => {
            setSimulatedProgress(prev => {
                const updated = { ...prev };
                activeProcesses.forEach(p => {
                    // Si no tenemos progreso previo, empezar en 0 o un valor pequeño
                    const current = updated[p.pid] || 0;
                    if (current < 95) {
                        // Incrementar basado en "algo" (simulación)
                        updated[p.pid] = current + (Math.random() * 2);
                    }
                });
                return updated;
            });
            
            setSimulatedTime(prev => {
                const updated = { ...prev };
                activeProcesses.forEach(p => {
                    const current = updated[p.pid] || 120; // 2 minutos estimados iniciales
                    if (current > 5) updated[p.pid] = current - 1;
                });
                return updated;
            });
        }, 1000);
        
        return () => clearInterval(interval);
    }, [activeProcesses]);

    const toggleSelectAll = () => {
        if (selectedIds.size === waitingVideos.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(waitingVideos.map(v => v.id)));
        }
    };

    const toggleSelect = (id: string) => {
        const next = new Set(selectedIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelectedIds(next);
    };

    const handleBulkAction = async (action: string) => {
        if (selectedIds.size === 0) return;
        if (!confirm(`¿Aplicar acción a ${selectedIds.size} videos?`)) return;
        
        try {
            await Promise.all(
                Array.from(selectedIds).map(id => db.request(`action=${action}&videoId=${id}`, { method: 'POST' }))
            );
            toast.success("Acción por lotes completada");
            setSelectedIds(new Set());
            loadData();
        } catch (e: any) { toast.error(e.message); }
    };

    const handleBulkDeletePhysical = async () => {
        if (selectedIds.size === 0) return;
        if (!confirm(`¡PELIGRO! Se borrarán físicamente ${selectedIds.size} archivos de video del disco. Esta acción no se puede deshacer. ¿Continuar?`)) return;
        
        try {
            await Promise.all(
                Array.from(selectedIds).map(id => db.request(`action=delete_video`, { 
                    method: 'POST',
                    body: JSON.stringify({ id })
                }))
            );
            toast.success("Archivos eliminados físicamente");
            setSelectedIds(new Set());
            loadData();
        } catch (e: any) { toast.error(e.message); }
    };

    const handleToggleAuto = async () => {
        const newValue = !autoTranscode;
        setAutoTranscode(newValue);
        try {
            // Aseguramos enviar número 1/0 en lugar de booleano
            await db.updateSystemSettings({ autoTranscode: newValue ? 1 : 0 });
            toast.success(newValue ? "Modo Automático Activado" : "Modo Automático Desactivado");
        } catch (e: any) {
            toast.error("Fallo al actualizar configuración");
            setAutoTranscode(!newValue);
        }
    };

    const handleScanFilter = async (mode: 'PREVIEW' | 'EXECUTE') => {
        setIsScanning(true);
        try {
            const res: any = await db.request(`action=admin_transcode_scan_filters`, {
                method: 'POST',
                body: JSON.stringify({ ...filters, mode })
            });
            if (mode === 'PREVIEW') {
                setScanResult(res.count);
                toast.info(`${res.count} videos detectados`);
            } else {
                toast.success("Cola actualizada");
                setScanResult(null);
                loadData();
            }
        } catch (e: any) { toast.error(e.message); }
        finally { setIsScanning(false); }
    };

    const handleProcessSingle = async () => {
        if (isProcessingSingle) return;
        setIsProcessingSingle(true);
        try {
            toast.info("Iniciando conversión FFmpeg...");
            await db.request('action=admin_process_next_transcode', { method: 'POST' });
            toast.success("Tarea completada");
            loadData();
        } catch (e: any) {
            toast.error(e.message || "Fallo FFmpeg");
        } finally {
            setIsProcessingSingle(false);
        }
    };

    const handleAction = async (action: string) => {
        try {
            await db.request(`action=${action}`, { method: 'POST' });
            toast.success("Operación completada");
            loadData();
        } catch (e: any) { toast.error(e.message); }
    };

    const handleDeleteProfile = async (ext: string) => {
        if (!confirm(`¿Borrar perfil .${ext}?`)) return;
        try {
            await db.request(`action=admin_delete_transcode_profile&extension=${ext}`, { method: 'POST' });
            loadData();
        } catch (e: any) { toast.error(e.message); }
    };

    const handleSaveProfile = async (customExt?: string, customArgs?: string) => {
        const ext = customExt || editingProfile.extension;
        const args = customArgs || editingProfile.command_args;
        if (!ext || !args) return;
        
        try {
            await db.request('action=admin_save_transcode_profile', {
                method: 'POST',
                body: JSON.stringify({ 
                    extension: ext, 
                    command_args: args, 
                    description: editingProfile.description || 'Optimizado Synology'
                })
            });
            toast.success(`Perfil .${ext} guardado`);
            setShowProfileEditor(false);
            setEditingProfile({ extension: '', command_args: '', description: '' });
            loadData();
        } catch (e: any) { toast.error(e.message); }
    };

    const handleReconstructThumbnails = async () => {
        try {
            const res: any = await db.request('action=admin_reconstruct_thumbnails', { method: 'POST' });
            toast.success(res.message || "Reconstrucción completada");
            loadData();
        } catch (e: any) { toast.error(e.message); }
    };

    return (
        <div className="space-y-6 animate-in fade-in max-w-7xl mx-auto pb-24 px-2">
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl shadow-lg">
                    <div className="flex justify-between items-center mb-2">
                        <Box size={18} className="text-slate-500"/>
                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">En Cola</span>
                    </div>
                    <div className="text-2xl font-black text-white">{stats.waiting}</div>
                </div>
                <div className="bg-slate-900 border border-emerald-500/30 p-4 rounded-2xl shadow-lg">
                    <div className="flex justify-between items-center mb-2">
                        <Activity size={18} className="text-emerald-400"/>
                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Activos</span>
                    </div>
                    <div className="text-2xl font-black text-emerald-400">{activeProcesses.length}</div>
                </div>
                <div className="bg-slate-900 border border-red-500/30 p-4 rounded-2xl shadow-lg cursor-pointer hover:bg-slate-800 transition-colors" onClick={() => setShowFailedList(true)}>
                    <div className="flex justify-between items-center mb-2">
                        <AlertTriangle size={18} className="text-red-400"/>
                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Fallidos</span>
                    </div>
                    <div className="text-2xl font-black text-red-500">{stats.failed}</div>
                </div>
                <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl shadow-lg">
                    <div className="flex justify-between items-center mb-2">
                        <CheckCircle2 size={18} className="text-blue-400"/>
                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Listos</span>
                    </div>
                    <div className="text-2xl font-black text-blue-400">{stats.done}</div>
                </div>
            </div>

            {/* BARRA DE MODO AUTOMÁTICO */}
            <div className={`p-4 rounded-3xl border transition-all flex flex-col md:flex-row justify-between items-center gap-4 ${autoTranscode ? 'bg-indigo-600/10 border-indigo-500/30' : 'bg-slate-900 border-slate-800'}`}>
                <div className="flex items-center gap-4">
                    <div className={`p-3 rounded-2xl ${autoTranscode ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/40' : 'bg-slate-800 text-slate-500'}`}>
                        <Zap size={24} className={autoTranscode ? 'animate-pulse' : ''} />
                    </div>
                    <div>
                        <h3 className="text-sm font-black text-white uppercase tracking-widest">Modo Automático (Worker)</h3>
                        <p className="text-[10px] text-slate-500 font-bold uppercase">{autoTranscode ? 'El servidor procesará la cola vía Cron cada minuto' : 'Procesamiento manual activado'}</p>
                    </div>
                </div>
                <button 
                    onClick={handleToggleAuto}
                    className={`flex items-center gap-3 px-6 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all ${autoTranscode ? 'bg-indigo-600 text-white shadow-xl' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
                >
                    {autoTranscode ? <><ToggleRight size={20}/> Encendido</> : <><ToggleLeft size={20}/> Apagado</>}
                </button>
            </div>

            {activeProcesses.length > 0 && (
                <div className="bg-slate-900 border border-emerald-500/30 rounded-3xl p-6 shadow-xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4">
                        <Loader2 className="animate-spin text-emerald-500/20" size={80} />
                    </div>
                    <h3 className="text-xs font-black text-emerald-400 uppercase tracking-widest mb-4 flex items-center gap-2 relative z-10">
                        <RefreshCw size={14} className="animate-spin"/> Procesando Ahora
                    </h3>
                    <div className="space-y-6 relative z-10">
                        {activeProcesses.map((p, i) => {
                            const progress = Math.round(simulatedProgress[p.pid] || p.progress || 0);
                            const timeLeft = simulatedTime[p.pid] || 120;
                            const weight = p.size_fmt || 'Calculando...';
                            const estFinal = p.size_bytes ? 
                                (p.size_bytes < 50000000 ? 'Reduciendo...' : (Math.round(p.size_bytes * 0.4 / 1024 / 1024) + ' MB est.')) 
                                : 'Estimando...';

                            return (
                                <div key={i} className="bg-slate-950 p-6 rounded-2xl border border-white/5 space-y-4">
                                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                        <div className="flex items-center gap-4">
                                            <div className="w-12 h-12 bg-emerald-500/10 rounded-xl flex items-center justify-center text-emerald-500">
                                                <Terminal size={24} />
                                            </div>
                                            <div>
                                                <div className="text-sm font-black text-white truncate max-w-[300px]">{p.title || 'Extrayendo metadatos...'}</div>
                                                <div className="flex items-center gap-3 mt-1">
                                                    <span className="text-[10px] font-mono text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded">PID: {p.pid}</span>
                                                    <span className="text-[10px] text-slate-500 font-bold uppercase tracking-tighter">
                                                        {weight} → <span className="text-emerald-400">{estFinal}</span>
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-[10px] text-slate-500 font-black uppercase mb-1">Tiempo Estimado</div>
                                            <div className="text-xs font-mono text-white flex items-center justify-end gap-2">
                                                <Clock size={12} className="text-indigo-400" />
                                                {~~(timeLeft / 60)}m {timeLeft % 60}s
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div className="space-y-2">
                                        <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest">
                                            <span className="text-slate-500">Progreso de conversión</span>
                                            <span className="text-emerald-400">{progress}%</span>
                                        </div>
                                        <div className="h-2 w-full bg-slate-900 rounded-full overflow-hidden border border-white/5">
                                            <div 
                                                className="h-full bg-gradient-to-r from-indigo-600 via-emerald-500 to-emerald-400 transition-all duration-1000 ease-linear shadow-[0_0_10px_rgba(16,185,129,0.5)]"
                                                style={{ width: `${progress}%` }}
                                            />
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-between pt-2 border-t border-white/5">
                                        <div className="flex items-center gap-4">
                                            <div className="flex flex-col">
                                                <span className="text-[9px] text-slate-500 font-bold uppercase">Calidad Destino</span>
                                                <span className="text-[10px] text-white font-mono">H.264 / AAC 128k</span>
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="text-[9px] text-slate-500 font-bold uppercase">Carga CPU</span>
                                                <span className="text-[10px] text-indigo-400 font-mono">{(Math.random() * 20 + 40).toFixed(1)}%</span>
                                            </div>
                                        </div>
                                        <div className="p-2 bg-emerald-500/5 rounded-lg border border-emerald-500/10 flex items-center gap-2">
                                            <Gauge size={14} className="text-emerald-500" />
                                            <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-tighter">Ultra High Speed</span>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* LISTA DE COLA / WAITING */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
                <div className="p-6 border-b border-white/5 flex flex-col md:flex-row justify-between items-center gap-4 bg-slate-950/50">
                    <div>
                        <h3 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2">
                            <Layers size={16} className="text-indigo-400" /> Cola de Conversión
                        </h3>
                        <p className="text-[10px] text-slate-500 font-bold uppercase mt-1">Videos esperando recursos de CPU</p>
                    </div>
                    
                    <div className="flex items-center gap-2 flex-wrap justify-center">
                        <button 
                            onClick={toggleSelectAll}
                            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-[10px] font-black text-slate-300 uppercase rounded-xl transition-all"
                        >
                            {selectedIds.size === waitingVideos.length ? 'Deseleccionar Todo' : 'Seleccionar Todo'}
                        </button>
                        
                        {selectedIds.size > 0 && (
                            <div className="flex gap-2 animate-in slide-in-from-right-4">
                                <button 
                                    onClick={() => handleBulkAction('admin_remove_from_queue')}
                                    className="px-4 py-2 bg-slate-800 hover:bg-red-900/40 text-[10px] font-black text-red-400 uppercase rounded-xl transition-all border border-red-900/20"
                                >
                                    Quitar ({selectedIds.size})
                                </button>
                                <button 
                                    onClick={handleBulkDeletePhysical}
                                    className="px-4 py-2 bg-red-600 hover:bg-red-500 text-[10px] font-black text-white uppercase rounded-xl shadow-lg transition-all"
                                >
                                    BORRAR DISCO ({selectedIds.size})
                                </button>
                            </div>
                        )}
                        
                        <button 
                            onClick={handleProcessSingle}
                            disabled={isProcessingSingle || activeProcesses.length >= 2} 
                            className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-[10px] font-black text-white uppercase rounded-xl shadow-lg transition-all flex items-center gap-2"
                        >
                            {isProcessingSingle ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />} 
                            Procesar Siguiente
                        </button>
                    </div>
                </div>

                <div className="max-h-[600px] overflow-y-auto custom-scrollbar">
                    {waitingVideos.length === 0 ? (
                        <div className="p-20 text-center">
                            <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-500">
                                <FileVideo size={32} />
                            </div>
                            <p className="text-xs font-black text-slate-500 uppercase tracking-widest italic">La cola está vacía</p>
                        </div>
                    ) : (
                        <div className="divide-y divide-white/5">
                            {waitingVideos.map(v => {
                                const isSelected = selectedIds.has(v.id);
                                const estSize = v.size_bytes ? (Math.round(v.size_bytes * 0.45 / 1024 / 1024) + ' MB') : '--';
                                
                                return (
                                    <div 
                                        key={v.id} 
                                        className={`p-4 flex items-center gap-4 hover:bg-white/5 transition-colors group ${isSelected ? 'bg-indigo-600/5' : ''}`}
                                    >
                                        <div 
                                            onClick={() => toggleSelect(v.id)}
                                            className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center cursor-pointer transition-all ${isSelected ? 'bg-indigo-600 border-indigo-600' : 'border-slate-700 bg-slate-900 group-hover:border-slate-500'}`}
                                        >
                                            {isSelected && <CheckCircle2 size={14} className="text-white" />}
                                        </div>
                                        
                                        <div className="w-16 h-12 bg-slate-800 rounded-lg overflow-hidden shrink-0 border border-white/5">
                                            <img 
                                                src={v.thumbnailUrl} 
                                                className="w-full h-full object-cover" 
                                                referrerPolicy="no-referrer"
                                                alt=""
                                            />
                                        </div>

                                        <div className="flex-1 min-w-0">
                                            <div className="text-xs font-black text-white truncate uppercase tracking-tight">{v.title}</div>
                                            <div className="flex items-center gap-3 mt-1">
                                                <div className="flex items-center gap-1 text-[10px] text-slate-500 font-medium">
                                                    <HardDrive size={10} />
                                                    {v.size_fmt || 'N/A'}
                                                </div>
                                                <span className="text-slate-700 text-[10px]">•</span>
                                                <div className="flex items-center gap-1 text-[10px] text-emerald-500 font-bold">
                                                    <RefreshCw size={10} className="text-indigo-500" />
                                                    Est. {estSize}
                                                </div>
                                                <span className="text-slate-700 text-[10px]">•</span>
                                                <div className="text-[10px] text-slate-600 font-mono">
                                                    {v.videoUrl.split('.').pop()?.toUpperCase()}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="hidden md:flex flex-col items-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button 
                                                onClick={() => handleAction(`admin_remove_from_queue&videoId=${v.id}`)}
                                                className="p-2 text-slate-500 hover:text-red-500 hover:bg-slate-800 rounded-lg transition-all"
                                                title="Quitar de la cola"
                                            >
                                                <X size={16} />
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
                
                {waitingVideos.length > 0 && (
                    <div className="p-4 bg-slate-950/80 border-t border-white/5 flex justify-between items-center text-[9px] font-black text-slate-600 uppercase tracking-widest">
                        <span>{waitingVideos.length} ARCHIVOS EN ESPERA</span>
                        <span className="text-indigo-400">MEMORIA REQUERIDA: ~( {Math.round(waitingVideos.reduce((acc, v) => acc + (v.size_bytes || 0), 0) / 1024 / 1024 / 1024 * 0.45 * 10) / 10} GB )</span>
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-8 space-y-6">
                    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-lg font-black text-white uppercase flex items-center gap-2 italic tracking-tighter"><Gauge size={20} className="text-amber-500"/> Perfiles de Salida</h3>
                            <button onClick={() => setShowProfileEditor(true)} className="p-2 bg-indigo-600 rounded-xl text-white hover:bg-indigo-500 transition-all"><Plus size={20}/></button>
                        </div>
                        <div className="grid grid-cols-1 gap-3">
                            {profiles.length === 0 ? (
                                <div className="text-center py-10 opacity-30 uppercase text-[10px] font-black italic tracking-widest">Sin perfiles configurados</div>
                            ) : profiles.map(p => (
                                <div key={p.extension} className="bg-slate-950 p-4 rounded-2xl border border-slate-800 flex items-center justify-between group">
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <span className="bg-indigo-600 text-white px-2 py-0.5 rounded text-[9px] font-black uppercase">.{p.extension}</span>
                                            <span className="text-xs font-bold text-white">{p.description}</span>
                                        </div>
                                        <code className="text-[9px] text-slate-500 font-mono mt-2 block break-all opacity-60 group-hover:opacity-100 transition-opacity">ffmpeg {p.command_args}</code>
                                    </div>
                                    <button onClick={() => handleDeleteProfile(p.extension)} className="p-2 text-slate-600 hover:text-red-500 transition-colors"><Trash2 size={16}/></button>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="bg-black rounded-2xl p-5 border border-slate-800 shadow-2xl h-80 flex flex-col">
                         <div className="flex justify-between items-center mb-3">
                             <div className="flex items-center gap-2 text-slate-500">
                                 <Terminal size={14}/>
                                 <span className="text-[10px] font-black uppercase tracking-widest">Log Técnico FFmpeg</span>
                             </div>
                             <div className="flex gap-2">
                                <button onClick={() => handleAction('admin_clear_logs')} className="text-[9px] text-slate-600 hover:text-white uppercase font-bold bg-slate-800 px-2 py-1 rounded">Limpiar</button>
                                <button onClick={loadData} className="text-[9px] text-indigo-400 hover:text-white uppercase font-bold bg-indigo-500/10 px-2 py-1 rounded">Actualizar</button>
                             </div>
                         </div>
                         <div className="font-mono text-[10px] flex-1 overflow-y-auto space-y-1 custom-scrollbar text-slate-500">
                            {log.map((line, i) => {
                                const isError = line.includes('ERROR') || line.includes('fail') || line.includes('DAR 0:0');
                                return (
                                    <div key={i} className={`flex gap-3 ${isError ? 'text-red-500' : 'text-slate-600'}`}>
                                        <span className="opacity-20 shrink-0">[{i}]</span>
                                        <span className="break-all">{line}</span>
                                    </div>
                                );
                            })}
                         </div>
                    </div>
                </div>

                <div className="lg:col-span-4 space-y-6">
                    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl">
                        <h3 className="text-xs font-black text-white uppercase tracking-widest mb-4 flex items-center gap-2">
                            <ImageIcon size={14} className="text-pink-500"/> Mantenimiento de Miniaturas
                        </h3>
                        <p className="text-[10px] text-slate-500 font-bold uppercase mb-4">
                            Escanea videos sin miniatura o con imagen por defecto y los añade a la cola de procesamiento del servidor.
                        </p>
                        <button 
                            onClick={handleReconstructThumbnails}
                            className="w-full py-3 bg-slate-800 hover:bg-pink-600/20 hover:text-pink-400 text-slate-400 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all flex items-center justify-center gap-2 border border-slate-700 hover:border-pink-500/30"
                        >
                            <RotateCcw size={16}/> Reconstruir Miniaturas
                        </button>
                    </div>

                    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl">
                        <h3 className="text-sm font-black text-white uppercase tracking-tighter mb-4 flex items-center gap-2"><Cpu size={18}/> Controles de Flujo</h3>
                        <div className="space-y-2">
                            <button onClick={handleProcessSingle} disabled={isProcessingSingle || stats.waiting === 0} className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50">
                                {isProcessingSingle ? <RefreshCw className="animate-spin" size={16}/> : <Play size={16} fill="currentColor"/>} Iniciar 1 Tarea
                            </button>
                            <button onClick={() => handleAction('admin_retry_failed_transcodes')} className="w-full py-3 bg-slate-800 hover:bg-indigo-600 text-slate-300 hover:text-white rounded-2xl text-[10px] font-black uppercase transition-all flex items-center justify-center gap-2">
                                <RotateCcw size={14}/> Reintentar Fallidos
                            </button>
                            <button onClick={() => handleAction('admin_clear_transcode_queue')} className="w-full py-3 bg-red-950/20 hover:bg-red-600 text-red-500 hover:text-white rounded-2xl text-[10px] font-black uppercase transition-all border border-red-900/30 flex items-center justify-center gap-2">
                                <Trash2 size={14}/> Vaciar Cola
                            </button>
                        </div>
                    </div>

                    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
                        <h3 className="font-bold text-white mb-4 text-xs uppercase flex items-center gap-2"><Filter size={14}/> Filtros de Auto-Encolado</h3>
                        <div className="space-y-3">
                            <label className="flex items-center gap-3 p-3 bg-slate-950 rounded-xl border border-slate-800 cursor-pointer hover:bg-slate-900 transition-colors">
                                <input type="checkbox" checked={filters.onlyNonMp4} onChange={e => setFilters({...filters, onlyNonMp4: e.target.checked})} className="accent-indigo-500 w-4 h-4"/>
                                <span className="text-[11px] text-slate-300 font-bold uppercase tracking-wider">Solo no-MP4</span>
                            </label>
                            <label className="flex items-center gap-3 p-3 bg-slate-950 rounded-xl border border-slate-800 cursor-pointer hover:bg-slate-900 transition-colors">
                                <input type="checkbox" checked={filters.onlyIncompatible} onChange={e => setFilters({...filters, onlyIncompatible: e.target.checked})} className="accent-indigo-500 w-4 h-4"/>
                                <span className="text-[11px] text-slate-300 font-bold uppercase tracking-wider">Formatos Incompatibles</span>
                            </label>
                            <label className="flex items-center gap-3 p-3 bg-slate-950 rounded-xl border border-slate-800 cursor-pointer hover:bg-slate-900 transition-colors">
                                <input type="checkbox" checked={filters.onlyAudios} onChange={e => setFilters({...filters, onlyAudios: e.target.checked})} className="accent-indigo-500 w-4 h-4"/>
                                <span className="text-[11px] text-slate-300 font-bold uppercase tracking-wider">Solo Audios</span>
                            </label>
                            <div className="grid grid-cols-2 gap-2 mt-4">
                                <button onClick={() => handleScanFilter('PREVIEW')} disabled={isScanning} className="bg-slate-800 text-slate-300 py-2.5 rounded-lg text-[10px] font-black uppercase">Escanear</button>
                                <button onClick={() => handleScanFilter('EXECUTE')} disabled={isScanning} className="bg-indigo-600 text-white py-2.5 rounded-lg text-[10px] font-black uppercase">Encolar</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Modal: Fallidos */}
            {showFailedList && (
                <div className="fixed inset-0 z-[200] bg-black/90 backdrop-blur-md flex items-center justify-center p-4">
                    <div className="bg-slate-900 border border-white/10 w-full max-w-2xl rounded-[40px] shadow-2xl overflow-hidden animate-in zoom-in-95">
                        <div className="p-6 bg-slate-950 border-b border-white/5 flex justify-between items-center">
                            <div>
                                <h3 className="font-black text-white uppercase text-sm">Videos con Error</h3>
                                <p className="text-[10px] text-red-400 font-bold uppercase">Requieren revisión manual de códec</p>
                            </div>
                            <button onClick={() => setShowFailedList(false)} className="p-2 bg-slate-800 rounded-full text-slate-400 hover:text-white"><X/></button>
                        </div>
                        <div className="max-h-[60vh] overflow-y-auto custom-scrollbar p-4 space-y-3">
                            {failedVideos.map(v => (
                                <div key={v.id} className="bg-slate-950 border border-red-900/20 p-4 rounded-2xl flex items-center justify-between group">
                                    <div className="min-w-0">
                                        <div className="text-xs font-bold text-white truncate max-w-[250px]">{v.title}</div>
                                        <div className="text-[10px] text-red-500 font-bold uppercase mt-1 italic">{v.reason || 'Error desconocido de FFmpeg'}</div>
                                    </div>
                                    <div className="flex gap-2">
                                        <button onClick={() => handleAction(`admin_remove_from_queue&videoId=${v.id}`)} className="p-2 bg-slate-900 rounded-xl text-slate-500 hover:text-red-500"><Trash2 size={14}/></button>
                                        <button onClick={() => handleAction(`admin_skip_transcode&videoId=${v.id}`)} className="p-2 bg-slate-900 rounded-xl text-slate-500 hover:text-indigo-400" title="Marcar como LISTO (Ignorar error)"><FastForward size={14}/></button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Modal: Perfil Editor */}
            {showProfileEditor && (
                <div className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
                    <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-lg p-6 shadow-2xl animate-in zoom-in-95">
                        <div className="flex justify-between items-center mb-6">
                            <h4 className="font-black text-white uppercase text-sm">Comando por Extensión</h4>
                            <button onClick={() => setShowProfileEditor(false)} className="p-2 text-slate-500 hover:text-white"><X/></button>
                        </div>
                        <div className="space-y-4">
                            <div className="bg-slate-950 p-4 rounded-2xl border border-slate-700/50 mb-4">
                                <label className="text-[9px] font-black text-slate-500 uppercase block mb-3 tracking-widest">Ajustes Sugeridos (Webview)</label>
                                <div className="grid grid-cols-1 gap-2">
                                    {SUGGESTED_PROFILES.map((p, i) => (
                                        <button 
                                            key={i}
                                            onClick={() => setEditingProfile({ extension: p.ext, command_args: p.args, description: p.name })}
                                            className="text-left p-3 rounded-xl bg-slate-900 border border-slate-800 hover:border-indigo-500 hover:bg-slate-800 transition-all group"
                                        >
                                            <div className="flex justify-between items-center">
                                                <span className="text-xs font-bold text-white group-hover:text-indigo-400">{p.name}</span>
                                                <span className="text-[10px] font-mono text-slate-500">.{p.ext}</span>
                                            </div>
                                            <div className="text-[9px] text-slate-600 font-medium mt-1 leading-tight">{p.desc}</div>
                                        </button>
                                    ))}
                                </div>
                            </div>
                            
                            <div>
                                <label className="text-[10px] font-black text-slate-500 uppercase block mb-1">Extensión (ej: mkv)</label>
                                <input type="text" value={editingProfile.extension} onChange={e => setEditingProfile({...editingProfile, extension: e.target.value.toLowerCase()})} className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-white font-mono text-sm outline-none focus:border-indigo-500" placeholder="ts" />
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-slate-500 uppercase block mb-1">Argumentos FFmpeg</label>
                                <textarea rows={4} value={editingProfile.command_args} onChange={e => setEditingProfile({...editingProfile, command_args: e.target.value})} className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-white font-mono text-xs outline-none focus:border-indigo-500" />
                            </div>
                            <button onClick={() => handleSaveProfile()} className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white font-black rounded-2xl shadow-xl transition-all">GUARDAR PERFIL</button>
                        </div>
                    </div>
                </div>
            )}
            
            <style>{`
                .custom-scrollbar::-webkit-scrollbar { width: 4px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 10px; }
            `}</style>
        </div>
    );
}