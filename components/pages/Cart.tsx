import React, { useState, useMemo, useEffect } from 'react';
import { useCart } from '../../context/CartContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { db } from '../../services/db';
import { useNavigate } from '../Router';
import { Trash2, ShoppingBag, Truck, CheckCircle, AlertCircle, Loader2, Minus, Plus, Tag, ArrowRight, Wallet, MapPin, History, ChevronRight, Package, Clock, XCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { CartItem } from '../../types';

export default function Cart() {
    const { cart, removeFromCart, updateQuantity, clearCart } = useCart();
    const { user, refreshUser } = useAuth();
    const navigate = useNavigate();
    const toast = useToast();
    const [loading, setLoading] = useState(false);
    const [paymentMethod, setPaymentMethod] = useState<'PLATFORM' | 'DIRECT'>('PLATFORM');
    const [activeTab, setActiveTab] = useState<'CURRENT' | 'HISTORY'>('CURRENT');
    const [orderHistory, setOrderHistory] = useState<any[]>([]);
    const [loadingHistory, setLoadingHistory] = useState(false);
    const [selectedOrder, setSelectedOrder] = useState<any | null>(null);
    
    // Shipping Form
    const [shipping, setShipping] = useState({
        fullName: '',
        address: '',
        city: '',
        zipCode: '',
        country: '',
        phoneNumber: ''
    });

    // Sincronizar saldo y datos de envío al entrar al carrito
    useEffect(() => {
        refreshUser();
    }, []);

    useEffect(() => {
        if (user?.shippingDetails) {
            setShipping(prev => ({
                ...prev,
                ...user.shippingDetails
            }));
        }
    }, [user]);

    useEffect(() => {
        if (user && activeTab === 'HISTORY') {
            fetchHistory();
            const interval = setInterval(fetchHistory, 10000); // Poll every 10 seconds
            return () => clearInterval(interval);
        }
    }, [user, activeTab]);

    const fetchHistory = async () => {
        if (!user) return;
        // Only show loader on initial fetch
        if (orderHistory.length === 0) setLoadingHistory(true);
        try {
            const history = await db.getBuyerOrders(user.id);
            setOrderHistory(history);
        } catch (error) {
            console.error("Error fetching history:", error);
        } finally {
            setLoadingHistory(false);
        }
    };

    // Advanced Calculations
    const totals = useMemo(() => {
        return cart.reduce((acc: { subtotal: number, total: number, itemCount: number }, item: CartItem) => {
            const qty = Number(item.quantity);
            const price = Number(item.price);
            // Fallback to price if originalPrice is missing or 0
            const originalPrice = (Number(item.originalPrice) > 0) ? Number(item.originalPrice) : price;
            
            acc.subtotal += originalPrice * qty;
            acc.total += price * qty;
            acc.itemCount += qty;
            return acc;
        }, { subtotal: 0, total: 0, itemCount: 0 });
    }, [cart]);

    const savings = totals.subtotal - totals.total;
    const savingsPercent = totals.subtotal > 0 ? Math.round((savings / totals.subtotal) * 100) : 0;

    const handleCheckout = async () => {
        if (!user) return;
        if (cart.length === 0) return;
        
        // Re-verificación de saldo antes de procesar (solo si es PLATFORM)
        if (paymentMethod === 'PLATFORM' && Number(user.balance) < totals.total) {
            toast.error("Tu saldo ha cambiado. Fondos insuficientes.");
            refreshUser();
            return;
        }

        if (!shipping.address || !shipping.fullName || !shipping.phoneNumber) {
             toast.error("Por favor completa los datos de envío obligatorios");
             document.getElementById('shipping-form')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
             return;
        }

        setLoading(true);
        try {
            await db.checkoutCart(user.id, cart, shipping, paymentMethod);
            clearCart();
            refreshUser();
            if (paymentMethod === 'DIRECT') {
                toast.success("¡Solicitud de compra directa enviada! El vendedor la procesará en persona.");
            } else {
                toast.success("¡Pedido realizado con éxito!");
            }
            navigate('/profile');
        } catch (e: any) {
            toast.error("Error: " + e.message);
        } finally {
            setLoading(false);
        }
    };

    if (cart.length === 0) {
        return (
            <div className="min-h-[60vh] flex flex-col items-center justify-center text-slate-500 animate-in fade-in">
                <div className="w-24 h-24 bg-slate-900 rounded-full flex items-center justify-center mb-6 border border-slate-800">
                    <ShoppingBag size={48} className="opacity-50"/>
                </div>
                <h2 className="text-2xl font-bold text-white mb-2">Tu carrito está vacío</h2>
                <p className="text-slate-400 mb-6">Parece que no has añadido nada aún.</p>
                <button onClick={() => navigate('/marketplace')} className="bg-indigo-600 hover:bg-indigo-500 text-white px-8 py-3 rounded-full font-bold transition-all shadow-lg active:scale-95">
                    Ir a la Tienda
                </button>
            </div>
        );
    }

    return (
        <div className="max-w-6xl mx-auto px-1.5 md:px-4 pt-4 md:pt-6 pb-12 animate-in fade-in">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 px-1.5">
                <h1 className="text-xl md:text-2xl font-bold text-white flex items-center gap-2">
                    <ShoppingBag className="text-indigo-400"/> Mi Carrito 
                </h1>
                
                <div className="flex bg-slate-900/50 p-1 rounded-xl border border-white/5 self-start">
                    <button 
                        onClick={() => setActiveTab('CURRENT')}
                        className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${activeTab === 'CURRENT' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                    >
                        <ShoppingBag size={14} /> Actual ({totals.itemCount})
                    </button>
                    <button 
                        onClick={() => setActiveTab('HISTORY')}
                        className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${activeTab === 'HISTORY' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                    >
                        <History size={14} /> Historial
                    </button>
                </div>
            </div>
            
            {activeTab === 'CURRENT' ? (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-8">
                    {/* Left Column: Items */}
                    <div className="lg:col-span-2 space-y-4">
                        <div className="bg-slate-900/50 rounded-2xl border border-slate-800 overflow-hidden">
                            {cart.map((item: CartItem, index: number) => {
                                const priceNum = Number(item.price);
                                const originalPriceNum = Number(item.originalPrice);
                                const original = originalPriceNum > 0 ? originalPriceNum : priceNum;
                                const hasDiscount = original > priceNum;
                                const discountPerc = Number(item.discountPercent);

                                return (
                                    <div key={item.id} className={`flex gap-2 md:gap-4 p-2 md:p-4 ${index !== cart.length - 1 ? 'border-b border-slate-800' : ''}`}>
                                        {/* Image (Smaller on mobile) */}
                                        <div className="w-20 h-20 md:w-24 md:h-28 bg-black rounded-lg md:rounded-xl overflow-hidden shrink-0 border border-slate-800 relative group">
                                            {item.images && item.images[0] && <img src={item.images[0]} className="w-full h-full object-cover transition-transform group-hover:scale-105" referrerPolicy="no-referrer" />}
                                            {hasDiscount && discountPerc > 0 && (
                                                <div className="absolute top-0 left-0 bg-red-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-br shadow-sm">
                                                    -{discountPerc}%
                                                </div>
                                            )}
                                        </div>

                                        {/* Details */}
                                        <div className="flex-1 min-w-0 flex flex-col justify-between py-0">
                                            <div className="flex justify-between items-start gap-1 md:gap-4">
                                                <div>
                                                    <h4 className="font-bold text-white text-xs md:text-base leading-tight line-clamp-2">{item.title}</h4>
                                                    <p className="text-[9px] md:text-xs text-slate-400 mt-1 flex items-center gap-1">
                                                        <span className="bg-slate-800 px-1.5 py-0.5 rounded uppercase">{item.condition}</span>
                                                    </p>
                                                    {hasDiscount && (
                                                        <p className="text-[9px] text-emerald-400 font-bold mt-1 flex items-center gap-1">
                                                            <Tag size={10}/> Ahorras {(original - priceNum).toFixed(2)} $
                                                        </p>
                                                    )}
                                                </div>
                                                <button onClick={() => removeFromCart(item.id)} className="text-slate-500 hover:text-red-400 p-1 transition-colors bg-slate-800/50 rounded-full shrink-0">
                                                    <Trash2 size={14}/>
                                                </button>
                                            </div>

                                            <div className="flex justify-between items-end mt-1 md:mt-4">
                                                <div>
                                                    {hasDiscount && (
                                                        <div className="text-[9px] md:text-xs text-slate-500 line-through mb-0.5">{original.toFixed(2)} $</div>
                                                    )}
                                                    <div className={`font-mono font-bold text-base md:text-xl ${hasDiscount ? 'text-red-400' : 'text-amber-400'}`}>
                                                        {priceNum.toFixed(2)} $
                                                    </div>
                                                    {hasDiscount && Number(item.quantity) > 1 && (
                                                        <div className="text-[8px] font-bold text-emerald-500/80 bg-emerald-500/5 px-1.5 py-0.5 rounded mt-1 border border-emerald-500/10 inline-block">
                                                            Ahorro: {((original - priceNum) * Number(item.quantity)).toFixed(2)} $
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Quantity Controls (Optimized for touch) */}
                                                <div className="flex items-center gap-1 md:gap-3 bg-slate-800 rounded-lg p-0.5 border border-slate-700">
                                                    <button onClick={() => updateQuantity(item.id, -1)} className="w-7 h-7 md:w-7 md:h-7 flex items-center justify-center hover:bg-slate-700 rounded text-slate-300 transition-colors active:bg-slate-600"><Minus size={12}/></button>
                                                    <span className="text-xs font-bold text-white w-6 md:w-4 text-center">{item.quantity}</span>
                                                    <button onClick={() => updateQuantity(item.id, 1)} className="w-7 h-7 md:w-7 md:h-7 flex items-center justify-center hover:bg-slate-700 rounded text-slate-300 transition-colors active:bg-slate-600"><Plus size={12}/></button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Right Column: Checkout Panel */}
                    <div className="space-y-4 md:space-y-6">
                        
                        {/* Payment Method Selector */}
                        <div className="bg-slate-900 p-4 md:p-6 rounded-2xl border border-slate-800">
                            <h3 className="font-bold text-white mb-4 flex items-center gap-2 text-sm uppercase tracking-wide text-slate-500"><Wallet size={16}/> Método de Pago</h3>
                            <div className="grid grid-cols-1 gap-3">
                                <button 
                                    onClick={() => setPaymentMethod('PLATFORM')}
                                    className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${paymentMethod === 'PLATFORM' ? 'bg-indigo-600/20 border-indigo-500 text-white' : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'}`}
                                >
                                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${paymentMethod === 'PLATFORM' ? 'border-white' : 'border-slate-700'}`}>
                                        {paymentMethod === 'PLATFORM' && <div className="w-2.5 h-2.5 bg-white rounded-full"/>}
                                    </div>
                                    <div className="text-left">
                                        <div className="text-sm font-bold">Saldo de la Plataforma</div>
                                        <div className="text-[10px] opacity-70">Pago instantáneo y seguro</div>
                                    </div>
                                </button>
                                <button 
                                    onClick={() => setPaymentMethod('DIRECT')}
                                    className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${paymentMethod === 'DIRECT' ? 'bg-amber-600/20 border-amber-500 text-white' : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'}`}
                                >
                                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${paymentMethod === 'DIRECT' ? 'border-white' : 'border-slate-700'}`}>
                                        {paymentMethod === 'DIRECT' && <div className="w-2.5 h-2.5 bg-white rounded-full"/>}
                                    </div>
                                    <div className="text-left">
                                        <div className="text-sm font-bold">Pago Directo en Persona</div>
                                        <div className="text-[10px] opacity-70">Sincronización en tiempo real con el vendedor</div>
                                    </div>
                                </button>
                            </div>
                        </div>

                        {/* Shipping Form - High priority, so placing it visibly */}
                        <div id="shipping-form" className="bg-slate-900 p-4 md:p-6 rounded-2xl border border-slate-800 scroll-mt-24">
                            <h3 className="font-bold text-white mb-4 flex items-center gap-2 text-sm uppercase tracking-wide text-slate-500"><Truck size={16}/> Datos de Envío</h3>
                            <div className="space-y-3">
                                <input type="text" placeholder="Nombre Completo *" value={shipping.fullName} onChange={e => setShipping({...shipping, fullName: e.target.value})} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-3 md:py-2.5 text-white text-sm focus:border-indigo-500 outline-none transition-colors" />
                                <div className="relative">
                                    <MapPin size={16} className="absolute left-3 top-3 text-slate-500 pointer-events-none"/>
                                    <input type="text" placeholder="Dirección *" value={shipping.address} onChange={e => setShipping({...shipping, address: e.target.value})} className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-9 pr-3 py-3 md:py-2.5 text-white text-sm focus:border-indigo-500 outline-none transition-colors" />
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <input type="text" placeholder="Ciudad" value={shipping.city} onChange={e => setShipping({...shipping, city: e.target.value})} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-3 md:py-2.5 text-white text-sm focus:border-indigo-500 outline-none transition-colors" />
                                    <input type="text" placeholder="C.P." value={shipping.zipCode} onChange={e => setShipping({...shipping, zipCode: e.target.value})} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-3 md:py-2.5 text-white text-sm focus:border-indigo-500 outline-none transition-colors" />
                                </div>
                                <input type="tel" placeholder="Teléfono *" value={shipping.phoneNumber} onChange={e => setShipping({...shipping, phoneNumber: e.target.value})} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-3 md:py-2.5 text-white text-sm focus:border-indigo-500 outline-none transition-colors" />
                            </div>
                        </div>

                        {/* Order Summary (Desktop) */}
                        <div className="bg-slate-900 p-4 md:p-6 rounded-2xl border border-slate-800 shadow-xl">
                            <h3 className="font-bold text-white mb-4 text-base md:text-lg">Resumen del Pedido</h3>
                            
                            <div className="space-y-3 mb-6">
                                <div className="flex justify-between text-slate-400 text-xs md:text-sm">
                                    <span>Subtotal</span>
                                    <span>{totals.subtotal.toFixed(2)} $</span>
                                </div>
                                
                                {savings > 0 && (
                                    <div className="flex flex-col gap-2 bg-emerald-900/10 p-3 rounded-xl border border-emerald-500/20">
                                        <div className="flex justify-between text-emerald-400 text-xs md:text-sm font-bold">
                                            <span className="flex items-center gap-1"><Tag size={14}/> Descuento Aplicado</span>
                                            <span>-{savings.toFixed(2)} $</span>
                                        </div>
                                        <div className="text-[9px] md:text-[10px] text-emerald-500/70 font-medium text-center uppercase tracking-wider">
                                            ¡Estás ahorrando un {savingsPercent}% en esta compra!
                                        </div>
                                    </div>
                                )}

                                <div className="border-t border-slate-800 my-4"></div>

                                <div className="flex justify-between items-end">
                                    <span className="text-white font-bold text-sm md:text-base">Total a Pagar</span>
                                    <span className="text-2xl md:text-3xl font-black text-amber-400 tracking-tight">{totals.total.toFixed(2)} <span className="text-sm text-amber-600">$</span></span>
                                </div>
                            </div>

                            {user && paymentMethod === 'PLATFORM' && Number(user.balance) < totals.total ? (
                                <div className="bg-red-900/20 border border-red-500/30 p-4 rounded-xl text-center space-y-2 mb-4">
                                    <div className="text-red-400 font-bold flex items-center justify-center gap-2"><AlertCircle size={18}/> Saldo Insuficiente</div>
                                    <div className="text-slate-400 text-xs">Tienes <strong>{Number(user.balance).toFixed(2)} $</strong> disponibles.</div>
                                    <button onClick={() => navigate('/profile')} className="text-xs text-indigo-400 hover:text-white underline mt-1">Recargar Saldo</button>
                                </div>
                            ) : paymentMethod === 'PLATFORM' ? (
                                <div className="bg-slate-950 rounded-xl p-3 border border-slate-800 mb-4 flex items-center justify-between">
                                    <div className="text-xs text-slate-400">Saldo Disponible</div>
                                    <div className="text-sm font-bold text-white flex items-center gap-1"><Wallet size={14} className="text-indigo-400"/> {Number(user?.balance || 0).toFixed(2)} $</div>
                                </div>
                            ) : (
                                <div className="bg-amber-900/10 border border-amber-500/20 p-4 rounded-xl text-center space-y-2 mb-4">
                                    <div className="text-amber-400 font-bold flex items-center justify-center gap-2"><CheckCircle size={18}/> Pago en Persona</div>
                                    <div className="text-slate-400 text-[10px]">Pagarás directamente al vendedor al recibir los productos.</div>
                                </div>
                            )}

                            <button 
                                onClick={handleCheckout}
                                disabled={loading || (paymentMethod === 'PLATFORM' && user ? Number(user.balance) < totals.total : false)}
                                className={`w-full ${paymentMethod === 'DIRECT' ? 'bg-amber-600 hover:bg-amber-500 shadow-amber-900/20' : 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-900/20'} disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 md:py-4 rounded-xl flex items-center justify-center gap-2 transition-transform active:scale-95 shadow-lg`}
                            >
                                {loading ? <Loader2 className="animate-spin"/> : <CheckCircle size={20}/>}
                                {paymentMethod === 'DIRECT' ? 'Solicitar Compra Directa' : 'Confirmar Compra'}
                            </button>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="space-y-4">
                    {loadingHistory ? (
                        <div className="flex items-center justify-center py-20">
                            <Loader2 className="animate-spin text-indigo-500" size={32} />
                        </div>
                    ) : orderHistory.length === 0 ? (
                        <div className="bg-slate-900/50 border border-white/5 rounded-[32px] p-20 text-center flex flex-col items-center gap-4">
                            <div className="w-20 h-20 rounded-full bg-slate-800 flex items-center justify-center text-slate-600">
                                <History size={40} />
                            </div>
                            <div>
                                <h3 className="text-xl font-black text-white uppercase italic tracking-tighter">Sin historial</h3>
                                <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-2">Aún no has realizado compras en el marketplace.</p>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-8">
                            {/* Pending Section */}
                            {orderHistory.some(o => o.status === 'PENDING') && (
                                <div className="space-y-4">
                                    <h3 className="text-sm font-black text-amber-500 uppercase tracking-widest flex items-center gap-2 px-2">
                                        <Clock size={16} /> Compras en Proceso
                                    </h3>
                                    {orderHistory.filter(o => o.status === 'PENDING').map((order: any) => (
                                        <div 
                                            key={order.id} 
                                            onClick={() => setSelectedOrder(order)}
                                            className="bg-slate-900/50 border border-amber-500/20 rounded-[32px] overflow-hidden cursor-pointer hover:border-amber-500/40 transition-all group"
                                        >
                                            <div className="p-4 bg-amber-500/5 border-b border-white/5 flex justify-between items-center">
                                                <div className="flex items-center gap-2">
                                                    <Package size={14} className="text-amber-500" />
                                                    <span className="text-[10px] font-black uppercase tracking-widest text-amber-200">Pedido #{order.id.slice(-6)}</span>
                                                    <span className="text-[8px] font-black px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                                                        ESPERANDO VENDEDOR
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[10px] text-slate-500 font-bold uppercase">{new Date(order.createdAt * 1000).toLocaleDateString()}</span>
                                                    <ChevronRight size={14} className="text-slate-700 group-hover:text-amber-400 transition-colors" />
                                                </div>
                                            </div>
                                            <div className="p-6 flex items-center justify-between">
                                                <div className="flex gap-3 overflow-x-auto scrollbar-hide">
                                                    {order.items.map((item: any) => (
                                                        <div key={item.id} className="w-12 h-12 rounded-xl overflow-hidden bg-slate-800 border border-white/5 shrink-0">
                                                            <img src={item.thumbnail} alt={item.title} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                                        </div>
                                                    ))}
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-[10px] text-slate-500 font-bold uppercase">Total</p>
                                                    <p className="text-xl font-black text-white tracking-tighter">${Number(order.totalAmount).toFixed(2)}</p>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Completed Section */}
                            <div className="space-y-4">
                                <h3 className="text-sm font-black text-slate-500 uppercase tracking-widest flex items-center gap-2 px-2">
                                    <History size={16} /> Historial de Compras
                                </h3>
                                {orderHistory.filter(o => o.status !== 'PENDING').map((order: any) => (
                                    <div 
                                        key={order.id} 
                                        onClick={() => setSelectedOrder(order)}
                                        className="bg-slate-900/50 border border-white/5 rounded-[32px] overflow-hidden cursor-pointer hover:border-indigo-500/30 transition-all group"
                                    >
                                        <div className="p-4 bg-slate-950/50 border-b border-white/5 flex justify-between items-center">
                                            <div className="flex items-center gap-2">
                                                <Package size={14} className="text-indigo-400" />
                                                <span className="text-[10px] font-black uppercase tracking-widest text-slate-300">Pedido #{order.id.slice(-6)}</span>
                                                <span className={`text-[8px] font-black px-2 py-0.5 rounded-full border ${
                                                    order.status === 'PAID' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                                                    'bg-red-500/10 text-red-400 border-red-500/20'
                                                }`}>
                                                    {order.status === 'PAID' ? 'COMPLETADO' : 'RECHAZADO'}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-[10px] text-slate-500 font-bold uppercase">{new Date(order.createdAt * 1000).toLocaleDateString()}</span>
                                                <ChevronRight size={14} className="text-slate-700 group-hover:text-indigo-400 transition-colors" />
                                            </div>
                                        </div>
                                        <div className="p-6 flex items-center justify-between">
                                            <div className="flex gap-3 overflow-x-auto scrollbar-hide">
                                                {order.items.map((item: any) => (
                                                    <div key={item.id} className="w-12 h-12 rounded-xl overflow-hidden bg-slate-800 border border-white/5 shrink-0">
                                                        <img src={item.thumbnail} alt={item.title} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                                    </div>
                                                ))}
                                            </div>
                                            <div className="text-right">
                                                <p className="text-[10px] text-slate-500 font-bold uppercase">Total</p>
                                                <p className="text-xl font-black text-white tracking-tighter">${Number(order.totalAmount).toFixed(2)}</p>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Order Details Modal */}
            <AnimatePresence>
                {selectedOrder && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/90 backdrop-blur-xl">
                        <motion.div 
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 20 }}
                            className="bg-slate-900 border border-white/10 rounded-[40px] w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl"
                        >
                            <div className="p-6 border-b border-white/5 flex justify-between items-center bg-slate-950/50">
                                <div>
                                    <h3 className="text-xl font-black text-white uppercase italic tracking-tighter">Detalles de la Compra</h3>
                                    <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">ID: {selectedOrder.id}</p>
                                </div>
                                <button onClick={() => setSelectedOrder(null)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                                    <XCircle size={24} />
                                </button>
                            </div>

                            <div className="flex-1 overflow-y-auto p-8 space-y-8">
                                <div className="flex justify-center">
                                    <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-[0.2em] border ${
                                        selectedOrder.status === 'PAID' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                                        selectedOrder.status === 'REJECTED' ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                                        'bg-amber-500/10 text-amber-400 border-amber-500/20'
                                    }`}>
                                        {selectedOrder.status === 'PAID' ? 'Completado' : 
                                         selectedOrder.status === 'REJECTED' ? 'Rechazado' : 'Pendiente'}
                                    </span>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="bg-slate-950/50 p-6 rounded-3xl border border-white/5 space-y-4">
                                        <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                                            <ShoppingBag size={14} /> Vendedor
                                        </h4>
                                        <div className="flex items-center gap-4">
                                            <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 flex items-center justify-center text-indigo-400">
                                                <ShoppingBag size={24} />
                                            </div>
                                            <div>
                                                <p className="text-sm font-black text-white">@{selectedOrder.sellerName}</p>
                                                <p className="text-[10px] text-slate-500 font-bold uppercase">Tienda StreamPay</p>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="bg-slate-950/50 p-6 rounded-3xl border border-white/5 space-y-4">
                                        <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                                            <Clock size={14} /> Fecha del Pedido
                                        </h4>
                                        <div className="flex items-center gap-4">
                                            <div className="w-12 h-12 rounded-2xl bg-slate-800 flex items-center justify-center text-slate-400">
                                                <Clock size={24} />
                                            </div>
                                            <div>
                                                <p className="text-sm font-black text-white">{new Date(selectedOrder.createdAt * 1000).toLocaleDateString()}</p>
                                                <p className="text-[10px] text-slate-500 font-bold uppercase">{new Date(selectedOrder.createdAt * 1000).toLocaleTimeString()}</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Artículos</h4>
                                    <div className="space-y-3">
                                        {selectedOrder.items.map((item: any) => (
                                            <div key={item.id} className="flex items-center gap-4 p-4 bg-slate-950/50 rounded-3xl border border-white/5">
                                                <div className="w-20 h-20 rounded-2xl overflow-hidden bg-slate-800 shrink-0 border border-white/5">
                                                    <img src={item.thumbnail} alt={item.title} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <h5 className="text-sm font-black text-white uppercase tracking-tight">{item.title}</h5>
                                                    <p className="text-[10px] text-slate-500 font-bold uppercase mt-1">Cantidad: {item.quantity}</p>
                                                    <p className="text-xs font-black text-indigo-400 mt-2">${Number(item.price).toFixed(2)} c/u</p>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-sm font-black text-white">${(Number(item.price) * Number(item.quantity)).toFixed(2)}</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {selectedOrder.status === 'REJECTED' && selectedOrder.rejectionReason && (
                                    <div className="bg-red-500/10 border border-red-500/20 p-6 rounded-3xl space-y-2">
                                        <h4 className="text-[10px] font-black text-red-400 uppercase tracking-widest flex items-center gap-2">
                                            <AlertCircle size={14} /> Motivo del Rechazo
                                        </h4>
                                        <p className="text-xs text-red-300/80 font-bold italic">"{selectedOrder.rejectionReason}"</p>
                                    </div>
                                )}

                                <div className="bg-indigo-600/10 border border-indigo-500/20 p-6 rounded-3xl space-y-4">
                                    <div className="flex justify-between items-center">
                                        <div>
                                            <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">Total del Pedido</p>
                                            <p className="text-xs text-indigo-400 font-bold uppercase">{selectedOrder.paymentMethod === 'PLATFORM' ? 'Saldo Plataforma' : 'Pago Directo'}</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-3xl font-black text-white tracking-tighter">${Number(selectedOrder.totalAmount).toFixed(2)}</p>
                                        </div>
                                    </div>

                                    {selectedOrder.status === 'PAID' && selectedOrder.paymentMethod === 'DIRECT' && selectedOrder.paidAmount > 0 && (
                                        <div className="pt-4 border-t border-white/5 grid grid-cols-2 gap-4">
                                            <div>
                                                <p className="text-[9px] text-slate-500 font-bold uppercase">Entregado</p>
                                                <p className="text-sm font-black text-emerald-400">${Number(selectedOrder.paidAmount).toFixed(2)}</p>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-[9px] text-slate-500 font-bold uppercase">Cambio</p>
                                                <p className="text-sm font-black text-amber-400">${Number(selectedOrder.changeAmount).toFixed(2)}</p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="p-6 bg-slate-950/50 border-t border-white/5">
                                <button 
                                    onClick={() => setSelectedOrder(null)}
                                    className="w-full py-4 bg-slate-800 hover:bg-slate-700 text-white font-black rounded-2xl text-[10px] uppercase tracking-widest transition-all"
                                >
                                    Cerrar
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}
