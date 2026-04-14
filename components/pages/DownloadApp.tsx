
import React, { useEffect, useState } from 'react';
import { db } from '../../services/db';
import { Smartphone, Download, ExternalLink, ShieldCheck, Zap, Info } from 'lucide-react';
import { motion } from 'motion/react';

export default function DownloadApp() {
    const [latest, setLatest] = useState<{version: string, url: string | null} | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const check = async () => {
            try {
                const latest = await db.getLatestVersion();
                if (latest.isAPK) {
                    window.location.hash = '#/';
                    return;
                }
                setLatest(latest);
            } catch (e) {
                console.warn("Error checking version", e);
            } finally {
                setLoading(false);
            }
        };
        check();
    }, []);

    const handleOpenApp = () => {
        const currentOrigin = window.location.origin;
        const packageName = "com.streampay.app";
        const scheme = "streampay";
        
        // Intentar abrir directamente con el esquema personalizado
        const directUrl = `${scheme}://open?url=${encodeURIComponent(currentOrigin)}`;
        
        // Intent URL como respaldo robusto para Android
        const intentUrl = `intent://open?url=${encodeURIComponent(currentOrigin)}#Intent;scheme=${scheme};package=${packageName};S.browser_fallback_url=${encodeURIComponent(window.location.href)};end`;
        
        // Intentar el esquema directo primero
        window.location.assign(directUrl);
        
        // Si después de 800ms seguimos aquí, probar el Intent
        setTimeout(() => {
            if (document.visibilityState === 'visible') {
                window.location.assign(intentUrl);
            }
        }, 800);
    };

    return (
        <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-6 relative overflow-hidden">
            {/* Background Accents */}
            <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-600/20 blur-[120px] rounded-full"></div>
            <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-600/20 blur-[120px] rounded-full"></div>

            <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="max-w-md w-full space-y-8 text-center z-10"
            >
                <div className="flex flex-col items-center">
                    <div className="w-20 h-20 bg-indigo-600 rounded-[2rem] flex items-center justify-center shadow-2xl shadow-indigo-500/20 mb-6">
                        <Smartphone size={40} className="text-white" />
                    </div>
                    <h1 className="text-4xl font-black tracking-tighter uppercase italic">
                        Stream<span className="text-indigo-500">Pay</span> APK
                    </h1>
                    <p className="text-slate-400 mt-2 font-medium">Lleva tu contenido a donde quieras con nuestra App dedicada.</p>
                </div>

                <div className="bg-slate-900/50 border border-slate-800 p-8 rounded-[2.5rem] backdrop-blur-xl space-y-6">
                    {loading ? (
                        <div className="flex flex-col items-center py-8">
                            <div className="w-10 h-10 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin"></div>
                            <p className="text-xs font-black uppercase tracking-widest text-slate-500 mt-4">Buscando última versión...</p>
                        </div>
                    ) : (
                        <>
                            <div className="space-y-2">
                                <div className="inline-flex items-center gap-2 bg-indigo-500/10 text-indigo-400 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest">
                                    <Zap size={12} /> Versión {latest?.version || '0.0.1'} Disponible
                                </div>
                                <h2 className="text-xl font-bold">Descarga Directa</h2>
                                <p className="text-sm text-slate-400">Instala la APK oficial para disfrutar de descargas ilimitadas y una mejor experiencia.</p>
                            </div>

                            <div className="grid gap-3">
                                <a 
                                    href={latest?.url || "streampay_v0.0.1.apk"} 
                                    download
                                    className="flex items-center justify-center gap-3 bg-white text-black font-black py-4 rounded-2xl hover:bg-indigo-50 transition-all active:scale-95"
                                >
                                    <Download size={20} />
                                    DESCARGAR APK
                                </a>
                                
                                <button 
                                    onClick={handleOpenApp}
                                    className="flex items-center justify-center gap-3 bg-slate-800 text-white font-black py-4 rounded-2xl hover:bg-slate-700 transition-all active:scale-95 border border-slate-700"
                                >
                                    <ExternalLink size={20} />
                                    ABRIR APLICACIÓN
                                </button>
                            </div>

                            <div className="pt-4 flex items-center justify-center gap-6 text-slate-500">
                                <div className="flex flex-col items-center gap-1">
                                    <ShieldCheck size={20} className="text-emerald-500" />
                                    <span className="text-[9px] font-black uppercase">Seguro</span>
                                </div>
                                <div className="flex flex-col items-center gap-1">
                                    <Zap size={20} className="text-amber-500" />
                                    <span className="text-[9px] font-black uppercase">Rápido</span>
                                </div>
                                <div className="flex flex-col items-center gap-1">
                                    <Smartphone size={20} className="text-blue-500" />
                                    <span className="text-[9px] font-black uppercase">Android</span>
                                </div>
                            </div>
                        </>
                    )}
                </div>

                <div className="bg-amber-500/10 border border-amber-500/20 p-4 rounded-2xl flex gap-3 text-left">
                    <Info className="text-amber-500 shrink-0" size={20} />
                    <p className="text-[11px] text-amber-200/80 leading-relaxed font-medium">
                        Si es la primera vez que instalas, recuerda habilitar <span className="text-amber-400 font-bold">"Orígenes Desconocidos"</span> en los ajustes de seguridad de tu dispositivo Android.
                    </p>
                </div>

                <button 
                    onClick={() => window.location.href = "/"}
                    className="text-slate-500 hover:text-white text-xs font-black uppercase tracking-widest transition-colors"
                >
                    Continuar en el navegador
                </button>
            </motion.div>
        </div>
    );
}
