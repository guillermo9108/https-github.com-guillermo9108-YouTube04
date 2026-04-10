import React from 'react';
import { X, Home as HomeIcon, User as UserIcon, Bell, Crown, ShieldCheck, LogOut, Play } from 'lucide-react';
import { useNavigate } from '../Router';
import { User } from '../../types';
import { useNotifications } from '../../context/NotificationContext';

interface SidebarProps {
    isOpen: boolean;
    onClose: () => void;
    user: User | null;
    isAdmin: boolean;
    logout: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose, user, isAdmin, logout }) => {
    const navigate = useNavigate();
    const { unreadCount, markAsRead } = useNotifications();
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 z-[100] animate-in fade-in duration-300">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose}></div>
            <div className="absolute top-0 left-0 bottom-0 w-[280px] bg-[#242526] border-r border-white/5 shadow-2xl flex flex-col animate-in slide-in-from-left duration-500">
                <div className="p-6 bg-[#18191a] border-b border-white/5 relative">
                    <button onClick={onClose} className="absolute top-4 right-4 text-[#b0b3b8] hover:text-white"><X size={20}/></button>
                    <div className="flex items-center gap-4 mb-6">
                        <div className="w-14 h-14 rounded-full bg-[#1877f2] border-2 border-white/10 overflow-hidden shadow-lg">
                            {user?.avatarUrl ? <img src={user.avatarUrl} className="w-full h-full object-cover" referrerPolicy="no-referrer" /> : <div className="w-full h-full flex items-center justify-center font-bold text-white text-xl">{user?.username?.[0] || '?'}</div>}
                        </div>
                        <div className="min-w-0">
                            <div className="font-bold text-[#e4e6eb] truncate">@{user?.username || 'Usuario'}</div>
                            <div className="text-xs text-[#b0b3b8]">{user?.role}</div>
                        </div>
                    </div>
                    <div className="bg-white/5 rounded-xl p-4 border border-white/5">
                        <p className="text-xs text-[#b0b3b8] mb-1">Tu Saldo</p>
                        <div className="text-xl font-bold text-[#31a24c]">{Number(user?.balance || 0).toFixed(2)} $</div>
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
                    <button onClick={() => { navigate('/'); onClose(); }} className="w-full flex items-center gap-4 p-3 rounded-xl hover:bg-[#3a3b3c] text-[#e4e6eb] transition-all group">
                        <HomeIcon size={20} className="text-[#b0b3b8] group-hover:text-[#1877f2]"/>
                        <span className="text-sm font-medium">Inicio</span>
                    </button>
                    <button onClick={() => { navigate('/profile'); onClose(); }} className="w-full flex items-center gap-4 p-3 rounded-xl hover:bg-[#3a3b3c] text-[#e4e6eb] transition-all group">
                        <UserIcon size={20} className="text-[#b0b3b8] group-hover:text-[#1877f2]"/>
                        <span className="text-sm font-medium">Mi Perfil</span>
                    </button>
                    <button onClick={() => { navigate(`/channel/${user?.id}`); onClose(); }} className="w-full flex items-center gap-4 p-3 rounded-xl hover:bg-[#3a3b3c] text-[#e4e6eb] transition-all group">
                        <Play size={20} className="text-[#b0b3b8] group-hover:text-[#1877f2]"/>
                        <span className="text-sm font-medium">Mi Canal</span>
                    </button>
                    <button onClick={() => { markAsRead(); onClose(); }} className="w-full flex items-center gap-4 p-3 rounded-xl hover:bg-[#3a3b3c] text-[#e4e6eb] transition-all group relative">
                        <Bell size={20} className="text-[#b0b3b8] group-hover:text-[#1877f2]"/>
                        <span className="text-sm font-medium">Notificaciones</span>
                        {unreadCount > 0 && (
                            <span className="absolute right-4 top-1/2 -translate-y-1/2 bg-[#e41e3f] text-white text-xs font-bold px-2 py-1 rounded-full min-w-[20px] text-center shadow-lg">
                                {unreadCount}
                            </span>
                        )}
                    </button>
                    <button onClick={() => { navigate('/watch-later'); onClose(); }} className="w-full flex items-center gap-4 p-3 rounded-xl hover:bg-[#3a3b3c] text-[#e4e6eb] transition-all group">
                        <Bell size={20} className="text-[#b0b3b8] group-hover:text-[#1877f2]"/>
                        <span className="text-sm font-medium">Ver más tarde</span>
                    </button>
                    <button onClick={() => { navigate('/vip'); onClose(); }} className="w-full flex items-center gap-4 p-3 rounded-xl hover:bg-[#3a3b3c] text-[#e4e6eb] transition-all group">
                        <Crown size={20} className="text-[#b0b3b8] group-hover:text-amber-500"/>
                        <span className="text-sm font-medium">VIP & Recargas</span>
                    </button>
                    {isAdmin && (
                        <div className="pt-4 mt-4 border-t border-white/5">
                            <button onClick={() => { navigate('/admin'); onClose(); }} className="w-full flex items-center gap-4 p-3 rounded-xl bg-[#1877f2]/10 hover:bg-[#1877f2]/20 text-[#1877f2] transition-all border border-[#1877f2]/20">
                                <ShieldCheck size={20}/><span className="text-sm font-medium">Panel Admin</span>
                            </button>
                        </div>
                    )}
                </div>
                <div className="p-4 bg-[#18191a] border-t border-white/5">
                    <button onClick={() => { logout(); onClose(); }} className="w-full flex items-center gap-4 p-3 rounded-xl text-[#e41e3f] hover:bg-[#e41e3f]/10 transition-all">
                        <LogOut size={20}/><span className="text-sm font-medium">Cerrar Sesión</span>
                    </button>
                </div>
            </div>
        </div>
    );
};

export default Sidebar;
