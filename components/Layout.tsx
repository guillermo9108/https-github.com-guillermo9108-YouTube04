import React, { useState, useEffect, useRef } from 'react';
import { Home, Upload, User, ShieldCheck, Smartphone, Bell, X, Menu, DownloadCloud, LogOut, ShoppingBag, Server, ChevronRight, Crown, Smartphone as MobileIcon, MonitorDown, AlertTriangle, CheckCircle2, Clock, ShoppingCart as SaleIcon, Zap, User as UserIcon, Search, Menu as MenuIcon } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useUpload } from '../context/UploadContext';
import { useCart } from '../context/CartContext';
import { useServerTask } from '../context/ServerTaskContext';
import { useSettings } from '../context/SettingsContext';
import { Link, useLocation, Outlet, useNavigate } from './Router';
import { db } from '../services/db';
import { Notification as AppNotification } from '../types';
import GridProcessor from './GridProcessor';

const UploadIndicator = () => {
  const { isUploading, progress, currentFileIndex, totalFiles, uploadSpeed } = useUpload();
  if (!isUploading) return null;
  const radius = 18;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (progress / 100) * circumference;
  return (
    <div className="fixed bottom-24 md:bottom-8 right-4 z-[40] bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-3 flex items-center gap-3 animate-in slide-in-from-bottom-6">
       <div className="relative w-12 h-12 flex items-center justify-center">
          <svg className="transform -rotate-90 w-12 h-12"><circle className="text-slate-700" strokeWidth="4" stroke="currentColor" fill="transparent" r={radius} cx="24" cy="24" /><circle className="text-indigo-500 transition-all duration-300 ease-in-out" strokeWidth="4" strokeDasharray={circumference} strokeDashoffset={strokeDashoffset} strokeLinecap="round" stroke="currentColor" fill="transparent" r={radius} cx="24" cy="24" /></svg>
          <span className="absolute text-[10px] font-bold text-white">{Math.round(progress)}%</span>
       </div>
       <div className="flex flex-col min-w-[100px]"><span className="text-xs font-bold text-white">Subiendo...</span><span className="text-[10px] text-slate-400">Archivo {currentFileIndex} de {totalFiles}</span><span className="text-[10px] text-indigo-400 font-mono">{uploadSpeed}</span></div>
    </div>
  );
};

