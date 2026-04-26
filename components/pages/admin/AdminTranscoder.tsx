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
        <div className="min-h-screen bg-[#f0f2f5] text-[#1c1e21] pb-20 font-sans">
            {/* Header */}
            <div className="sticky top-0 z-50 bg-white shadow-sm border-b border-gray-200 px-4 py-2 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <button onClick={() => navigate('/admin')} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                        <ChevronRight size={24} className="text-gray-600 rotate-180" />
                    </button>
                    <div className="flex items-center gap-2">
                        <div className="w-10 h-10 bg-[#1877f2] rounded-full flex items-center justify-center text-white shadow-md">
                            <Activity size={20} />
                        </div>
                        <div>
                            <h1 className="text-lg font-bold leading-tight">Gestor de Conversión</h1>
                            <p className="text-[11px] text-gray-500 font-medium uppercase tracking-wider">Estado: <span className="text-green-600 font-bold">En Línea</span></p>
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={loadData} className={`p-2.5 bg-gray-100 hover:bg-gray-200 rounded-full transition-all ${isScanning ? 'animate-spin' : ''}`}>
                        <RefreshCw size={20} className="text-gray-700" />
                    </button>
                </div>
            </div>

            <div className="max-w-4xl mx-auto p-4 space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
                        <div className="flex justify-between items-center mb-1">
                            <Layers size={18} className="text-gray-400"/>
                            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">En Cola</span>
                        </div>
                        <div className="text-2xl font-bold text-[#1c1e21]">{stats.waiting}</div>
                    </div>
                    <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
                        <div className="flex justify-between items-center mb-1">
                            <Activity size={18} className="text-[#1877f2]"/>
                            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Activos</span>
                        </div>
                        <div className="text-2xl font-bold text-[#1877f2]">{activeProcesses.length}</div>
                    </div>
                    <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 cursor-pointer hover:bg-gray-50 transition-colors" onClick={() => setShowFailedList(true)}>
                        <div className="flex justify-between items-center mb-1">
                            <AlertTriangle size={18} className="text-red-500"/>
                            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Fallidos</span>
                        </div>
                        <div className="text-2xl font-bold text-red-600">{stats.failed}</div>
                    </div>
                    <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
                        <div className="flex justify-between items-center mb-1">
                            <CheckCircle2 size={18} className="text-green-500"/>
                            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Listos</span>
                        </div>
                        <div className="text-2xl font-bold text-green-600">{stats.done}</div>
                    </div>
                </div>

                {/* Switch Principal */}
                <div className={`p-4 rounded-2xl border transition-all flex flex-col md:flex-row justify-between items-center gap-4 bg-white shadow-sm border-gray-200`}>
                    <div className="flex items-center gap-4">
                        <div className={`p-3 rounded-2xl ${autoTranscode ? 'bg-[#e7f3ff] text-[#1877f2]' : 'bg-gray-100 text-gray-400'}`}>
                            <Zap size={24} className={autoTranscode ? 'animate-pulse' : ''} />
                        </div>
                        <div>
                            <h3 className="text-sm font-bold text-gray-900">Modo Automático (Worker)</h3>
                            <p className="text-[11px] text-gray-500 font-medium uppercase tracking-tighter">Cron activo cada 60 segundos</p>
                        </div>
                    </div>
                    <button 
                        onClick={handleToggleAuto}
                        className={`flex items-center gap-3 px-6 py-2.5 rounded-full font-bold text-[11px] uppercase tracking-widest transition-all ${autoTranscode ? 'bg-[#1877f2] text-white shadow-lg' : 'bg-gray-200 text-gray-600'}`}
                    >
                        {autoTranscode ? <><ToggleRight size={20}/> Encendido</> : <><ToggleLeft size={20}/> Apagado</>}
                    </button>
                </div>

            {activeProcesses.length > 0 && (
                <div className="space-y-3">
                    <div className="flex items-center justify-between px-1">
                        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
                            <Activity size={14} className="text-[#1877f2]" />
                            Procesando Ahora ({activeProcesses.length})
                        </h3>
                    </div>
                    
                    <div className="space-y-4">
                        {activeProcesses.map((p, i) => {
                            const progress = p.progress || 0;
                            const outSize = p.current_output_size ? (p.current_output_size / (1024 * 1024)).toFixed(1) + ' MB' : '0 MB';
                            const estFinal = p.expected_output_size ? (Math.round(p.expected_output_size / (1024 * 1024)) + ' MB') : '...';
                            
                            // Cálculo de tiempo estimado
                            const etime = p.etime || 0; 
                            let remainingText = "Estimando...";
                            if (progress > 0 && etime > 2) {
                                const totalSec = etime / (progress / 100);
                                const remSec = Math.max(0, Math.round(totalSec - etime));
                                if (remSec > 60) {
                                    remainingText = `${Math.floor(remSec / 60)}m ${remSec % 60}s`;
                                } else {
                                    remainingText = `${remSec}s`;
                                }
                            }

                            return (
                                <div key={i} className="bg-white rounded-2xl shadow-md border border-gray-200 overflow-hidden">
                                    <div className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                                        <div className="flex items-center gap-4">
                                            <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center text-[#1877f2] shrink-0 border border-gray-200 shadow-inner">
                                                <Terminal size={24} />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <h4 className="text-[15px] font-bold text-gray-900 truncate pr-8">{p.title || 'Extrayendo metadatos...'}</h4>
                                                <div className="flex flex-wrap items-center gap-y-1 gap-x-3 mt-1.5">
                                                    <span className="text-[10px] font-bold text-[#1877f2] bg-[#e7f3ff] px-2 py-0.5 rounded">PID: {p.pid}</span>
                                                    <span className="text-[11px] text-gray-500 font-bold uppercase flex items-center gap-1">
                                                         {outSize} / <span className="text-gray-400">{estFinal}</span>
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-6">
                                            <div className="text-right">
                                                <div className="text-[10px] text-gray-400 font-black uppercase mb-0.5 tracking-tight">Escrito</div>
                                                <div className="text-[13px] font-bold text-gray-900 flex items-center justify-end gap-1.5 font-mono">
                                                    <HardDrive size={14} className="text-gray-400" />
                                                    {outSize}
                                                </div>
                                            </div>
                                            <div className="text-right border-l border-gray-100 pl-6">
                                                <div className="text-[10px] text-gray-400 font-black uppercase mb-0.5 tracking-tight">Restante</div>
                                                <div className="text-[13px] font-bold text-[#1877f2] flex items-center justify-end gap-1.5 font-mono">
                                                    <Clock size={14} />
                                                    {remainingText}
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="px-4 pb-4 space-y-2">
                                        <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-widest text-gray-400">
                                            <span>Progreso real por tamaño de archivo</span>
                                            <span className="text-[#1877f2] text-sm">{progress}%</span>
                                        </div>
                                        <div className="h-2.5 w-full bg-gray-100 rounded-full overflow-hidden border border-gray-50 shadow-inner">
                                            <div 
                                                className="h-full bg-gradient-to-r from-[#1877f2] to-[#2e89ff] transition-all duration-700 ease-out"
                                                style={{ width: `${progress}%` }}
                                            />
                                        </div>
                                        
                                        <div className="flex items-center justify-between pt-3 border-t border-gray-100 mt-2">
                                            <div className="flex items-center gap-3">
                                                <div className="flex flex-col">
                                                    <span className="text-[9px] text-gray-400 font-bold uppercase tracking-wider">Carga CPU</span>
                                                    <span className="text-[11px] text-[#1877f2] font-black italic uppercase">Low Load (2 Cores)</span>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2 px-3 py-1 bg-green-50 rounded-lg border border-green-100">
                                                <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                                                <span className="text-[10px] font-bold text-green-600 uppercase tracking-tighter">Precision Optimized</span>
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
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="p-4 border-b border-gray-100 flex flex-col md:flex-row justify-between items-center gap-4 bg-gray-50/50">
                        <div>
                            <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
                                <Layers size={16} className="text-[#1877f2]" /> Cola de Espera ({waitingVideos.length})
                            </h3>
                            <p className="text-[10px] text-gray-500 font-bold uppercase mt-1">Videos esperando recursos</p>
                        </div>
                        
                        <div className="flex items-center gap-2 flex-wrap justify-center">
                            <button 
                                onClick={toggleSelectAll}
                                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-[10px] font-bold text-gray-700 uppercase rounded-lg transition-all"
                            >
                                {selectedIds.size === waitingVideos.length ? 'Deseleccionar' : 'Todos'}
                            </button>
                            
                            {selectedIds.size > 0 && (
                                <div className="flex gap-2 animate-in slide-in-from-right-4">
                                    <button 
                                        onClick={() => handleBulkAction('admin_remove_from_queue')}
                                        className="px-4 py-2 bg-red-50 hover:bg-red-100 text-[10px] font-bold text-red-600 uppercase rounded-lg transition-all border border-red-100"
                                    >
                                        Quitar ({selectedIds.size})
                                    </button>
                                    <button 
                                        onClick={handleBulkDeletePhysical}
                                        className="px-4 py-2 bg-red-600 hover:bg-red-700 text-[10px] font-bold text-white uppercase rounded-lg shadow-md transition-all"
                                    >
                                        Borrar Disco
                                    </button>
                                </div>
                            )}
                            
                            <button 
                                onClick={handleProcessSingle}
                                disabled={isProcessingSingle || activeProcesses.length >= 2} 
                                className="px-5 py-2 bg-[#1877f2] hover:bg-[#166fe5] disabled:opacity-50 text-[10px] font-bold text-white uppercase rounded-lg shadow-md transition-all flex items-center gap-2"
                            >
                                {isProcessingSingle ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />} 
                                Procesar 1
                            </button>
                        </div>
                    </div>

                    <div className="max-h-[500px] overflow-y-auto divide-y divide-gray-100">
                        {waitingVideos.length === 0 ? (
                            <div className="p-16 text-center text-gray-400 text-sm font-medium">
                                No hay videos pendientes en la cola
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
                                        className={`p-4 flex items-center gap-4 hover:bg-gray-50 transition-colors group ${isSelected ? 'bg-[#e7f3ff]' : ''}`}
                                    >
                                        <div 
                                            onClick={() => toggleSelect(v.id)}
                                            className={`w-6 h-6 rounded-md border-2 flex items-center justify-center cursor-pointer transition-all ${isSelected ? 'bg-[#1877f2] border-[#1877f2]' : 'border-gray-300 bg-white group-hover:border-gray-400'}`}
                                        >
                                            {isSelected && <CheckCircle2 size={16} className="text-white" />}
                                        </div>
                                        
                                        <div className="w-16 h-10 bg-gray-100 rounded-lg overflow-hidden shrink-0 border border-gray-200">
                                            <img 
                                                src={v.thumbnailUrl} 
                                                className="w-full h-full object-cover" 
                                                referrerPolicy="no-referrer"
                                                alt=""
                                            />
                                        </div>

                                        <div className="flex-1 min-w-0">
                                            <div className="text-[14px] font-bold text-gray-900 truncate flex items-center gap-2">
                                                {v.title}
                                                {(v as any).queue_priority > 0 && <span className="bg-amber-100 text-amber-700 text-[9px] px-1.5 rounded uppercase font-black">Prioritario</span>}
                                            </div>
                                            <div className="flex items-center gap-3 mt-1 text-[11px] text-gray-500 font-medium tracking-tight">
                                                <span className="flex items-center gap-1"><HardDrive size={11}/> {v.size_fmt || 'N/A'}</span>
                                                <span className="text-gray-300">•</span>
                                                <span className="flex items-center gap-1 text-[#1877f2] font-bold"><Zap size={11} /> {estSize} Est.</span>
                                                <span className="text-gray-300">•</span>
                                                <span className="font-mono text-gray-400 uppercase">{v.videoUrl.split('.').pop() || '??'}</span>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <div className="flex flex-col gap-1 mr-2">
                                                <button onClick={() => handleReorder(v.id, 'UP')} className="p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-[#1877f2]" title="Subir"><ChevronRight size={14} className="-rotate-90"/></button>
                                                <button onClick={() => handleReorder(v.id, 'DOWN')} className="p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-[#1877f2]" title="Bajar"><ChevronRight size={14} className="rotate-90"/></button>
                                            </div>
                                            <button 
                                                onClick={() => handleStartNow(v.id)}
                                                className="px-3 py-1.5 bg-[#e7f3ff] hover:bg-[#1877f2] text-[#1877f2] hover:text-white rounded-lg text-[10px] font-bold uppercase transition-all shadow-sm border border-[#1877f2]/20"
                                            >
                                                Ahora
                                            </button>
                                            <button 
                                                onClick={() => handleAction(`admin_remove_from_queue&videoId=${v.id}`)}
                                                className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
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
                        <div className="p-3 bg-gray-50 border-t border-gray-100 flex justify-between items-center text-[10px] font-bold text-gray-500 uppercase tracking-widest px-4">
                            <span>{waitingVideos.length} ARCHIVOS PENDIENTES</span>
                            <span className="text-[#1877f2]">MEMORIA ESTIMADA: ~( {Math.round(waitingVideos.reduce((acc, v) => acc + (v.size_bytes || 0), 0) / 1024 / 1024 / 1024 * 0.45 * 10) / 10} GB )</span>
                        </div>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                <div className="lg:col-span-8 space-y-4">
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
                                <Settings2 size={18} className="text-gray-500"/>
                                Perfiles de Transcodificación
                            </h3>
                            <button onClick={() => setShowProfileEditor(true)} className="p-1 px-3 bg-[#1877f2] rounded-lg text-white text-[10px] font-bold uppercase hover:bg-[#166fe5] transition-all">Nuevo</button>
                        </div>
                        <div className="space-y-2">
                            {profiles.length === 0 ? (
                                <div className="text-center py-8 text-gray-400 text-xs font-medium">No hay perfiles configurados</div>
                            ) : profiles.map(p => (
                                <div key={p.extension} className="bg-gray-50 p-3 rounded-xl border border-gray-100 flex items-center justify-between group">
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <span className="bg-[#1877f2] text-white px-2 py-0.5 rounded text-[9px] font-bold">.{p.extension}</span>
                                            <span className="text-[13px] font-bold text-gray-800">{p.description}</span>
                                        </div>
                                        <code className="text-[10px] text-gray-400 mt-1 block break-all font-mono">ffmpeg {p.command_args}</code>
                                    </div>
                                    <button onClick={() => handleDeleteProfile(p.extension)} className="p-2 text-gray-300 hover:text-red-500 transition-colors"><Trash2 size={16}/></button>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="bg-[#1c1e21] rounded-xl p-5 shadow-lg flex flex-col h-64">
                         <div className="flex justify-between items-center mb-3 border-b border-white/5 pb-2">
                             <div className="flex items-center gap-2 text-gray-400">
                                 <Terminal size={14}/>
                                 <span className="text-[10px] font-bold uppercase tracking-widest leading-none">Terminal Output</span>
                             </div>
                             <button onClick={() => handleAction('admin_clear_logs')} className="text-[9px] text-gray-500 hover:text-white uppercase font-bold">Limpiar</button>
                         </div>
                         <div className="font-mono text-[10px] flex-1 overflow-y-auto space-y-1 custom-scrollbar text-gray-400 leading-relaxed">
                            {log.map((line, i) => {
                                const isError = line.includes('ERROR') || line.includes('fail') || line.includes('DENIED');
                                return (
                                    <div key={i} className={`flex gap-3 ${isError ? 'text-red-400' : 'text-gray-500'}`}>
                                        <span className="opacity-20 shrink-0 select-none">{i}</span>
                                        <span className="break-all">{line}</span>
                                    </div>
                                );
                            })}
                         </div>
                    </div>
                </div>

                <div className="lg:col-span-4 space-y-4">
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                        <h3 className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-3">Mantenimiento</h3>
                        <div className="space-y-2">
                            <button 
                                onClick={handleReconstructThumbnails}
                                className="w-full py-2.5 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-lg font-bold text-[11px] uppercase tracking-wide transition-all flex items-center justify-center gap-2 border border-gray-200"
                            >
                                <ImageIcon size={14}/> Reconstruir Miniaturas
                            </button>
                            <button 
                                onClick={() => handleAction('admin_retry_failed_transcodes')}
                                className="w-full py-2.5 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-lg font-bold text-[11px] uppercase tracking-wide transition-all flex items-center justify-center gap-2 border border-gray-200"
                            >
                                <RotateCcw size={14}/> Reintentar Fallidos
                            </button>
                        </div>
                    </div>

                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                        <h3 className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-3">Escaneo y Auto-Cola</h3>
                        <div className="space-y-2">
                            <label className="flex items-center gap-3 p-2.5 hover:bg-gray-50 rounded-lg cursor-pointer transition-colors">
                                <input type="checkbox" checked={filters.onlyNonMp4} onChange={e => setFilters({...filters, onlyNonMp4: e.target.checked})} className="accent-[#1877f2] w-4 h-4"/>
                                <span className="text-[11px] font-bold text-gray-600 uppercase">Solo No-MP4</span>
                            </label>
                            <label className="flex items-center gap-3 p-2.5 hover:bg-gray-50 rounded-lg cursor-pointer transition-colors">
                                <input type="checkbox" checked={filters.onlyIncompatible} onChange={e => setFilters({...filters, onlyIncompatible: e.target.checked})} className="accent-[#1877f2] w-4 h-4"/>
                                <span className="text-[11px] font-bold text-gray-600 uppercase">Incompatibles</span>
                            </label>
                            <label className="flex items-center gap-3 p-2.5 hover:bg-gray-50 rounded-lg cursor-pointer transition-colors">
                                <input type="checkbox" checked={filters.onlyAudios} onChange={e => setFilters({...filters, onlyAudios: e.target.checked})} className="accent-[#1877f2] w-4 h-4"/>
                                <span className="text-[11px] font-bold text-gray-600 uppercase">Solo Audios</span>
                            </label>
                            <label className="flex items-center gap-3 p-2.5 hover:bg-gray-50 rounded-lg cursor-pointer transition-colors">
                                <input type="checkbox" checked={filters.onlyMetadataError} onChange={e => setFilters({...filters, onlyMetadataError: e.target.checked})} className="accent-[#1877f2] w-4 h-4"/>
                                <span className="text-[11px] font-bold text-gray-600 uppercase">Error Meta</span>
                            </label>
                            
                            <div className="grid grid-cols-2 gap-2 pt-2">
                                <button onClick={() => handleScanFilter('PREVIEW')} disabled={isScanning} className="bg-gray-100 text-gray-700 py-2.5 rounded-lg text-[10px] font-bold uppercase hover:bg-gray-200 transition-all">Escanear</button>
                                <button onClick={() => handleScanFilter('EXECUTE')} disabled={isScanning} className="bg-[#1877f2] text-white py-2.5 rounded-lg text-[10px] font-bold uppercase shadow-sm">Encolar</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Modal: Fallidos */}
            {showFailedList && (
                <div className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white border border-gray-200 w-full max-w-xl rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95">
                        <div className="p-4 bg-white border-b border-gray-100 flex justify-between items-center">
                            <div>
                                <h3 className="font-bold text-gray-900 text-base">Videos con Error</h3>
                                <p className="text-[11px] text-red-500 font-bold uppercase">Transcodificación fallida</p>
                            </div>
                            <button onClick={() => setShowFailedList(false)} className="p-2 bg-gray-100 rounded-full text-gray-500 hover:text-gray-700 transition-colors"><X size={20}/></button>
                        </div>
                        <div className="max-h-[60vh] overflow-y-auto p-4 space-y-3 bg-[#f0f2f5]/30">
                            {failedVideos.length === 0 && <div className="text-center py-10 text-gray-400 font-medium">No hay errores registrados</div>}
                            {failedVideos.map(v => (
                                <div key={v.id} className="bg-white border border-gray-200 p-4 rounded-xl flex items-center justify-between group shadow-sm transition-all hover:shadow-md">
                                    <div className="min-w-0">
                                        <div className="text-[13px] font-bold text-gray-900 truncate max-w-[250px]">{v.title}</div>
                                        <div className="text-[11px] text-red-500 font-bold mt-1 bg-red-50 px-2 py-0.5 rounded-full inline-block">{v.reason || 'Error de Proceso'}</div>
                                    </div>
                                    <div className="flex gap-2">
                                        <button onClick={() => handleAction(`admin_remove_from_queue&videoId=${v.id}`)} className="p-2 bg-gray-50 rounded-lg text-gray-400 hover:text-red-600 border border-gray-100"><Trash2 size={14}/></button>
                                        <button onClick={() => handleAction(`admin_skip_transcode&videoId=${v.id}`)} className="p-2 bg-gray-50 rounded-lg text-gray-400 hover:text-[#1877f2] border border-gray-100" title="Marcar como LISTO"><FastForward size={14}/></button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Modal: Perfil Editor */}
            {showProfileEditor && (
                <div className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white border border-gray-200 rounded-2xl w-full max-w-lg p-6 shadow-2xl animate-in zoom-in-95">
                        <div className="flex justify-between items-center mb-6">
                            <h4 className="font-bold text-gray-900 text-lg">Editor de Perfiles</h4>
                            <button onClick={() => setShowProfileEditor(false)} className="p-2 text-gray-400 hover:text-gray-600 transition-colors"><X /></button>
                        </div>
                        <div className="space-y-5">
                            <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 mb-4 shadow-inner">
                                <label className="text-[10px] font-bold text-gray-400 uppercase block mb-3 tracking-widest">Ajustes Sugeridos</label>
                                <div className="grid grid-cols-1 gap-2">
                                    {SUGGESTED_PROFILES.map((p, i) => (
                                        <button 
                                            key={i}
                                            onClick={() => setEditingProfile({ extension: p.ext, command_args: p.args, description: p.name })}
                                            className="text-left p-3 rounded-lg bg-white border border-gray-200 hover:border-[#1877f2] hover:bg-[#e7f3ff]/30 transition-all group"
                                        >
                                            <div className="flex justify-between items-center">
                                                <span className="text-[12px] font-bold text-gray-800 group-hover:text-[#1877f2]">{p.name}</span>
                                                <span className="text-[10px] font-mono text-gray-400">.{p.ext}</span>
                                            </div>
                                            <div className="text-[10px] text-gray-500 font-medium mt-1 leading-tight">{p.desc}</div>
                                        </button>
                                    ))}
                                </div>
                            </div>
                            
                            <div className="grid grid-cols-1 gap-4">
                                <div>
                                    <label className="text-[11px] font-bold text-gray-500 uppercase block mb-1 px-1">Extensión (ej: mp4)</label>
                                    <input type="text" value={editingProfile.extension} onChange={e => setEditingProfile({...editingProfile, extension: e.target.value.toLowerCase()})} className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-gray-900 font-mono text-sm outline-none focus:border-[#1877f2] focus:ring-2 focus:ring-[#1877f2]/10 transition-all" placeholder="ts" />
                                </div>
                                <div>
                                    <label className="text-[11px] font-bold text-gray-500 uppercase block mb-1 px-1">Comandos FFmpeg</label>
                                    <textarea rows={4} value={editingProfile.command_args} onChange={e => setEditingProfile({...editingProfile, command_args: e.target.value})} className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-gray-900 font-mono text-[11px] outline-none focus:border-[#1877f2] focus:ring-2 focus:ring-[#1877f2]/10 transition-all transition-all resize-none" />
                                </div>
                            </div>
                            <button onClick={() => handleSaveProfile()} className="w-full py-3.5 bg-[#1877f2] hover:bg-[#166fe5] text-white font-bold rounded-xl shadow-lg transition-all active:scale-95">GUARDAR PERFIL</button>
                        </div>
                    </div>
                </div>
            )}
            
            <style>{`
                .custom-scrollbar::-webkit-scrollbar { width: 5px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: #d1d5db; border-radius: 10px; }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #9ca3af; }
            `}</style>
        </div>
    );
}