
import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../../services/db';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { VipPlan, SystemSettings } from '../../types';
import { 
    Crown, Check, Zap, Loader2, ArrowLeft, Wallet, 
    CreditCard, Coins, TrendingUp, ShieldCheck, 
    Smartphone, Globe, X, Copy, Info, Clock, Camera, FileText, Send, Calendar, Banknote
} from 'lucide-react';
import { useNavigate, useLocation } from '../Router';

export default function VipStore() {
    const { user, refreshUser } = useAuth();
    const navigate = useNavigate();
    const toast = useToast();
    
    const [plans, setPlans] = useState<VipPlan[]>([]);
    const [settings, setSettings] = useState<SystemSettings | null>(null);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [popularityData, setPopularityData] = useState<Record<string, number>>({});
    
    // Modal State
    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [selectedPlan, setSelectedPlan] = useState<VipPlan | null>(null);
    const [selectedMethod, setSelectedMethod] = useState<string | null>(null);

    // Proof Form State
    const [proofText, setProofText] = useState('');
    const [proofImage, setProofImage] = useState<File | null>(null);
    const [proofPreview, setProofPreview] = useState<string | null>(null);

    useEffect(() => {
        db.getSystemSettings().then((s: any) => {
            setSettings(s);
            if (s.vipPlans) setPlans(s.vipPlans);
            if (s.planPopularity) setPopularityData(s.planPopularity);
            setLoading(false);
        });
    }, []);

    // --- Hooks movidos arriba para evitar Error #310 ---
    
    const mostPopularPlanName = useMemo(() => {
        let max = 0;
        let winner = null;
        Object.entries(popularityData).forEach(([name, val]) => {
            const count = val as number;
            if (count > max) {
                max = count;
                winner = name;
            }
        });
        return winner;
    }, [popularityData]);

    const activeMethods = useMemo(() => {
        return settings?.paymentMethods || {
            manual: { enabled: true, instructions: '', exchangeRate: 1, currencySymbol: '$' }
        };
    }, [settings]);

    const isVip = useMemo(() => user && user.vipExpiry && Number(user.vipExpiry) > (Date.now() / 1000), [user]);

    // Cálculo de precio convertido basado en el método seleccionado (DIVISIÓN PARA TASA INVERSA)
    const convertedAmountDisplay = useMemo(() => {
        if (!selectedPlan || !selectedMethod) return null;
        const methodKey = selectedMethod as keyof typeof activeMethods;
        const config = (activeMethods as any)[methodKey];
        if (!config) return null;
        
        const rate = Number(config.exchangeRate || 1);
        const symbol = config.currencySymbol || '$';
        
        // CORRECCIÓN LÓGICA: DIVIDIR PRECIO POR TASA (2x1 -> Precio 100 / Tasa 2 = Paga 50)
        const rawValue = rate > 0 ? (selectedPlan.price / rate) : selectedPlan.price;
        const converted = rawValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        
        return { value: converted, symbol, rate };
    }, [selectedPlan, selectedMethod, activeMethods]);

    // --- Fin de Hooks de nivel superior ---

    const resetProof = () => {
        setProofText('');
        setProofImage(null);
        setProofPreview(null);
    };

    const handleProofFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            setProofImage(file);
            setProofPreview(URL.createObjectURL(file));
        }
    };

    const handleSubmitManualRequest = async () => {
        if (!user || !selectedPlan) return;
        if (!proofText.trim() && !proofImage) {
            toast.warning("Por favor adjunta el SMS o una captura del pago.");
            return;
        }

        setSubmitting(true);
        try {
            await db.submitManualVipRequest(user.id, selectedPlan, proofText, proofImage);
            toast.success("Solicitud enviada. El administrador la revisará pronto.");
            setShowPaymentModal(false);
            resetProof();
            setSelectedMethod(null);
        } catch (e: any) { toast.error(e.message); }
        finally { setSubmitting(false); }
    };

    const handleInstantPurchase = async (plan: VipPlan) => {
        if (!user) return;
        if (plan.type && plan.type.toString().toUpperCase() === 'BALANCE') {
            toast.error("Las recargas de saldo requieren pago externo.");
            return;
        }
        if (user.balance < plan.price) {
            toast.error("Saldo insuficiente.");
            return;
        }
        if (!confirm(`¿Canjear ${plan.price} $ por ${plan.durationDays} días VIP?`)) return;

        setSubmitting(true);
        try {
            await db.purchaseVipInstant(user.id, plan);
            toast.success("¡Acceso VIP Activado!");
            refreshUser();
            navigate('/profile');
        } catch (e: any) { toast.error(e.message); }
        finally { setSubmitting(false); }
    };

    const handleTropipayDirect = async (plan: VipPlan) => {
        if (!user) return;
        setSubmitting(true);
        try {
            const res = await db.createPayLink(user.id, plan);
            if (res.paymentUrl) {
                window.location.href = res.paymentUrl;
            }
        } catch (e: any) { toast.error(e.message); setSubmitting(false); }
    };

    const handleCopy = (text: string) => {
        navigator.clipboard.writeText(text);
        toast.success("Copiado al portapapeles");
    };

    const getPriceDisplayForMethod = (methodKey: string) => {
        if (!selectedPlan) return null;
        const config = (activeMethods as any)[methodKey];
        if (!config) return null;
        const rate = Number(config.exchangeRate || 1);
        const symbol = config.currencySymbol || '$';
        const rawValue = rate > 0 ? (selectedPlan.price / rate) : selectedPlan.price;
        return {
            value: rawValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
            symbol
        };
    };

    if (loading) return <div className="flex justify-center p-20"><Loader2 className="animate-spin text-amber-500" /></div>;

    return (
        <div className="pb-24 pt-6 px-4 max-w-5xl mx-auto animate-in fade-in">
            <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-slate-400 hover:text-white mb-8 bg-slate-900 px-4 py-2 rounded-full border border-slate-800 transition-all">
                <ArrowLeft size={20}/> Volver
            </button>

            <div className="text-center mb-12">
                <h1 className="text-3xl font-black text-white mb-2 uppercase italic tracking-tighter">VIP & Recargas</h1>
                <p className="text-slate-400 text-sm uppercase font-bold tracking-widest">Mejora tu experiencia en StreamPay</p>
            </div>

            {isVip && (
                <div className="mb-10 bg-gradient-to-r from-amber-600/20 to-indigo-600/20 border border-amber-500/30 rounded-[32px] p-6 flex flex-col md:flex-row md:items-center justify-between gap-6 shadow-2xl backdrop-blur-sm">
                    <div className="flex items-center gap-5">
                        <div className="w-14 h-14 rounded-2xl bg-amber-500 flex items-center justify-center text-black shadow-lg shadow-amber-500/20">
                            <Crown size={32} />
                        </div>
                        <div>
                            <h2 className="text-white font-black uppercase text-sm tracking-widest">Suscripción VIP Activa</h2>
                            <p className="text-amber-400 text-xs font-bold mt-1">
                                Vence el: {new Date(Number(user?.vipExpiry || 0) * 1000).toLocaleDateString(undefined, { day:'2-digit', month:'long', year:'numeric' })}
                            </p>
                        </div>
                    </div>
                    <div className="bg-black/40 px-4 py-2 rounded-2xl border border-white/5 flex items-center gap-3">
                        <Info size={16} className="text-indigo-400"/>
                        <span className="text-[10px] text-slate-300 font-bold uppercase leading-tight">
                            Comprar un plan nuevo<br/>acumula tiempo al actual
                        </span>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {plans.map(plan => {
                    const isBalance = plan.type && plan.type.toString().toUpperCase() === 'BALANCE';
                    const finalRecharge = plan.price * (1 + (plan.bonusPercent || 0) / 100);
                    const isWinner = plan.name === mostPopularPlanName;

                    return (
                        <div key={plan.id} className={`bg-slate-900 border ${isWinner ? 'border-amber-500/50 ring-2 ring-amber-500/10' : 'border-slate-800'} rounded-[32px] p-8 flex flex-col hover:border-indigo-500/50 transition-all group relative overflow-hidden shadow-2xl`}>
                            {isWinner && <div className="absolute top-0 right-0 bg-amber-500 text-black text-[10px] font-black px-4 py-1 rounded-bl-xl">POPULAR</div>}
                            <div className="mb-4">
                                <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded ${isBalance ? 'bg-emerald-500/20 text-emerald-400' : 'bg-indigo-500/20 text-indigo-400'}`}>
                                    {isBalance ? 'Recarga de Saldo' : 'Acceso VIP'}
                                </span>
                            </div>
                            <h3 className="text-xl font-black text-white mb-2 uppercase tracking-tighter">{plan.name}</h3>
                            <div className="text-4xl font-black text-white mb-6">{plan.price} $</div>
                            
                            <ul className="space-y-4 mb-10 flex-1">
                                {isBalance ? (
                                    <li className="flex gap-3 text-sm text-white items-center bg-emerald-500/10 p-2 rounded-xl border border-emerald-500/20">
                                        <Coins size={18} className="text-emerald-400 shrink-0"/>
                                        <span className="font-bold">Recibes: {finalRecharge.toFixed(2)} $</span>
                                    </li>
                                ) : (
                                    <>
                                        <li className="flex gap-3 text-sm text-slate-300 items-center"><Check size={18} className="text-emerald-500"/> Contenido Premium Gratis</li>
                                        <li className="flex gap-3 text-sm text-slate-300 items-center"><Clock size={18} className="text-blue-500"/> Duración: {plan.durationDays} días</li>
                                    </>
                                )}
                            </ul>

                            <div className="space-y-3">
                                {!isBalance && (
                                    <button 
                                        onClick={() => handleInstantPurchase(plan)}
                                        className="w-full py-4 bg-amber-500 hover:bg-amber-400 text-black font-black rounded-2xl shadow-lg flex items-center justify-center gap-2 transition-all active:scale-95"
                                    >
                                        <Wallet size={18}/> Canjear Saldo
                                    </button>
                                )}
                                <button 
                                    onClick={() => { setSelectedPlan(plan); setShowPaymentModal(true); }}
                                    className={`w-full py-3 ${isBalance ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-slate-800 hover:bg-slate-700'} text-white font-bold rounded-2xl text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2 shadow-lg active:scale-95`}
                                >
                                    <CreditCard size={14}/> Pago Externo
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Modal de Pagos Externos */}
            {showPaymentModal && selectedPlan && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm animate-in fade-in">
                    <div className="bg-slate-900 border border-slate-800 w-full max-w-lg rounded-[40px] shadow-2xl overflow-hidden animate-in zoom-in-95">
                        <div className="p-6 bg-slate-950 border-b border-white/5 flex justify-between items-center">
                            <div>
                                <h3 className="font-black text-white uppercase text-sm tracking-widest">Método de Pago</h3>
                                <p className="text-[10px] text-amber-500 font-bold uppercase">{selectedPlan.name} - {selectedPlan.price} $</p>
                            </div>
                            <button onClick={() => { setShowPaymentModal(false); setSelectedMethod(null); resetProof(); }} className="p-2 hover:bg-white/10 rounded-full text-slate-500"><X/></button>
                        </div>

                        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto custom-scrollbar">
                            {!selectedMethod ? (
                                <div className="grid grid-cols-2 gap-3">
                                    {activeMethods.tropipay?.enabled && (
                                        <button onClick={() => setSelectedMethod('tropipay')} className="p-4 bg-slate-950 border border-slate-800 rounded-2xl flex flex-col items-center gap-2 hover:border-indigo-500/50 transition-all group">
                                            <Globe size={24} className="text-blue-400 group-hover:scale-110 transition-transform"/>
                                            <span className="text-[10px] font-black text-white uppercase tracking-widest text-center leading-tight">Tropipay</span>
                                            {(() => {
                                                const d = getPriceDisplayForMethod('tropipay');
                                                return d && <div className="mt-1 bg-emerald-500/10 px-2 py-1 rounded border border-emerald-500/20 text-[9px] text-emerald-400 font-black">Pagas: {d.value} {d.symbol}</div>;
                                            })()}
                                        </button>
                                    )}
                                    {activeMethods.card?.enabled && (
                                        <button onClick={() => setSelectedMethod('card')} className="p-4 bg-slate-950 border border-slate-800 rounded-2xl flex flex-col items-center gap-2 hover:border-indigo-500/50 transition-all group">
                                            <CreditCard size={24} className="text-emerald-400 group-hover:scale-110 transition-transform"/>
                                            <span className="text-[10px] font-black text-white uppercase tracking-widest text-center leading-tight">Tarjeta / Zelle</span>
                                            {(() => {
                                                const d = getPriceDisplayForMethod('card');
                                                return d && <div className="mt-1 bg-emerald-500/10 px-2 py-1 rounded border border-emerald-500/20 text-[9px] text-emerald-400 font-black">Pagas: {d.value} {d.symbol}</div>;
                                            })()}
                                        </button>
                                    )}
                                    {activeMethods.mobile?.enabled && (
                                        <button onClick={() => setSelectedMethod('mobile')} className="p-4 bg-slate-950 border border-slate-800 rounded-2xl flex flex-col items-center gap-2 hover:border-indigo-500/50 transition-all group">
                                            <Smartphone size={24} className="text-pink-400 group-hover:scale-110 transition-transform"/>
                                            <span className="text-[10px] font-black text-white uppercase tracking-widest text-center leading-tight">Saldo Móvil</span>
                                            {(() => {
                                                const d = getPriceDisplayForMethod('mobile');
                                                return d && <div className="mt-1 bg-emerald-500/10 px-2 py-1 rounded border border-emerald-500/20 text-[9px] text-emerald-400 font-black">Pagas: {d.value} {d.symbol}</div>;
                                            })()}
                                        </button>
                                    )}
                                    {activeMethods.cash?.enabled && (
                                        <button onClick={() => setSelectedMethod('cash')} className="p-4 bg-slate-950 border border-slate-800 rounded-2xl flex flex-col items-center gap-2 hover:border-indigo-500/50 transition-all group">
                                            <Banknote size={24} className="text-emerald-400 group-hover:scale-110 transition-transform"/>
                                            <span className="text-[10px] font-black text-white uppercase tracking-widest text-center leading-tight">Efectivo</span>
                                            {(() => {
                                                const d = getPriceDisplayForMethod('cash');
                                                return d && <div className="mt-1 bg-emerald-500/10 px-2 py-1 rounded border border-emerald-500/20 text-[9px] text-emerald-400 font-black">Pagas: {d.value} {d.symbol}</div>;
                                            })()}
                                        </button>
                                    )}
                                    {activeMethods.manual?.enabled && (
                                        <button onClick={() => setSelectedMethod('manual')} className="p-4 bg-slate-950 border border-slate-800 rounded-2xl flex flex-col items-center gap-2 hover:border-indigo-500/50 transition-all group">
                                            <Wallet size={24} className="text-amber-400 group-hover:scale-110 transition-transform"/>
                                            <span className="text-[10px] font-black text-white uppercase tracking-widest text-center leading-tight">Soporte Admin</span>
                                            {(() => {
                                                const d = getPriceDisplayForMethod('manual');
                                                return d && <div className="mt-1 bg-emerald-500/10 px-2 py-1 rounded border border-emerald-500/20 text-[9px] text-emerald-400 font-black">Pagas: {d.value} {d.symbol}</div>;
                                            })()}
                                        </button>
                                    )}
                                </div>
                            ) : (
                                <div className="space-y-6 animate-in slide-in-from-right-4">
                                    <div className="flex justify-between items-center">
                                        <button onClick={() => setSelectedMethod(null)} className="text-[10px] font-black text-indigo-400 uppercase flex items-center gap-1"><ArrowLeft size={12}/> Cambiar Método</button>
                                        
                                        {/* Badge de Tasa de Cambio */}
                                        {convertedAmountDisplay && (
                                            <div className="bg-emerald-500/10 border border-emerald-500/30 px-3 py-1 rounded-full flex items-center gap-2">
                                                <Banknote size={12} className="text-emerald-400"/>
                                                <span className="text-[10px] font-black text-emerald-400 uppercase">Tasa: {convertedAmountDisplay.rate}x1 en {convertedAmountDisplay.symbol}</span>
                                            </div>
                                        )}
                                    </div>
                                    
                                    {/* Monto Final Calculado */}
                                    {convertedAmountDisplay && (
                                        <div className="bg-slate-950 p-6 rounded-[32px] border border-emerald-500/20 text-center shadow-inner">
                                            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Monto total a transferir</p>
                                            <h4 className="text-3xl font-black text-white tracking-tighter">
                                                {convertedAmountDisplay.value} <span className="text-lg text-emerald-500 ml-1">{convertedAmountDisplay.symbol}</span>
                                            </h4>
                                        </div>
                                    )}

                                    <div className="bg-slate-950 p-5 rounded-3xl border border-indigo-500/20 relative">
                                        <h4 className="text-xs font-black text-white uppercase mb-3 tracking-widest flex items-center gap-2">
                                            <span className="p-1 bg-slate-900 rounded-lg"><Info size={14} className="text-indigo-400"/></span> Instrucciones
                                        </h4>
                                        <p className="text-xs text-slate-400 leading-relaxed whitespace-pre-wrap italic mb-4">
                                            {(activeMethods as any)[selectedMethod]?.instructions || "Consulte con el administrador."}
                                        </p>
                                        <button onClick={() => handleCopy((activeMethods as any)[selectedMethod]?.instructions)} className="absolute top-4 right-4 p-2 bg-slate-900 rounded-xl text-slate-500 hover:text-white">
                                            <Copy size={14}/>
                                        </button>
                                    </div>

                                    {/* Tropipay Automatic Trigger */}
                                    {selectedMethod === 'tropipay' && (
                                        <button 
                                            onClick={() => handleTropipayDirect(selectedPlan)}
                                            disabled={submitting}
                                            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-black py-5 rounded-[24px] shadow-xl transition-all flex items-center justify-center gap-3 uppercase text-xs tracking-widest"
                                        >
                                            {submitting ? <Loader2 className="animate-spin" size={20}/> : <Globe size={20}/>}
                                            Pagar con Tropipay
                                        </button>
                                    )}

                                    {/* Manual Proof Submission Section */}
                                    {selectedMethod !== 'tropipay' && (
                                        <div className="space-y-4">
                                            <h4 className="text-xs font-black text-white uppercase tracking-widest flex items-center gap-2 border-l-2 border-amber-500 pl-3">
                                                Adjuntar Comprobante
                                            </h4>
                                            
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-black text-slate-500 uppercase flex items-center gap-2">
                                                    <FileText size={12}/> Texto del SMS o Referencia
                                                </label>
                                                <textarea 
                                                    value={proofText}
                                                    onChange={e => setProofText(e.target.value)}
                                                    placeholder={selectedMethod === 'cash' ? "Escribe un mensaje para el admin (ej: 'Ya te entregué el dinero')" : "Pega aquí el contenido del SMS de confirmación..."}
                                                    className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 text-xs text-white focus:border-indigo-500 outline-none transition-all min-h-[100px] resize-none"
                                                />
                                            </div>

                                            <div className="space-y-2">
                                                <label className="text-[10px] font-black text-slate-500 uppercase flex items-center gap-2">
                                                    <Camera size={12}/> Captura de Pantalla (Opcional)
                                                </label>
                                                <div className="relative group">
                                                    {proofPreview ? (
                                                        <div className="relative aspect-video rounded-2xl overflow-hidden border border-slate-700 bg-black">
                                                            <img src={proofPreview} className="w-full h-full object-contain" alt="Proof" />
                                                            <button onClick={() => { setProofImage(null); setProofPreview(null); }} className="absolute top-2 right-2 bg-red-600 text-white p-1.5 rounded-full shadow-lg">
                                                                <X size={14}/>
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <label className="flex flex-col items-center justify-center aspect-video bg-slate-950 border-2 border-dashed border-slate-800 rounded-2xl cursor-pointer hover:bg-slate-900 hover:border-indigo-500/50 transition-all">
                                                            <Camera size={24} className="text-slate-600 mb-2" />
                                                            <span className="text-[9px] font-black text-slate-500 uppercase">Click para subir imagen</span>
                                                            <input type="file" accept="image/*" onChange={handleProofFileChange} className="hidden" />
                                                        </label>
                                                    )}
                                                </div>
                                            </div>

                                            <button 
                                                onClick={handleSubmitManualRequest}
                                                disabled={submitting || (!proofText.trim() && !proofImage)}
                                                className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-600 text-white font-black py-5 rounded-[24px] shadow-xl transition-all flex items-center justify-center gap-3 uppercase text-xs tracking-widest active:scale-95"
                                            >
                                                {submitting ? <Loader2 className="animate-spin" size={20}/> : <Send size={20}/>}
                                                Enviar para Revisión
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
