
import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from '../Router';
import { db } from '../../services/db';
import { MarketplaceItem, MarketplaceReview, CartItem } from '../../types';
import { useCart } from '../../context/CartContext';
import { useAuth } from '../../context/AuthContext';
// Added Loader2 and MessageSquare to imports to fix missing name errors
import { ShoppingBag, ChevronLeft, User, Tag, ShieldCheck, ShoppingCart, Star, Edit3, Send, AlertTriangle, Check, ShieldAlert, Fingerprint, Loader2, MessageSquare } from 'lucide-react';
import { useToast } from '../../context/ToastContext';

export default function MarketplaceItemView() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();
    const { addToCart, cart } = useCart();
    const toast = useToast();
    
    const [item, setItem] = useState<MarketplaceItem | null>(null);
    const [reviews, setReviews] = useState<MarketplaceReview[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeImg, setActiveImg] = useState(0);

    // Review Form
    const [rating, setRating] = useState(5);
    const [comment, setComment] = useState('');
    const [submittingReview, setSubmittingReview] = useState(false);

    useEffect(() => {
        if(id) {
            db.getMarketplaceItem(id).then((data: MarketplaceItem | null) => {
                if (data) setItem(data);
                setLoading(false);
            });
            db.getReviews(id).then(setReviews);
        }
    }, [id]);

    const handleAddReview = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || !id || !comment.trim()) return;
        setSubmittingReview(true);
        try {
            await db.addReview(id, user.id, rating, comment);
            const newReviews = await db.getReviews(id);
            setReviews(newReviews);
            setComment('');
        } catch(e) { alert("Error al enviar reseña"); }
        finally { setSubmittingReview(false); }
    };

    const handleAddToCart = () => {
        if (!item) return;
        if (!isVerified) {
            const confirmRisk = window.confirm("Atención: Este vendedor no ha validado su identidad real con la administración de StreamPay. ¿Deseas proceder con la compra bajo tu propio riesgo?");
            if (!confirmRisk) return;
        }
        addToCart(item);
        toast.success("Añadido al carrito");
    };

    if (loading) return <div className="text-center p-10 text-slate-500">Cargando...</div>;
    if (!item) return <div className="text-center p-10 text-slate-500">Artículo no encontrado</div>;

    const isInCart = cart.some((c: CartItem) => c.id === item.id);
    const isSeller = user?.id === item.sellerId;
    const isVerified = Number(item.isVerifiedSeller) === 1;

    return (
        <div className="pb-20 max-w-5xl mx-auto md:pt-6 animate-in fade-in">
            <button onClick={() => navigate('/marketplace')} className="flex items-center gap-1 text-slate-400 hover:text-white px-4 py-2 mb-2 bg-slate-900/50 rounded-full border border-white/5 ml-4 text-xs font-bold transition-all">
                <ChevronLeft size={16}/> Volver al Catálogo
            </button>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 px-4">
                {/* Gallery */}
                <div className="space-y-4">
                    <div className="aspect-[3/4] bg-slate-950 rounded-[32px] overflow-hidden border border-slate-800 relative shadow-2xl">
                        {item.images && item.images.length > 0 ? (
                            <img src={item.images[activeImg]} className={`w-full h-full object-cover ${item.status === 'AGOTADO' ? 'grayscale opacity-50' : ''}`} />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center text-slate-800"><ShoppingBag size={80}/></div>
                        )}
                        
                        {item.discountPercent && item.discountPercent > 0 && item.status !== 'AGOTADO' && (
                            <div className="absolute top-6 left-6 bg-red-600 text-white font-black px-4 py-1.5 text-lg rounded-xl shadow-2xl transform -rotate-2 z-10">
                                -{item.discountPercent}%
                            </div>
                        )}

                        {item.status === 'AGOTADO' && (
                            <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm z-20">
                                <span className="bg-white text-black px-8 py-3 font-black text-2xl border-4 border-black transform -rotate-12 shadow-2xl">AGOTADO</span>
                            </div>
                        )}
                    </div>
                    {item.images && item.images.length > 1 && (
                        <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
                            {item.images.map((img: string, i: number) => (
                                <button key={i} onClick={() => setActiveImg(i)} className={`w-20 h-20 rounded-2xl overflow-hidden border-2 shrink-0 transition-all ${activeImg === i ? 'border-indigo-500 scale-105 shadow-lg' : 'border-slate-800 opacity-60 hover:opacity-100'}`}>
                                    <img src={img} className="w-full h-full object-cover" />
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Info */}
                <div className="space-y-6">
                    <div className="bg-slate-900 p-8 rounded-[40px] border border-slate-800 shadow-2xl relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none group-hover:scale-110 transition-transform duration-700"><Tag size={120}/></div>
                        
                        <div className="relative z-10">
                            <div className="flex justify-between items-start mb-4">
                                <h1 className="text-3xl font-black text-white leading-tight uppercase italic tracking-tighter">{item.title}</h1>
                                {isSeller && (
                                    <button onClick={() => navigate(`/marketplace/edit/${item.id}`)} className="bg-indigo-600 hover:bg-indigo-500 text-white flex items-center gap-2 text-[10px] font-black px-4 py-2 rounded-xl transition-all shadow-lg active:scale-95">
                                        <Edit3 size={14}/> EDITAR
                                    </button>
                                )}
                            </div>
                            
                            <div className="flex items-center gap-3 mb-8">
                                <div className="flex text-amber-500">
                                    {[1,2,3,4,5].map(s => <Star key={s} size={16} fill={s <= (item.rating || 0) ? "currentColor" : "none"} className={s <= (item.rating || 0) ? "" : "text-slate-700"} />)}
                                </div>
                                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">{reviews.length} valoraciones</span>
                            </div>

                            <div className="mb-10">
                                {item.discountPercent && item.discountPercent > 0 ? (
                                    <div className="flex items-baseline gap-3">
                                        <span className="text-slate-600 line-through text-xl font-bold">{item.originalPrice} $</span>
                                        <span className="text-5xl font-black text-red-500 tracking-tighter">{item.price} <span className="text-2xl">$</span></span>
                                    </div>
                                ) : (
                                    <span className="text-5xl font-black text-emerald-400 tracking-tighter">{item.price} <span className="text-2xl">$</span></span>
                                )}
                                <div className="text-[10px] text-slate-500 mt-3 flex flex-wrap gap-2">
                                    <span className="bg-slate-950 border border-white/5 px-3 py-1 rounded-full font-black uppercase tracking-widest">{item.category}</span>
                                    <span className="bg-slate-950 border border-white/5 px-3 py-1 rounded-full font-black uppercase tracking-widest">{item.condition}</span>
                                    {item.stock !== undefined && item.stock < 5 && item.stock > 0 && <span className="bg-red-600 text-white px-3 py-1 rounded-full font-black uppercase tracking-widest animate-pulse">¡STOCK CRÍTICO: {item.stock}!</span>}
                                </div>
                            </div>

                            {/* Seller Status Info */}
                            <div className="mb-8 bg-slate-950/50 p-5 rounded-3xl border border-white/5 space-y-4">
                                <div className="flex items-center gap-4">
                                    <div className="w-14 h-14 rounded-2xl bg-slate-800 overflow-hidden border border-white/5 shadow-lg shrink-0">
                                        {item.sellerAvatarUrl ? <img src={item.sellerAvatarUrl} className="w-full h-full object-cover"/> : <div className="w-full h-full flex items-center justify-center text-slate-600"><User size={28}/></div>}
                                    </div>
                                    <div>
                                        <div className="text-[10px] text-slate-500 font-black uppercase tracking-widest">Publicado por</div>
                                        <div className="font-black text-white text-lg hover:text-indigo-400 transition-colors cursor-pointer" onClick={() => navigate(`/channel/${item.sellerId}`)}>@{item.sellerName || 'Usuario'}</div>
                                    </div>
                                </div>

                                {isVerified ? (
                                    <div className="flex items-center gap-3 text-emerald-400 bg-emerald-500/10 p-3 rounded-2xl border border-emerald-500/20">
                                        <ShieldCheck size={20}/>
                                        <div className="min-w-0">
                                            <div className="text-[10px] font-black uppercase tracking-widest">Identidad Validada</div>
                                            <p className="text-[9px] font-bold uppercase opacity-60">Vendedor oficial StreamPay</p>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-3 text-amber-500 bg-amber-500/10 p-3 rounded-2xl border border-amber-500/20 animate-in fade-in">
                                        <AlertTriangle size={20} className="shrink-0"/>
                                        <div className="min-w-0">
                                            <div className="text-[10px] font-black uppercase tracking-widest">Vendedor no verificado</div>
                                            <p className="text-[9px] font-bold uppercase opacity-60">Opera bajo tu propio riesgo</p>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <button 
                                onClick={handleAddToCart}
                                disabled={isInCart || item.status !== 'ACTIVO'}
                                className={`w-full py-5 rounded-2xl font-black flex items-center justify-center gap-3 text-sm uppercase tracking-[0.2em] shadow-2xl transition-all active:scale-95 ${isInCart ? 'bg-slate-800 text-slate-500 cursor-default border border-white/5' : (item.status === 'ACTIVO' ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-500/20' : 'bg-slate-800 text-slate-600 cursor-not-allowed')}`}
                            >
                                {isInCart ? <><Check size={20}/> EN TU CARRITO</> : (item.status === 'ACTIVO' ? <><ShoppingCart size={20}/> AÑADIR AL CARRITO</> : 'ARTÍCULO AGOTADO')}
                            </button>
                        </div>
                    </div>

                    <div className="bg-slate-900/40 p-8 rounded-[40px] border border-white/5">
                        <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4">Descripción del Vendedor</h3>
                        <p className="text-slate-300 text-sm leading-relaxed whitespace-pre-wrap">{item.description}</p>
                    </div>
                </div>
            </div>

            {/* Reviews Section */}
            <div className="mt-16 px-4">
                <div className="flex items-center gap-3 mb-10 px-4">
                    <div className="w-1.5 h-8 bg-indigo-500 rounded-full"></div>
                    <h3 className="text-xl font-black text-white uppercase italic tracking-tighter">Experiencias de Clientes</h3>
                </div>
                
                {user && !isSeller && (
                    <form onSubmit={handleAddReview} className="bg-slate-900 p-8 rounded-[40px] border border-slate-800 mb-12 shadow-xl animate-in slide-in-from-bottom-4">
                        <div className="flex justify-between items-center mb-6">
                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Tu calificación</span>
                            <div className="flex gap-2">
                                {[1,2,3,4,5].map(s => (
                                    <button key={s} type="button" onClick={() => setRating(s)} className="focus:outline-none transform hover:scale-125 transition-transform">
                                        <Star size={24} className={s <= rating ? "text-amber-500" : "text-slate-800"} fill={s <= rating ? "currentColor" : "none"} />
                                    </button>
                                ))}
                            </div>
                        </div>
                        <textarea 
                            value={comment} 
                            onChange={e => setComment(e.target.value)} 
                            className="w-full bg-slate-950 border border-slate-800 rounded-3xl p-6 text-white text-sm mb-6 focus:border-indigo-500 outline-none transition-all shadow-inner resize-none" 
                            rows={3}
                            placeholder="¿Cómo fue tu experiencia con el producto y el vendedor?"
                        />
                        <button disabled={submittingReview || !comment.trim()} className="w-full bg-slate-800 hover:bg-indigo-600 text-white font-black py-4 rounded-2xl text-[10px] uppercase tracking-widest flex items-center justify-center gap-3 transition-all">
                            {submittingReview ? <Loader2 className="animate-spin" size={16}/> : <Send size={16}/>}
                            PUBLICAR RESEÑA
                        </button>
                    </form>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {reviews.length === 0 ? (
                        <div className="col-span-full py-20 text-center bg-slate-900/20 rounded-[40px] border-2 border-dashed border-slate-800/50">
                            <MessageSquare size={48} className="mx-auto mb-4 opacity-10 text-white"/>
                            <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Sin opiniones registradas aún</p>
                        </div>
                    ) : reviews.map(r => (
                        <div key={r.id} className="bg-slate-900/60 p-6 rounded-[32px] border border-white/5 hover:border-indigo-500/30 transition-all group">
                            <div className="flex justify-between items-start mb-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-slate-800 overflow-hidden border border-white/5 shadow-lg group-hover:scale-110 transition-transform">
                                        {r.userAvatarUrl ? <img src={r.userAvatarUrl} className="w-full h-full object-cover"/> : <div className="flex items-center justify-center w-full h-full text-[10px] font-black text-slate-600">{r.username?.[0] || '?'}</div>}
                                    </div>
                                    <div>
                                        <div className="text-xs font-black text-slate-200">@{r.username || 'Anónimo'}</div>
                                        <div className="flex text-amber-500 mt-1">
                                            {[1,2,3,4,5].map(s => <Star key={s} size={10} fill={s <= r.rating ? "currentColor" : "none"} className={s <= r.rating ? "" : "text-slate-800"} />)}
                                        </div>
                                    </div>
                                </div>
                                <span className="text-[9px] font-bold text-slate-600 uppercase">{new Date(r.timestamp * 1000).toLocaleDateString()}</span>
                            </div>
                            <p className="text-xs text-slate-400 leading-relaxed italic pr-4">"{r.comment}"</p>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
