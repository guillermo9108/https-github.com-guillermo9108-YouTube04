import React from 'react';
import { ChevronLeft, CreditCard } from 'lucide-react';
import { useNavigate } from '../Router';

export default function RechargePage() {
    const navigate = useNavigate();

    return (
        <div className="min-h-screen bg-black pb-20">
            <header className="sticky top-0 z-50 bg-slate-900 border-b border-white/5 px-4 h-14 flex items-center gap-4">
                <button onClick={() => navigate(-1)} className="text-slate-300 hover:text-white transition-colors">
                    <ChevronLeft size={24} />
                </button>
                <h1 className="text-lg font-bold text-white">Recargar Saldo</h1>
            </header>

            <div className="p-6 space-y-6">
                <div className="bg-slate-900 border border-white/5 p-6 rounded-3xl text-center space-y-4">
                    <div className="w-16 h-16 bg-green-500/20 rounded-2xl flex items-center justify-center mx-auto">
                        <CreditCard size={32} className="text-green-500" />
                    </div>
                    <h2 className="text-xl font-bold text-white">Añadir fondos</h2>
                    <p className="text-slate-400 text-sm">Selecciona un método de pago para recargar tu saldo de StreamPay.</p>
                </div>
                
                <div className="grid gap-4">
                    <button className="w-full p-4 bg-slate-900 border border-white/5 rounded-2xl flex items-center justify-between hover:bg-slate-800 transition-colors">
                        <span className="text-white font-medium">Tarjeta de Crédito/Débito</span>
                        <ChevronLeft size={20} className="rotate-180 text-slate-600" />
                    </button>
                    <button className="w-full p-4 bg-slate-900 border border-white/5 rounded-2xl flex items-center justify-between hover:bg-slate-800 transition-colors">
                        <span className="text-white font-medium">PayPal</span>
                        <ChevronLeft size={20} className="rotate-180 text-slate-600" />
                    </button>
                    <button className="w-full p-4 bg-slate-900 border border-white/5 rounded-2xl flex items-center justify-between hover:bg-slate-800 transition-colors">
                        <span className="text-white font-medium">Criptomonedas</span>
                        <ChevronLeft size={20} className="rotate-180 text-slate-600" />
                    </button>
                </div>
            </div>
        </div>
    );
}
