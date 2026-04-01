
import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../services/db';
import { useToast } from '../../context/ToastContext';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie
} from 'recharts';
import { 
  TrendingUp, ShoppingBag, DollarSign, Clock, CheckCircle, 
  ArrowLeft, Package, User, Calendar, Info, AlertCircle,
  BarChart3, History, CreditCard, Users, XCircle, Calculator,
  ChevronRight, MapPin, Phone, Mail, MessageSquare, X
} from 'lucide-react';
import { useNavigate } from '../Router';
import { motion, AnimatePresence } from 'motion/react';

interface SellerStats {
  summary: {
    paymentMethod: 'PLATFORM' | 'DIRECT';
    totalRevenue: number;
    orderCount: number;
  }[];
  history: any[];
}

export default function SellerDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [stats, setStats] = useState<SellerStats | null>(null);
  const [pendingOrders, setPendingOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'STATS' | 'PENDING' | 'HISTORY'>('STATS');
  
  // New States
  const [rejectingOrder, setRejectingOrder] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [selectedOrderDetails, setSelectedOrderDetails] = useState<any | null>(null);
  const [amountPaid, setAmountPaid] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (user) {
      fetchData();
    }
  }, [user]);

  const fetchData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [statsData, ordersData] = await Promise.all([
        db.getSellerStats(user.id),
        db.getSellerOrders(user.id)
      ]);
      setStats(statsData);
      setPendingOrders(ordersData);
    } catch (error: any) {
      toast.error("Error al cargar datos: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleMarkPaid = async (orderItemId: string) => {
    if (!user) return;
    try {
      await db.markItemPaid(orderItemId, user.id);
      toast.success("Artículo marcado como pagado");
      fetchData(); // Refresh data
    } catch (error: any) {
      toast.error("Error: " + error.message);
    }
  };

  const handleRejectOrder = async () => {
    if (!user || !rejectingOrder || !rejectionReason.trim()) return;
    setIsSubmitting(true);
    try {
      await db.rejectOrder(rejectingOrder, user.id, rejectionReason);
      toast.success("Pedido rechazado correctamente");
      setRejectingOrder(null);
      setRejectionReason('');
      fetchData();
    } catch (error: any) {
      toast.error("Error: " + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const calculateChange = (total: number, paid: string) => {
    const paidNum = parseFloat(paid);
    if (isNaN(paidNum) || paidNum < total) return null;
    return paidNum - total;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500"></div>
      </div>
    );
  }

  const totalRevenue = stats?.summary.reduce((acc, s) => acc + Number(s.totalRevenue), 0) || 0;
  const totalOrders = stats?.summary.reduce((acc, s) => acc + Number(s.orderCount), 0) || 0;
  
  const chartData = stats?.summary.map(s => ({
    name: s.paymentMethod === 'PLATFORM' ? 'Plataforma' : 'Directo',
    value: Number(s.totalRevenue),
    count: s.orderCount
  })) || [];

  const COLORS = ['#6366f1', '#10b981'];

  return (
    <div className="min-h-screen bg-black text-white pb-24">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-black/80 backdrop-blur-lg border-b border-white/5 p-4 flex items-center gap-4">
        <button onClick={() => navigate('/profile')} className="p-2 hover:bg-white/10 rounded-full transition-colors">
          <ArrowLeft size={24} />
        </button>
        <div>
          <h1 className="text-xl font-black uppercase tracking-tighter">Panel de Vendedor</h1>
          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Estadísticas y Gestión de Ventas</p>
        </div>
      </div>

      <div className="max-w-5xl mx-auto p-4 space-y-6">
        {/* Quick Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-slate-900/50 border border-white/5 p-4 rounded-[24px] flex flex-col justify-between"
          >
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-400 mb-3">
              <DollarSign size={20} />
            </div>
            <div>
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Ingresos Totales</p>
              <h3 className="text-2xl font-black tracking-tighter">${totalRevenue.toFixed(2)}</h3>
            </div>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-slate-900/50 border border-white/5 p-4 rounded-[24px] flex flex-col justify-between"
          >
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400 mb-3">
              <ShoppingBag size={20} />
            </div>
            <div>
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Ventas Totales</p>
              <h3 className="text-2xl font-black tracking-tighter">{totalOrders}</h3>
            </div>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-slate-900/50 border border-white/5 p-4 rounded-[24px] flex flex-col justify-between"
          >
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-400 mb-3">
              <Clock size={20} />
            </div>
            <div>
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Pendientes Directos</p>
              <h3 className="text-2xl font-black tracking-tighter">{pendingOrders.length}</h3>
            </div>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-slate-900/50 border border-white/5 p-4 rounded-[24px] flex flex-col justify-between"
          >
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center text-purple-400 mb-3">
              <TrendingUp size={20} />
            </div>
            <div>
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Tasa de Éxito</p>
              <h3 className="text-2xl font-black tracking-tighter">100%</h3>
            </div>
          </motion.div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 p-1 bg-slate-900/50 rounded-2xl border border-white/5">
          <button 
            onClick={() => setActiveTab('STATS')}
            className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'STATS' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
          >
            <div className="flex items-center justify-center gap-2">
              <BarChart3 size={14} />
              Estadísticas
            </div>
          </button>
          <button 
            onClick={() => setActiveTab('PENDING')}
            className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all relative ${activeTab === 'PENDING' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
          >
            <div className="flex items-center justify-center gap-2">
              <Clock size={14} />
              Pendientes
              {pendingOrders.length > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center text-[10px] font-black border-2 border-slate-900">
                  {pendingOrders.length}
                </span>
              )}
            </div>
          </button>
          <button 
            onClick={() => setActiveTab('HISTORY')}
            className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'HISTORY' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
          >
            <div className="flex items-center justify-center gap-2">
              <History size={14} />
              Historial
            </div>
          </button>
        </div>

        {/* Content */}
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
          {activeTab === 'STATS' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Revenue Chart */}
              <div className="bg-slate-900/50 border border-white/5 p-6 rounded-[32px] space-y-6">
                <h4 className="text-sm font-black uppercase tracking-widest flex items-center gap-2">
                  <DollarSign size={16} className="text-indigo-400" />
                  Ingresos por Método
                </h4>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                      <XAxis dataKey="name" stroke="#64748b" fontSize={10} fontWeight="bold" />
                      <YAxis stroke="#64748b" fontSize={10} fontWeight="bold" />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }}
                        itemStyle={{ color: '#fff', fontSize: '12px', fontWeight: 'bold' }}
                      />
                      <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                        {chartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Order Distribution */}
              <div className="bg-slate-900/50 border border-white/5 p-6 rounded-[32px] space-y-6">
                <h4 className="text-sm font-black uppercase tracking-widest flex items-center gap-2">
                  <Package size={16} className="text-emerald-400" />
                  Distribución de Ventas
                </h4>
                <div className="space-y-4">
                  {chartData.map((item, i) => (
                    <div key={item.name} className="flex items-center justify-between p-4 bg-slate-950/50 rounded-2xl border border-white/5">
                      <div className="flex items-center gap-3">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[i] }}></div>
                        <div>
                          <p className="text-xs font-bold text-white">{item.name}</p>
                          <p className="text-[10px] text-slate-500 font-bold uppercase">{item.count} Pedidos</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-black text-white">${item.value.toFixed(2)}</p>
                        <p className="text-[10px] text-emerald-400 font-bold uppercase">
                          {totalRevenue > 0 ? ((item.value / totalRevenue) * 100).toFixed(1) : 0}%
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'PENDING' && (
            <div className="space-y-6">
              {pendingOrders.length === 0 ? (
                <div className="bg-slate-900/50 border border-white/5 rounded-[32px] p-12 text-center flex flex-col items-center gap-4">
                  <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center text-slate-600">
                    <CheckCircle size={32} />
                  </div>
                  <div>
                    <h3 className="text-lg font-black uppercase tracking-tighter">¡Todo al día!</h3>
                    <p className="text-sm text-slate-500 font-bold">No tienes pedidos pendientes de pago directo.</p>
                  </div>
                </div>
              ) : (
                pendingOrders.map((order: any) => (
                  <div key={order.id} className="bg-slate-900/50 border border-white/5 rounded-[32px] overflow-hidden shadow-xl">
                    <div className="p-4 bg-amber-500/10 border-b border-white/5 flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <Clock size={16} className="text-amber-500" />
                        <span className="text-[10px] font-black text-amber-500 uppercase tracking-widest">Pedido Directo #{order.id.slice(-6)}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-[10px] text-slate-500 font-bold uppercase">{new Date(order.createdAt * 1000).toLocaleDateString()}</span>
                        <button 
                          onClick={() => setRejectingOrder(order.id)}
                          className="p-1.5 hover:bg-red-500/20 text-red-400 rounded-lg transition-colors"
                          title="Rechazar pedido"
                        >
                          <XCircle size={16} />
                        </button>
                      </div>
                    </div>
                    <div className="p-6 space-y-6">
                      <div className="flex items-center justify-between pb-4 border-b border-white/5">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-indigo-500/10 flex items-center justify-center text-indigo-400">
                            <User size={20} />
                          </div>
                          <div>
                            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Comprador</p>
                            <p className="text-sm font-black text-white">@{order.buyerName}</p>
                          </div>
                        </div>
                        <button 
                          onClick={() => setSelectedOrderDetails(order)}
                          className="text-[10px] font-black text-indigo-400 uppercase tracking-widest hover:underline"
                        >
                          Ver Detalles
                        </button>
                      </div>

                      <div className="space-y-4">
                        {order.items.map((item: any) => (
                          <div key={item.id} className="flex items-center gap-4 p-3 bg-slate-950/30 rounded-2xl border border-white/5">
                            <div className="w-16 h-16 rounded-xl overflow-hidden bg-slate-800 shrink-0 border border-white/5">
                              <img src={item.thumbnail} alt={item.title} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <h4 className="text-sm font-black tracking-tight text-white truncate">{item.title}</h4>
                              <p className="text-[10px] text-slate-500 font-bold uppercase mt-1">
                                Cant: {item.quantity} • ${Number(item.price).toFixed(2)} c/u
                              </p>
                              <div className="mt-2">
                                {item.status === 'PAID' ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 text-[9px] font-black uppercase tracking-widest">
                                    <CheckCircle size={10} /> Pagado
                                  </span>
                                ) : (
                                  <button 
                                    onClick={() => handleMarkPaid(item.id)}
                                    className="bg-emerald-600 hover:bg-emerald-500 text-white font-black px-3 py-1.5 rounded-lg transition-all active:scale-95 flex items-center gap-2 text-[9px] uppercase tracking-widest"
                                  >
                                    <CheckCircle size={12} />
                                    Confirmar Pago
                                  </button>
                                )}
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-black text-white">${(Number(item.price) * Number(item.quantity)).toFixed(2)}</p>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Change Calculator */}
                      <div className="bg-slate-950/50 p-4 rounded-2xl border border-white/5 space-y-3">
                        <div className="flex items-center gap-2 text-indigo-400">
                          <Calculator size={14} />
                          <span className="text-[10px] font-black uppercase tracking-widest">Calculadora de Cambio</span>
                        </div>
                        <div className="flex gap-3">
                          <div className="flex-1">
                            <input 
                              type="number" 
                              placeholder="Monto pagado"
                              value={amountPaid[order.id] || ''}
                              onChange={(e) => setAmountPaid({ ...amountPaid, [order.id]: e.target.value })}
                              className="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-2 text-sm font-bold focus:border-indigo-500 outline-none"
                            />
                          </div>
                          <div className="flex-1 bg-slate-900 border border-white/10 rounded-xl px-4 py-2 flex items-center justify-between">
                            <span className="text-[10px] text-slate-500 font-bold uppercase">Cambio:</span>
                            <span className={`text-sm font-black ${calculateChange(Number(order.totalAmount), amountPaid[order.id]) !== null ? 'text-emerald-400' : 'text-slate-600'}`}>
                              ${calculateChange(Number(order.totalAmount), amountPaid[order.id])?.toFixed(2) || '0.00'}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="pt-4 border-t border-white/5 flex justify-between items-center">
                        <p className="text-[10px] text-slate-500 font-bold uppercase">Total del Pedido</p>
                        <p className="text-xl font-black text-indigo-400 tracking-tighter">${Number(order.totalAmount).toFixed(2)}</p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'HISTORY' && (
            <div className="space-y-4">
              {stats?.history.length === 0 ? (
                <div className="bg-slate-900/50 border border-white/5 rounded-[32px] p-12 text-center">
                  <p className="text-slate-500 font-bold uppercase tracking-widest text-xs">Aún no tienes historial de ventas</p>
                </div>
              ) : (
                stats?.history.map((order: any) => (
                  <div 
                    key={order.id} 
                    onClick={() => setSelectedOrderDetails(order)}
                    className="bg-slate-900/50 border border-white/5 rounded-[32px] overflow-hidden cursor-pointer hover:border-indigo-500/30 transition-all group"
                  >
                    <div className="p-4 bg-slate-950/50 border-b border-white/5 flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        {order.paymentMethod === 'PLATFORM' ? (
                          <CreditCard size={14} className="text-indigo-400" />
                        ) : (
                          <Users size={14} className="text-emerald-400" />
                        )}
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-300">
                          {order.paymentMethod === 'PLATFORM' ? 'Venta en Plataforma' : 'Venta Directa'}
                        </span>
                        {order.status === 'REJECTED' && (
                          <span className="bg-red-500/10 text-red-400 text-[8px] font-black px-2 py-0.5 rounded-full border border-red-500/20">RECHAZADO</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-slate-500 font-bold uppercase">{new Date(order.createdAt * 1000).toLocaleDateString()}</span>
                        <ChevronRight size={14} className="text-slate-700 group-hover:text-indigo-400 transition-colors" />
                      </div>
                    </div>
                    <div className="p-6 space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-slate-500">
                            <User size={20} />
                          </div>
                          <div>
                            <p className="text-[10px] text-slate-500 font-bold uppercase">Comprador</p>
                            <p className="text-sm font-black text-white">@{order.buyerName}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] text-slate-500 font-bold uppercase">Total</p>
                          <p className="text-lg font-black text-indigo-400 tracking-tighter">${Number(order.totalAmount).toFixed(2)}</p>
                        </div>
                      </div>
                      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                        {order.items.map((item: any) => (
                          <div key={item.id} className="w-12 h-12 rounded-lg overflow-hidden bg-slate-800 shrink-0 border border-white/5">
                            <img src={item.thumbnail} alt={item.title} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      <AnimatePresence>
        {/* Rejection Modal */}
        {rejectingOrder && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-slate-900 border border-white/10 rounded-[32px] p-8 max-w-md w-full shadow-2xl"
            >
              <div className="w-16 h-16 rounded-2xl bg-red-500/10 flex items-center justify-center text-red-500 mx-auto mb-6">
                <XCircle size={40} />
              </div>
              <h3 className="text-xl font-black text-white text-center uppercase italic tracking-tighter mb-2">Rechazar Pedido</h3>
              <p className="text-slate-400 text-center text-xs font-bold uppercase tracking-widest mb-6">Indica el motivo del rechazo para el comprador</p>
              
              <textarea 
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Ej: No tengo stock disponible en este momento..."
                className="w-full bg-slate-950 border border-white/10 rounded-2xl p-4 text-white text-sm font-bold focus:border-red-500 outline-none transition-all resize-none mb-6"
                rows={4}
              />

              <div className="flex gap-3">
                <button 
                  onClick={() => setRejectingOrder(null)}
                  className="flex-1 py-4 bg-slate-800 hover:bg-slate-700 text-slate-300 font-black rounded-2xl text-[10px] uppercase tracking-widest transition-all"
                >
                  Cancelar
                </button>
                <button 
                  onClick={handleRejectOrder}
                  disabled={isSubmitting || !rejectionReason.trim()}
                  className="flex-1 py-4 bg-red-600 hover:bg-red-500 text-white font-black rounded-2xl text-[10px] uppercase tracking-widest transition-all shadow-lg shadow-red-600/20 disabled:opacity-50"
                >
                  {isSubmitting ? 'Procesando...' : 'Rechazar'}
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* Order Details Modal */}
        {selectedOrderDetails && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/90 backdrop-blur-xl">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="bg-slate-900 border border-white/10 rounded-[40px] w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl"
            >
              <div className="p-6 border-b border-white/5 flex justify-between items-center bg-slate-950/50">
                <div>
                  <h3 className="text-xl font-black text-white uppercase italic tracking-tighter">Detalles del Pedido</h3>
                  <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">ID: {selectedOrderDetails.id}</p>
                </div>
                <button onClick={() => setSelectedOrderDetails(null)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                  <X size={24} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-8 space-y-8">
                {/* Status Badge */}
                <div className="flex justify-center">
                  <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-[0.2em] border ${
                    selectedOrderDetails.status === 'PAID' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                    selectedOrderDetails.status === 'REJECTED' ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                    'bg-amber-500/10 text-amber-400 border-amber-500/20'
                  }`}>
                    {selectedOrderDetails.status === 'PAID' ? 'Completado' : 
                     selectedOrderDetails.status === 'REJECTED' ? 'Rechazado' : 'Pendiente'}
                  </span>
                </div>

                {/* Buyer Info */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-slate-950/50 p-6 rounded-3xl border border-white/5 space-y-4">
                    <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                      <User size={14} /> Información del Comprador
                    </h4>
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 flex items-center justify-center text-indigo-400">
                        <User size={24} />
                      </div>
                      <div>
                        <p className="text-sm font-black text-white">@{selectedOrderDetails.buyerName}</p>
                        <p className="text-[10px] text-slate-500 font-bold uppercase">Cliente StreamPay</p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-slate-950/50 p-6 rounded-3xl border border-white/5 space-y-4">
                    <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                      <MapPin size={14} /> Datos de Entrega
                    </h4>
                    {selectedOrderDetails.shippingDetails ? (
                      <div className="space-y-2">
                        {(() => {
                          let ship = selectedOrderDetails.shippingDetails;
                          if (typeof ship === 'string') {
                            try { ship = JSON.parse(ship); } catch(e) { ship = {}; }
                          }
                          return (
                            <>
                              <p className="text-xs font-bold text-white">{ship.address || 'Sin dirección'}</p>
                              <div className="flex items-center gap-4 text-[10px] text-slate-500 font-bold uppercase">
                                <span className="flex items-center gap-1"><Phone size={10}/> {ship.phone || 'N/A'}</span>
                                <span className="flex items-center gap-1"><Mail size={10}/> {ship.email || 'N/A'}</span>
                              </div>
                            </>
                          );
                        })()}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500 font-bold uppercase italic">No se proporcionaron datos</p>
                    )}
                  </div>
                </div>

                {/* Items List */}
                <div className="space-y-4">
                  <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Artículos Comprados</h4>
                  <div className="space-y-3">
                    {selectedOrderDetails.items.map((item: any) => (
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

                {/* Rejection Reason if any */}
                {selectedOrderDetails.status === 'REJECTED' && selectedOrderDetails.rejectionReason && (
                  <div className="bg-red-500/10 border border-red-500/20 p-6 rounded-3xl space-y-2">
                    <h4 className="text-[10px] font-black text-red-400 uppercase tracking-widest flex items-center gap-2">
                      <AlertCircle size={14} /> Motivo del Rechazo
                    </h4>
                    <p className="text-xs text-red-300/80 font-bold italic">"{selectedOrderDetails.rejectionReason}"</p>
                  </div>
                )}

                {/* Summary */}
                <div className="bg-indigo-600/10 border border-indigo-500/20 p-6 rounded-3xl flex justify-between items-center">
                  <div>
                    <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">Total Final</p>
                    <p className="text-xs text-indigo-400 font-bold uppercase">{selectedOrderDetails.paymentMethod === 'PLATFORM' ? 'Pagado vía Plataforma' : 'Pago Directo'}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-3xl font-black text-white tracking-tighter">${Number(selectedOrderDetails.totalAmount).toFixed(2)}</p>
                  </div>
                </div>
              </div>

              <div className="p-6 bg-slate-950/50 border-t border-white/5">
                <button 
                  onClick={() => setSelectedOrderDetails(null)}
                  className="w-full py-4 bg-slate-800 hover:bg-slate-700 text-white font-black rounded-2xl text-[10px] uppercase tracking-widest transition-all"
                >
                  Cerrar Detalles
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
