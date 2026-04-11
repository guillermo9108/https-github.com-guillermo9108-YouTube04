import React from 'react';
import { ChevronLeft, HelpCircle, Search, MessageSquare, Shield, FileText } from 'lucide-react';
import { useNavigate } from '../Router';

export default function HelpPage() {
    const navigate = useNavigate();

    const helpItems = [
        { icon: MessageSquare, label: 'Centro de ayuda', desc: 'Preguntas frecuentes y tutoriales' },
        { icon: Shield, label: 'Privacidad y seguridad', desc: 'Gestiona tu seguridad' },
        { icon: FileText, label: 'Términos y condiciones', desc: 'Reglas de la plataforma' },
    ];

    return (
        <div className="min-h-screen bg-black pb-20">
            <header className="sticky top-0 z-50 bg-slate-900 border-b border-white/5 px-4 h-14 flex items-center gap-4">
                <button onClick={() => navigate(-1)} className="text-slate-300 hover:text-white transition-colors">
                    <ChevronLeft size={24} />
                </button>
                <h1 className="text-lg font-bold text-white">Ayuda y soporte</h1>
            </header>

            <div className="p-6 space-y-6">
                <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                    <input 
                        type="text" 
                        placeholder="¿Cómo podemos ayudarte?" 
                        className="w-full bg-slate-900 border border-white/5 rounded-2xl py-4 pl-12 pr-4 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all"
                    />
                </div>

                <div className="grid gap-4">
                    {helpItems.map((item, i) => (
                        <button key={i} className="w-full p-5 bg-slate-900 border border-white/5 rounded-3xl flex items-center gap-4 hover:bg-slate-800 transition-colors text-left group">
                            <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 flex items-center justify-center text-indigo-500 group-hover:bg-indigo-500 group-hover:text-white transition-all">
                                <item.icon size={24} />
                            </div>
                            <div className="flex-1">
                                <h3 className="text-white font-bold">{item.label}</h3>
                                <p className="text-slate-500 text-xs">{item.desc}</p>
                            </div>
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}
