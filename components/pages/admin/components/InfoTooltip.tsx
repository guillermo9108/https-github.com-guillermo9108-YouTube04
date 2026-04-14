
import React from 'react';
import { HelpCircle } from 'lucide-react';

export const InfoTooltip = ({ text, example }: { text: string, example?: string }) => (
    <div className="group relative inline-flex items-center ml-1.5 align-middle cursor-help">
        <HelpCircle size={12} className="text-slate-500 hover:text-indigo-400 transition-colors" />
        <div className="hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-3 bg-slate-950 border border-slate-700 text-xs text-slate-300 rounded-xl shadow-2xl z-50 pointer-events-none animate-in fade-in zoom-in-95">
            <p className="font-medium mb-1 text-white">{text}</p>
            {example && (
                <div className="bg-slate-900 rounded p-1.5 font-mono text-[10px] text-indigo-300 border border-slate-800">
                    Ej: <span className="select-all">{example}</span>
                </div>
            )}
            {/* Arrow */}
            <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-slate-700"></div>
        </div>
    </div>
);
