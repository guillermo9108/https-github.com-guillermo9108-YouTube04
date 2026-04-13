import React, { useState } from 'react';
import {
    ChevronLeft, User, Bell, Crown, ShieldCheck, LogOut, Settings,
    Home, Play, Clock, ShoppingBag, Folder, Search, Tag,
    TrendingUp, History, Heart, Share2, Download, HelpCircle,
    Moon, Sun, Globe, Smartphone, Monitor, Languages,
    CheckCircle2, AlertCircle, DollarSign, CreditCard, LucideIcon,
    ArrowLeft, ArrowLeftRight, ChevronDown, BarChart3, MessageCircle,
    Users, PlaySquare, Flag, Bookmark, Gift, Calendar, List, UserPlus,
    ChevronRight, Menu as MenuIcon
} from 'lucide-react';
import { useNavigate, Link } from '../Router';
import { useAuth } from '../../context/AuthContext';
import { useSettings } from '../../context/SettingsContext';
import { useNotifications } from '../../context/NotificationContext';

interface GridMenuItem {
    icon: LucideIcon;
    label: string;
    path?: string;
    action?: () => void;
    iconColor: string;
    badge?: number | string | null;
}

export default function MenuPage() {
    const navigate = useNavigate();
    const { user, logout } = useAuth();
    const { settings } = useSettings();
    const { unreadCount } = useNotifications();
    const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

    const isAdmin = user?.role?.trim().toUpperCase() === 'ADMIN';
    const isVip = !!(user?.vipExpiry && user.vipExpiry > Date.now() / 1000);

    const gridItems: GridMenuItem[] = [
        { icon: BarChart3, label: 'Panel Admin', path: '/admin', iconColor: 'text-blue-500', badge: isAdmin ? '!' : null },
        { icon: MessageCircle, label: 'Mensajes', path: '/messages', iconColor: 'text-pink-500' },
        { icon: Users, label: 'Grupos', path: '/folders', iconColor: 'text-blue-400' },
        { icon: User, label: 'Amigos', path: '/friends', iconColor: 'text-blue-500' },
        { icon: PlaySquare, label: 'Shorts', path: '/shorts', iconColor: 'text-red-500' },
        { icon: Flag, label: 'Mi Canal', path: `/channel/${user?.id}`, iconColor: 'text-orange-500' },
        { icon: Bookmark, label: 'Guardados', path: '/watch-later', iconColor: 'text-purple-500' },
        { icon: Gift, label: 'Marketplace', path: '/marketplace', iconColor: 'text-blue-400' },
        { icon: Calendar, label: 'Categorías', path: '/categories', iconColor: 'text-red-400' },
        { icon: CheckCircle2, label: 'VIP Status', path: '/vip', iconColor: 'text-blue-500', badge: isVip ? '✓' : null },
        { icon: List, label: 'Tendencias', path: '/?sort=trending', iconColor: 'text-orange-400' },
        { icon: Smartphone, label: 'Recargar', path: '/recharge', iconColor: 'text-pink-500' },
        { icon: History, label: 'Historial', path: '/history', iconColor: 'text-blue-400' },
    ];

    // Filter grid items (e.g. only show admin panel to admins)
    const filteredGridItems = gridItems.filter(item => {
        if (item.label === 'Panel Admin' && !isAdmin) return false;
        return true;
    });

    const handleLogout = () => {
        logout();
        navigate('/');
    };

    return (
        <div className="min-h-screen bg-[#1c1e21] text-[#e4e6eb] pb-10">
            {/* Header */}
            <header className="sticky top-0 z-50 bg-[#1c1e21] flex items-center justify-between px-4 h-14 border-b border-[#3e4042]">
                <div className="flex items-center gap-4">
                    <button onClick={() => navigate(-1)} className="text-[#e4e6eb]">
                        <ArrowLeft size={24} />
                    </button>
                    <h1 className="text-xl font-bold">Menú</h1>
                </div>
                <div className="flex items-center gap-2">
                    <button className="w-10 h-10 flex items-center justify-center bg-[#3a3b3c] rounded-full">
                        <ArrowLeftRight size={20} />
                    </button>
                    <button onClick={() => navigate('/search')} className="w-10 h-10 flex items-center justify-center bg-[#3a3b3c] rounded-full">
                        <Search size={20} />
                    </button>
                </div>
            </header>

            <div className="max-w-md mx-auto px-3 pt-3 space-y-3">
                {/* Profile Card */}
                <button 
                    onClick={() => navigate('/profile')}
                    className="w-full bg-[#242526] rounded-xl p-3 flex items-center gap-3 hover:bg-[#3a3b3c] transition-colors text-left"
                >
                    <div className="w-12 h-12 rounded-full overflow-hidden bg-[#3a3b3c] shrink-0">
                        {user?.avatarUrl ? (
                            <img src={user.avatarUrl} className="w-full h-full object-cover" alt={user.username} referrerPolicy="no-referrer" />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center text-lg font-bold text-white">
                                {user?.username?.[0]?.toUpperCase() || '?'}
                            </div>
                        )}
                    </div>
                    <div className="flex-1 min-w-0">
                        <h2 className="text-base font-bold truncate">{user?.username || 'Usuario'}</h2>
                        <p className="text-sm text-[#b0b3b8]">Ver tu perfil</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full overflow-hidden bg-[#3a3b3c] border-2 border-[#242526]">
                             {/* Small avatar placeholder for switch account style */}
                             <div className="w-full h-full flex items-center justify-center bg-indigo-600">
                                <User size={14} />
                             </div>
                        </div>
                        <div className="w-8 h-8 flex items-center justify-center bg-[#3a3b3c] rounded-full">
                            <ChevronDown size={20} />
                        </div>
                    </div>
                </button>

                {/* Invite Friends Card */}
                <button className="w-full bg-[#242526] rounded-xl p-4 flex items-center gap-3 hover:bg-[#3a3b3c] transition-colors text-left">
                    <div className="w-10 h-10 flex items-center justify-center">
                        <Heart size={28} className="text-pink-500 fill-pink-500" />
                    </div>
                    <span className="text-base font-medium">Invitar amigos</span>
                </button>

                {/* Grid Menu */}
                <div className="grid grid-cols-2 gap-2">
                    {filteredGridItems.map((item, idx) => (
                        <button
                            key={idx}
                            onClick={() => item.path && navigate(item.path)}
                            className="bg-[#242526] rounded-xl p-3 flex flex-col items-start gap-2 hover:bg-[#3a3b3c] transition-colors text-left relative h-24"
                        >
                            <item.icon size={24} className={item.iconColor} />
                            <span className="text-sm font-medium leading-tight">{item.label}</span>
                            {item.badge && (
                                <span className="absolute top-2 right-2 bg-[#f02849] text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                                    {item.badge}
                                </span>
                            )}
                        </button>
                    ))}
                </div>

                {/* Bottom List */}
                <div className="pt-2 border-t border-[#3e4042] space-y-1">
                    <button 
                        onClick={() => navigate('/settings')}
                        className="w-full flex items-center gap-3 p-3 hover:bg-[#3a3b3c] rounded-lg transition-colors text-left"
                    >
                        <div className="w-9 h-9 flex items-center justify-center bg-[#3a3b3c] rounded-full">
                            <Settings size={22} className="text-[#b0b3b8]" />
                        </div>
                        <span className="flex-1 text-base font-medium">Configuración y privacidad</span>
                        <ChevronDown size={20} className="text-[#b0b3b8]" />
                    </button>

                    <button 
                        onClick={() => navigate('/help')}
                        className="w-full flex items-center gap-3 p-3 hover:bg-[#3a3b3c] rounded-lg transition-colors text-left"
                    >
                        <div className="w-9 h-9 flex items-center justify-center bg-[#3a3b3c] rounded-full">
                            <HelpCircle size={22} className="text-[#b0b3b8]" />
                        </div>
                        <span className="flex-1 text-base font-medium">Ayuda y soporte</span>
                        <ChevronDown size={20} className="text-[#b0b3b8]" />
                    </button>

                    <button 
                        onClick={() => navigate('/recharge')}
                        className="w-full flex items-center gap-3 p-3 hover:bg-[#3a3b3c] rounded-lg transition-colors text-left"
                    >
                        <div className="w-9 h-9 flex items-center justify-center bg-[#3a3b3c] rounded-full">
                            <UserPlus size={22} className="text-[#b0b3b8]" />
                        </div>
                        <span className="flex-1 text-base font-medium">Agregar cuenta</span>
                    </button>

                    <button 
                        onClick={() => setShowLogoutConfirm(true)}
                        className="w-full flex items-center gap-3 p-3 hover:bg-[#3a3b3c] rounded-lg transition-colors text-left"
                    >
                        <div className="w-9 h-9 flex items-center justify-center bg-[#3a3b3c] rounded-full">
                            <LogOut size={22} className="text-[#b0b3b8]" />
                        </div>
                        <span className="flex-1 text-base font-medium">Cerrar sesión</span>
                    </button>
                </div>
            </div>

            {/* Logout Confirmation Modal */}
            {showLogoutConfirm && (
                <div className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
                    <div className="bg-[#242526] border border-[#3e4042] rounded-2xl w-full max-w-xs overflow-hidden shadow-2xl animate-in zoom-in-95 p-6 text-center">
                        <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                            <LogOut size={32} className="text-red-500" />
                        </div>
                        <h3 className="text-lg font-bold text-white mb-2">¿Cerrar sesión?</h3>
                        <p className="text-sm text-[#b0b3b8] mb-6">¿Estás seguro de que quieres salir de tu cuenta?</p>
                        <div className="flex flex-col gap-2">
                            <button 
                                onClick={handleLogout}
                                className="w-full py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg transition-colors"
                            >
                                Sí, cerrar sesión
                            </button>
                            <button 
                                onClick={() => setShowLogoutConfirm(false)}
                                className="w-full py-2.5 bg-[#3a3b3c] hover:bg-[#4e4f50] text-white font-bold rounded-lg transition-colors"
                            >
                                Cancelar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
