import React, { useState } from 'react';
import { ChevronLeft, AlertCircle, Send, Camera, CheckCircle2 } from 'lucide-react';
import { useNavigate } from '../Router';
import { useToast } from '../../context/ToastContext';

export default function ReportPage() {
    const navigate = useNavigate();
    const toast = useToast();
    const [text, setText] = useState('');
    const [sent, setSent] = useState(false);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!text.trim()) return;
        
        // Simular envío
        setSent(true);
        toast.success("Reporte enviado correctamente");
        setTimeout(() => navigate(-1), 2000);
    };

    return (
        <div className="min-h-screen bg-black pb-20">
            <header className="sticky top-0 z-50 bg-slate-900 border-b border-white/5 px-4 h-14 flex items-center gap-4">
                <button onClick={() => navigate(-1)} className="text-slate-300 hover:text-white transition-colors">
                    <ChevronLeft size={24} />
                </button>
                <h1 className="text-lg font-bold text-white">Reportar un problema</h1>
            </header>

            <div className="p-6">
                {sent ? (
                    <div className="flex flex-col items-center justify-center py-20 text-center space-y-4 animate-in zoom-in duration-300">
                        <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center text-green-500">
                            <CheckCircle2 size={48} />
                        </div>
                        <h2 className="text-xl font-bold text-white">¡Gracias por tu reporte!</h2>
                        <p className="text-slate-400 text-sm">Tu feedback nos ayuda a mejorar StreamPay para todos.</p>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div className="space-y-2">
                            <label className="text-xs font-black text-slate-500 uppercase tracking-widest px-1">Describe el problema</label>
                            <textarea 
                                value={text}
                                onChange={(e) => setText(e.target.value)}
                                placeholder="¿Qué salió mal? Danos tantos detalles como sea posible..."
                                className="w-full h-48 bg-slate-900 border border-white/5 rounded-3xl p-6 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all resize-none"
                            />
                        </div>

                        <div className="flex gap-4">
                            <button type="button" className="flex-1 py-4 bg-slate-900 border border-white/5 rounded-2xl flex items-center justify-center gap-2 text-slate-400 hover:text-white transition-colors">
                                <Camera size={18} />
                                <span className="text-sm font-bold">Añadir captura</span>
                            </button>
                            <button 
                                type="submit"
                                disabled={!text.trim()}
                                className="flex-1 py-4 bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-2xl flex items-center justify-center gap-2 font-bold shadow-lg shadow-indigo-900/40 active:scale-95 transition-all"
                            >
                                <Send size={18} />
                                <span className="text-sm">Enviar reporte</span>
                            </button>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
}
