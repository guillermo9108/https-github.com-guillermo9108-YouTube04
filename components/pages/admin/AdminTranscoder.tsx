import React, { useState, useEffect, useRef, useMemo } from 'react';
import { db } from '../../../services/db';
import { useNavigate } from '../../../components/Router';
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
    const navigate = useNavigate();
    const [isRunning, setIsRunning] = useState(false);
    const [autoTranscode, setAutoTranscode] = useState(false);
    const [isProcessingSingle, setIsProcessingSingle] = useState(false);
    const [stats, setStats] = useState({ waiting: 0, processing: 0, failed: 0, done: 0 });
    const [waitingVideos, setWaitingVideos] = useState<Video[]>([]);
    const [failedVideos, setFailedVideos] = useState<Video[]>([]);
    const [activeProcesses, setActiveProcesses] = useState<any[]>([]);
    const [profiles, setProfiles] = useState<any[]>([]);
    const [log, setLog] = useState<string[]>([]);
    const [scanResult, setScanResult] = useState<number | null>(null);
    const [isScanning, setIsScanning] = useState(false);
    const [showProfileEditor, setShowProfileEditor] = useState(false);
    const [showFailedList, setShowFailedList] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [lastSizes, setLastSizes] = useState<Record<string, number>>({});
    const [staleTicks, setStaleTicks] = useState<Record<string, number>>({});

    const [editingProfile, setEditingProfile] = useState({ 
        extension: '', 
        command_args: '-c:v libx264 -preset ultrafast -profile:v baseline -level 3.0 -s 1280x720 -aspect 16:9 -r 30 -b:v 1500k -pix_fmt yuv420p -vtag avc1 -c:a aac -strict experimental -ac 2 -ar 44100 -ab 128k -threads 2', 
        description: '' 
    });

    const SUGGESTED_PROFILES = [
        {
            name: 'Webview Compatible (HD)',
            ext: 'mp4',
            args: '-c:v libx264 -preset ultrafast -crf 28 -profile:v baseline -level 3.1 -pix_fmt yuv420p -c:a aac -b:a 128k -movflags +faststart -threads 2',
            desc: 'H.264 Baseline optimizado para 2 núcleos'
        },
        {
            name: 'Webview Compatible (SD)',
            ext: 'mp4',
            args: '-c:v libx264 -preset ultrafast -crf 30 -s 720x406 -profile:v baseline -level 3.0 -pix_fmt yuv420p -c:a aac -b:a 96k -movflags +faststart -threads 2',
            desc: 'Baja resolución (2 núcleos)'
        },
        {
            name: 'Solo Audio (MP3)',
            ext: 'mp3',
            args: '-c:a libmp3lame -b:a 128k -threads 2',
            desc: 'Audio MP3 (2 núcleos)'
        }
    ];

    const [filters, setFilters] = useState({ 
        onlyNonMp4: true, 
        onlyIncompatible: false,
        onlyAudios: false,
        onlyMetadataError: false
    });

    const loadData = async () => {
        try {
            const [profileData, lStats, settings, realLogs, waiting, failed] = await Promise.all([
                db.request<any[]>('action=admin_get_transcode_profiles'),
                db.request<any>('action=admin_get_local_stats'),
                db.getSystemSettings(),
                db.request<string[]>('action=admin_get_logs'),
                db.getAllVideos(true, 'WAITING'),
                db.getAllVideos(true, 'FAILED')
            ]);

            setWaitingVideos(waiting || []);
            setFailedVideos(failed || []);
            
            // Usar counts del backend para los stats
            const tStats = lStats.transcode_stats || [];
            setStats({
                waiting: tStats.find((s: any) => s.transcode_status === 'WAITING')?.count || 0,
                processing: tStats.find((s: any) => s.transcode_status === 'PROCESSING')?.count || 0,
                failed: tStats.find((s: any) => s.transcode_status === 'FAILED')?.count || 0,
                done: tStats.find((s: any) => s.transcode_status === 'DONE')?.count || 0
            });
            
            setProfiles(profileData || []);
            setActiveProcesses(lStats.active_processes || []);
            setIsRunning(!!settings.is_transcoder_active);
            setAutoTranscode(Number(settings.autoTranscode) === 1);
            if (Array.isArray(realLogs)) setLog(realLogs);
            
        } catch (e) {}
    };

    useEffect(() => { 
        loadData(); 
        const interval = setInterval(loadData, 3000); // Poll faster
        return () => clearInterval(interval);
    }, []);

    // Monitorización de estancamiento (Cada 30 segundos como pidió el usuario)
    useEffect(() => {
        const monitorInterval = setInterval(() => {
            if (activeProcesses.length > 0) {
                const newStale: Record<string, number> = { ...staleTicks };
                const newLastSizes: Record<string, number> = { ...lastSizes };
                
                activeProcesses.forEach(p => {
                    const pid = p.pid;
                    const currentSize = p.current_output_size || 0;
                    
                    if (newLastSizes[pid] === currentSize && currentSize > 0) {
                        newStale[pid] = (newStale[pid] || 0) + 1;
                        if (newStale[pid] >= 2) { // 60 segundos sin cambios
                            console.warn(`Proceso FFmpeg ${pid} parece estancado (30s x ${newStale[pid]})`);
                        }
                    } else {
                        newStale[pid] = 0;
                    }
                    newLastSizes[pid] = currentSize;
                });
                
                setLastSizes(newLastSizes);
                setStaleTicks(newStale);
                
                // Forzar un refresco profundo si hay procesos bloqueados al 0%
                if (activeProcesses.some(p => p.progress === 0)) {
                    loadData();
                }
            }
        }, 30000); // 30 segundos
        return () => clearInterval(monitorInterval);
    }, [activeProcesses, lastSizes, staleTicks]);

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

    const handleReorder = async (videoId: string, direction: 'TOP' | 'UP' | 'DOWN') => {
        try {
            await db.request(`action=admin_reorder_transcode_queue&videoId=${videoId}&direction=${direction}`, { method: 'POST' });
            loadData();
        } catch (e: any) { toast.error(e.message); }
    };

    const handleStartNow = async (videoId: string) => {
        if (!confirm("Esto prioriza este video y reinicia el worker. ¿Continuar?")) return;
        try {
            await db.request(`action=admin_start_transcode_now&videoId=${videoId}`, { method: 'POST' });
            toast.success("Priorizado");
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
        <div className="min-h-screen bg-[#0f172a] text-slate-200 pb-20 font-sans selection:bg-[#1877f2]/30">
            {/* Header */}
            <div className="sticky top-0 z-50 bg-[#1e293b] shadow-xl border-b border-white/5 px-4 py-2 flex items-center justify-between backdrop-blur-md bg-opacity-80">
                <div className="flex items-center gap-3">
                    <button onClick={() => navigate('/admin')} className="p-2 hover:bg-white/5 rounded-full transition-colors group">
                        <ChevronRight size={24} className="text-slate-400 rotate-180 group-hover:text-white" />
                    </button>
                    <div className="flex items-center gap-2">
                        <div className="w-10 h-10 bg-[#1877f2] rounded-full flex items-center justify-center text-white shadow-lg shadow-[#1877f2]/20">
                            <Activity size={20} />
                        </div>
                        <div>
                            <h1 className="text-lg font-black text-white leading-tight tracking-tight">Gestor de Conversión</h1>
                            <p className="text-[11px] text-slate-500 font-bold uppercase tracking-wider">Server: <span className="text-emerald-400 font-black">Online</span></p>
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={loadData} className={`p-2.5 bg-white/5 hover:bg-white/10 rounded-full transition-all border border-white/5 ${isScanning ? 'animate-spin' : ''}`}>
                        <RefreshCw size={20} className="text-slate-300" />
                    </button>
                </div>
            </div>

            <div className="max-w-4xl mx-auto p-4 space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="bg-[#1e293b] p-4 rounded-2xl shadow-lg border border-white/5 hover:border-white/10 transition-colors">
                        <div className="flex justify-between items-center mb-1">
                            <Layers size={18} className="text-slate-500"/>
                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">En Cola</span>
                        </div>
                        <div className="text-2xl font-black text-white">{stats.waiting}</div>
                    </div>
                    <div className="bg-[#1e293b] p-4 rounded-2xl shadow-lg border border-white/5 hover:border-[#1877f2]/30 transition-colors">
                        <div className="flex justify-between items-center mb-1">
                            <Activity size={18} className="text-[#1877f2]"/>
                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Activos</span>
                        </div>
                        <div className="text-2xl font-black text-[#1877f2]">{activeProcesses.length}</div>
                    </div>
                    <div className="bg-[#1e293b] p-4 rounded-2xl shadow-lg border border-white/5 cursor-pointer hover:border-red-500/30 transition-colors" onClick={() => setShowFailedList(true)}>
                        <div className="flex justify-between items-center mb-1">
                            <AlertTriangle size={18} className="text-red-500"/>
                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Fallidos</span>
                        </div>
                        <div className="text-2xl font-black text-red-500">{stats.failed}</div>
                    </div>
                    <div className="bg-[#1e293b] p-4 rounded-2xl shadow-lg border border-white/5 hover:border-emerald-500/30 transition-colors">
                        <div className="flex justify-between items-center mb-1">
                            <CheckCircle2 size={18} className="text-emerald-500"/>
                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Listos</span>
                        </div>
                        <div className="text-2xl font-black text-emerald-500">{stats.done}</div>
                    </div>
                </div>

                {/* Switch Principal */}
                <div className={`p-5 rounded-3xl border transition-all flex flex-col md:flex-row justify-between items-center gap-4 bg-[#1e293b] shadow-2xl border-white/5`}>
                    <div className="flex items-center gap-5">
                        <div className={`p-4 rounded-2xl transition-all ${autoTranscode ? 'bg-[#1877f2] text-white shadow-lg shadow-[#1877f2]/20' : 'bg-white/5 text-slate-600'}`}>
                            <Zap size={28} className={autoTranscode ? 'animate-pulse' : ''} />
                        </div>
                        <div>
                            <h3 className="text-sm font-black text-white uppercase tracking-tight">Cero-Intervención (Worker)</h3>
                            <p className="text-[11px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">Auto-Procesar cola en segundo plano</p>
                        </div>
                    </div>
                    <button 
                        onClick={handleToggleAuto}
                        className={`flex items-center gap-3 px-8 py-3 rounded-full font-black text-[11px] uppercase tracking-widest transition-all active:scale-95 ${autoTranscode ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/40' : 'bg-white/10 text-slate-400 hover:bg-white/20'}`}
                    >
                        {autoTranscode ? <><ToggleRight size={20}/> Activado</> : <><ToggleLeft size={20}/> Desactivado</>}
                    </button>
                </div>

            {activeProcesses.length > 0 && (
                <div className="space-y-4">
                    <div className="flex items-center justify-between px-1">
                        <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] flex items-center gap-2">
                            <Activity size={14} className="text-[#1877f2] animate-pulse" />
                            Transcoding Real-Time ({activeProcesses.length})
                        </h3>
                    </div>
                    
                    <div className="space-y-4">
                        {activeProcesses.map((p, i) => {
                            const progress = p.progress || 0;
                            const outSize = p.current_output_size ? (p.current_output_size / (1024 * 1024)).toFixed(1) + ' MB' : '0 MB';
                            const estFinal = p.expected_output_size ? (Math.round(p.expected_output_size / (1024 * 1024)) + ' MB') : '...';
                            
                            // Cálculo de tiempo estimado
                            const etime = p.etime || 0; 
                            let remainingText = "--:--";
                            if (progress > 0 && etime > 2) {
                                const totalSec = etime / (progress / 100);
                                const remSec = Math.max(0, Math.round(totalSec - etime));
                                if (remSec > 3600) {
                                    remainingText = `${Math.floor(remSec / 3600)}h ${Math.floor((remSec % 3600) / 60)}m`;
                                } else if (remSec > 60) {
                                    remainingText = `${Math.floor(remSec / 60)}m ${remSec % 60}s`;
                                } else {
                                    remainingText = `${remSec}s`;
                                }
                            }

                            return (
                                <div key={i} className="bg-[#1e293b] rounded-[2.5rem] shadow-2xl border border-white/5 overflow-hidden group">
                                    <div className="p-6 flex flex-col md:flex-row md:items-center justify-between gap-6">
                                        <div className="flex items-center gap-5">
                                            <div className="w-14 h-14 bg-[#1877f2]/10 rounded-[1.5rem] flex items-center justify-center text-[#1877f2] shrink-0 border border-[#1877f2]/20 shadow-inner group-hover:bg-[#1877f2]/20 transition-all">
                                                <Terminal size={28} />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <h4 className="text-[17px] font-black text-white truncate tracking-tight">{p.title || 'Procesando archivo...'}</h4>
                                                <div className="flex flex-wrap items-center gap-y-1 gap-x-4 mt-2">
                                                    <span className="text-[10px] font-black text-white bg-[#1877f2] px-2.5 py-0.5 rounded-full shadow-lg shadow-[#1877f2]/20">PID {p.pid}</span>
                                                    <span className="text-[11px] text-slate-400 font-bold uppercase flex items-center gap-1.5">
                                                         <Box size={12}/> {outSize} / <span className="text-slate-600">{estFinal}</span>
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-8 px-4 py-3 bg-black/20 rounded-3xl border border-white/5">
                                            <div className="text-right">
                                                <div className="text-[9px] text-slate-500 font-black uppercase mb-0.5 tracking-widest">Salida</div>
                                                <div className="text-[14px] font-black text-white flex items-center justify-end gap-2 font-mono">
                                                    <HardDrive size={14} className="text-[#1877f2]" />
                                                    {outSize}
                                                </div>
                                            </div>
                                            <div className="text-right border-l border-white/10 pl-8">
                                                <div className="text-[9px] text-slate-500 font-black uppercase mb-0.5 tracking-widest">Restante</div>
                                                <div className="text-[14px] font-black text-amber-400 flex items-center justify-end gap-2 font-mono">
                                                    <Clock size={14} />
                                                    {remainingText}
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="px-6 pb-6 space-y-3">
                                        <div className="flex justify-between items-end text-[10px] font-black uppercase tracking-[0.15em] text-slate-500">
                                            <div className="flex items-center gap-2">
                                                <Zap size={12} className="text-[#1877f2]"/> Monitorizando {p.tempPath ? p.tempPath.split(/[/\\]/).pop() : (p.videoUrl ? p.videoUrl.split(/[/\\]/).pop()?.replace(/\.[^.]+$/, '') + '_t.mp4' : 'file_t.mp4')}
                                            </div>
                                            <span className="text-[#1877f2] text-lg font-black">{progress}%</span>
                                        </div>
                                        <div className="h-3 w-full bg-black/40 rounded-full overflow-hidden border border-white/5 p-[2px]">
                                            <div 
                                                className="h-full bg-gradient-to-r from-[#1877f2] via-[#2e89ff] to-cyan-400 rounded-full shadow-[0_0_15px_rgba(24,119,242,0.4)] transition-all duration-1000 ease-linear"
                                                style={{ width: `${progress}%` }}
                                            />
                                        </div>
                                        
                                        <div className="flex items-center justify-between pt-4 border-t border-white/5 mt-3">
                                            <div className="flex items-center gap-4">
                                                <div className="flex flex-col">
                                                    <span className="text-[9px] text-slate-600 font-black uppercase tracking-widest">Hardware Opt.</span>
                                                    <span className="text-[11px] text-indigo-400 font-black italic uppercase tracking-tight">H.264 Baseline Baseline</span>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2 px-4 py-1.5 bg-emerald-500/10 rounded-full border border-emerald-500/20 shadow-inner">
                                                <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                                                <span className="text-[10px] font-black text-emerald-500 uppercase tracking-tighter">Procesando</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Cola de Espera */}
                <div className="bg-[#1e293b] rounded-3xl shadow-2xl border border-white/5 overflow-hidden">
                    <div className="p-5 border-b border-white/5 flex flex-col md:flex-row justify-between items-center gap-4 bg-black/20">
                        <div>
                            <h3 className="text-sm font-black text-white flex items-center gap-2 uppercase tracking-widest">
                                <Layers size={18} className="text-[#1877f2]" /> Cola de Espera ({waitingVideos.length})
                            </h3>
                            <p className="text-[10px] text-slate-500 font-bold uppercase mt-1 tracking-wider italic">Archivos esperando asignación de CPU</p>
                        </div>
                        
                        <div className="flex items-center gap-2 flex-wrap justify-center">
                            <button 
                                onClick={toggleSelectAll}
                                className="px-4 py-2 bg-white/5 hover:bg-white/10 text-[10px] font-black text-slate-300 uppercase rounded-xl transition-all border border-white/5"
                            >
                                {selectedIds.size === waitingVideos.length ? 'Deseleccionar' : 'Todos'}
                            </button>
                            
                            {selectedIds.size > 0 && (
                                <div className="flex gap-2 animate-in slide-in-from-right-4">
                                    <button 
                                        onClick={() => handleBulkAction('admin_remove_from_queue')}
                                        className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-[10px] font-black text-red-500 uppercase rounded-xl transition-all border border-red-500/20"
                                    >
                                        Quitar ({selectedIds.size})
                                    </button>
                                    <button 
                                        onClick={handleBulkDeletePhysical}
                                        className="px-4 py-2 bg-red-600 hover:bg-red-500 text-[10px] font-black text-white uppercase rounded-xl shadow-lg shadow-red-900/40 transition-all"
                                    >
                                        Borrar Disco
                                    </button>
                                </div>
                            )}
                            
                            <button 
                                onClick={handleProcessSingle}
                                disabled={isProcessingSingle || activeProcesses.length >= 2} 
                                className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-[10px] font-black text-white uppercase rounded-xl shadow-lg shadow-emerald-900/40 transition-all flex items-center gap-2"
                            >
                                {isProcessingSingle ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />} 
                                Procesar 1
                            </button>
                        </div>
                    </div>

                    <div className="max-h-[500px] overflow-y-auto divide-y divide-white/5 custom-scrollbar">
                        {waitingVideos.length === 0 ? (
                            <div className="p-20 text-center">
                                <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-600">
                                    <FileVideo size={32} />
                                </div>
                                <p className="text-xs font-black text-slate-500 uppercase tracking-widest italic">La cola está vacía</p>
                            </div>
                        ) : (
                            waitingVideos.map(v => {
                                const isSelected = selectedIds.has(v.id);
                                const duration = (v as any).duration || 0;
                                const estSize = duration > 0 
                                    ? (Math.round(duration * 203.5 / 1024) + ' MB')
                                    : (v.size_bytes ? (Math.round(v.size_bytes * 0.45 / 1024 / 1024) + ' MB') : '--');
                                
                                return (
                                    <div 
                                        key={v.id} 
                                        className={`p-4 flex items-center gap-4 hover:bg-white/5 transition-colors group ${isSelected ? 'bg-[#1877f2]/10' : ''}`}
                                    >
                                        <div 
                                            onClick={() => toggleSelect(v.id)}
                                            className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center cursor-pointer transition-all ${isSelected ? 'bg-[#1877f2] border-[#1877f2]' : 'border-slate-700 bg-slate-900 group-hover:border-slate-500'}`}
                                        >
                                            {isSelected && <CheckCircle2 size={16} className="text-white" />}
                                        </div>
                                        
                                        <div className="w-16 h-10 bg-slate-800 rounded-lg overflow-hidden shrink-0 border border-white/5 shadow-inner">
                                            <img 
                                                src={v.thumbnailUrl} 
                                                className="w-full h-full object-cover" 
                                                referrerPolicy="no-referrer"
                                                alt=""
                                            />
                                        </div>

                                        <div className="flex-1 min-w-0 pr-2 overflow-hidden">
                                            <div className="text-[12px] md:text-[14px] font-black text-white truncate flex items-center gap-2 uppercase tracking-tight">
                                                {v.title}
                                                {(v as any).queue_priority > 0 && <Zap size={12} className="text-amber-500 fill-amber-500 shrink-0"/>}
                                            </div>
                                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1 text-[9px] md:text-[11px] text-slate-500 font-bold uppercase tracking-tighter">
                                                <span className="flex items-center gap-1 shrink-0"><HardDrive size={11}/> {v.size_fmt || 'N/A'}</span>
                                                <span className="text-slate-800 opacity-30">•</span>
                                                <span className="flex items-center gap-1 text-[#1877f2] shrink-0"><Zap size={11} className="fill-[#1877f2]"/> {estSize} Est.</span>
                                                <span className="text-slate-800 opacity-30">•</span>
                                                <span className="font-mono text-slate-600 uppercase shrink-0">{v.videoUrl.split('.').pop() || '??'}</span>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2 shrink-0 self-center md:self-auto">
                                            <div className="hidden lg:flex flex-col gap-0.5 mr-1 px-1">
                                                <button onClick={() => handleReorder(v.id, 'UP')} className="p-1 hover:bg-white/10 rounded-lg text-slate-600 hover:text-white" title="Subir"><ChevronRight size={12} className="-rotate-90"/></button>
                                                <button onClick={() => handleReorder(v.id, 'DOWN')} className="p-1 hover:bg-white/10 rounded-lg text-slate-600 hover:text-white" title="Bajar"><ChevronRight size={12} className="rotate-90"/></button>
                                            </div>
                                            <button 
                                                onClick={() => handleStartNow(v.id)}
                                                className="px-2 md:px-3 py-1.5 md:py-2 bg-[#1877f2]/10 hover:bg-[#1877f2] text-[#1877f2] hover:text-white rounded-lg md:rounded-xl text-[8px] md:text-[10px] font-black uppercase transition-all border border-[#1877f2]/20 whitespace-nowrap"
                                            >
                                                Priorizar
                                            </button>
                                            <button 
                                                onClick={() => handleAction(`admin_remove_from_queue&videoId=${v.id}`)}
                                                className="p-1.5 md:p-2 text-slate-600 hover:text-red-500 hover:bg-red-500/10 rounded-lg md:rounded-xl transition-all"
                                                title="Quitar"
                                            >
                                                <X size={18} />
                                            </button>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                    
                    {waitingVideos.length > 0 && (
                        <div className="p-4 bg-black/40 border-t border-white/5 flex justify-between items-center text-[10px] font-black text-slate-600 uppercase tracking-[0.2em] px-6">
                            <span>{waitingVideos.length} ARCHIVOS PENDIENTES</span>
                            <span className="text-[#1877f2]">STORAGE ESTIMADO: ~( {Math.round(waitingVideos.reduce((acc, v) => acc + (v.size_bytes || 0), 0) / 1024 / 1024 / 1024 * 0.45 * 10) / 10} GB )</span>
                        </div>
                    )}
                </div>
            </div>

            <div className="max-w-4xl mx-auto p-4">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-8 space-y-6">
                    <div className="bg-[#1e293b] rounded-3xl shadow-2xl border border-white/5 p-6">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-[11px] font-black text-slate-400 flex items-center gap-2 uppercase tracking-[0.2em]">
                                <Settings2 size={18} className="text-slate-500"/>
                                Perfiles Engine
                            </h3>
                            <button onClick={() => setShowProfileEditor(true)} className="p-1 px-4 bg-[#1877f2] rounded-full text-white text-[10px] font-black uppercase hover:bg-[#166fe5] transition-all shadow-lg shadow-[#1877f2]/30">Nuevo Perfil</button>
                        </div>
                        <div className="space-y-3">
                            {profiles.length === 0 ? (
                                <div className="text-center py-10 text-slate-600 text-xs font-black uppercase tracking-widest italic opacity-50">Sin perfiles activos</div>
                            ) : profiles.map(p => (
                                <div key={p.extension} className="bg-black/20 p-4 rounded-2xl border border-white/5 flex items-center justify-between group hover:border-[#1877f2]/30 transition-all">
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-3">
                                            <span className="bg-[#1877f2] text-white px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase shadow-lg shadow-[#1877f2]/20">.{p.extension}</span>
                                            <span className="text-[14px] font-black text-white truncate tracking-tight">{p.description}</span>
                                        </div>
                                        <code className="text-[10px] text-slate-500 mt-2 block break-all font-mono opacity-60 group-hover:opacity-100 transition-opacity">ffmpeg {p.command_args}</code>
                                    </div>
                                    <button onClick={() => handleDeleteProfile(p.extension)} className="p-2.5 text-slate-700 hover:text-red-500 transition-colors hover:bg-red-500/10 rounded-full ml-4"><Trash2 size={18}/></button>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="bg-[#0b0e14] rounded-3xl p-6 shadow-2xl border border-white/5 flex flex-col h-80">
                         <div className="flex justify-between items-center mb-4 border-b border-white/5 pb-3">
                             <div className="flex items-center gap-2 text-slate-500">
                                 <Terminal size={14} className="text-[#1877f2]"/>
                                 <span className="text-[10px] font-black uppercase tracking-widest leading-none">FFmpeg Low-Level Log</span>
                             </div>
                             <div className="flex gap-4">
                                <button onClick={() => handleAction('admin_clear_logs')} className="text-[9px] text-slate-600 hover:text-red-400 uppercase font-black tracking-widest transition-colors">Limpiar</button>
                                <button onClick={loadData} className="text-[9px] text-slate-600 hover:text-[#1877f2] uppercase font-black tracking-widest transition-colors">Refrescar</button>
                             </div>
                         </div>
                         <div className="font-mono text-[10px] flex-1 overflow-y-auto space-y-1.5 custom-scrollbar text-slate-500 tracking-tight">
                            {log.map((line, i) => {
                                const isError = line.includes('ERROR') || line.includes('fail') || line.includes('DENIED');
                                return (
                                    <div key={i} className={`flex gap-4 leading-relaxed ${isError ? 'text-red-400/80 bg-red-500/5 px-2 rounded' : 'text-slate-600 hover:text-slate-400 transition-colors'}`}>
                                        <span className="opacity-20 shrink-0 select-none font-black">[{i}]</span>
                                        <span className="break-all">{line}</span>
                                    </div>
                                );
                            })}
                            {log.length === 0 && <div className="text-center py-20 opacity-20 italic">No hay logs registrados</div>}
                         </div>
                    </div>
                </div>

                <div className="lg:col-span-4 space-y-6">
                    <div className="bg-[#1e293b] rounded-3xl shadow-2xl border border-white/5 p-6">
                        <h3 className="text-[11px] font-black text-slate-500 uppercase tracking-[0.2em] mb-5">Mantenimiento</h3>
                        <div className="space-y-3">
                            <button 
                                onClick={handleReconstructThumbnails}
                                className="w-full py-3.5 bg-black/20 hover:bg-[#1877f2]/10 text-slate-300 hover:text-[#1877f2] rounded-2xl font-black text-[11px] uppercase tracking-widest transition-all flex items-center justify-center gap-3 border border-white/5 hover:border-[#1877f2]/30 active:scale-95"
                            >
                                <ImageIcon size={18}/> Re-Generar Miniaturas
                            </button>
                            <button 
                                onClick={() => handleAction('admin_retry_failed_transcodes')}
                                className="w-full py-3.5 bg-black/20 hover:bg-amber-500/10 text-slate-300 hover:text-amber-500 rounded-2xl font-black text-[11px] uppercase tracking-widest transition-all flex items-center justify-center gap-3 border border-white/5 hover:border-amber-500/30 active:scale-95"
                            >
                                <RotateCcw size={18}/> Retentativa de Fallidos
                            </button>
                        </div>
                    </div>

                    <div className="bg-[#1e293b] rounded-3xl shadow-2xl border border-white/5 p-6">
                        <h3 className="text-[11px] font-black text-slate-500 uppercase tracking-[0.2em] mb-5">Filtros Auto-Queue</h3>
                        <div className="space-y-3">
                            <label className="flex items-center gap-4 p-3.5 bg-black/20 border border-white/5 hover:border-white/10 rounded-2xl cursor-pointer transition-all group">
                                <input type="checkbox" checked={filters.onlyNonMp4} onChange={e => setFilters({...filters, onlyNonMp4: e.target.checked})} className="accent-[#1877f2] w-5 h-5"/>
                                <span className="text-[11px] font-black text-slate-400 group-hover:text-slate-200 uppercase tracking-widest">Solo No-MP4</span>
                            </label>
                            <label className="flex items-center gap-4 p-3.5 bg-black/20 border border-white/5 hover:border-white/10 rounded-2xl cursor-pointer transition-all group">
                                <input type="checkbox" checked={filters.onlyIncompatible} onChange={e => setFilters({...filters, onlyIncompatible: e.target.checked})} className="accent-[#1877f2] w-5 h-5"/>
                                <span className="text-[11px] font-black text-slate-400 group-hover:text-slate-200 uppercase tracking-widest">Incompatibles</span>
                            </label>
                            
                            <div className="grid grid-cols-2 gap-3 pt-4">
                                <button onClick={() => handleScanFilter('PREVIEW')} disabled={isScanning} className="bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white py-3.5 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all border border-white/5 shadow-inner">Escanear</button>
                                <button onClick={() => handleScanFilter('EXECUTE')} disabled={isScanning} className="bg-[#1877f2] hover:bg-[#166fe5] text-white py-3.5 rounded-2xl text-[11px] font-black uppercase tracking-widest shadow-lg shadow-[#1877f2]/30 active:scale-95">Encolar</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

            {/* Modal: Fallidos */}
            {showFailedList && (
                <div className="fixed inset-0 z-[200] bg-[#0b0e14]/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-300">
                    <div className="bg-[#1e293b] border border-white/5 w-full max-w-xl rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
                        <div className="p-6 bg-white/5 border-b border-white/5 flex justify-between items-center">
                            <div>
                                <h3 className="font-black text-white text-lg tracking-tight">Videos con Interrupción</h3>
                                <p className="text-[10px] text-red-500 font-black uppercase tracking-widest mt-1">Error de procesamiento crítico</p>
                            </div>
                            <button onClick={() => setShowFailedList(false)} className="p-3 bg-white/5 rounded-full text-slate-400 hover:text-white transition-colors"><X size={20}/></button>
                        </div>
                        <div className="max-h-[60vh] overflow-y-auto p-6 space-y-3 bg-black/20 custom-scrollbar">
                            {failedVideos.length === 0 && (
                                <div className="text-center py-20">
                                    <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-600">
                                        <AlertCircle size={32} />
                                    </div>
                                    <p className="text-xs font-black text-slate-500 uppercase tracking-widest italic opacity-50">Cero incidencias registradas</p>
                                </div>
                            )}
                            {failedVideos.map(v => (
                                <div key={v.id} className="bg-[#1e293b] border border-white/5 p-5 rounded-3xl flex items-center justify-between group shadow-lg hover:border-red-500/30 transition-all">
                                    <div className="min-w-0 pr-4">
                                        <div className="text-[14px] font-black text-white truncate max-w-[300px] tracking-tight uppercase">{v.title}</div>
                                        <div className="text-[10px] text-red-400 font-black mt-2 bg-red-500/10 px-3 py-1 rounded-full inline-flex items-center gap-2 border border-red-500/20">
                                            <AlertTriangle size={10}/> {v.reason || 'Error de Proceso'}
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <button onClick={() => handleAction(`admin_remove_from_queue&videoId=${v.id}`)} className="p-3 bg-white/5 rounded-xl text-slate-500 hover:text-red-500 border border-white/5 hover:bg-red-500/10" title="Eliminar"><Trash2 size={16}/></button>
                                        <button onClick={() => handleAction(`admin_skip_transcode&videoId=${v.id}`)} className="p-3 bg-white/5 rounded-xl text-slate-500 hover:text-emerald-500 border border-white/5 hover:bg-emerald-500/10" title="Forzar Listo"><FastForward size={16}/></button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Modal: Perfil Editor */}
            {showProfileEditor && (
                <div className="fixed inset-0 z-[200] bg-[#0b0e14]/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-300">
                    <div className="bg-[#1e293b] border border-white/5 rounded-[3rem] w-full max-w-xl p-8 shadow-2xl animate-in zoom-in-95 duration-300">
                        <div className="flex justify-between items-center mb-8">
                            <div>
                                <h4 className="font-black text-white text-xl tracking-tight">Editor de Perfiles</h4>
                                <p className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em] mt-1">Configuración FFmpeg Advanced</p>
                            </div>
                            <button onClick={() => setShowProfileEditor(false)} className="p-3 bg-white/5 rounded-full text-slate-400 hover:text-white transition-colors"><X size={24}/></button>
                        </div>
                        <div className="space-y-6">
                            <div className="bg-black/30 p-6 rounded-3xl border border-white/5 shadow-inner">
                                <label className="text-[10px] font-black text-slate-500 uppercase block mb-4 tracking-[0.25em] text-center">Templates Optimizados</label>
                                <div className="grid grid-cols-1 gap-3">
                                    {SUGGESTED_PROFILES.map((p, i) => (
                                        <button 
                                            key={i}
                                            onClick={() => setEditingProfile({ extension: p.ext, command_args: p.args, description: p.name })}
                                            className="text-left p-4 rounded-2xl bg-white/5 border border-white/5 hover:border-[#1877f2]/50 hover:bg-[#1877f2]/5 transition-all group relative overflow-hidden"
                                        >
                                            <div className="flex justify-between items-center relative z-10">
                                                <span className="text-[13px] font-black text-slate-200 group-hover:text-[#1877f2] transition-colors">{p.name}</span>
                                                <span className="text-[10px] font-mono text-slate-500 bg-black/40 px-2 py-0.5 rounded">.{p.ext}</span>
                                            </div>
                                            <div className="text-[10px] text-slate-500 font-bold mt-1.5 leading-tight group-hover:text-slate-400">{p.desc}</div>
                                        </button>
                                    ))}
                                </div>
                            </div>
                            
                            <div className="grid grid-cols-1 gap-5">
                                <div>
                                    <label className="text-[10px] font-black text-slate-500 uppercase block mb-2 px-1 tracking-widest font-mono">Output Extension</label>
                                    <input type="text" value={editingProfile.extension} onChange={e => setEditingProfile({...editingProfile, extension: e.target.value.toLowerCase()})} className="w-full bg-black/40 border border-white/10 rounded-2xl px-5 py-3.5 text-white font-mono text-sm outline-none focus:border-[#1877f2] focus:ring-4 focus:ring-[#1877f2]/10 transition-all placeholder:text-slate-700 shadow-inner" placeholder="ej: mp4" />
                                </div>
                                <div>
                                    <label className="text-[10px] font-black text-slate-500 uppercase block mb-2 px-1 tracking-widest font-mono">FFmpeg Argument Pipeline</label>
                                    <textarea rows={4} value={editingProfile.command_args} onChange={e => setEditingProfile({...editingProfile, command_args: e.target.value})} className="w-full bg-black/40 border border-white/10 rounded-2xl px-5 py-4 text-[#1877f2] font-mono text-[11px] outline-none focus:border-[#1877f2] focus:ring-4 focus:ring-[#1877f2]/10 transition-all resize-none shadow-inner leading-relaxed" />
                                </div>
                            </div>
                            <button onClick={() => handleSaveProfile()} className="w-full py-5 bg-[#1877f2] hover:bg-[#166fe5] text-white font-black rounded-2xl shadow-xl shadow-[#1877f2]/20 transition-all active:scale-[0.98] uppercase tracking-widest text-xs mt-4">Desplegar Perfil</button>
                        </div>
                    </div>
                </div>
            )}
            
            <style>{`
                .custom-scrollbar::-webkit-scrollbar { width: 6px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.05); border-radius: 10px; }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.1); }
            `}</style>
        </div>
    );
}