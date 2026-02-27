
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { db } from '../../../services/db';
import { Video, SystemSettings } from '../../../types';
import { useToast } from '../../../context/ToastContext';
import { generateThumbnail } from '../../../utils/videoGenerator';
import { 
    FolderSearch, Loader2, Terminal, Film, Wand2, Database, RefreshCw, 
    CheckCircle2, Clock, AlertTriangle, ShieldAlert, Sparkles, Layers, 
    HardDrive, List, Play, ChevronRight, XCircle, Zap, FolderOpen, Lock, Music
} from 'lucide-react';

interface ScannerPlayerProps {
    video: Video;
    onComplete: (dur: number, thumb: File | null, success: boolean, clientIncompatible?: boolean) => void;
}

const ScannerPlayer: React.FC<ScannerPlayerProps> = ({ video, onComplete }) => {
    const [status, setStatus] = useState('Iniciando...');
    const [isAudio, setIsAudio] = useState(false);
    const processedRef = useRef(false);
    const videoRef = useRef<HTMLVideoElement>(null);

    useEffect(() => {
        const checkType = () => {
            const ext = video.videoUrl.split('.').pop()?.toLowerCase();
            const audioExts = ['mp3', 'wav', 'aac', 'm4a', 'flac'];
            const audioDetected = Boolean(video.is_audio) || (ext && audioExts.includes(ext)) || video.videoUrl.includes('.mp3');
            if (audioDetected) {
                setIsAudio(true);
                processMedia(true);
            }
        };
        checkType();
    }, [video.id]);

    const processMedia = async (force: boolean) => {
        if (processedRef.current) return;
        setStatus('Extrayendo Metadatos...');
        
        try {
            const streamUrl = video.videoUrl.includes('action=stream') ? video.videoUrl : `api/index.php?action=stream&id=${video.id}`;
            const result = await generateThumbnail(streamUrl, force, true);
            
            if (!processedRef.current) {
                processedRef.current = true;
                setStatus('Listo (Solo Duración)');
                onComplete(result.duration, null, result.duration > 0, false);
            }
        } catch (e) {
            if (!processedRef.current) {
                processedRef.current = true;
                setStatus('Error extracción');
                onComplete(0, null, false, true);
            }
        }
    };

    useEffect(() => {
        if (isAudio) return;

        const vid = videoRef.current;
        if (!vid) return;
        vid.src = video.videoUrl.includes('action=stream') ? video.videoUrl : `api/index.php?action=stream&id=${video.id}`;
        vid.muted = true;
        vid.crossOrigin = "anonymous";
        
        const timeout = window.setTimeout(() => {
            if (!processedRef.current) {
                const dur = (vid.duration && isFinite(vid.duration)) ? vid.duration : 0;
                onComplete(dur, null, dur > 0, true);
                processedRef.current = true;
            }
        }, 15000);

        vid.play().catch(() => setStatus('Interrumpido'));

        return () => clearTimeout(timeout);
    }, [video, isAudio]);

    const handleLoadedMetadata = (e: React.SyntheticEvent<HTMLVideoElement>) => {
        const vid = e.currentTarget;
        if (vid.videoWidth === 0 && vid.duration > 0) {
            setIsAudio(true);
            processMedia(true);
        }
    };

    const handleTimeUpdate = (e: React.SyntheticEvent<HTMLVideoElement>) => {
        const vid = e.currentTarget;
        if (processedRef.current || isAudio) return;

        if (vid.currentTime > 1.2 && vid.videoWidth > 0) {
            processedRef.current = true;
            setStatus('Capturando frame...');
            const canvas = document.createElement('canvas');
            canvas.width = vid.videoWidth;
            canvas.height = vid.videoHeight;
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.drawImage(vid, 0, 0);
                canvas.toBlob(blob => {
                    const file = blob ? new File([blob], "thumb.jpg", { type: "image/jpeg" }) : null;
                    onComplete(vid.duration, file, true, false);
                }, 'image/jpeg', 0.8);
            } else onComplete(vid.duration, null, true, false);
        }
    };

    return (
        <div className="bg-black rounded-lg overflow-hidden aspect-video relative border border-slate-800 shadow-2xl flex items-center justify-center">
            {isAudio ? (
                <div className="w-full h-full flex flex-col items-center justify-center bg-slate-900 text-indigo-400">
                    <Music size={48} className="animate-pulse mb-2"/>
                    <span className="text-[10px] font-black uppercase tracking-widest">Analizando Audio...</span>
                </div>
            ) : (
                <video 
                    ref={videoRef} 
                    className="w-full h-full object-contain" 
                    onLoadedMetadata={handleLoadedMetadata}
                    onTimeUpdate={handleTimeUpdate} 
                    onError={() => {
                        if (!processedRef.current) {
                            onComplete(0, null, false, true);
                            processedRef.current = true;
                        }
                    }} 
                />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent pointer-events-none"></div>
            <div className="absolute bottom-2 left-2 flex items-center gap-2">
                <span className="bg-indigo-600 px-2 py-0.5 rounded text-[9px] text-white font-black uppercase animate-pulse">Scanner</span>
                <span className="text-[10px] text-slate-300 font-mono truncate max-w-[200px]">{status}</span>
            </div>
        </div>
    );
};

export default function AdminLibrary() {
    const toast = useToast();
    const [localPath, setLocalPath] = useState('');
    const [libraryPaths, setLibraryPaths] = useState<string[]>([]);
    const [isIndexing, setIsIndexing] = useState(false);
    const [indexProgress, setIndexProgress] = useState({ current: 0, total: 0, label: '' });
    const [activeScan, setActiveScan] = useState(false);
    const [isOrganizing, setIsOrganizing] = useState(false);
    const [isReorganizingAll, setIsReorganizingAll] = useState(false);
    const [isFixing, setIsFixing] = useState(false);
    const [scanLog, setScanLog] = useState<string[]>([]);
    const [scanQueue, setScanQueue] = useState<Video[]>([]);
    const [currentScanIndex, setCurrentScanIndex] = useState(0);
    const [stats, setStats] = useState({ 
        pending: 0, locked: 0, available: 0, 
        processing: 0, public: 0, broken: 0, failed: 0, total: 0 
    });

    const loadSettings = async () => {
        try {
            const s = await db.getSystemSettings();
            setLocalPath(s.localLibraryPath || '');
            setLibraryPaths(s.libraryPaths || []);
        } catch(e) {}
    };

    const loadStats = async () => {
        try {
            const adminStats = await db.getAdminLibraryStats();
            setStats({
                pending: adminStats.pending,
                locked: adminStats.locked,
                available: adminStats.available,
                processing: adminStats.processing,
                public: adminStats.total - (adminStats.pending + adminStats.processing + adminStats.failed),
                broken: adminStats.broken,
                failed: adminStats.failed,
                total: adminStats.total
            });
        } catch(e) {}
    };

    useEffect(() => { 
        loadSettings();
        loadStats();
        const intv = setInterval(loadStats, 10000);
        return () => clearInterval(intv);
    }, []);

    const addToLog = (msg: string) => { setScanLog(prev => [`> ${msg}`, ...prev].slice(0, 100)); };

    const handleStep1 = async (useGlobalPaths: boolean = false) => {
        if (isIndexing) return;
        setIsIndexing(true);
        setIndexProgress({ current: 0, total: 0, label: 'Iniciando descubrimiento...' });
        
        try {
            if (localPath.trim()) {
                await db.updateSystemSettings({ localLibraryPath: localPath });
            }

            let foldersToScan: any[] = [];
            
            if (useGlobalPaths) {
                addToLog("Solicitando descubrimiento de ramas...");
                const branches: any = await db.request('action=get_scan_folders');
                foldersToScan = Array.isArray(branches) ? branches : [];
            } else {
                foldersToScan = [{ path: localPath, name: basename(localPath) }];
            }

            if (foldersToScan.length === 0) {
                addToLog("No se encontraron carpetas válidas para escanear.");
                setIsIndexing(false);
                return;
            }

            addToLog(`Cola de escaneo lista: ${foldersToScan.length} ramas detectadas.`);
            setIndexProgress({ current: 0, total: foldersToScan.length, label: 'Preparando motor...' });

            let totalImported = 0;
            let totalFound = 0;

            for (let i = 0; i < foldersToScan.length; i++) {
                const folder = foldersToScan[i];
                setIndexProgress({ 
                    current: i + 1, 
                    total: foldersToScan.length, 
                    label: `Escaneando: ${folder.name}` 
                });
                
                addToLog(`[RAMA ${i+1}/${foldersToScan.length}] Procesando ${folder.path}...`);
                
                try {
                    const res: any = await db.scanLocalLibrary(folder.path);
                    totalFound += (res.totalFound || 0);
                    totalImported += (res.newToImport || 0);
                    
                    if (res.errors && res.errors.length > 0) {
                        res.errors.forEach((err: string) => addToLog(`WARN: ${err}`));
                    }
                } catch (folderErr: any) {
                    addToLog(`ERROR en rama: ${folderErr.message}`);
                }
            }

            addToLog(`Escaneo completo. Total Encontrados: ${totalFound}. Total Nuevos: ${totalImported}`);
            toast.success("Indexación masiva terminada");
            loadStats();
        } catch (e: any) { 
            addToLog(`ERROR CRÍTICO: ${e.message}`); 
            toast.error("Fallo el escaneo por lotes");
        } finally { 
            setIsIndexing(false); 
            setIndexProgress({ current: 0, total: 0, label: '' });
        }
    };

    const basename = (path: string) => {
        return path.split(/[\\/]/).pop() || path;
    };

    const handleStep2 = async (force: boolean = false) => {
        if (activeScan && !force) return;
        
        addToLog("Buscando lote de registros PENDING...");
        try {
            const pending = await db.getUnprocessedVideos(50, 'normal');
            if (pending.length === 0) {
                addToLog("Cola vacía. Proceso finalizado.");
                setActiveScan(false);
                return;
            }
            setScanQueue(pending);
            setCurrentScanIndex(0);
            setActiveScan(true);
        } catch (e: any) { addToLog(`Error: ${e.message}`); }
    };

    const handleVideoProcessed = async (duration: number, thumbnail: File | null, success: boolean, clientIncompatible: boolean = false) => {
        const item = scanQueue[currentScanIndex];
        try {
            const fd = new FormData();
            fd.append('id', item.id);
            fd.append('duration', String(duration));
            fd.append('success', success ? '1' : '0');
            fd.append('clientIncompatible', clientIncompatible ? '1' : '0');
            if (thumbnail) fd.append('thumbnail', thumbnail);

            await db.request(`action=update_video_metadata`, { method: 'POST', body: fd });
            
            let logMsg = success ? `[OK] ${item.title}` : `[FAIL] ${item.title}`;
            if (clientIncompatible) logMsg += " (Servidor extraerá thumb)";
            addToLog(logMsg);
        } catch (e) { console.error(e); }
        
        if (currentScanIndex + 1 >= scanQueue.length) {
            addToLog("Lote completado. Solicitando nuevo lote...");
            loadStats();
            setScanQueue([]);
            setTimeout(() => {
                handleStep2(true);
            }, 500);
        } else {
            setCurrentScanIndex(prev => prev + 1);
        }
    };

    const handleStep3 = async () => {
        setIsOrganizing(true);
        addToLog("Iniciando Organización de videos...");
        try {
            const res = await db.smartOrganizeLibrary();
            addToLog(`Procesados: ${res.processed}. Restantes en cola: ${res.remaining || 0}`);
            
            if (res.processed > 0) {
                toast.success("Organización completada");
                db.setHomeDirty();
            } else {
                addToLog("Nada pendiente para organizar.");
            }
            loadStats();
        } catch (e: any) { 
            addToLog(`Error al organizar: ${e.message}`); 
            toast.error("Error en el organizador");
        }
        finally { setIsOrganizing(false); }
    };

    const handleStep4 = async () => {
        setIsFixing(true);
        addToLog("Iniciando Mantenimiento Avanzado...");
        try {
            const res = await db.fixLibraryMetadata();
            addToLog(`Mantenimiento completado.`);
            addToLog(`- Videos rotos reseteados: ${res.fixedBroken}`);
            if (res.fixedBroken > 0) {
                toast.success("Mantenimiento finalizado");
                db.setHomeDirty();
            } else {
                addToLog("No se requirieron cambios.");
            }
            loadStats();
        } catch (e: any) { addToLog(`Error: ${e.message}`); }
        finally { setIsFixing(false); }
    };

    const handleStep5 = async () => {
        if (!confirm("Esto analizará TODOS los videos de la base de datos y los moverá a sus categorías/precios correctos según la configuración actual de Admin. Se hará por lotes para evitar errores de servidor. ¿Continuar?")) return;
        
        setIsReorganizingAll(true);
        addToLog("Iniciando Re-sincronización Global por lotes...");
        
        try {
            let offset = 0;
            const limit = 100;
            let finished = false;

            while (!finished) {
                addToLog(`Procesando lote desde ${offset}...`);
                const res = await db.request<any>(`action=reorganize_all_videos&limit=${limit}&offset=${offset}`, { method: 'POST' });
                
                if (!res || res.processed === 0) {
                    finished = true;
                } else {
                    addToLog(`Lote OK: ${res.processed} videos actualizados.`);
                    offset += limit;
                    await new Promise(r => setTimeout(r, 300));
                }
            }

            addToLog(`Re-sincronización finalizada con éxito.`);
            toast.success("Librería actualizada al 100%");
            db.setHomeDirty();
            loadStats();
        } catch (e: any) { 
            addToLog(`Error en el flujo de sincronización: ${e.message}`); 
            toast.error("Sincronización interrumpida.");
        } finally { 
            setIsReorganizingAll(false); 
        }
    };

    return (
        <div className="space-y-6 pb-20 max-w-4xl mx-auto px-2">
            <h2 className="text-2xl font-black flex items-center gap-2 text-white uppercase italic tracking-tighter">
                <Database className="text-indigo-500"/> Gestión de Librería
            </h2>
            
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <div className="bg-slate-900 p-3 rounded-xl border border-slate-800 text-center shadow-lg group relative">
                    <div className="text-slate-500 text-[10px] font-black uppercase mb-1">P1: Registro</div>
                    <div className="text-xl font-black text-amber-500 flex items-center justify-center gap-1">
                        <Clock size={16}/> {stats.pending}
                    </div>
                    {stats.locked > 0 && (
                        <div className="absolute -top-2 -right-1 bg-red-600 text-[8px] font-black text-white px-1.5 py-0.5 rounded-full flex items-center gap-1 shadow-lg animate-bounce">
                            <Lock size={8}/> {stats.locked} ocupado
                        </div>
                    )}
                </div>
                <div className="bg-slate-900 p-3 rounded-xl border border-slate-800 text-center shadow-lg">
                    <div className="text-slate-500 text-[10px] font-black uppercase mb-1">P2: Extracción</div>
                    <div className="text-xl font-black text-blue-500 flex items-center justify-center gap-1"><RefreshCw size={16}/> {stats.processing}</div>
                </div>
                <div className="bg-slate-900 p-3 rounded-xl border border-slate-800 text-center shadow-lg">
                    <div className="text-slate-500 text-[10px] font-black uppercase mb-1">P3: Listos</div>
                    <div className="text-xl font-black text-emerald-400 flex items-center justify-center gap-1"><CheckCircle2 size={16}/> {stats.public}</div>
                </div>
                <div className="bg-slate-900 p-3 rounded-xl border border-slate-800 text-center shadow-lg">
                    <div className="text-slate-500 text-[10px] font-black uppercase mb-1">P4: Mantenimiento</div>
                    <div className="text-xl font-black text-red-500 flex items-center justify-center gap-1"><ShieldAlert size={16}/> {stats.broken + stats.failed}</div>
                </div>
                <div className="bg-slate-900 p-3 rounded-xl border border-slate-800 text-center shadow-lg">
                    <div className="text-slate-500 text-[10px] font-black uppercase mb-1">TOTAL DB</div>
                    <div className="text-xl font-black text-indigo-400 flex items-center justify-center gap-1"><Layers size={16}/> {stats.total}</div>
                </div>
            </div>
            
            <div className="bg-slate-900 border border-slate-800 rounded-[32px] p-6 shadow-xl space-y-8">
                
                <div className="space-y-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-blue-500/20 text-blue-400 flex items-center justify-center font-black">1</div>
                        <div>
                            <h3 className="font-black text-white text-sm uppercase tracking-widest leading-none">Registro Físico Multi-Disco</h3>
                            <p className="text-[10px] text-slate-500 uppercase font-bold mt-1">Sincroniza archivos mediante escaneo por lotes (Batch Mode)</p>
                        </div>
                    </div>

                    <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-4">
                        <div className="space-y-2">
                            <label className="text-[9px] font-black text-slate-600 uppercase flex items-center gap-1 ml-1"><List size={10}/> Volúmenes a Procesar:</label>
                            <div className="flex flex-wrap gap-2">
                                <div className="bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-xl text-[10px] font-mono text-indigo-400 flex items-center gap-2">
                                    <HardDrive size={12}/> {localPath || '/root'} (Principal)
                                </div>
                                {libraryPaths.map((path, i) => (
                                    <div key={i} className="bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-xl text-[10px] font-mono text-slate-300 flex items-center gap-2">
                                        <HardDrive size={12} className="text-slate-500"/> {path}
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="flex flex-col md:flex-row gap-3 pt-2">
                            <div className="flex-1 flex gap-2">
                                <input 
                                    type="text" 
                                    value={localPath} 
                                    onChange={e => setLocalPath(e.target.value)} 
                                    className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-xs font-mono text-white outline-none focus:border-indigo-500 transition-colors" 
                                    placeholder="Ruta específica para un escaneo rápido..." 
                                />
                                <button 
                                    onClick={() => handleStep1(false)} 
                                    disabled={isIndexing || !localPath.trim()} 
                                    className="bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-white px-5 rounded-xl text-[10px] font-black uppercase transition-all"
                                >
                                    Escanear Esta
                                </button>
                            </div>
                            <button 
                                onClick={() => handleStep1(true)} 
                                disabled={isIndexing} 
                                className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 py-3 md:px-8 rounded-xl text-xs font-black uppercase tracking-widest text-white transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-900/20 active:scale-95"
                            >
                                {isIndexing ? <RefreshCw className="animate-spin" size={16}/> : <Layers size={16}/>} 
                                Escanear en Bucle (Evita Timeouts)
                            </button>
                        </div>

                        {isIndexing && indexProgress.total > 0 && (
                            <div className="pt-2 animate-in fade-in zoom-in-95">
                                <div className="flex justify-between items-center mb-2">
                                    <span className="text-[10px] font-black text-white uppercase tracking-widest flex items-center gap-2">
                                        <FolderOpen size={12} className="text-indigo-400 animate-pulse"/>
                                        {indexProgress.label}
                                    </span>
                                    <span className="text-[10px] font-mono text-indigo-400">{indexProgress.current} / {indexProgress.total}</span>
                                </div>
                                <div className="w-full h-1.5 bg-slate-900 rounded-full overflow-hidden border border-white/5">
                                    <div className="h-full bg-indigo-500 transition-all duration-500 shadow-[0_0_10px_rgba(79,70,229,0.5)]" style={{ width: `${(indexProgress.current / indexProgress.total) * 100}%` }}></div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-3">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-black">2</div>
                            <h3 className="font-black text-white text-xs uppercase tracking-widest">Extracción Automática</h3>
                        </div>
                        <button onClick={() => handleStep2()} disabled={activeScan || stats.available === 0} className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest text-white shadow-xl transition-all flex items-center justify-center gap-2">
                            {activeScan ? <Zap size={18} className="animate-pulse text-yellow-300" /> : <Film size={18}/>} 
                            {activeScan ? 'MOTOR ACTIVO...' : `INICIAR MOTOR AUTOMÁTICO (${stats.available})`}
                        </button>
                        <p className="text-[9px] text-slate-500 font-bold uppercase text-center">EL PROCESO CONTINUARÁ HASTA TERMINAR TODA LA LIBRERÍA</p>
                    </div>

                    <div className="space-y-3">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center font-black">3</div>
                            <h3 className="font-black text-white text-xs uppercase tracking-widest">Organización IA</h3>
                        </div>
                        <button onClick={handleStep3} disabled={isOrganizing} className="w-full bg-purple-600 hover:bg-purple-500 disabled:bg-slate-800 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest text-white shadow-xl transition-all flex items-center justify-center gap-2 active:scale-95">
                            {isOrganizing ? <RefreshCw className="animate-spin" size={18}/> : <Wand2 size={18}/>} 
                            Organizar y Publicar {stats.processing > 0 ? `(${stats.processing})` : ''}
                        </button>
                        <p className="text-[9px] text-slate-500 font-bold uppercase text-center">Aplica precios y categorías finales</p>
                    </div>
                </div>

                <div className="pt-4 border-t border-slate-800 grid grid-cols-2 gap-4">
                    <button onClick={handleStep4} disabled={isFixing || (stats.broken === 0 && stats.failed === 0)} className="bg-slate-800 border border-slate-700 hover:bg-slate-700 py-3 rounded-xl font-bold text-[9px] uppercase tracking-[0.1em] text-slate-400 flex items-center justify-center gap-2">
                        {isFixing ? <RefreshCw className="animate-spin" size={14}/> : <ShieldAlert size={14}/>} Mantenimiento ({stats.broken})
                    </button>
                    <button onClick={handleStep5} disabled={isReorganizingAll || stats.total === 0} className={`py-3 rounded-xl font-bold text-[9px] uppercase tracking-[0.1em] flex items-center justify-center gap-2 transition-all ${isReorganizingAll ? 'bg-indigo-600 text-white animate-pulse' : 'bg-slate-800 border border-slate-700 text-slate-400 hover:bg-slate-700'}`}>
                        {isReorganizingAll ? <Loader2 className="animate-spin" size={14}/> : <Layers size={14}/>} Sincronizar Todo (Lotes)
                    </button>
                </div>
            </div>

            <div className="bg-black/80 p-4 rounded-2xl border border-slate-800 h-64 flex flex-col shadow-inner">
                <div className="flex items-center justify-between mb-3 border-b border-slate-800 pb-2">
                    <div className="flex items-center gap-2">
                        <Terminal size={12} className="text-slate-600"/>
                        <span className="font-black text-[10px] uppercase tracking-widest text-slate-500 opacity-60">System Output</span>
                    </div>
                    <button onClick={() => setScanLog([])} className="text-[9px] font-black uppercase text-slate-600 hover:text-white flex items-center gap-1 transition-colors">
                        <XCircle size={10}/> Limpiar Consola
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto font-mono text-[10px] space-y-1.5 custom-scrollbar pr-2">
                    {scanLog.map((l, i) => (
                        <div key={i} className={`py-1 border-b border-white/5 last:border-0 ${l.includes('ERROR') ? 'text-red-400 font-bold' : (l.includes('[OK]') ? 'text-emerald-400' : (l.includes('[RAMA') ? 'text-indigo-400 font-bold' : 'text-slate-400'))}`}>
                            <span className="opacity-20 mr-2 shrink-0">[{new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit', second:'2-digit'})}]</span>
                            <span className="break-words">{l}</span>
                        </div>
                    ))}
                    {scanLog.length === 0 && <p className="italic opacity-30 text-center py-10">Esperando comandos del administrador...</p>}
                </div>
            </div>

            {activeScan && scanQueue.length > 0 && (
                <div className="fixed inset-0 z-[100] bg-black/90 flex flex-col items-center justify-center p-6 backdrop-blur-md animate-in fade-in duration-300">
                    <div className="bg-slate-900 p-8 rounded-[40px] border border-slate-700 w-full max-w-md text-center shadow-2xl relative overflow-hidden">
                        <div className="absolute top-0 left-0 w-full h-1.5 bg-slate-800">
                            <div className="h-full bg-indigo-500 transition-all duration-500 shadow-[0_0_15px_rgba(79,70,229,0.6)]" style={{ width: `${((currentScanIndex + 1) / scanQueue.length) * 100}%` }}></div>
                        </div>
                        
                        <div className="flex flex-col items-center mb-8">
                            <div className="w-16 h-16 bg-indigo-500/10 rounded-3xl flex items-center justify-center text-indigo-400 mb-4 animate-bounce">
                                <Film size={32}/>
                            </div>
                            <h4 className="font-black text-white uppercase tracking-tighter text-xl leading-none">
                                Motor de Extracción
                            </h4>
                            <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest mt-2">
                                Procesando {currentScanIndex + 1} de {scanQueue.length}
                            </p>
                        </div>

                        <p className="text-[10px] text-indigo-400 mb-6 truncate font-mono bg-indigo-500/5 p-3 rounded-2xl border border-indigo-500/10 italic">
                            {scanQueue[currentScanIndex].title}
                        </p>
                        
                        <ScannerPlayer key={scanQueue[currentScanIndex].id} video={scanQueue[currentScanIndex]} onComplete={handleVideoProcessed} />
                        
                        <button onClick={() => setActiveScan(false)} className="mt-8 w-full bg-red-950/20 hover:bg-red-900/40 text-red-500 text-[10px] font-black uppercase tracking-[0.2em] py-4 rounded-2xl border border-red-900/30 transition-all active:scale-95">Detener Ciclo</button>
                    </div>
                </div>
            )}
        </div>
    );
}
