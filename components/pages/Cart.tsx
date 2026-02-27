import React, { useState, useMemo, useEffect } from 'react';
import { useCart } from '../../context/CartContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { db } from '../../services/db';
import { useNavigate } from '../Router';
import { Trash2, ShoppingBag, Truck, CheckCircle, AlertCircle, Loader2, Minus, Plus, Tag, ArrowRight, Wallet, MapPin } from 'lucide-react';
import { CartItem } from '../../types';

export default function Cart() {
    const { cart, removeFromCart, updateQuantity, clearCart } = useCart();
    const { user, refreshUser } = useAuth();
    const navigate = useNavigate();
    const toast = useToast();
    const [loading, setLoading] = useState(false);
    
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

    // Advanced Calculations
    const totals = useMemo(() => {
        return cart.reduce((acc: { subtotal: number, total: number, itemCount: number }, item: CartItem) => {
            const qty = item.quantity;
            const price = Number(item.price);
            // Fallback to price if originalPrice is missing or 0
            const originalPrice = (item.originalPrice && item.originalPrice > 0) ? Number(item.originalPrice) : price;
            
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
        
        // Re-verificación de saldo antes de procesar
        if (Number(user.balance) < totals.total) {
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
            await db.checkoutCart(user.id, cart, shipping);
            clearCart();
            refreshUser();
            toast.success("¡Pedido realizado con éxito!");
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
        <div className="max-w-6xl mx-auto px-3 md:px-4 pt-4 md:pt-6 pb-12 animate-in fade-in">
            <h1 className="text-xl md:text-2xl font-bold text-white mb-4 md:mb-6 flex items-center gap-2">
                <ShoppingBag className="text-indigo-400"/> Tu Carrito 
                <span className="text-sm font-normal text-slate-500 ml-2">({totals.itemCount} artículos)</span>
            </h1>
            
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8">
                {/* Left Column: Items */}
                <div className="lg:col-span-2 space-y-4">
                    <div className="bg-slate-900/50 rounded-2xl border border-slate-800 overflow-hidden">
                        {cart.map((item: CartItem, index: number) => {
                            const original = (item.originalPrice && item.originalPrice > 0) ? item.originalPrice : item.price;
                            const hasDiscount = original > item.price;

                            return (
                                <div key={item.id} className={`flex gap-3 md:gap-4 p-3 md:p-4 ${index !== cart.length - 1 ? 'border-b border-slate-800' : ''}`}>
                                    {/* Image (Smaller on mobile) */}
                                    <div className="w-20 h-20 md:w-24 md:h-28 bg-black rounded-lg md:rounded-xl overflow-hidden shrink-0 border border-slate-800 relative group">
                                        {item.images && item.images[0] && <img src={item.images[0]} className="w-full h-full object-cover transition-transform group-hover:scale-105"/>}
                                        {hasDiscount && (
                                            <div className="absolute top-0 left-0 bg-red-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-br shadow-sm">
                                                -{item.discountPercent}%
                                            </div>
                                        )}
                                    </div>

                                    {/* Details */}
                                    <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5 md:py-1">
                                        <div className="flex justify-between items-start gap-2 md:gap-4">
                                            <div>
                                                <h4 className="font-bold text-white text-sm md:text-base leading-tight line-clamp-2">{item.title}</h4>
                                                <p className="text-[10px] md:text-xs text-slate-400 mt-1 flex items-center gap-1">
                                                    <span className="bg-slate-800 px-1.5 py-0.5 rounded uppercase">{item.condition}</span>
                                                </p>
                                            </div>
                                            <button onClick={() => removeFromCart(item.id)} className="text-slate-500 hover:text-red-400 p-1.5 transition-colors bg-slate-800/50 rounded-full shrink-0">
                                                <Trash2 size={16}/>
                                            </button>
                                        </div>

                                        <div className="flex justify-between items-end mt-2 md:mt-4">
                                            <div>
                                                {hasDiscount && (
                                                    <div className="text-[10px] md:text-xs text-slate-500 line-through mb-0.5">{original} $</div>
                                                )}
                                                <div className={`font-mono font-bold text-lg md:text-xl ${hasDiscount ? 'text-red-400' : 'text-amber-400'}`}>
                                                    {item.price} $
                                                </div>
                                            </div>

                                            {/* Quantity Controls (Optimized for touch) */}
                                            <div className="flex items-center gap-1 md:gap-3 bg-slate-800 rounded-lg p-0.5 md:p-1 border border-slate-700">
                                                <button onClick={() => updateQuantity(item.id, -1)} className="w-8 h-8 md:w-7 md:h-7 flex items-center justify-center hover:bg-slate-700 rounded text-slate-300 transition-colors active:bg-slate-600"><Minus size={14}/></button>
                                                <span className="text-sm font-bold text-white w-6 md:w-4 text-center">{item.quantity}</span>
                                                <button onClick={() => updateQuantity(item.id, 1)} className="w-8 h-8 md:w-7 md:h-7 flex items-center justify-center hover:bg-slate-700 rounded text-slate-300 transition-colors active:bg-slate-600"><Plus size={14}/></button>
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
                    <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-xl">
                        <h3 className="font-bold text-white mb-4 text-lg">Resumen del Pedido</h3>
                        
                        <div className="space-y-3 mb-6">
                            <div className="flex justify-between text-slate-400 text-sm">
                                <span>Subtotal</span>
                                <span>{totals.subtotal.toFixed(2)} $</span>
                            </div>
                            
                            {savings > 0 && (
                                <div className="flex justify-between text-emerald-400 text-sm font-medium bg-emerald-900/10 p-2 rounded-lg border border-emerald-500/20">
                                    <span className="flex items-center gap-1"><Tag size={14}/> Descuento ({savingsPercent}%)</span>
                                    <span>-{savings.toFixed(2)} $</span>
                                </div>
                            )}

                            <div className="border-t border-slate-800 my-4"></div>

                            <div className="flex justify-between items-end">
                                <span className="text-white font-bold">Total a Pagar</span>
                                <span className="text-3xl font-black text-amber-400 tracking-tight">{totals.total.toFixed(2)} <span className="text-sm text-amber-600">$</span></span>
                            </div>
                        </div>

                        {user && Number(user.balance) < totals.total ? (
                            <div className="bg-red-900/20 border border-red-500/30 p-4 rounded-xl text-center space-y-2 mb-4">
                                <div className="text-red-400 font-bold flex items-center justify-center gap-2"><AlertCircle size={18}/> Saldo Insuficiente</div>
                                <div className="text-slate-400 text-xs">Tienes <strong>{Number(user.balance).toFixed(2)} $</strong> disponibles.</div>
                                <button onClick={() => navigate('/profile')} className="text-xs text-indigo-400 hover:text-white underline mt-1">Recargar Saldo</button>
                            </div>
                        ) : (
                            <div className="bg-slate-950 rounded-xl p-3 border border-slate-800 mb-4 flex items-center justify-between">
                                <div className="text-xs text-slate-400">Saldo Disponible</div>
                                <div className="text-sm font-bold text-white flex items-center gap-1"><Wallet size={14} className="text-indigo-400"/> {Number(user?.balance || 0).toFixed(2)} $</div>
                            </div>
                        )}

                        <button 
                            onClick={handleCheckout}
                            disabled={loading || (user ? Number(user.balance) < totals.total : true)}
                            className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2 transition-transform active:scale-95 shadow-lg shadow-emerald-900/20"
                        >
                            {loading ? <Loader2 className="animate-spin"/> : <CheckCircle size={20}/>}
                            Confirmar Compra
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}