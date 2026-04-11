import React from 'react';
import { ChevronLeft, DollarSign, History, ArrowUpRight, ArrowDownLeft } from 'lucide-react';
import { useNavigate } from '../Router';
import { useAuth } from '../../context/AuthContext';

export default function WalletPage() {
    const navigate = useNavigate();
    const { user } = useAuth();

    return (
        <div className="min-h-screen bg-black pb-20">
            <header className="sticky top-0 z-50 bg-slate-900 border-b border-white/5 px-4 h-14 flex items-center gap-4">
                <button onClick={() => navigate(-1)} className="text-slate-300 hover:text-white transition-colors">
                    <ChevronLeft size={24} />
                </button>
                <h1 className="text-lg font-bold text-white">Mi Billetera</h1>
            </header>

            <div className="p-6 space-y-8">
                {/* Balance Card */}
                <div className="bg-gradient-to-br from-indigo-600 to-purple-700 p-8 rounded-[2.5rem] shadow-2xl shadow-indigo-500/20 relative overflow-hidden">
                    <div className="absolute -top-24 -right-24 w-48 h-48 bg-white/10 rounded-full blur-3xl" />
                    <div className="relative z-10">
                        <p className="text-indigo-100 text-sm font-medium mb-1">Saldo disponible</p>
                        <h2 className="text-4xl font-black text-white">${Number(user?.balance || 0).toFixed(2)}</h2>
                        <div className="flex gap-4 mt-8">
                            <button onClick={() => navigate('/recharge')} className="flex-1 bg-white text-indigo-600 py-3 rounded-2xl font-bold text-sm shadow-lg active:scale-95 transition-transform">
                                Recargar
                            </button>
                            <button className="flex-1 bg-white/20 backdrop-blur-md text-white py-3 rounded-2xl font-bold text-sm border border-white/10 active:scale-95 transition-transform">
                                Retirar
                            </button>
                        </div>
                    </div>
                </div>

                {/* Transactions */}
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <h3 className="text-sm font-black text-white uppercase tracking-widest">Transacciones recientes</h3>
                        <button className="text-xs text-indigo-400 font-bold">Ver todo</button>
                    </div>
                    
                    <div className="space-y-3">
                        <div className="flex flex-col items-center justify-center py-12 text-slate-500 bg-slate-900/50 rounded-3xl border border-white/5">
                            <History size={32} className="opacity-20 mb-2" />
                            <p className="text-xs font-medium">No hay transacciones recientes</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
