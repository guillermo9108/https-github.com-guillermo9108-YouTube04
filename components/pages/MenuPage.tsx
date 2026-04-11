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
                { icon: Search, label: 'Buscar', path: '/search', color: 'text-[#b0b3b8]' },
                { icon: Tag, label: 'Categorías', path: '/categories', color: 'text-green-500' },
                { icon: Folder, label: 'Explorar Carpetas', path: '/folders', color: 'text-yellow-500' },
                { icon: TrendingUp, label: 'Tendencias', path: '/?sort=trending', color: 'text-red-500' },
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
                { icon: Settings, label: 'Configuración', path: '/settings', color: 'text-[#b0b3b8]' },
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
        <div className="min-h-screen bg-[var(--bg-primary)] pb-20">
            {/* User Info Card */}
            <div className="bg-[var(--bg-secondary)] border-b border-[var(--divider)] p-4">
                <div className="flex items-center gap-3">
                    <div className="w-14 h-14 rounded-full bg-[var(--accent)] border border-[var(--divider)] overflow-hidden">
                        {user?.avatarUrl ? (
                            <img src={user.avatarUrl} className="w-full h-full object-cover" alt={user.username} referrerPolicy="no-referrer" />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center text-xl font-bold text-white">
                                {user?.username?.[0]?.toUpperCase() || '?'}
                            </div>
                        )}
                    </div>
                    <div className="flex-1">
                        <h2 className="text-base font-bold text-[var(--text-primary)]">{user?.username || 'Usuario'}</h2>
                        <p className="text-xs text-[var(--text-secondary)]">@{user?.username || 'usuario'}</p>
                        {isVip && (
                            <div className="flex items-center gap-1 mt-0.5">
                                <Crown size={12} className="text-amber-500" />
                                <span className="text-[10px] text-amber-500 font-bold uppercase">VIP</span>
                            </div>
                        )}
                    </div>
                    <button
                        onClick={() => navigate('/profile')}
                        className="px-3 py-1.5 bg-[var(--bg-tertiary)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)] rounded-md text-xs font-bold transition-colors"
                    >
                        Ver perfil
                    </button>
                </div>
            </div>

            {/* Menu Sections */}
            <div className="max-w-2xl mx-auto">
                {menuSections.map((section, sectionIndex) => (
                    <div key={sectionIndex}>
                        <div className="h-2 bg-[var(--bg-primary)]"></div>
                        <h3 className="px-4 py-3 text-sm font-bold text-[var(--text-secondary)] uppercase tracking-wider bg-[var(--bg-secondary)]">{section.title}</h3>
                        <div className="bg-[var(--bg-secondary)] border-y border-[var(--divider)]">
                            {section.items.map((item, itemIndex) => (
                                <button
                                    key={itemIndex}
                                    onClick={() => handleNavigation(item)}
                                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[var(--bg-hover)] transition-colors border-b border-[var(--divider)] last:border-b-0 group"
                                >
                                    <div className={`w-8 h-8 rounded-md bg-[#3a3b3c] flex items-center justify-center transition-colors`}>
                                        <item.icon size={18} className={item.color} />
                                    </div>
                                    <span className="flex-1 text-left text-[var(--text-primary)] text-sm font-medium">{item.label}</span>
                                    {item.badge && (
                                        <span className="bg-[#f02849] text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                                            {item.badge}
                                        </span>
                                    )}
                                </button>
                            ))}
                        </div>
                    </div>
                ))}

                {/* Logout Button */}
                <div className="mt-4 bg-[var(--bg-secondary)] border-y border-[var(--divider)]">
                    <button
                        onClick={() => setShowSettings(true)}
                        className="w-full flex items-center gap-3 px-4 py-4 hover:bg-red-500/10 transition-colors group"
                    >
                        <div className="w-8 h-8 rounded-md bg-red-500/10 flex items-center justify-center transition-colors">
                            <LogOut size={18} className="text-red-600" />
                        </div>
                        <span className="flex-1 text-left text-red-600 text-sm font-bold">Cerrar sesión</span>
                    </button>
                </div>

                {/* Footer Info */}
                <div className="px-4 py-8 text-center">
                    <p className="text-[10px] text-[var(--text-secondary)] mb-1 uppercase tracking-widest font-bold">
                        StreamPay • Política • Condiciones
                    </p>
                    <p className="text-[10px] text-[var(--text-secondary)] opacity-50">
                        © 2024 StreamPay. Todos los derechos reservados.
                    </p>
                </div>
            </div>

            {/* Logout Confirmation Modal */}
            {showSettings && (
                <div className="fixed inset-0 z-[200] bg-black flex items-center justify-center p-4 animate-in fade-in">
                    <div className="bg-[var(--bg-secondary)] border border-[var(--divider)] rounded-2xl w-full max-w-xs overflow-hidden shadow-2xl animate-in zoom-in-95 p-6 text-center">
                        <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                            <LogOut size={32} className="text-red-600" />
                        </div>
                        <h3 className="text-lg font-bold text-[var(--text-primary)] mb-2">¿Cerrar sesión?</h3>
                        <p className="text-sm text-[var(--text-secondary)] mb-6">¿Estás seguro de que quieres salir de tu cuenta?</p>
                        <div className="flex flex-col gap-2">
                            <button 
                                onClick={() => { logout(); navigate('/'); }}
                                className="w-full py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg transition-colors"
                            >
                                Sí, cerrar sesión
                            </button>
                            <button 
                                onClick={() => setShowSettings(false)}
                                className="w-full py-2.5 bg-[#3a3b3c] hover:bg-[var(--bg-hover)] text-[var(--text-primary)] font-bold rounded-lg transition-colors"
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