const ServerTaskIndicator = () => {
    const { isScanning, progress, currentFile } = useServerTask();
    const navigate = useNavigate();
    if (!isScanning) return null;
    return (
        <div onClick={() => navigate('/admin')} className="fixed bottom-24 md:bottom-28 right-4 z-[40] bg-slate-900 border border-emerald-900/50 rounded-2xl shadow-2xl p-3 flex items-center gap-3 animate-in slide-in-from-bottom-6 cursor-pointer hover:bg-slate-800 transition-colors">
            <div className="relative w-12 h-12 flex items-center justify-center bg-emerald-900/20 rounded-full"><Server size={24} className="text-emerald-500 animate-pulse" /></div>
            <div className="flex flex-col min-w-[120px]"><span className="text-xs font-bold text-white flex items-center gap-1">Escaneando NAS...</span><span className="text-[10px] text-slate-400 truncate max-w-[120px]">{currentFile || 'Iniciando...'}</span><div className="w-full h-1.5 bg-slate-800 rounded-full mt-1 overflow-hidden"><div className="h-full bg-emerald-500 transition-all duration-500" style={{ width: `${progress.percent}%` }}></div></div><span className="text-[9px] text-emerald-400 mt-0.5 text-right">{progress.current} / {progress.total}</span></div>
        </div>
    );
};

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { settings } = useSettings();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!user) return;
    
    const checkNotifs = async () => {
        try {
            const res = await db.getUnreadCount(user.id);
            setUnreadCount(res.count);
        } catch(e) {}
    };

    checkNotifs();
    const interval = setInterval(checkNotifs, 60000); // Check every minute
    return () => clearInterval(interval);
  }, [user]);

  // Reset scroll automatically when changing sections
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);
  
  const isActive = (path: string) => location.pathname === path ? 'text-indigo-400' : 'text-slate-400 hover:text-indigo-200';
  const isShortsMode = location.pathname === '/shorts';
  const isWatchMode = location.pathname.startsWith('/watch/');
  
  if (isShortsMode) {
      return (
          <div className="fixed inset-0 bg-black overflow-hidden">
              <Outlet />
          </div>
      );
  }

  const Avatar = ({ size=24, className='' }: any) => (
      <div className={`rounded-full overflow-hidden bg-indigo-600 flex items-center justify-center shrink-0 ${className}`} style={{width: size, height: size}}>
        {user?.avatarUrl || settings?.defaultAvatar ? <img src={user?.avatarUrl || settings?.defaultAvatar} className="w-full h-full object-cover" /> : <span className="text-white font-bold uppercase" style={{fontSize: size*0.4}}>{user?.username?.[0] || '?'}</span>}
      </div>
  );

  return (
    <div className={`min-h-screen flex flex-col bg-black pt-[104px]`}>
      {/* Facebook Lite Style Header */}
      <header className="fixed top-0 left-0 right-0 bg-slate-900 z-50 border-b border-white/5 shadow-lg">
        {/* Top Bar: Logo & Actions */}
        <div className="flex items-center justify-between px-4 py-2">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-600/20">
              <Zap size={20} className="text-white fill-white" />
            </div>
            <span className="text-xl font-black italic tracking-tighter text-white">
              STREAM<span className="text-indigo-500">PAY</span>
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <button onClick={() => navigate('/search')} className="p-2 bg-white/5 rounded-full text-slate-300 hover:bg-white/10 transition-colors">
              <Search size={20} />
            </button>
            <button onClick={() => navigate('/notifications')} className="p-2 bg-white/5 rounded-full text-slate-300 hover:bg-white/10 transition-colors relative">
              <Bell size={20} />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 border-2 border-slate-900 rounded-full flex items-center justify-center text-[8px] font-black text-white">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
            <button onClick={() => navigate('/profile')} className="p-1 bg-white/5 rounded-full text-slate-300 hover:bg-white/10 transition-colors">
              <Avatar size={28} />
            </button>
          </div>
        </div>

        {/* Tab Bar: Navigation */}
        <nav className="flex items-center justify-around border-t border-white/5">
          <Link to="/" className={`flex-1 flex flex-col items-center py-3 border-b-2 transition-all ${location.pathname === '/' ? 'border-indigo-500 text-indigo-500' : 'border-transparent text-slate-500'}`}>
            <Home size={24} />
          </Link>
          <Link to="/shorts" className={`flex-1 flex flex-col items-center py-3 border-b-2 transition-all ${location.pathname === '/shorts' ? 'border-indigo-500 text-indigo-500' : 'border-transparent text-slate-500'}`}>
            <Smartphone size={24} />
          </Link>
          <Link to="/upload" className={`flex-1 flex flex-col items-center py-3 border-b-2 transition-all ${location.pathname === '/upload' ? 'border-indigo-500 text-indigo-500' : 'border-transparent text-slate-500'}`}>
            <Upload size={24} />
          </Link>
          <Link to="/marketplace" className={`flex-1 flex flex-col items-center py-3 border-b-2 transition-all ${location.pathname === '/marketplace' ? 'border-indigo-500 text-indigo-500' : 'border-transparent text-slate-500'}`}>
            <ShoppingBag size={24} />
          </Link>
          <Link to="/menu" className={`flex-1 flex flex-col items-center py-3 border-b-2 transition-all ${location.pathname === '/menu' ? 'border-indigo-500 text-indigo-500' : 'border-transparent text-slate-500'}`}>
            <MenuIcon size={24} />
          </Link>
        </nav>
      </header>

      {/* Container removed or made fluid for Watch mode to allow full-width player and proper sticky behavior */}
      <main className={`flex-1 ${isWatchMode ? 'w-full' : 'container mx-auto px-4 max-w-5xl'}`}>
        <Outlet />
      </main>

      <UploadIndicator />
      <ServerTaskIndicator />
      <GridProcessor />
    </div>
  );
}
