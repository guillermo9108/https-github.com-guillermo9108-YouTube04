
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
  BarChart3, History, CreditCard, Users
} from 'lucide-react';
import { useNavigate } from '../Router';
import { motion } from 'motion/react';

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
                  <div key={order.id} className="bg-slate-900/50 border border-white/5 rounded-[32px] overflow-hidden">
                    <div className="p-4 bg-amber-500/10 border-b border-white/5 flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <Clock size={16} className="text-amber-500" />
                        <span className="text-[10px] font-black text-amber-500 uppercase tracking-widest">Pedido Directo #{order.id.slice(-6)}</span>
                      </div>
                      <span className="text-[10px] text-slate-500 font-bold uppercase">{new Date(order.createdAt * 1000).toLocaleDateString()}</span>
                    </div>
                    <div className="p-6 space-y-6">
                      <div className="flex items-center gap-3 pb-4 border-b border-white/5">
                        <div className="w-10 h-10 rounded-full bg-indigo-500/10 flex items-center justify-center text-indigo-400">
                          <User size={20} />
                        </div>
                        <div>
                          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Comprador</p>
                          <p className="text-sm font-black text-white">@{order.buyerName}</p>
                        </div>
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
                  <div key={order.id} className="bg-slate-900/50 border border-white/5 rounded-[32px] overflow-hidden">
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
                      </div>
                      <span className="text-[10px] text-slate-500 font-bold uppercase">{new Date(order.createdAt).toLocaleDateString()}</span>
                    </div>
                    <div className="p-6 space-y-4">
                      {order.items.map((item: any) => (
                        <div key={item.id} className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-xl overflow-hidden bg-slate-800 shrink-0 border border-white/5">
                            {item.thumbnail ? (
                              <img src={item.thumbnail} alt={item.title} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-slate-700">
                                <ShoppingBag size={20} />
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <h5 className="text-sm font-bold text-white truncate">{item.title}</h5>
                            <p className="text-[10px] text-slate-500 font-bold uppercase">Cant: {item.quantity} • ${Number(item.price).toFixed(2)} c/u</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-black text-white">${(Number(item.price) * Number(item.quantity)).toFixed(2)}</p>
                          </div>
                        </div>
                      ))}
                      <div className="pt-4 border-t border-white/5 flex justify-between items-center">
                        <div className="flex items-center gap-2">
                          <User size={12} className="text-slate-500" />
                          <span className="text-[10px] font-bold text-slate-400 uppercase">Comprador: @{order.buyerName}</span>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] text-slate-500 font-bold uppercase">Total del Pedido</p>
                          <p className="text-lg font-black text-indigo-400 tracking-tighter">${Number(order.totalAmount).toFixed(2)}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
