
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../services/db';
import { Transaction, Notification as AppNotification } from '../../types';
import { Wallet, Send, ArrowDownLeft, ArrowUpRight, History, Shield, LogOut, ChevronRight, User as UserIcon, RefreshCw, Smartphone, Loader2, Settings, Save, Zap, Heart, Truck, Camera, Lock, Eye, EyeOff, UserCheck, Bell, MessageSquare, Trash2, CheckCircle2, Crown, Calendar, Clock as ClockIcon, ShieldCheck, AlertTriangle, Fingerprint, MapPin, Smartphone as PhoneIcon, X } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { useNavigate } from '../Router';

export default function Profile() {
  const { user, logout, refreshUser } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  
  const [activeSubTab, setActiveSubTab] = useState<'WALLET' | 'NOTIFS' | 'HISTORY' | 'SETTINGS'>('WALLET');
  const [txHistory, setTxHistory] = useState<Transaction[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [transferData, setTransferData] = useState({ target: '', amount: '' });
  const [userSuggestions, setUserSuggestions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // Seller Verification Modal
  const [showVerificationModal, setShowVerificationModal] = useState(false);
  const [verificationForm, setVerificationForm] = useState({
      fullName: '',
      idNumber: '',
      address: '',
      mobile: ''
  });

  const hasUnread = useMemo(() => notifications.some(n => Number(n.isRead) === 0), [notifications]);

  const [settings, setSettings] = useState({
      autoPurchaseLimit: user?.autoPurchaseLimit || 1.00,
      newPassword: '',
      confirmPassword: '',
      avatar: null as File | null
  });
  const [avatarPreview, setAvatarPreview] = useState<string | null>(user?.avatarUrl || null);
  const [showPass, setShowPass] = useState(false);

  useEffect(() => {
    if (user) {
        db.request<Transaction[]>(`action=get_user_transactions&userId=${user.id}`).then(setTxHistory);
        db.getNotifications(user.id).then(setNotifications);
        setSettings(prev => ({
            ...prev,
            autoPurchaseLimit: user.autoPurchaseLimit
        }));
        setAvatarPreview(user.avatarUrl || null);
    }
  }, [user]);

  const searchTimeout = useRef<any>(null);
  const handleTargetChange = (val: string) => {
      setTransferData({...transferData, target: val});
      if (searchTimeout.current) clearTimeout(searchTimeout.current);
      if (val.length < 2) { setUserSuggestions([]); return; }
      searchTimeout.current = setTimeout(async () => {
          if (!user) return;
          const hits = await db.searchUsers(user.id, val);
          setUserSuggestions(hits);
      }, 300);
  };

  const handleTransfer = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!user || !transferData.target || !transferData.amount) return;
      setLoading(true);
      try {
          await db.transferBalance(user.id, transferData.target, parseFloat(transferData.amount));
          toast.success("Transferencia enviada correctamente");
          setTransferData({ target: '', amount: '' });
          setUserSuggestions([]);
          refreshUser();
          db.request<Transaction[]>(`action=get_user_transactions&userId=${user.id}`).then(setTxHistory);
      } catch (e: any) { toast.error(e.message); }
      finally { setLoading(false); }
  };

  const handleSaveSettings = async () => {
      if (!user) return;
      if (settings.newPassword && settings.newPassword !== settings.confirmPassword) {
          toast.error("Las contraseñas no coinciden");
          return;
      }
      setLoading(true);
      try {
          await db.updateUserProfile(user.id, {
              autoPurchaseLimit: settings.autoPurchaseLimit,
              newPassword: settings.newPassword,
              avatar: settings.avatar,
              shippingDetails: user.shippingDetails 
          });
          toast.success("Perfil actualizado correctamente");
          setSettings(p => ({...p, newPassword: '', confirmPassword: '', avatar: null}));
          refreshUser();
      } catch (e: any) { toast.error(e.message); }
      finally { setLoading(false); }
  };

  const onAvatarFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files[0]) {
          const file = e.target.files[0];
          setSettings({...settings, avatar: file});
          setAvatarPreview(URL.createObjectURL(file));
      }
  };

  const markNotifRead = async (n: AppNotification) => {
      if (Number(n.isRead) === 0) {
          try {
              await db.markNotificationRead(n.id);
              setNotifications(prev => prev.map(p => p.id === n.id ? {...p, isRead: true} : p));
          } catch(e) {}
      }
      navigate(n.link);
  };

  const handleVerificationSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!user) return;
      setLoading(true);
      try {
          await db.request('action=submit_seller_verification', {
              method: 'POST',
              body: JSON.stringify({ userId: user.id, ...verificationForm })
          });
          toast.success("Solicitud de verificación enviada con éxito.");
          setShowVerificationModal(false);
      } catch (e: any) { toast.error(e.message); }
      finally { setLoading(false); }
  };

  // Helper para tiempo restante VIP
  const getVipTimeLeft = (expiry: number) => {
      const now = Math.floor(Date.now() / 1000);
      const diff = expiry - now;
      if (diff <= 0) return null;

      const days = Math.floor(diff / 86400);
      const hours = Math.floor((diff % 86400) / 3600);
      const mins = Math.floor((diff % 3600) / 60);

      if (days > 0) return `${days}d ${hours}h restantes`;
      if (hours > 0) return `${hours}h ${mins}m restantes`;
      return `${mins}m restantes`;
  };

  if (!user) return null;

  const vipTimeLeft = user.vipExpiry ? getVipTimeLeft(Number(user.vipExpiry)) : null;
  const isVerified = Number(user.is_verified_seller) === 1;

  return (
    <div className="space-y-6 pb-24 px-2 max-w-4xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-700">
      
      {/* Neo-Banking Wallet Header */}
      <div className="bg-gradient-to-br from-indigo-600 via-indigo-700 to-purple-800 p-8 rounded-[40px] shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 p-8 opacity-10"><Wallet size={120}/></div>
          <div className="relative z-10 flex flex-col md:row justify-between items-center gap-6">
              <div className="text-center md:text-left flex flex-col md:flex-row items-center gap-6">
                  <div className="relative group">
                      <div className="w-24 h-24 rounded-full border-4 border-white/20 overflow-hidden bg-slate-800 shadow-2xl">
                          {avatarPreview ? <img src={avatarPreview} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-3xl font-black text-white/20">{user?.username?.[0] || '?'}</div>}
                      </div>
                  </div>
                  <div>
                    <p className="text-indigo-200 text-xs font-black uppercase tracking-[0.2em] mb-2">Saldo Disponible</p>
                    <h2 className="text-5xl font-black text-white tracking-tighter">
                        {Number(user.balance).toFixed(2)} <span className="text-xl font-medium opacity-60">$</span>
                    </h2>
                    <div className="mt-4 flex items-center gap-2 justify-center md:justify-start">
                        <span className="bg-white/10 px-3 py-1 rounded-full text-[10px] font-bold text-white flex items-center gap-1.5">
                            <UserIcon size={10}/> @{user.username}
                        </span>
                        {vipTimeLeft && (
                            <div className="flex flex-col gap-1 items-start">
                                <span className="bg-gradient-to-tr from-amber-500 to-yellow-300 text-black px-4 py-1.5 rounded-full text-[10px] font-black uppercase shadow-[0_0_15px_rgba(245,158,11,0.5)] border border-amber-300 flex items-center gap-1">
                                    <Crown size={12}/> VIP ACTIVO
                                </span>
                            </div>
                        )}
                        {isVerified && (
                             <span className="bg-emerald-500 text-black px-3 py-1 rounded-full text-[10px] font-black uppercase flex items-center gap-1">
                                <ShieldCheck size={12}/> VERIFICADO
                            </span>
                        )}
                    </div>
                  </div>
              </div>
              <div className="flex gap-2">
                  <button onClick={refreshUser} className="p-4 bg-white/10 hover:bg-white/20 rounded-2xl text-white backdrop-blur-md transition-all active:scale-90">
                      <RefreshCw size={24}/>
                  </button>
                  <button onClick={() => setActiveSubTab('SETTINGS')} className={`p-4 rounded-2xl backdrop-blur-md transition-all active:scale-90 ${activeSubTab === 'SETTINGS' ? 'bg-white text-indigo-700' : 'bg-white/10 text-white hover:bg-white/20'}`}>
                      <Settings size={24}/>
                  </button>
              </div>
          </div>
      </div>

      {/* Seller Verification Banner */}
      {!isVerified && (
          <div className="bg-slate-900 border border-indigo-500/20 rounded-[32px] p-6 shadow-xl flex flex-col md:flex-row items-center justify-between gap-4 group hover:border-indigo-500/40 transition-all">
              <div className="flex items-center gap-4 text-center md:text-left">
                  <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center shrink-0">
                      <Fingerprint size={24}/>
                  </div>
                  <div>
                      <h4 className="text-white font-black text-sm uppercase tracking-widest">Estatus de Vendedor</h4>
                      <p className="text-slate-500 text-[10px] font-bold uppercase tracking-tight">Tu identidad no ha sido validada. Solicítalo para ganar confianza.</p>
                  </div>
              </div>
              <button 
                  onClick={() => setShowVerificationModal(true)}
                  className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-black uppercase tracking-[0.1em] rounded-xl shadow-lg active:scale-95 transition-all"
              >
                  Verificar Identidad
              </button>
          </div>
      )}

      {/* VIP Status Card (Solo si es VIP) */}
      {vipTimeLeft && (
          <div className="bg-slate-900 border border-amber-500/20 rounded-[32px] p-6 shadow-xl animate-in slide-in-from-top-4 duration-500 relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:scale-110 transition-transform"><Crown size={80} className="text-amber-500" /></div>
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-2xl bg-amber-500/10 flex items-center justify-center text-amber-500 border border-amber-500/20 shadow-lg shadow-amber-500/5">
                          <ClockIcon size={24}/>
                      </div>
                      <div>
                          <h4 className="text-white font-black text-sm uppercase tracking-widest">Estatus de Membresía</h4>
                          <p className="text-amber-400 text-xs font-bold uppercase">{vipTimeLeft}</p>
                      </div>
                  </div>
                  <div className="bg-slate-950/50 px-4 py-3 rounded-2xl border border-white/5">
                      <div className="flex items-center gap-2 text-slate-500 mb-1">
                          <Calendar size={12}/>
                          <span className="text-[9px] font-black uppercase">Fecha de Expiración</span>
                      </div>
                      <div className="text-white font-mono text-xs font-bold">
                          {new Date(Number(user.vipExpiry) * 1000).toLocaleString([], { day:'2-digit', month:'long', year:'numeric', hour:'2-digit', minute:'2-digit' })}
                      </div>
                  </div>
              </div>
          </div>
      )}

      {/* Sub Navigation */}
      <div className="flex gap-1 p-1 bg-slate-900 border border-slate-800 rounded-2xl overflow-x-auto scrollbar-hide">
          <button onClick={() => setActiveSubTab('WALLET')} className={`flex-1 min-w-[80px] py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeSubTab === 'WALLET' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500'}`}>Cartera</button>
          <button onClick={() => setActiveSubTab('NOTIFS')} className={`flex-1 min-w-[80px] py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all relative ${activeSubTab === 'NOTIFS' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500'}`}>
            Alertas
            {hasUnread && <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>}
          </button>
          <button onClick={() => setActiveSubTab('HISTORY')} className={`flex-1 min-w-[80px] py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeSubTab === 'HISTORY' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500'}`}>Historial</button>
          <button onClick={() => setActiveSubTab('SETTINGS')} className={`flex-1 min-w-[80px] py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeSubTab === 'SETTINGS' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500'}`}>Ajustes</button>
      </div>

      <div className="animate-in fade-in zoom-in-95 duration-300">
          {activeSubTab === 'WALLET' && (
              <div className="bg-slate-900 border border-slate-800 rounded-[40px] p-8 shadow-xl">
                <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                    <Send size={20} className="text-indigo-400"/> Transferencia Segura
                </h3>
                <form onSubmit={handleTransfer} className="space-y-5">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2 relative">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Destinatario</label>
                            <div className="relative">
                                <span className="absolute left-4 top-3.5 text-slate-500 font-bold">@</span>
                                <input 
                                    type="text" placeholder="nombre_usuario"
                                    autoComplete="off"
                                    className="w-full bg-slate-950 border border-slate-800 rounded-2xl pl-8 pr-4 py-4 text-white focus:border-indigo-500 outline-none transition-all shadow-inner"
                                    value={transferData.target}
                                    onChange={e => handleTargetChange(e.target.value)}
                                />
                            </div>
                            
                            {userSuggestions.length > 0 && (
                                <div className="absolute top-full left-0 right-0 mt-2 bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden z-50 animate-in fade-in zoom-in-95 origin-top">
                                    {userSuggestions.map(s => (
                                        <button 
                                            key={s.username} type="button"
                                            onClick={() => { setTransferData({...transferData, target: s.username}); setUserSuggestions([]); }}
                                            className="w-full p-3 flex items-center gap-3 hover:bg-indigo-600 transition-colors border-b border-white/5 last:border-0"
                                        >
                                            <div className="w-8 h-8 rounded-full overflow-hidden bg-slate-900 shrink-0">
                                                {s.avatarUrl ? <img src={s.avatarUrl} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-[10px] font-bold text-white/20">{s.username?.[0] || '?'}</div>}
                                            </div>
                                            <span className="text-sm font-bold text-white">@{s.username}</span>
                                            <UserCheck size={14} className="ml-auto opacity-30"/>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Monto $</label>
                            <input 
                                type="number" placeholder="0.00"
                                className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-4 py-4 text-white text-2xl font-black focus:border-indigo-500 outline-none transition-all shadow-inner"
                                value={transferData.amount}
                                onChange={e => setTransferData({...transferData, amount: e.target.value})}
                            />
                        </div>
                    </div>
                    <button type="submit" disabled={loading || !transferData.amount || !transferData.target} className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 text-white font-black py-5 rounded-2xl shadow-xl transition-all active:scale-95 flex items-center justify-center gap-2">
                        {loading ? <Loader2 className="animate-spin" /> : <Shield size={18}/>}
                        Confirmar Envío
                    </button>
                </form>
              </div>
          )}

          {activeSubTab === 'NOTIFS' && (
              <div className="bg-slate-900 border border-slate-800 rounded-[40px] p-8 shadow-xl flex flex-col min-h-[500px]">
                <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                    <Bell size={20} className="text-indigo-400"/> Bandeja de Entrada
                </h3>
                <div className="flex-1 space-y-3">
                    {notifications.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 text-slate-600 opacity-50">
                            <MessageSquare size={48} className="mb-4" />
                            <p className="text-sm font-black uppercase">Sin mensajes nuevos</p>
                        </div>
                    ) : notifications.map(n => {
                        const isRead = Number(n.isRead) === 1;
                        return (
                            <div 
                                key={n.id} 
                                onClick={() => markNotifRead(n)}
                                className={`p-4 rounded-2xl border transition-all cursor-pointer flex gap-4 items-start ${!isRead ? 'bg-indigo-500/10 border-indigo-500/30 shadow-lg shadow-indigo-500/5' : 'bg-slate-950/40 border-white/5 grayscale opacity-60 hover:grayscale-0 hover:opacity-100'}`}
                            >
                                <div className="w-12 h-12 rounded-xl bg-slate-800 shrink-0 overflow-hidden border border-white/10">
                                    {n.avatarUrl ? <img src={n.avatarUrl} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center"><Bell size={18} className="text-slate-500"/></div>}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex justify-between items-start mb-1">
                                        <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">{n.type}</span>
                                        <span className="text-[9px] text-slate-600 font-bold">{new Date(n.timestamp * 1000).toLocaleDateString()}</span>
                                    </div>
                                    <p className={`text-sm leading-snug ${!isRead ? 'text-white font-bold' : 'text-slate-400'}`}>{n.text}</p>
                                </div>
                                {!isRead && <div className="w-2 h-2 bg-indigo-500 rounded-full mt-2 animate-pulse"></div>}
                            </div>
                        );
                    })}
                </div>
              </div>
          )}

          {activeSubTab === 'HISTORY' && (
              <div className="bg-slate-900 border border-slate-800 rounded-[40px] p-8 shadow-xl flex flex-col h-[500px]">
                <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                    <History size={20} className="text-indigo-400"/> Actividad Reciente
                </h3>
                <div className="flex-1 overflow-y-auto space-y-4 custom-scrollbar pr-2">
                    {txHistory.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-slate-600 opacity-50">
                            <History size={48} className="mb-4" />
                            <p className="text-sm font-bold uppercase tracking-tighter">Sin movimientos</p>
                        </div>
                    ) : txHistory.map(tx => {
                        const isRecv = tx.type === 'TRANSFER_RECV' || tx.type === 'DEPOSIT' || tx.creatorId === user.id;
                        return (
                            <div key={tx.id} className="flex items-center justify-between p-4 bg-slate-950/50 rounded-2xl border border-white/5 hover:bg-slate-800/50 transition-colors">
                                <div className="flex items-center gap-4">
                                    <div className={`p-2.5 rounded-xl ${isRecv ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'}`}>
                                        {isRecv ? <ArrowDownLeft size={20}/> : <ArrowUpRight size={20}/>}
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-xs font-black text-white uppercase truncate">
                                            {tx.type === 'TRANSFER_SENT' ? `A @${tx.recipientName}` : (tx.type === 'TRANSFER_RECV' ? `DE @${tx.senderName}` : tx.type)}
                                        </p>
                                        <p className="text-[10px] text-slate-500 font-medium">{new Date(tx.timestamp * 1000).toLocaleDateString()}</p>
                                    </div>
                                </div>
                                <div className={`text-sm font-black whitespace-nowrap ${isRecv ? 'text-emerald-400' : 'text-red-400'}`}>
                                    {isRecv ? '+' : '-'}{Number(tx.amount).toFixed(2)}
                                </div>
                            </div>
                        );
                    })}
                </div>
              </div>
          )}

          {activeSubTab === 'SETTINGS' && (
              <div className="space-y-6">
                  {/* Perfil & Avatar */}
                  <div className="bg-slate-900 border border-slate-800 rounded-[40px] p-8 shadow-xl">
                      <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2"><Camera size={20} className="text-indigo-400"/> Identidad Visual</h3>
                      <div className="flex flex-col items-center gap-6">
                         <div className="relative group">
                            <div className="w-32 h-32 rounded-full border-4 border-indigo-500/30 overflow-hidden bg-slate-950 shadow-2xl relative">
                                {avatarPreview ? <img src={avatarPreview} className="w-full h-full object-cover" /> : null}
                                <label className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center cursor-pointer">
                                    <Camera size={32} className="text-white mb-1"/>
                                    <span className="text-[10px] font-black text-white uppercase">Cambiar</span>
                                    <input type="file" accept="image/*" onChange={onAvatarFileChange} className="hidden" />
                                </label>
                            </div>
                         </div>
                         <p className="text-center text-xs text-slate-500 italic max-w-xs">Tu avatar es tu carta de presentación en el Marketplace y la Comunidad.</p>
                      </div>
                  </div>

                  <div className="bg-slate-900 border border-slate-800 rounded-[40px] p-8 shadow-xl">
                      <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2"><Lock size={20} className="text-red-400"/> Seguridad de la Cuenta</h3>
                      <div className="space-y-4">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="relative">
                                <input 
                                    type={showPass ? 'text' : 'password'} placeholder="Nueva Contraseña"
                                    className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-4 py-3 text-white focus:border-indigo-500 outline-none"
                                    value={settings.newPassword}
                                    onChange={e => setSettings({...settings, newPassword: e.target.value})}
                                />
                                <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-4 top-3.5 text-slate-600">{showPass ? <EyeOff size={18}/> : <Eye size={18}/>}</button>
                            </div>
                            <input 
                                type={showPass ? 'text' : 'password'} placeholder="Confirmar Nueva Contraseña"
                                className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-4 py-3 text-white focus:border-indigo-500 outline-none"
                                value={settings.confirmPassword}
                                onChange={e => setSettings({...settings, confirmPassword: e.target.value})}
                            />
                          </div>
                          {settings.newPassword && settings.newPassword.length < 6 && <p className="text-[10px] text-amber-500 font-bold uppercase tracking-wider">Mínimo 6 caracteres sugeridos</p>}
                      </div>
                  </div>
                  
                  <div className="bg-slate-900 border border-slate-800 rounded-[40px] p-8 shadow-xl space-y-8">
                      <div className="flex justify-between items-center">
                          <div>
                              <h4 className="text-sm font-black text-white uppercase flex items-center gap-2"><Zap size={14} className="text-amber-400"/> Auto-Desbloqueo</h4>
                              <p className="text-[10px] text-slate-500 font-bold uppercase mt-1">Presupuesto por episodio de serie</p>
                          </div>
                          <span className="text-xl font-black text-indigo-400">{settings.autoPurchaseLimit} $</span>
                      </div>
                      <input 
                        type="range" min="0" max="10" step="0.5" 
                        value={settings.autoPurchaseLimit} 
                        onChange={e => setSettings({...settings, autoPurchaseLimit: parseFloat(e.target.value)})}
                        className="w-full accent-indigo-500 h-1.5 bg-slate-800 rounded-full appearance-none cursor-pointer"
                      />
                  </div>

                  <button 
                    onClick={handleSaveSettings} 
                    disabled={loading}
                    className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-black py-5 rounded-[24px] shadow-2xl transition-all flex items-center justify-center gap-2 active:scale-95"
                  >
                      {loading ? <Loader2 className="animate-spin" /> : <Save size={20}/>}
                      Sincronizar y Guardar Cambios
                  </button>
              </div>
          )}
      </div>

      {/* Seller Verification Modal */}
      {showVerificationModal && (
          <div className="fixed inset-0 z-[200] bg-black/95 backdrop-blur-xl flex items-center justify-center p-4 animate-in fade-in">
              <div className="bg-slate-900 border border-white/10 w-full max-w-lg rounded-[40px] shadow-2xl overflow-hidden animate-in zoom-in-95">
                  <div className="p-8 bg-slate-950 border-b border-white/5 flex justify-between items-center">
                      <div className="flex items-center gap-4">
                          <div className="p-3 rounded-2xl bg-indigo-600 text-white shadow-lg">
                              <Fingerprint size={24}/>
                          </div>
                          <div>
                              <h3 className="font-black text-white uppercase text-sm tracking-widest leading-none">Validación de Identidad</h3>
                              <p className="text-[10px] text-indigo-400 font-bold uppercase mt-1">Auditoría para Vendedores</p>
                          </div>
                      </div>
                      <button onClick={() => setShowVerificationModal(false)} className="p-2.5 bg-slate-800 text-slate-500 hover:text-white rounded-2xl transition-all"><X/></button>
                  </div>

                  <form onSubmit={handleVerificationSubmit} className="p-8 space-y-5">
                      <div className="bg-amber-500/10 border border-amber-500/20 p-4 rounded-2xl flex gap-3 mb-2">
                          <AlertTriangle size={18} className="text-amber-500 shrink-0"/>
                          <p className="text-[9px] text-amber-200 font-bold uppercase leading-relaxed">Estos datos son confidenciales y solo serán visibles para la administración para asegurar la legitimidad de tus ventas.</p>
                      </div>

                      <div className="space-y-1">
                          <label className="text-[10px] font-black text-slate-500 uppercase ml-1">Nombre Completo (Real)</label>
                          <div className="relative">
                              <UserIcon size={16} className="absolute left-4 top-3.5 text-slate-600"/>
                              <input required type="text" value={verificationForm.fullName} onChange={e => setVerificationForm({...verificationForm, fullName: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-2xl pl-12 pr-4 py-4 text-white text-sm focus:border-indigo-500 outline-none transition-all" placeholder="Juan Pérez Pérez" />
                          </div>
                      </div>

                      <div className="space-y-1">
                          <label className="text-[10px] font-black text-slate-500 uppercase ml-1">Carnet de Identidad / Pasaporte</label>
                          <div className="relative">
                              <Shield size={16} className="absolute left-4 top-3.5 text-slate-600"/>
                              <input required type="text" value={verificationForm.idNumber} onChange={e => setVerificationForm({...verificationForm, idNumber: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-2xl pl-12 pr-4 py-4 text-white text-sm focus:border-indigo-500 outline-none transition-all" placeholder="ID Nacional" />
                          </div>
                      </div>

                      <div className="space-y-1">
                          <label className="text-[10px] font-black text-slate-500 uppercase ml-1">Dirección de Residencia</label>
                          <div className="relative">
                              <MapPin size={16} className="absolute left-4 top-3.5 text-slate-600"/>
                              <input required type="text" value={verificationForm.address} onChange={e => setVerificationForm({...verificationForm, address: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-2xl pl-12 pr-4 py-4 text-white text-sm focus:border-indigo-500 outline-none transition-all" placeholder="Calle, ciudad..." />
                          </div>
                      </div>

                      <div className="space-y-1">
                          <label className="text-[10px] font-black text-slate-500 uppercase ml-1">Número Móvil de Contacto</label>
                          <div className="relative">
                              <PhoneIcon size={16} className="absolute left-4 top-3.5 text-slate-600"/>
                              <input required type="tel" value={verificationForm.mobile} onChange={e => setVerificationForm({...verificationForm, mobile: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-2xl pl-12 pr-4 py-4 text-white text-sm focus:border-indigo-500 outline-none transition-all" placeholder="+53..." />
                          </div>
                      </div>

                      <button type="submit" disabled={loading} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-black py-5 rounded-[24px] shadow-2xl transition-all flex items-center justify-center gap-3 uppercase text-xs tracking-widest active:scale-95">
                          {loading ? <Loader2 className="animate-spin" size={20}/> : <ShieldCheck size={20}/>}
                          Enviar para Aprobación
                      </button>
                  </form>
              </div>
          </div>
      )}

      <div className="flex flex-col md:flex-row gap-4 pt-6 border-t border-slate-800/50">
          <button onClick={logout} className="flex-1 bg-red-950/20 hover:bg-red-950/40 text-red-400 font-bold py-4 rounded-2xl border border-red-900/30 flex items-center justify-center gap-2 transition-all">
              <LogOut size={20}/> Cerrar Sesión Segura
          </button>
          <div className="flex-1 bg-slate-900 p-4 rounded-2xl flex items-center justify-between border border-slate-800">
                <div className="flex items-center gap-3">
                    <Smartphone size={20} className="text-slate-500"/>
                    <div>
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Dispositivo</p>
                        <p className="text-[10px] font-mono text-slate-400">{user.lastDeviceId || 'Desconocido'}</p>
                    </div>
                </div>
                <Shield size={20} className="text-emerald-500"/>
          </div>
      </div>
    </div>
  );
}
