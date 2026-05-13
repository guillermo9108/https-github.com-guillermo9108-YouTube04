import React, { useState, useEffect } from 'react';
import { Settings2, X, Play, Scissors, Layers, Clock, CheckCircle2, Save } from 'lucide-react';
import { db } from '../../services/db';
import { Video } from '../../types';
import { useToast } from '../../context/ToastContext';

interface Props {
    video: Video | null;
    show: boolean;
    onClose: () => void;
    onSaved?: () => void;
}

export const VideoTranscodeModal: React.FC<Props> = ({ video, show, onClose, onSaved }) => {
    const toast = useToast();
    const [configData, setConfigData] = useState({
        mode: 'NORMAL',
        fragTime: 60,
        profileExt: ''
    });
    const [profiles, setProfiles] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (show) {
            loadProfiles();
            if (video) {
                const v: any = video;
                let mode = 'NORMAL';
                if (v.split_shorts) mode = 'SHORTS';
                else if (v.split_series) mode = 'SERIES';
                
                setConfigData({
                    mode,
                    fragTime: v.custom_fragmentation_time || 60,
                    profileExt: v.target_extension || ''
                });
            }
        }
    }, [show, video]);

    const loadProfiles = async () => {
        try {
            const data = await db.request('action=admin_get_transcode_profiles') as any[];
            setProfiles(data);
            if (!configData.profileExt && data && data.length > 0) {
                setConfigData(prev => ({ ...prev, profileExt: data[0].extension }));
            }
        } catch (e) {}
    };

    const saveConfig = async () => {
        if (!video) return;
        setLoading(true);
        try {
            const videoId = video.id;
            await db.request(`action=admin_save_video_transcode_config`, {
                method: 'POST',
                body: JSON.stringify({
                    videoId,
                    mode: configData.mode,
                    fragTime: configData.fragTime,
                    profileExt: configData.profileExt
                })
            });

            // Si el modo no es NORMAL, o si el usuario quiere convertir después de configurar...
            // El requerimiento dice: "este modal envíe el video a la cola con la configuración que ajuste el administrador"
            await db.request(`action=admin_add_video_to_transcode_queue&videoId=${videoId}`, { method: 'POST' });

            toast.success("Enviado a cola de transcodificación");
            onSaved?.();
            onClose();
        } catch (e: any) {
            toast.error(e.message);
        } finally {
            setLoading(false);
        }
    };

    if (!show || !video) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-300 pointer-events-auto">
            <div className="bg-[#1e293b] w-full max-w-md rounded-[2.5rem] shadow-2xl border border-white/10 overflow-hidden animate-in zoom-in-95 duration-300" onClick={e => e.stopPropagation()}>
                <div className="p-6 border-b border-white/5 bg-black/20 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-[#1877f2] rounded-xl text-white">
                            <Settings2 size={20} />
                        </div>
                        <div>
                            <h3 className="text-sm font-black text-white uppercase tracking-tight">Configurar Conversión</h3>
                            <p className="text-[10px] text-slate-500 font-bold uppercase truncate max-w-[200px]">{video.title}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-full text-slate-400">
                        <X size={20} />
                    </button>
                </div>

                <div className="p-6 space-y-6">
                    {/* Tipo de Proceso */}
                    <div className="space-y-3">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Modo de Publicación</label>
                        <div className="grid grid-cols-3 gap-2">
                            {[
                                { id: 'NORMAL', icon: Play, label: 'Normal', color: 'slate' },
                                { id: 'SHORTS', icon: Scissors, label: 'Shorts', color: 'amber' },
                                { id: 'SERIES', icon: Layers, label: 'Serie', color: 'indigo' }
                            ].map(m => (
                                <button
                                    key={m.id}
                                    onClick={() => setConfigData(prev => ({ ...prev, mode: m.id }))}
                                    className={`flex flex-col items-center gap-2 p-3 rounded-2xl border transition-all ${
                                        configData.mode === m.id 
                                            ? `bg-${m.color}-500/20 border-${m.color}-500/50 text-${m.color}-500 shadow-lg shadow-${m.color}-500/10` 
                                            : 'bg-white/5 border-white/5 text-slate-600 hover:bg-white/10'
                                    }`}
                                >
                                    <m.icon size={20} />
                                    <span className="text-[10px] font-black uppercase tracking-tighter">{m.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Formato de Salida */}
                    <div className="space-y-3">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Perfil de Salida</label>
                        <div className="grid grid-cols-1 gap-2 max-h-[150px] overflow-y-auto pr-1">
                            {profiles.map(p => (
                                <button
                                    key={p.extension}
                                    onClick={() => setConfigData(prev => ({ ...prev, profileExt: p.extension }))}
                                    className={`flex items-center justify-between p-3 rounded-2xl border transition-all ${
                                        configData.profileExt === p.extension 
                                            ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-500' 
                                            : 'bg-white/5 border-white/5 text-slate-400 hover:bg-white/10'
                                    }`}
                                >
                                    <div className="flex items-center gap-3">
                                        <span className={`px-2 py-0.5 rounded-lg text-[9px] font-black uppercase ${configData.profileExt === p.extension ? 'bg-emerald-500 text-white' : 'bg-slate-800 text-slate-400'}`}>
                                            .{p.extension}
                                        </span>
                                        <span className="text-[11px] font-black uppercase">{p.description}</span>
                                    </div>
                                    {configData.profileExt === p.extension && <CheckCircle2 size={16} />}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Tiempo de Fragmentación */}
                    {(configData.mode === 'SHORTS' || configData.mode === 'SERIES') && (
                        <div className="space-y-3 animate-in slide-in-from-top-2 duration-300">
                            <div className="flex justify-between items-center">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1 flex items-center gap-2">
                                    <Clock size={12}/> Tiempo de {configData.mode === 'SHORTS' ? 'Short' : 'Capítulo'}
                                </label>
                                <span className="text-[12px] font-black text-white">
                                    {configData.fragTime >= 60 
                                        ? `${Math.floor(configData.fragTime / 60)}m ${configData.fragTime % 60}s` 
                                        : `${configData.fragTime}s`}
                                </span>
                            </div>
                            <input 
                                type="range"
                                min="15"
                                max={configData.mode === 'SERIES' ? 2700 : 300}
                                step="15"
                                value={configData.fragTime}
                                onChange={(e) => setConfigData(prev => ({ ...prev, fragTime: parseInt(e.target.value) }))}
                                className="w-full h-2 bg-black/40 rounded-lg appearance-none cursor-pointer accent-[#1877f2]"
                            />
                            <div className="flex justify-between text-[8px] font-black text-slate-600 uppercase italic">
                                <span>Mínima (15s)</span>
                                <span>Máxima ({configData.mode === 'SERIES' ? '45m' : '5m'})</span>
                            </div>
                        </div>
                    )}
                </div>

                <div className="p-6 bg-black/20 border-t border-white/5 flex gap-3">
                    <button 
                        onClick={onClose}
                        className="flex-1 py-4 rounded-2xl bg-white/5 text-slate-400 text-[11px] font-black uppercase tracking-widest hover:bg-white/10 transition-all border border-white/5"
                    >
                        Cerrar
                    </button>
                    <button 
                        onClick={saveConfig}
                        disabled={loading}
                        className="flex-[2] py-4 rounded-2xl bg-[#1877f2] disabled:opacity-50 text-white text-[11px] font-black uppercase tracking-widest hover:bg-[#166fe5] transition-all shadow-lg shadow-[#1877f2]/30 flex items-center justify-center gap-2"
                    >
                        <Save size={18} />
                        {loading ? 'Procesando...' : 'Enfilar'}
                    </button>
                </div>
            </div>
        </div>
    );
};
