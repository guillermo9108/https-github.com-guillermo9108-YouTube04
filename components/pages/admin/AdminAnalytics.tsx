
import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../../../services/db';
import { VipPlan, SystemSettings } from '../../../types';
import { 
    Calculator, TrendingUp, RefreshCw, Activity, Crown, 
    Calendar, HelpCircle, Clock, AlertTriangle, Zap, Settings,
    ArrowDownLeft, BarChart3, Coins, Wallet
} from 'lucide-react';
import { useNavigate } from '../../Router';

const InfoHint = ({ title, text, formula }: { title: string, text: string, formula?: string }) => {
    const [show, setShow] = useState(false);
    return (
        <div className="relative inline-block ml-1.5 align-middle">
            <button 
                onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}
                className="text-slate-600 hover:text-indigo-400 transition-colors"
            >
                <HelpCircle size={12} />
            </button>
            {show && (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-3 bg-slate-950 border border-slate-700 text-[10px] text-slate-300 rounded-xl shadow-2xl z-50 pointer-events-none animate-in fade-in zoom-in-95">
                    <p className="font-black text-indigo-400 uppercase mb-1 tracking-widest border-b border-white/5 pb-1">{title}</p>
                    <p className="leading-relaxed mb-2 font-medium">{text}</p>
                    {formula && (
                        <div className="bg-black/40 p-1.5 rounded-lg border border-white/5 font-mono text-indigo-300/80">Fórmula: {formula}</div>
                    )}
                </div>
            )}
        </div>
    );
};

