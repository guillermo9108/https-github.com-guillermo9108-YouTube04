import React, { useState } from 'react';
import {
    ChevronLeft, User, Bell, Crown, ShieldCheck, LogOut, Settings,
    Home, Play, Clock, ShoppingBag, Folder, Search, Tag,
    TrendingUp, History, Heart, Share2, Download, HelpCircle,
    Moon, Sun, Globe, Smartphone, Monitor, Languages,
    CheckCircle2, AlertCircle, DollarSign, CreditCard, LucideIcon
} from 'lucide-react';
import { useNavigate } from '../Router';
import { useAuth } from '../../context/AuthContext';
import { useSettings } from '../../context/SettingsContext';
import { useNotifications } from '../../context/NotificationContext';

interface MenuItem {
    icon: LucideIcon;
    label: string;
    path?: string;
    action?: () => void;
    color: string;
    badge?: number | string | null;
}

interface MenuSection {
    title: string;
    items: MenuItem[];
}

export default function MenuPage() {
    const navigate = useNavigate();
    const { user, logout } = useAuth();
    const { settings } = useSettings();
    const { unreadCount } = useNotifications();
    const [showSettings, setShowSettings] = useState(false);

    const isAdmin = user?.role?.trim().toUpperCase() === 'ADMIN';
    const isVip = !!(user?.vipExpiry && user.vipExpiry > Date.now() / 1000);

    const menuSections: MenuSection[] = [
        {
            title: 'Tu cuenta',
            items: [
                { icon: User, label: 'Mi Perfil', path: '/profile', color: 'text-[#1877f2]' },
                { icon: Play, label: 'Mi Canal', path: `/channel/${user?.id}`, color: 'text-[#1877f2]' },
                { icon: Bell, label: 'Notificaciones', path: '/notifications', badge: unreadCount, color: 'text-[#1877f2]' },
                { icon: Heart, label: 'Me gusta', path: '/liked', color: 'text-red-500' },
                { icon: Clock, label: 'Ver más tarde', path: '/watch-later', color: 'text-amber-500' },
                { icon: History, label: 'Historial', path: '/history', color: 'text-[#b0b3b8]' },
            ]
        },
        {
            title: 'Explorar',
            items: [
                { icon: Home, label: 'Inicio', path: '/', color: 'text-[#1877f2]' },
                { icon: TrendingUp, label: 'Tendencias', path: '/?sort=trending', color: 'text-red-500' },
                { icon: Tag, label: 'Categorías', path: '/?categories=all', color: 'text-green-500' },
                { icon: Folder, label: 'Carpetas', path: '/?folders=all', color: 'text-yellow-500' },
                { icon: Search, label: 'Buscar', path: '/?search=open', color: 'text-[#b0b3b8]' },
            ]
        },
        {
            title: 'Servicios',
            items: [
                { icon: ShoppingBag, label: 'Marketplace', path: '/marketplace', color: 'text-blue-500' },
                { icon: Crown, label: isVip ? 'VIP Activo' : 'Hazte VIP', path: '/vip', color: 'text-amber-500', badge: isVip ? '✓' : null },
                { icon: CreditCard, label: 'Recargar Saldo', path: '/recharge', color: 'text-green-500' },
                { icon: DollarSign, label: `Saldo: $${Number(user?.balance || 0).toFixed(2)}`, path: '/wallet', color: 'text-[#31a24c]' },
            ]
        },
        {
            title: 'Configuración y soporte',
            items: [
                { icon: Settings, label: 'Configuración', action: () => setShowSettings(!showSettings), color: 'text-[#b0b3b8]' },
                { icon: HelpCircle, label: 'Ayuda y soporte', path: '/help', color: 'text-[#b0b3b8]' },
                { icon: AlertCircle, label: 'Reportar problema', path: '/report', color: 'text-[#b0b3b8]' },
            ]
        },
    ];

    if (isAdmin) {
        menuSections.push({
            title: 'Administración',
            items: [
                { icon: ShieldCheck, label: 'Panel Admin', path: '/admin', color: 'text-[#1877f2]' },
            ]
        });
    }

    const handleNavigation = (item: MenuItem) => {
        if (item.action) {
            item.action();
        } else if (item.path) {
            navigate(item.path);
        }
    };

    const handleLogout = () => {
        if (confirm('¿Estás seguro de que quieres cerrar sesión?')) {
            logout();
            navigate('/');
        }
    };

    return (
        <div className="min-h-screen bg-[#18191a] pb-20">
            {/* Header */}
            <header className="sticky top-0 z-50 bg-[#242526] border-b border-white/5 shadow-lg">
                <div className="flex items-center justify-between px-4 h-14">
                    <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-[#e4e6eb] hover:text-white transition-colors">
                        <ChevronLeft size={24} />
                        <span className="font-semibold">Menú</span>
                    </button>
                    <button onClick={() => navigate('/search')} className="w-10 h-10 rounded-full bg-[#3a3b3c] flex items-center justify-center hover:bg-[#4e4f50] transition-colors">
                        <Search size={20} className="text-[#e4e6eb]" />
                    </button>
                </div>
            </header>

            {/* User Info Card */}
            <div className="bg-[#242526] border-b border-white/5 p-4">
                <div className="flex items-center gap-3">
                    <div className="w-16 h-16 rounded-full bg-[#1877f2] border-2 border-white/10 overflow-hidden">
                        {user?.avatarUrl ? (
                            <img src={user.avatarUrl} className="w-full h-full object-cover" alt={user.username} referrerPolicy="no-referrer" />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center text-2xl font-bold text-white">
                                {user?.username?.[0]?.toUpperCase() || '?'}
                            </div>
                        )}
                    </div>
                    <div className="flex-1">
                        <h2 className="text-lg font-bold text-[#e4e6eb]">{user?.username || 'Usuario'}</h2>
                        <p className="text-sm text-[#b0b3b8]">@{user?.username || 'usuario'}</p>
                        {isVip && (
                            <div className="flex items-center gap-1 mt-1">
                                <Crown size={14} className="text-amber-500" />
                                <span className="text-xs text-amber-500 font-semibold">Miembro VIP</span>
                            </div>
                        )}
                    </div>
                    <button
                        onClick={() => navigate('/profile')}
                        className="px-4 py-2 bg-[#3a3b3c] hover:bg-[#4e4f50] text-[#e4e6eb] rounded-lg text-sm font-semibold transition-colors"
                    >
                        Ver perfil
                    </button>
                </div>
            </div>

            {/* Menu Sections */}
            <div className="max-w-2xl mx-auto">
                {menuSections.map((section, sectionIndex) => (
                    <div key={sectionIndex} className="mt-6">
                        <h3 className="px-4 text-lg font-bold text-[#e4e6eb] mb-2">{section.title}</h3>
                        <div className="bg-[#242526] border-y border-white/5">
                            {section.items.map((item, itemIndex) => (
                                <button
                                    key={itemIndex}
                                    onClick={() => handleNavigation(item)}
                                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[#3a3b3c] transition-colors border-b border-white/5 last:border-b-0 group"
                                >
                                    <div className={`w-10 h-10 rounded-full bg-[#3a3b3c] group-hover:bg-[#4e4f50] flex items-center justify-center transition-colors`}>
                                        <item.icon size={20} className={item.color} />
                                    </div>
                                    <span className="flex-1 text-left text-[#e4e6eb] font-medium">{item.label}</span>
                                    {item.badge && (
                                        <span className="bg-[#e41e3f] text-white text-xs font-bold px-2 py-1 rounded-full min-w-[24px] text-center">
                                            {item.badge}
                                        </span>
                                    )}
                                </button>
                            ))}
                        </div>
                    </div>
                ))}

                {/* Settings Dropdown */}
                {showSettings && (
                    <div className="mt-4 bg-[#242526] border-y border-white/5 animate-in slide-in-from-top duration-300">
                        <h4 className="px-4 py-3 text-sm font-bold text-[#b0b3b8] border-b border-white/5">CONFIGURACIÓN RÁPIDA</h4>
                        <button className="w-full flex items-center justify-between px-4 py-3 hover:bg-[#3a3b3c] transition-colors border-b border-white/5">
                            <div className="flex items-center gap-3">
                                <Moon size={20} className="text-[#b0b3b8]" />
                                <span className="text-[#e4e6eb] font-medium">Modo oscuro</span>
                            </div>
                            <div className="w-12 h-6 bg-[#1877f2] rounded-full relative">
                                <div className="absolute right-1 top-1 w-4 h-4 bg-white rounded-full"></div>
                            </div>
                        </button>
                        <button className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[#3a3b3c] transition-colors border-b border-white/5">
                            <Languages size={20} className="text-[#b0b3b8]" />
                            <span className="text-[#e4e6eb] font-medium">Idioma: Español</span>
                        </button>
                        <button className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[#3a3b3c] transition-colors">
                            <Monitor size={20} className="text-[#b0b3b8]" />
                            <span className="text-[#e4e6eb] font-medium">Calidad de video: Auto</span>
                        </button>
                    </div>
                )}

                {/* Logout Button */}
                <div className="mt-6 bg-[#242526] border-y border-white/5">
                    <button
                        onClick={handleLogout}
                        className="w-full flex items-center gap-3 px-4 py-4 hover:bg-[#e41e3f]/10 transition-colors group"
                    >
                        <div className="w-10 h-10 rounded-full bg-[#e41e3f]/10 group-hover:bg-[#e41e3f]/20 flex items-center justify-center transition-colors">
                            <LogOut size={20} className="text-[#e41e3f]" />
                        </div>
                        <span className="flex-1 text-left text-[#e41e3f] font-semibold">Cerrar sesión</span>
                    </button>
                </div>

                {/* Footer Info */}
                <div className="px-4 py-6 text-center">
                    <p className="text-xs text-[#b0b3b8] mb-2">
                        StreamPay • Política de privacidad • Condiciones
                    </p>
                    <p className="text-xs text-[#b0b3b8]">
                        © 2024 StreamPay. Todos los derechos reservados.
                    </p>
                </div>
            </div>
        </div>
    );
}
