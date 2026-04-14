import React from 'react';
import { ChevronRight } from 'lucide-react';

interface BreadcrumbsProps {
    path: string[];
    onNavigate: (index: number) => void;
}

const Breadcrumbs: React.FC<BreadcrumbsProps> = ({ path, onNavigate }) => (
    <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide py-2 animate-in fade-in flex-1 min-w-0 [mask-image:linear-gradient(to_right,transparent,black_5%,black_95%,transparent)]">
        {path.map((segment, i) => (
            <React.Fragment key={`${segment}-${i}`}>
                {i > 0 && <ChevronRight size={10} className="text-white/20 shrink-0"/>}
                <button 
                    onClick={() => onNavigate(i)}
                    className={`whitespace-nowrap px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all shrink-0 ${i === path.length - 1 ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/40' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
                >
                    {segment}
                </button>
            </React.Fragment>
        ))}
    </div>
);

export default Breadcrumbs;
