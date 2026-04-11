import React from 'react';
import { ChevronLeft, History } from 'lucide-react';
import { useNavigate } from '../Router';

export default function HistoryPage() {
    const navigate = useNavigate();

    return (
        <div className="min-h-screen bg-black pb-20">
            <header className="sticky top-0 z-50 bg-slate-900 border-b border-white/5 px-4 h-14 flex items-center gap-4">
                <button onClick={() => navigate(-1)} className="text-slate-300 hover:text-white transition-colors">
                    <ChevronLeft size={24} />
                </button>
                <h1 className="text-lg font-bold text-white">Historial</h1>
            </header>

            <div className="flex flex-col items-center justify-center py-40 text-slate-500 gap-4">
                <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center">
                    <History size={40} className="text-slate-400" />
                </div>
                <p className="font-medium">Tu historial de reproducción aparecerá aquí</p>
            </div>
        </div>
    );
}