export default function AdminAnalytics() {
    const navigate = useNavigate();
    const [realStats, setRealStats] = useState<any>(null);
    const [allVipPlans, setAllVipPlans] = useState<VipPlan[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeView, setActiveView] = useState<'REAL' | 'SIMULATOR'>('REAL');
    
    const [dateRange, setDateRange] = useState({
        from: new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0],
        to: new Date().toISOString().split('T')[0]
    });

    const [sim, setSim] = useState({
        users: 100,
        newUsersPerMonth: 30,
        churn: 5,
        growth: 0,
        fixedCosts: 1500,
        avgTicket: 150,
        planMix: {} as Record<string, number> 
    });

    const accessPlans = useMemo(() => {
        if (!allVipPlans || !Array.isArray(allVipPlans)) return [];
        return allVipPlans.filter(p => {
            const pType = String(p.type || '').toUpperCase().trim();
            return pType === 'ACCESS' || (!p.type && p.durationDays && Number(p.durationDays) > 0);
        });
    }, [allVipPlans]);

    const loadData = async () => {
        setLoading(true);
        try {
            const fromTs = Math.floor(new Date(dateRange.from).getTime() / 1000);
            const toTs = Math.floor(new Date(dateRange.to).getTime() / 1000);

            const [rs, settings] = await Promise.all([
                db.request<any>(`action=get_real_stats&from=${fromTs}&to=${toTs}`),
                db.getSystemSettings()
            ]);

            setRealStats(rs);
            
            let plans: VipPlan[] = [];
            const rawVip: any = settings?.vipPlans;
            if (Array.isArray(rawVip)) plans = rawVip;
            else if (typeof rawVip === 'string') try { plans = JSON.parse(rawVip); } catch(e) {}

            setAllVipPlans(plans);

            // Sincronizar el Simulador con el Efectivo Real (Inflow)
            const initialMix: Record<string, number> = {};
            plans.forEach(p => { 
                // Tomamos el mix real de ventas externas del backend
                initialMix[p.id] = rs?.planMix?.[p.name] || 0; 
            });

            setSim(prev => ({ 
                ...prev, 
                users: rs?.userCount || prev.users,
                avgTicket: rs?.averages?.arpu || prev.avgTicket,
                planMix: initialMix
            }));
        } catch(e) { 
            console.error("Analytics Error", e); 
        } finally { 
            setLoading(false); 
        }
    };

    useEffect(() => { loadData(); }, [dateRange]);

    const updateTicketFromMix = (newMix: Record<string, number>) => {
        let totalVal = 0;
        let totalQty = 0;
        accessPlans.forEach(p => {
            const qty = Number(newMix[p.id]) || 0;
            totalVal += (qty * p.price);
            totalQty += qty;
        });
        const calculatedTicket = totalQty > 0 ? totalVal / totalQty : 0;
        setSim(prev => ({ ...prev, planMix: newMix, avgTicket: parseFloat(calculatedTicket.toFixed(1)) }));
    };

    const updateMixFromTicket = (targetTicket: number) => {
        if (accessPlans.length === 0) return;
        const newMix: Record<string, number> = {};
        const totalSalesTarget = 100;
        const sortedPlans = [...accessPlans].sort((a, b) => a.price - b.price);
        const above = sortedPlans.filter(p => p.price >= targetTicket);
        const below = sortedPlans.filter(p => p.price < targetTicket).reverse();

        if (above.length > 0 && below.length > 0) {
            const pHigh = above[0];
            const pLow = below[0];
            const weightHigh = (targetTicket - pLow.price) / (pHigh.price - pLow.price);
            sortedPlans.forEach(p => {
                if (p.id === pHigh.id) newMix[p.id] = Math.round(totalSalesTarget * weightHigh);
                else if (p.id === pLow.id) newMix[p.id] = Math.round(totalSalesTarget * (1 - weightHigh));
                else newMix[p.id] = 0;
            });
        } else {
            const closest = sortedPlans.sort((a, b) => Math.abs(a.price - targetTicket) - Math.abs(b.price - targetTicket))[0];
            sortedPlans.forEach(p => { newMix[p.id] = (p.id === closest.id) ? totalSalesTarget : 0; });
        }
        setSim(prev => ({ ...prev, avgTicket: targetTicket, planMix: newMix }));
    };

    const projection = useMemo(() => {
        let currentMonthlyRevenue = 0;
        let totalSalesInMix = 0;
        
        Object.entries(sim.planMix).forEach(([id, qty]) => {
            const plan = allVipPlans.find(p => p.id === id);
            if (plan) {
                currentMonthlyRevenue += (Number(plan.price) * Number(qty));
                totalSalesInMix += Number(qty);
            }
        });

        if (totalSalesInMix === 0 && sim.avgTicket > 0) {
            currentMonthlyRevenue = sim.avgTicket * 10;
            totalSalesInMix = 10;
        }

        const data = [];
        let currentUsers = sim.users;
        let cumulativeNetProfit = 0;

        for (let i = 1; i <= 12; i++) {
            const losses = currentUsers * (sim.churn / 100);
            const growth = currentUsers * (sim.growth / 100) + sim.newUsersPerMonth;
            currentUsers = Math.max(0, currentUsers + growth - losses);
            
            const monthlyGross = currentMonthlyRevenue; 
            const netMonthlyProfit = monthlyGross - sim.fixedCosts;
            cumulativeNetProfit += netMonthlyProfit;
            data.push({ label: `M${i}`, revenue: Math.round(monthlyGross), profit: Math.round(netMonthlyProfit) });
        }
        
        return { data, totalProfit: cumulativeNetProfit, currentMonthlyRevenue, totalSalesInMix, netResult: currentMonthlyRevenue - sim.fixedCosts };
    }, [sim, allVipPlans]);

    const renderChart = (points: any[], dataKey: string, color: string) => {
        if (!points || points.length < 2) return <div className="flex items-center justify-center h-full text-slate-700 uppercase text-[10px] font-black">Sin Datos</div>;
        const values = points.map(p => Number(p[dataKey] || 0));
        const max = Math.max(...values, 100) * 1.2;
        const min = Math.min(...values, 0) * 1.2;
        const range = max - min;
        const path = points.map((p, i) => {
            const x = (i / (points.length - 1)) * 100;
            const y = 100 - (((Number(p[dataKey]) - min) / (range || 1)) * 100);
            return `${x},${y}`;
        }).join(' ');
        return (
            <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                <path d={`M0,100 L${path} L100,100 Z`} fillOpacity="0.1" fill={color} />
                <polyline points={path} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
        );
    };

    if (loading) return <div className="flex justify-center p-20"><RefreshCw className="animate-spin text-indigo-500" size={32}/></div>;

    return (
        <div className="space-y-6 animate-in fade-in pb-24 px-1">
            <div className="flex flex-col md:flex-row justify-between items-center bg-slate-900 border border-slate-800 p-2 rounded-[32px] shadow-xl gap-2">
                <div className="flex p-1 bg-slate-950 rounded-2xl w-full md:w-auto">
                    <button onClick={() => setActiveView('REAL')} className={`flex-1 md:flex-none px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeView === 'REAL' ? 'bg-indigo-600 text-white' : 'text-slate-500'}`}>EFECTIVO REAL</button>
                    <button onClick={() => setActiveView('SIMULATOR')} className={`flex-1 md:flex-none px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeView === 'SIMULATOR' ? 'bg-indigo-600 text-white' : 'text-slate-500'}`}>SIMULADOR</button>
                </div>
                <div className="flex items-center gap-2 p-1 bg-slate-950 rounded-2xl w-full md:w-auto">
                    <Calendar size={12} className="text-slate-600 ml-3"/>
                    <input type="date" value={dateRange.from} onChange={e => setDateRange({...dateRange, from: e.target.value})} className="bg-transparent text-[9px] font-black text-white outline-none uppercase" />
                    <span className="text-slate-700">/</span>
                    <input type="date" value={dateRange.to} onChange={e => setDateRange({...dateRange, to: e.target.value})} className="bg-transparent text-[9px] font-black text-white outline-none uppercase" />
                </div>
            </div>

            {activeView === 'REAL' ? (
                <div className="space-y-6">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="bg-slate-900 p-5 rounded-3xl border border-emerald-500/20 shadow-lg group">
                            <div className="flex items-center gap-2 mb-1">
                                <ArrowDownLeft size={14} className="text-emerald-400" />
                                <span className="text-[10px] font-black text-slate-500 uppercase">Efectivo Real (Inflow)</span>
                                <InfoHint title="Entrada de Capital" text="Dinero nuevo que ha entrado al sistema vía pasarelas o depósitos manuales." />
                            </div>
                            <div className="text-3xl font-black text-emerald-400">{(realStats?.totalRevenue || 0).toFixed(2)} $</div>
                        </div>
                        <div className="bg-slate-900 p-5 rounded-3xl border border-indigo-500/20 shadow-lg">
                            <div className="flex items-center gap-2 mb-1">
                                <Coins size={14} className="text-indigo-400" />
                                <span className="text-[10px] font-black text-slate-500 uppercase">Comisiones (Circulación)</span>
                                <InfoHint title="Ganancia Interna" text="Comisiones generadas por compras de videos o market usando saldo pre-existente." />
                            </div>
                            <div className="text-3xl font-black text-white">{(realStats?.internalRevenue || 0).toFixed(2)} $</div>
                        </div>
                        <div className="bg-slate-900 p-5 rounded-3xl border border-slate-800 shadow-lg">
                            <div className="flex items-center gap-2 mb-1">
                                <Wallet size={14} className="text-amber-400" />
                                <span className="text-[10px] font-black text-slate-500 uppercase">Ticket Medio Inflow</span>
                            </div>
                            <div className="text-3xl font-black text-white">{(realStats?.averages?.arpu || 0)} $</div>
                        </div>
                        <div className="bg-slate-900 p-5 rounded-3xl border border-slate-800 shadow-lg">
                            <div className="flex items-center gap-2 mb-1">
                                <Activity size={14} className="text-blue-400" />
                                <span className="text-[10px] font-black text-slate-500 uppercase">Conversión Real</span>
                            </div>
                            <div className="text-3xl font-black text-white">{(realStats?.averages?.conversion || 0)}%</div>
                        </div>
                    </div>
                    
                    <div className="bg-slate-900 border border-slate-800 rounded-[40px] p-8 shadow-2xl h-[400px] flex flex-col">
                        <h3 className="text-xl font-black text-white uppercase italic tracking-tighter mb-8 flex items-center gap-2">
                            <TrendingUp className="text-emerald-400" /> Flujo de Caja Real vs Ganancia Interna
                        </h3>
                        <div className="flex-1 w-full bg-slate-950/20 rounded-3xl p-6 relative">
                            {renderChart(realStats?.history?.daily || [], 'cash_in', '#10b981')}
                            <div className="absolute inset-x-6 inset-y-6 opacity-30">
                                {renderChart(realStats?.history?.daily || [], 'internal_rev', '#6366f1')}
                            </div>
                        </div>
                        <div className="flex gap-6 mt-4 justify-center">
                            <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-emerald-500"></span><span className="text-[9px] font-black text-slate-500 uppercase">Dinero Nuevo</span></div>
                            <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-indigo-500"></span><span className="text-[9px] font-black text-slate-500 uppercase">Comisiones Internas</span></div>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-in slide-in-from-bottom-4">
                    <div className="lg:col-span-4 space-y-4">
                        <div className="bg-slate-900 p-8 rounded-[40px] border border-slate-800 shadow-xl space-y-6">
                            <div className="border-b border-slate-800 pb-2">
                                <div className="flex items-center gap-3">
                                    <Crown size={18} className="text-amber-400"/>
                                    <h3 className="font-black text-white uppercase text-[10px] tracking-widest">Mix de Membresías (Ventas Cash)</h3>
                                    <InfoHint title="Basado en Ventas Reales" text="Estas cantidades reflejan cuántas veces se ha comprado cada plan con dinero externo en el periodo seleccionado." />
                                </div>
                            </div>
                            
                            <div className="space-y-3 max-h-[350px] overflow-y-auto pr-2 custom-scrollbar">
                                {allVipPlans.map(plan => (
                                    <div key={plan.id} className="bg-slate-950 p-4 rounded-3xl border border-white/5 hover:border-emerald-500/30 transition-all">
                                        <div className="flex justify-between items-center">
                                            <div className="min-w-0">
                                                <div className="text-[10px] font-black text-white uppercase truncate">{plan.name}</div>
                                                <div className="text-[8px] font-bold text-slate-500 uppercase">${plan.price}</div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <input 
                                                    type="number" min="0" 
                                                    value={sim.planMix[plan.id] || 0}
                                                    onChange={e => {
                                                        const newMix = { ...sim.planMix, [plan.id]: parseInt(e.target.value) || 0 };
                                                        updateTicketFromMix(newMix);
                                                    }}
                                                    className="w-16 bg-slate-900 border border-slate-800 rounded-lg py-1.5 px-2 text-xs font-black text-white text-center"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            
                            <div className="space-y-6 pt-4 border-t border-slate-800">
                                <div>
                                    <div className="flex justify-between mb-2">
                                        <label className="text-[10px] font-black text-slate-500 uppercase">Costos Operativos</label>
                                        <span className="text-sm font-black text-red-400">${sim.fixedCosts}</span>
                                    </div>
                                    <input type="range" min="100" max="10000" step="100" value={sim.fixedCosts} onChange={e => setSim({...sim, fixedCosts: parseInt(e.target.value)})} className="w-full accent-red-500 h-1 bg-slate-800 rounded-full appearance-none" />
                                </div>
                                <div className="bg-indigo-600/10 p-4 rounded-2xl border border-indigo-500/20">
                                    <div className="text-[9px] font-black text-indigo-400 uppercase mb-1">Ticket Promedio Simulado</div>
                                    <div className="text-2xl font-black text-white">${sim.avgTicket}</div>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <div className="lg:col-span-8 space-y-6">
                        <div className="bg-slate-900 border border-slate-800 rounded-[40px] p-8 md:p-12 shadow-2xl flex flex-col min-h-[500px]">
                            <div className="flex flex-col md:flex-row justify-between items-start gap-8 mb-12">
                                <div className="space-y-4">
                                    <h3 className="text-2xl font-black text-white uppercase italic tracking-tighter">Proyección de Entrada de Capital</h3>
                                    <div className="flex flex-wrap gap-4">
                                        <div className="bg-slate-950 px-5 py-3 rounded-3xl border border-white/5">
                                            <div className="text-[9px] font-black text-slate-500 uppercase mb-1">Efectivo Mensual Est.</div>
                                            <div className="text-xl font-black text-emerald-400">${projection.currentMonthlyRevenue.toLocaleString()}</div>
                                        </div>
                                        <div className={`px-5 py-3 rounded-3xl border ${projection.netResult >= 0 ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-red-500/10 border-red-500/20'}`}>
                                            <div className="text-[9px] font-black uppercase mb-1 opacity-60">Flujo Neto Mensual</div>
                                            <div className={`text-xl font-black ${projection.netResult >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                                {projection.netResult >= 0 ? '+' : ''}{projection.netResult.toLocaleString()} $
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            <div className="flex-1 w-full bg-slate-950/30 rounded-[32px] p-8 border border-slate-800/50 mb-8 relative">
                                {renderChart(projection.data, 'profit', (projection.netResult >= 0) ? '#10b981' : '#f43f5e')}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
