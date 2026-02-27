
import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../../../services/db';
import { BalanceRequest, VipRequest, User, Transaction, SellerVerificationRequest } from '../../../types';
import { useAuth } from '../../../context/AuthContext';
import { useToast } from '../../../context/ToastContext';
// Added ShieldAlert to imports to fix missing name error
import { Check, X, Clock, TrendingUp, ArrowDownLeft, ArrowUpRight, Crown, FileText, User as UserIcon, Wallet, Eye, Camera, MessageSquare, AlertCircle, Zap, Calendar, Fingerprint, ShieldCheck, MapPin, Smartphone, Shield, Search, ShieldAlert } from 'lucide-react';

export default function AdminFinance() {
    const { user: currentUser } = useAuth();
    const toast = useToast();
    
    const [activeTab, setActiveTab] = useState<'FINANCE' | 'IDENTITY'>('FINANCE');
    const [requests, setRequests] = useState<{balance: BalanceRequest[], vip: VipRequest[]}>({
        balance: [], 
        vip: []
    });
    
    const [globalTransactions, setGlobalTransactions] = useState<Transaction[]>([]);
    const [systemRevenue, setSystemRevenue] = useState(0);
    const [activeVips, setActiveVips] = useState<Partial<User>[]>([]);
    const [sellerRequests, setSellerRequests] = useState<SellerVerificationRequest[]>([]);
    
    const [selectedProof, setSelectedProof] = useState<{ text?: string, image?: string } | null>(null);
    const [selectedIdentity, setSelectedIdentity] = useState<SellerVerificationRequest | null>(null);
    
    const [now, setNow] = useState(Math.floor(Date.now() / 1000));

    useEffect(() => {
        const interval = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 60000);
        return () => clearInterval(interval);
    }, []);

    const loadData = () => {
        db.getBalanceRequests()
            .then((data: {balance: BalanceRequest[], vip: VipRequest[], activeVip?: Partial<User>[]}) => {
                if (data && typeof data === 'object') {
                    setRequests({
                        balance: Array.isArray(data.balance) ? data.balance : [],
                        vip: Array.isArray(data.vip) ? data.vip : []
                    });
                    if (data.activeVip && Array.isArray(data.activeVip)) {
                        setActiveVips(data.activeVip);
                    }
                }
            })
            .catch(e => console.error("Failed to load requests", e));
            
        db.getGlobalTransactions()
            .then((data: any) => {
                if (data) {
                    if (Array.isArray(data.history)) setGlobalTransactions(data.history);
                    if (typeof data.systemRevenue === 'number') setSystemRevenue(data.systemRevenue);
                }
            })
            .catch(e => console.error("Failed to load transactions", e));

        db.request<SellerVerificationRequest[]>('action=get_seller_verification_requests')
            .then(setSellerRequests)
            .catch(() => {});
    };

    useEffect(() => {
        loadData();
    }, []);

    const handleVipReq = async (reqId: string, action: 'APPROVED' | 'REJECTED') => {
        if (!currentUser) return;
        try {
            await db.handleVipRequest(currentUser.id, reqId, action);
            toast.success(`VIP ${action === 'APPROVED' ? 'Activado' : 'Rechazado'}`);
            loadData();
        } catch (e: any) { toast.error("Error: " + e.message); }
    };

    const handleSellerReq = async (reqId: string, status: 'APPROVED' | 'REJECTED') => {
        if (!currentUser) return;
        try {
            await db.request('action=admin_handle_seller_verification', {
                method: 'POST',
                body: JSON.stringify({ reqId, status })
            });
            toast.success(`Vendedor ${status === 'APPROVED' ? 'Verificado' : 'Rechazado'}`);
            setSelectedIdentity(null);
            loadData();
        } catch (e: any) { toast.error(e.message); }
    };

    const stats = useMemo(() => {
        const bal = requests.balance || [];
        const vip = requests.vip || [];
        const pendingCount = bal.length + vip.length;
        return { pendingCount, sellerPending: sellerRequests.length };
    }, [requests, sellerRequests]);

    // Formateador de tiempo relativo para Admin
    const getTimeRemaining = (expiry: number) => {
        const diff = expiry - now;
        if (diff <= 0) return 'Expirado';
        const days = Math.floor(diff / 86400);
        if (days > 0) return `${days} días`;
        const hours = Math.floor(diff / 3600);
        return `${hours} horas`;
    };

    return (
        <div className="space-y-6 animate-in fade-in pb-20 px-1">
            
            {/* Header Switcher */}
            <div className="bg-slate-900 border border-slate-800 p-2 rounded-[32px] shadow-xl flex gap-2">
                <button 
                    onClick={() => setActiveTab('FINANCE')}
                    className={`flex-1 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${activeTab === 'FINANCE' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/40' : 'text-slate-500 hover:text-white'}`}
                >
                    <TrendingUp size={16}/> Finanzas & VIP
                </button>
                <button 
                    onClick={() => setActiveTab('IDENTITY')}
                    className={`flex-1 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 relative ${activeTab === 'IDENTITY' ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/40' : 'text-slate-500 hover:text-white'}`}
                >
                    <Fingerprint size={16}/> Validación ID
                    {stats.sellerPending > 0 && <span className="absolute top-1 right-1 w-5 h-5 bg-red-600 border-2 border-slate-900 rounded-full flex items-center justify-center text-[9px] animate-bounce">{stats.sellerPending}</span>}
                </button>
            </div>

            {activeTab === 'FINANCE' ? (
                <div className="space-y-6">
                    {/* KPI Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="bg-slate-900 p-5 rounded-3xl border border-slate-800 flex items-center justify-between shadow-xl">
                            <div>
                                <p className="text-slate-500 text-[10px] font-black uppercase mb-1 tracking-widest">Recaudación (Neto)</p>
                                <h3 className="text-2xl font-black text-emerald-400">+{systemRevenue.toFixed(2)} $</h3>
                            </div>
                            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center"><TrendingUp size={24} /></div>
                        </div>
                        
                        <div className="bg-slate-900 p-5 rounded-3xl border border-slate-800 flex items-center justify-between shadow-xl">
                            <div>
                                <p className="text-slate-500 text-[10px] font-black uppercase mb-1 tracking-widest">Revisión Manual</p>
                                <h3 className="text-2xl font-black text-white">{stats.pendingCount}</h3>
                            </div>
                            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-400 flex items-center justify-center"><Clock size={24} /></div>
                        </div>

                        <div className="bg-slate-900 p-5 rounded-3xl border border-slate-800 flex items-center justify-between shadow-xl">
                            <div>
                                <p className="text-slate-500 text-[10px] font-black uppercase mb-1 tracking-widest">Activos Premium</p>
                                <h3 className="text-2xl font-black text-white">{activeVips.length}</h3>
                            </div>
                            <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center"><Crown size={24} /></div>
                        </div>
                    </div>

                    {/* VIP Requests Table */}
                    <div className="bg-slate-900 rounded-3xl border border-slate-800 overflow-hidden shadow-2xl">
                        <div className="p-5 border-b border-slate-800 bg-slate-950 flex justify-between items-center">
                            <div className="flex items-center gap-3">
                                <FileText size={18} className="text-amber-400"/>
                                <h3 className="font-black text-white uppercase text-xs tracking-widest">Solicitudes por Validar</h3>
                            </div>
                            <span className="bg-amber-500/10 text-amber-500 text-[9px] font-black px-3 py-1 rounded-full border border-amber-500/20 uppercase tracking-widest">{requests.vip.length} Pendientes</span>
                        </div>
                        
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="text-[10px] text-slate-500 uppercase bg-slate-950/50 border-b border-slate-800 font-black tracking-widest">
                                    <tr>
                                        <th className="px-6 py-4">Usuario</th>
                                        <th className="px-6 py-4">Plan Solicitado</th>
                                        <th className="px-6 py-4">Comprobantes</th>
                                        <th className="px-6 py-4 text-right">Acciones</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800">
                                    {requests.vip.length === 0 ? (
                                        <tr><td colSpan={4} className="text-center py-20 text-slate-600 font-bold uppercase text-[10px] tracking-widest italic">No hay pagos manuales pendientes</td></tr>
                                    ) : requests.vip.map(req => {
                                        const plan = typeof req.planSnapshot === 'string' ? JSON.parse(req.planSnapshot) : req.planSnapshot;
                                        const isBalance = plan.type === 'BALANCE';
                                        return (
                                            <tr key={req.id} className="hover:bg-slate-800/30 transition-colors group">
                                                <td className="px-6 py-4 font-bold text-white">@{req.username}</td>
                                                <td className="px-6 py-4">
                                                    <div className="text-white font-black text-xs uppercase mb-0.5">{plan.name}</div>
                                                    <div className="text-[10px] text-slate-500 font-bold uppercase">
                                                        {isBalance ? `Recarga: ${plan.price} $` : `${plan.durationDays} Días VIP`}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="flex gap-2">
                                                        {req.proofText && (
                                                            <button onClick={() => setSelectedProof({ text: req.proofText })} className="p-2 bg-indigo-500/10 text-indigo-400 rounded-xl hover:bg-indigo-600 hover:text-white transition-all shadow-lg"><MessageSquare size={16}/></button>
                                                        )}
                                                        {req.proofImageUrl && (
                                                            <button onClick={() => setSelectedProof({ image: req.proofImageUrl })} className="w-10 h-10 rounded-xl overflow-hidden border border-slate-700 hover:border-indigo-500 transition-all shadow-lg bg-black"><img src={req.proofImageUrl} className="w-full h-full object-cover opacity-60 hover:opacity-100" /></button>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="flex justify-end gap-3">
                                                        <button onClick={() => handleVipReq(req.id, 'APPROVED')} className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-emerald-900/40 active:scale-95 transition-all">Activar</button>
                                                        <button onClick={() => handleVipReq(req.id, 'REJECTED')} className="bg-slate-800 hover:bg-red-600 text-slate-400 hover:text-white p-2 rounded-xl active:scale-95 transition-all"><X size={16}/></button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Active VIPs List */}
                    <div className="bg-slate-900 rounded-3xl border border-slate-800 overflow-hidden shadow-xl">
                        <div className="p-5 border-b border-slate-800 bg-slate-950 flex items-center gap-3">
                            <Crown size={18} className="text-indigo-400"/>
                            <h3 className="font-black text-white uppercase text-xs tracking-widest">Activos Premium (Tiempo Real)</h3>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="text-[10px] text-slate-500 uppercase bg-slate-950/50 border-b border-slate-800 font-black tracking-widest">
                                    <tr>
                                        <th className="px-6 py-4">Usuario</th>
                                        <th className="px-6 py-4">Expira el</th>
                                        <th className="px-6 py-4 text-right">Tiempo Restante</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800">
                                    {activeVips.length === 0 ? (
                                        <tr><td colSpan={3} className="text-center py-10 text-slate-600">No hay usuarios VIP actualmente</td></tr>
                                    ) : activeVips.map(v => {
                                        const expiry = Number(v.vipExpiry);
                                        const diff = expiry - now;
                                        return (
                                            <tr key={v.id} className="hover:bg-slate-800/20">
                                                <td className="px-6 py-4 font-bold text-white flex items-center gap-2">
                                                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                                                    @{v.username}
                                                </td>
                                                <td className="px-6 py-4 text-slate-400 font-mono text-xs">
                                                    {new Date(expiry * 1000).toLocaleDateString()}
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    <span className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase ${diff < 86400 ? 'bg-red-500/20 text-red-400' : 'bg-indigo-500/20 text-indigo-400'}`}>
                                                        {getTimeRemaining(expiry)}
                                                    </span>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Global Transactions Audit Table */}
                    <div className="bg-slate-900 rounded-3xl border border-slate-800 overflow-hidden shadow-xl">
                        <div className="p-5 border-b border-slate-800 bg-slate-950 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <TrendingUp size={18} className="text-emerald-400"/>
                                <h3 className="font-black text-white uppercase text-xs tracking-widest">Historial Global & Auditoría</h3>
                            </div>
                            <div className="flex gap-4">
                                <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span><span className="text-[8px] font-black text-slate-500 uppercase">Dinero Externo</span></div>
                                <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-indigo-500"></span><span className="text-[8px] font-black text-slate-500 uppercase">Circulación Interna</span></div>
                            </div>
                        </div>
                        <div className="overflow-x-auto max-h-[600px] overflow-y-auto custom-scrollbar">
                            <table className="w-full text-sm text-left">
                                <thead className="text-[10px] text-slate-500 uppercase bg-slate-950/50 sticky top-0 font-black tracking-widest z-10">
                                    <tr>
                                        <th className="px-4 py-4">Origen</th>
                                        <th className="px-4 py-4">Tipo</th>
                                        <th className="px-4 py-4">Detalle</th>
                                        <th className="px-4 py-4 text-right">Monto</th>
                                        <th className="px-4 py-4 text-right">Fee</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800">
                                    {globalTransactions.map(t => {
                                        const isRealCash = Number(t.isExternal) === 1;
                                        return (
                                            <tr key={t.id} className={`hover:bg-slate-800/20 transition-colors ${isRealCash ? 'bg-emerald-500/[0.02]' : ''}`}>
                                                <td className="px-4 py-4">
                                                    {isRealCash ? (
                                                        <span className="flex items-center gap-1 text-[9px] font-black text-emerald-400 uppercase tracking-tighter bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                                                            <Zap size={10} fill="currentColor"/> Inflow
                                                        </span>
                                                    ) : (
                                                        <span className="text-[9px] font-black text-slate-500 uppercase tracking-tighter bg-slate-800 px-2 py-0.5 rounded-full">
                                                            Interno
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="px-4 py-4">
                                                    <span className="text-[9px] font-black px-2 py-0.5 rounded bg-slate-800 text-slate-400 uppercase">{t.type}</span>
                                                </td>
                                                <td className="px-4 py-4">
                                                    <div className="text-white font-bold truncate max-w-[180px] text-xs">{t.videoTitle || 'Operación'}</div>
                                                    <div className="text-[9px] text-slate-500 font-bold uppercase mt-0.5">@{t.buyerName || 'Anónimo'}</div>
                                                </td>
                                                <td className="px-4 py-4 text-right">
                                                    <span className={`font-mono font-bold text-sm ${isRealCash ? 'text-emerald-400' : 'text-white'}`}>
                                                        {Number(t.amount).toFixed(2)}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-4 text-right font-mono text-slate-600 text-xs">
                                                    {Number(t.adminFee || 0).toFixed(2)}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="space-y-6 animate-in slide-in-from-right-10 duration-500">
                    <div className="bg-slate-900 border border-slate-800 rounded-[40px] overflow-hidden shadow-2xl">
                        <div className="p-8 bg-slate-950 border-b border-white/5 flex justify-between items-center">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-2xl bg-emerald-600 flex items-center justify-center text-white shadow-lg">
                                    <Fingerprint size={28}/>
                                </div>
                                <div>
                                    <h3 className="font-black text-white uppercase text-sm tracking-widest leading-none">Auditoría de Identidad</h3>
                                    <p className="text-[10px] text-slate-500 font-bold uppercase mt-1">Valida datos reales para permitir ventas seguras</p>
                                </div>
                            </div>
                        </div>

                        <div className="p-4 space-y-4">
                            {sellerRequests.length === 0 ? (
                                <div className="py-24 text-center flex flex-col items-center gap-4 opacity-30">
                                    <Shield size={64}/>
                                    <p className="font-black uppercase text-[10px] tracking-widest italic">No hay solicitudes de verificación pendientes</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {sellerRequests.map(req => (
                                        <div key={req.id} className="bg-slate-950 border border-white/5 rounded-[32px] p-6 space-y-6 hover:border-emerald-500/30 transition-all group shadow-xl">
                                            <div className="flex justify-between items-start">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white font-black uppercase text-xs">
                                                        {req.username[0]}
                                                    </div>
                                                    <div>
                                                        <h4 className="font-black text-white text-sm">@{req.username}</h4>
                                                        <span className="text-[9px] text-slate-500 uppercase font-bold">{new Date(req.createdAt * 1000).toLocaleDateString()}</span>
                                                    </div>
                                                </div>
                                                <button onClick={() => setSelectedIdentity(req)} className="p-2 bg-slate-900 rounded-xl text-slate-500 hover:text-white transition-all"><Eye size={16}/></button>
                                            </div>

                                            <div className="space-y-2">
                                                <div className="flex items-center gap-2 text-slate-400">
                                                    <UserIcon size={14} className="text-emerald-500"/>
                                                    <span className="text-xs font-bold truncate">{req.fullName}</span>
                                                </div>
                                                <div className="flex items-center gap-2 text-slate-400">
                                                    <Smartphone size={14} className="text-indigo-500"/>
                                                    <span className="text-xs font-mono">{req.mobile}</span>
                                                </div>
                                            </div>

                                            <div className="flex gap-2 pt-2">
                                                <button 
                                                    onClick={() => handleSellerReq(req.id, 'APPROVED')}
                                                    className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-black py-3 rounded-xl text-[9px] uppercase tracking-widest transition-all active:scale-95 shadow-lg"
                                                >
                                                    Aprobar Identidad
                                                </button>
                                                <button 
                                                    onClick={() => handleSellerReq(req.id, 'REJECTED')}
                                                    className="px-4 bg-slate-800 hover:bg-red-600 text-slate-400 hover:text-white rounded-xl transition-all"
                                                >
                                                    <X size={16}/>
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Proof Modal Viewer */}
            {selectedProof && (
                <div className="fixed inset-0 z-[300] bg-black/95 backdrop-blur-xl flex items-center justify-center p-4 animate-in fade-in" onClick={() => setSelectedProof(null)}>
                    <div className="bg-slate-900 border border-white/10 w-full max-w-2xl rounded-[40px] shadow-2xl overflow-hidden animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
                        <div className="p-6 bg-slate-950 border-b border-white/5 flex justify-between items-center">
                            <h4 className="font-black text-white uppercase text-sm tracking-widest">Evidencia de Pago</h4>
                            <button onClick={() => setSelectedProof(null)} className="p-2 bg-slate-800 text-slate-400 rounded-full hover:text-white"><X/></button>
                        </div>
                        <div className="p-8">
                            {selectedProof.image ? (
                                <div className="rounded-3xl overflow-hidden border border-white/5 shadow-2xl bg-black max-h-[60vh]"><img src={selectedProof.image} className="w-full h-auto object-contain" /></div>
                            ) : (
                                <div className="bg-slate-950 p-8 rounded-[32px] border border-indigo-500/20 text-slate-200 font-mono text-sm leading-relaxed whitespace-pre-wrap italic">"{selectedProof.text}"</div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Identity Detail Modal */}
            {selectedIdentity && (
                <div className="fixed inset-0 z-[300] bg-black/95 backdrop-blur-xl flex items-center justify-center p-4 animate-in fade-in" onClick={() => setSelectedIdentity(null)}>
                    <div className="bg-slate-900 border border-white/10 w-full max-w-md rounded-[40px] shadow-2xl overflow-hidden animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
                        <div className="p-6 bg-slate-950 border-b border-white/5 flex justify-between items-center">
                            <h4 className="font-black text-white uppercase text-sm tracking-widest">Expediente de Identidad</h4>
                            <button onClick={() => setSelectedIdentity(null)} className="p-2 bg-slate-800 text-slate-400 rounded-full hover:text-white"><X/></button>
                        </div>
                        <div className="p-8 space-y-6">
                            <div className="flex flex-col items-center gap-4 mb-4">
                                <div className="w-20 h-20 rounded-full bg-indigo-600 flex items-center justify-center text-white text-3xl font-black shadow-2xl">
                                    {selectedIdentity.username[0].toUpperCase()}
                                </div>
                                <h3 className="font-black text-white text-xl uppercase">@{selectedIdentity.username}</h3>
                            </div>

                            <div className="space-y-4">
                                <div className="p-4 bg-slate-950 rounded-2xl border border-white/5">
                                    <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest mb-1 block">Nombre Legal</label>
                                    <p className="text-white font-bold">{selectedIdentity.fullName}</p>
                                </div>
                                <div className="p-4 bg-slate-950 rounded-2xl border border-white/5">
                                    <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest mb-1 block">Identificación (ID/CI)</label>
                                    <p className="text-emerald-400 font-mono font-bold">{selectedIdentity.idNumber}</p>
                                </div>
                                <div className="p-4 bg-slate-950 rounded-2xl border border-white/5">
                                    <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest mb-1 block">Móvil de Contacto</label>
                                    <p className="text-indigo-400 font-mono font-bold">{selectedIdentity.mobile}</p>
                                </div>
                                <div className="p-4 bg-slate-950 rounded-2xl border border-white/5">
                                    <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest mb-1 block">Domicilio Registrado</label>
                                    <p className="text-slate-300 text-xs italic">{selectedIdentity.address}</p>
                                </div>
                            </div>

                            <div className="flex gap-4 pt-4">
                                <button 
                                    onClick={() => handleSellerReq(selectedIdentity.id, 'APPROVED')}
                                    className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-black py-4 rounded-2xl shadow-xl transition-all active:scale-95 uppercase text-xs tracking-widest"
                                >
                                    Validar Vendedor
                                </button>
                                <button 
                                    onClick={() => handleSellerReq(selectedIdentity.id, 'REJECTED')}
                                    className="px-6 bg-red-950/20 hover:bg-red-600 text-red-500 hover:text-white rounded-2xl border border-red-900/30 transition-all active:scale-95"
                                >
                                    <ShieldAlert size={20}/>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
