import React, { useState, useEffect, useRef } from 'react';
import { Home, Upload, User, ShieldCheck, Smartphone, Bell, X, Menu, DownloadCloud, LogOut, ShoppingBag, Server, ChevronRight, Crown, Smartphone as MobileIcon, MonitorDown, AlertTriangle, CheckCircle2, Clock, ShoppingCart as SaleIcon, Zap, User as UserIcon, Search, Menu as MenuIcon, Wallet } from 'lucide-react';
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
    <div className={`min-h-screen flex flex-col bg-[var(--bg-primary)] pt-[96px]`}>
      {/* Facebook Lite Style Header */}
      <header className="fixed top-0 left-0 right-0 bg-[var(--bg-secondary)] z-50 border-b border-[var(--divider)] shadow-sm">
        {/* Top Bar: Logo & Actions */}
        <div className="flex items-center justify-between px-3 py-1.5">
          <Link to="/" className="flex items-center gap-1.5">
            <div className="w-7 h-7 bg-[#1877f2] rounded flex items-center justify-center">
              <Zap size={18} className="text-white fill-white" />
            </div>
            <span className="text-lg font-bold tracking-tight text-[#1877f2]">
              streampay
            </span>
          </Link>
          <div className="flex items-center gap-1">
            <button onClick={() => navigate('/search')} className="p-2 text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] rounded-full transition-colors">
              <Search size={20} />
            </button>
            <button onClick={() => navigate('/notifications')} className="p-2 text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] rounded-full transition-colors relative">
              <Bell size={20} />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 min-w-[16px] h-4 bg-red-600 border-2 border-[var(--bg-secondary)] rounded-full flex items-center justify-center text-[9px] font-bold text-white px-1">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
            <button onClick={() => navigate('/menu')} className="p-2 text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] rounded-full transition-colors">
              <MenuIcon size={20} />
            </button>
          </div>
        </div>

        {/* Tab Bar: Navigation */}
        <nav className="flex items-center justify-around">
          <Link to="/" className={`flex-1 flex flex-col items-center py-2.5 border-b-2 transition-all ${location.pathname === '/' ? 'border-[#1877f2] text-[#1877f2]' : 'border-transparent text-[var(--text-secondary)]'}`}>
            <Home size={22} />
          </Link>
          <Link to="/shorts" className={`flex-1 flex flex-col items-center py-2.5 border-b-2 transition-all ${location.pathname === '/shorts' ? 'border-[#1877f2] text-[#1877f2]' : 'border-transparent text-[var(--text-secondary)]'}`}>
            <Smartphone size={22} />
          </Link>
          <Link to="/upload" className={`flex-1 flex flex-col items-center py-2.5 border-b-2 transition-all ${location.pathname === '/upload' ? 'border-[#1877f2] text-[#1877f2]' : 'border-transparent text-[var(--text-secondary)]'}`}>
            <Upload size={22} />
          </Link>
          <Link to="/marketplace" className={`flex-1 flex flex-col items-center py-2.5 border-b-2 transition-all ${location.pathname === '/marketplace' ? 'border-[#1877f2] text-[#1877f2]' : 'border-transparent text-[var(--text-secondary)]'}`}>
            <ShoppingBag size={22} />
          </Link>
          <Link to="/wallet" className={`flex-1 flex flex-col items-center py-2.5 border-b-2 transition-all ${location.pathname === '/wallet' ? 'border-[#1877f2] text-[#1877f2]' : 'border-transparent text-[var(--text-secondary)]'}`}>
            <Wallet size={22} />
          </Link>
        </nav>
      </header>

      {/* Container removed or made fluid for Watch mode to allow full-width player and proper sticky behavior */}
      <main className={`flex-1 ${isWatchMode ? 'w-full' : 'w-full max-w-5xl mx-auto'}`}>
        <Outlet />
      </main>

      <UploadIndicator />
      <ServerTaskIndicator />
      <GridProcessor />
    </div>
  );
}
