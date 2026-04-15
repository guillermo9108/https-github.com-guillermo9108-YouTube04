
import React, { Suspense, useState, useEffect, useRef } from 'react';
// Page Imports
import Login from './components/pages/Login';
import Home from './components/pages/Home';
import MenuPage from './components/pages/MenuPage';
import SearchPage from './components/pages/SearchPage';
import Notifications from './components/pages/Notifications';
import Watch from './components/pages/Watch';
import Upload from './components/pages/Upload';
import Profile from './components/pages/Profile';
import Admin from './components/pages/admin/Admin';
import Shorts from './components/pages/Shorts';
import Setup from './components/pages/Setup';
import Requests from './components/pages/Requests';
import Channel from './components/pages/Channel';
import Marketplace from './components/pages/Marketplace';
import MarketplaceItem from './components/pages/MarketplaceItem';
import MarketplaceCreate from './components/pages/MarketplaceCreate';
import MarketplaceEdit from './components/pages/MarketplaceEdit';
import SellerDashboard from './components/pages/SellerDashboard';
import CategoriesPage from './components/pages/CategoriesPage';
import FolderExplorerPage from './components/pages/FolderExplorerPage';
import SettingsPage from './components/pages/SettingsPage';
import LikedPage from './components/pages/LikedPage';
import HistoryPage from './components/pages/HistoryPage';
import RechargePage from './components/pages/RechargePage';
import WalletPage from './components/pages/WalletPage';
import HelpPage from './components/pages/HelpPage';
import ReportPage from './components/pages/ReportPage';
import EditVideo from './components/pages/EditVideo';
import TrendingPage from './components/pages/TrendingPage';
import ChatPage from './components/pages/ChatPage';
import ChatDetailPage from './components/pages/ChatDetailPage';
import CreatePost from './components/pages/CreatePost';
import CreateStory from './components/pages/CreateStory';
import StoryViewer from './components/pages/StoryViewer';
import FriendsPage from './components/pages/FriendsPage';
import Cart from './components/pages/Cart';
import VipStore from './components/pages/VipStore';
import WatchLater from './components/pages/WatchLater';
import DownloadApp from './components/pages/DownloadApp';
import { AlertCircle, Download, X } from 'lucide-react';
import { motion } from 'motion/react';

// Components & Context
import { HashRouter, Routes, Route, Navigate } from './components/Router';
// Fix: Import missing Layout component
import Layout from './components/Layout';
import { AuthProvider, useAuth } from './context/AuthContext';
import { UploadProvider } from './context/UploadContext';
import { CartProvider } from './context/CartContext';
import { ServerTaskProvider } from './context/ServerTaskContext';
import { ToastProvider } from './context/ToastContext';
import { GridProvider } from './context/GridContext';
import { NotificationProvider } from './context/NotificationContext';
import { SettingsProvider } from './context/SettingsContext';
import { db } from './services/db';
import { Loader2, WifiOff } from 'lucide-react';

const OfflineBanner = () => {
    const [online, setOnline] = useState(navigator.onLine);
    useEffect(() => {
        const handleOnline = () => setOnline(true);
        const handleOffline = () => setOnline(false);
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    if (online) return null;

    return (
        <div className="fixed bottom-16 md:bottom-0 left-0 right-0 bg-red-600/90 text-white text-center py-2 z-[100] text-xs font-bold flex items-center justify-center gap-2 backdrop-blur-sm">
            <WifiOff size={14} /> Estás desconectado. Mostrando contenido caché.
        </div>
    );
};

// --- Guards ---

const ProtectedRoute = ({ children }: { children?: React.ReactNode }) => {
  const { user, isLoading } = useAuth();
  
  if (isLoading) {
      return <div className="min-h-screen bg-slate-950 flex items-center justify-center"><Loader2 className="animate-spin text-indigo-500" size={32} /></div>;
  }

  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
};

const AdminRoute = ({ children }: { children?: React.ReactNode }) => {
  const { user, isLoading } = useAuth();
  if (isLoading) return null;
  if (!user || user.role?.trim().toUpperCase() !== 'ADMIN') return <Navigate to="/" replace />;
  return <>{children}</>;
};

const SetupGuard = ({ children }: { children?: React.ReactNode }) => {
  const [checkDone, setCheckDone] = useState(false);
  const [needsSetup, setNeedsSetup] = useState(false);

  useEffect(() => {
    // Verificación robusta del estado de instalación
    db.checkInstallation()
      .then((res) => {
         if (res && res.status === 'not_installed') {
             setNeedsSetup(true);
         }
         setCheckDone(true);
      })
      .catch((err) => {
         console.warn("Verificación de instalación ignorada por error de red", err);
         setCheckDone(true);
      });
  }, []);

  if (!checkDone) return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-500">Conectando...</div>;

  if (needsSetup) {
    return <Navigate to="/setup" replace />;
  }
  return <>{children}</>;
};

// --- App ---

const UpdateModal = ({ version, url, onClose }: { version: string, url: string, onClose: () => void }) => {
    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md">
            <motion.div 
                initial={{ scale: 0.9, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                className="bg-slate-900 border border-white/10 p-8 rounded-[2.5rem] max-w-sm w-full text-center space-y-6 shadow-2xl shadow-indigo-500/20 relative overflow-hidden"
            >
                {/* Decorative background */}
                <div className="absolute -top-24 -right-24 w-48 h-48 bg-indigo-600/20 rounded-full blur-3xl" />
                <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-purple-600/20 rounded-full blur-3xl" />

                <div className="w-20 h-20 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-3xl flex items-center justify-center mx-auto shadow-xl shadow-indigo-500/40 relative z-10">
                    <Download size={40} className="text-white" />
                </div>
                
                <div className="space-y-2 relative z-10">
                    <h2 className="text-2xl font-black italic uppercase tracking-tight text-white">Actualización <span className="text-indigo-400">Disponible</span></h2>
                    <p className="text-slate-400 text-sm font-medium leading-relaxed">
                        Hay una nueva versión de StreamPay (<span className="text-white font-bold">{version}</span>) con mejoras y correcciones importantes.
                    </p>
                </div>

                <div className="grid gap-3 pt-2 relative z-10">
                    <a 
                        href={url} 
                        target="_blank"
                        rel="noopener noreferrer"
                        className="bg-indigo-600 text-white font-black py-4 rounded-2xl hover:bg-indigo-500 transition-all active:scale-95 flex items-center justify-center gap-2 shadow-lg shadow-indigo-900/40"
                    >
                        ACTUALIZAR AHORA
                    </a>
                    <button 
                        onClick={onClose}
                        className="text-slate-500 hover:text-slate-300 text-[10px] font-black uppercase tracking-widest transition-colors py-2"
                    >
                        Omitir por ahora
                    </button>
                </div>
            </motion.div>
        </div>
    );
};

const AppGuard = ({ children }: { children: React.ReactNode }) => {
    const { user } = useAuth();
    const [updateInfo, setUpdateInfo] = useState<{version: string, url: string} | null>(null);
    const [showUpdate, setShowUpdate] = useState(false);
    const [isAPK, setIsAPK] = useState(false);
    const [isMobile, setIsMobile] = useState(/Android|iPhone|iPad|iPod/i.test(navigator.userAgent));
    const hasChecked = useRef(false);
    
    const currentVersion = "4.2.0"; // Versión base de la APK (según screenshot del usuario)

    useEffect(() => {
        const checkVersion = async () => {
            // No bloqueamos si no hay usuario, pero si hay usuario queremos que se registre su versión
            // Si ya chequeamos y no hay usuario, y ahora hay usuario, re-chequeamos
            if (hasChecked.current && !user?.id) return;
            
            try {
                // Intentar extraer versión del UserAgent o del objeto inyectado por la APK
                const ua = navigator.userAgent || '';
                const uaMatch = ua.match(/StreamPayAPK\/([\d\.]+)/i);
                
                // Prioridad: 1. Objeto inyectado, 2. UserAgent, 3. undefined
                let clientVersion = window.StreamPayAPK?.version || (uaMatch ? uaMatch[1] : undefined);
                
                // Si no se detectó pero estamos en lo que parece ser la APK, intentar esperar un poco
                if (!clientVersion && (ua.includes('StreamPayAPK') || (window as any).ReactNativeWebView)) {
                    await new Promise(r => setTimeout(r, 1000));
                    clientVersion = window.StreamPayAPK?.version || (uaMatch ? uaMatch[1] : undefined);
                }

                const latest = await db.getLatestVersion(user?.id, clientVersion);
                setIsAPK(latest.isAPK);
                
                // Si ya tenemos el ID del usuario y el servidor respondió, marcamos como chequeado
                if (user?.id || !latest.isAPK) {
                    hasChecked.current = true;
                }
                
                const currentHash = window.location.hash;
                
                // Redirigir a descarga si es móvil y NO es la APK
                if (isMobile && !latest.isAPK && !currentHash.includes('/download')) {
                    window.location.hash = '#/download';
                    return;
                }

                // Si es la APK y está en descarga, volver al inicio
                if (latest.isAPK && currentHash.includes('/download')) {
                    window.location.hash = '#/';
                }

                // Verificar actualización: Solo si es APK y la versión del servidor es mayor
                if (latest.isAPK && latest.version && latest.url) {
                    // Comparar versiones de forma segura
                    const vCompare = (v1: string, v2: string) => {
                        const parts1 = v1.split('.').map(Number);
                        const parts2 = v2.split('.').map(Number);
                        for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
                            const p1 = parts1[i] || 0;
                            const p2 = parts2[i] || 0;
                            if (p1 > p2) return 1;
                            if (p1 < p2) return -1;
                        }
                        return 0;
                    };

                    const localVersion = window.StreamPayAPK?.version || clientVersion || currentVersion;
                    if (vCompare(latest.version, localVersion) > 0) {
                        setUpdateInfo({ version: latest.version, url: latest.url });
                        setShowUpdate(true);
                    }
                }
            } catch (e) {
                console.warn("Error checking app version", e);
            }
        };

        checkVersion();
    }, [user?.id, isMobile]);

    return (
        <>
            {children}
            {showUpdate && updateInfo && (
                <UpdateModal 
                    version={updateInfo.version} 
                    url={updateInfo.url} 
                    onClose={() => setShowUpdate(false)} 
                />
            )}
        </>
    );
};

export default function App() {
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', 'dark');
  }, []);

  return (
    <ToastProvider>
      <SettingsProvider>
      <AuthProvider>
        <NotificationProvider>
          <UploadProvider>
            <ServerTaskProvider>
                <CartProvider>
                    <GridProvider>
                        <HashRouter>
                        <AppGuard>
                        <OfflineBanner />
                        <Suspense fallback={<div className="min-h-screen bg-black text-white flex items-center justify-center">Cargando...</div>}>
                            <Routes>
                            <Route path="/setup" element={<Setup />} />
                            <Route path="/download" element={<DownloadApp />} />
                            
                            <Route path="/login" element={
                                <SetupGuard>
                                <Login />
                                </SetupGuard>
                            } />
                            
                            <Route element={<Layout />}>
                                <Route path="/" element={<SetupGuard><ProtectedRoute><Home /></ProtectedRoute></SetupGuard>} />
                                <Route path="/menu" element={<SetupGuard><ProtectedRoute><MenuPage /></ProtectedRoute></SetupGuard>} />
                                <Route path="/notifications" element={<SetupGuard><ProtectedRoute><Notifications /></ProtectedRoute></SetupGuard>} />
                                <Route path="/search" element={<SetupGuard><ProtectedRoute><SearchPage /></ProtectedRoute></SetupGuard>} />
                                <Route path="/shorts" element={<SetupGuard><ProtectedRoute><Shorts /></ProtectedRoute></SetupGuard>} />
                                <Route path="/watch/:id" element={<SetupGuard><ProtectedRoute><Watch /></ProtectedRoute></SetupGuard>} />
                                <Route path="/channel/:userId" element={<SetupGuard><ProtectedRoute><Channel /></ProtectedRoute></SetupGuard>} />
                                <Route path="/upload" element={<SetupGuard><ProtectedRoute><Upload /></ProtectedRoute></SetupGuard>} />
                                <Route path="/create-post" element={<SetupGuard><ProtectedRoute><CreatePost /></ProtectedRoute></SetupGuard>} />
                                <Route path="/create-story" element={<SetupGuard><ProtectedRoute><CreateStory /></ProtectedRoute></SetupGuard>} />
                                <Route path="/stories" element={<SetupGuard><ProtectedRoute><StoryViewer /></ProtectedRoute></SetupGuard>} />
                                <Route path="/friends" element={<SetupGuard><ProtectedRoute><FriendsPage /></ProtectedRoute></SetupGuard>} />
                                <Route path="/profile" element={<SetupGuard><ProtectedRoute><Profile /></ProtectedRoute></SetupGuard>} />
                                <Route path="/watch-later" element={<SetupGuard><ProtectedRoute><WatchLater /></ProtectedRoute></SetupGuard>} />
                                <Route path="/requests" element={<SetupGuard><ProtectedRoute><Requests /></ProtectedRoute></SetupGuard>} />
                                <Route path="/marketplace" element={<SetupGuard><ProtectedRoute><Marketplace /></ProtectedRoute></SetupGuard>} />
                                <Route path="/sell" element={<SetupGuard><ProtectedRoute><MarketplaceCreate /></ProtectedRoute></SetupGuard>} />
                                <Route path="/cart" element={<SetupGuard><ProtectedRoute><Cart /></ProtectedRoute></SetupGuard>} />
                                <Route path="/vip" element={<SetupGuard><ProtectedRoute><VipStore /></ProtectedRoute></SetupGuard>} />
                                <Route path="/marketplace/edit/:id" element={<SetupGuard><ProtectedRoute><MarketplaceEdit /></ProtectedRoute></SetupGuard>} />
                                <Route path="/edit/:id" element={<SetupGuard><ProtectedRoute><EditVideo /></ProtectedRoute></SetupGuard>} />
                                <Route path="/marketplace/:id" element={<SetupGuard><ProtectedRoute><MarketplaceItem /></ProtectedRoute></SetupGuard>} />
                                <Route path="/seller-dashboard" element={<SetupGuard><ProtectedRoute><SellerDashboard /></ProtectedRoute></SetupGuard>} />
                                <Route path="/categories" element={<SetupGuard><ProtectedRoute><CategoriesPage /></ProtectedRoute></SetupGuard>} />
                                <Route path="/folders" element={<SetupGuard><ProtectedRoute><FolderExplorerPage /></ProtectedRoute></SetupGuard>} />
                                <Route path="/settings" element={<SetupGuard><ProtectedRoute><SettingsPage /></ProtectedRoute></SetupGuard>} />
                                <Route path="/liked" element={<SetupGuard><ProtectedRoute><LikedPage /></ProtectedRoute></SetupGuard>} />
                                <Route path="/history" element={<SetupGuard><ProtectedRoute><HistoryPage /></ProtectedRoute></SetupGuard>} />
                                <Route path="/recharge" element={<SetupGuard><ProtectedRoute><RechargePage /></ProtectedRoute></SetupGuard>} />
                                <Route path="/wallet" element={<SetupGuard><ProtectedRoute><WalletPage /></ProtectedRoute></SetupGuard>} />
                                <Route path="/help" element={<SetupGuard><ProtectedRoute><HelpPage /></ProtectedRoute></SetupGuard>} />
                                <Route path="/report" element={<SetupGuard><ProtectedRoute><ReportPage /></ProtectedRoute></SetupGuard>} />
                                <Route path="/trending" element={<SetupGuard><ProtectedRoute><TrendingPage /></ProtectedRoute></SetupGuard>} />
                                <Route path="/chat" element={<SetupGuard><ProtectedRoute><ChatPage /></ProtectedRoute></SetupGuard>} />
                                <Route path="/chat/:id" element={<SetupGuard><ProtectedRoute><ChatDetailPage /></ProtectedRoute></SetupGuard>} />
                                
                                {/* Admin Routes Independientes */}
                                <Route path="/admin" element={<SetupGuard><AdminRoute><Admin /></AdminRoute></SetupGuard>} />
                                <Route path="/admin/users" element={<SetupGuard><AdminRoute><Admin /></AdminRoute></SetupGuard>} />
                                <Route path="/admin/finance" element={<SetupGuard><AdminRoute><Admin /></AdminRoute></SetupGuard>} />
                                <Route path="/admin/market" element={<SetupGuard><AdminRoute><Admin /></AdminRoute></SetupGuard>} />
                                <Route path="/admin/requests" element={<SetupGuard><AdminRoute><Admin /></AdminRoute></SetupGuard>} />
                                <Route path="/admin/library" element={<SetupGuard><AdminRoute><Admin /></AdminRoute></SetupGuard>} />
                                <Route path="/admin/transcoder" element={<SetupGuard><AdminRoute><Admin /></AdminRoute></SetupGuard>} />
                                <Route path="/admin/portability" element={<SetupGuard><AdminRoute><Admin /></AdminRoute></SetupGuard>} />
                                <Route path="/admin/files" element={<SetupGuard><AdminRoute><Admin /></AdminRoute></SetupGuard>} />
                                <Route path="/admin/ftp" element={<SetupGuard><AdminRoute><Admin /></AdminRoute></SetupGuard>} />
                                <Route path="/admin/analytics" element={<SetupGuard><AdminRoute><Admin /></AdminRoute></SetupGuard>} />
                                <Route path="/admin/config" element={<SetupGuard><AdminRoute><Admin /></AdminRoute></SetupGuard>} />
                                <Route path="/admin/maintenance" element={<SetupGuard><AdminRoute><Admin /></AdminRoute></SetupGuard>} />
                                <Route path="/admin/server" element={<SetupGuard><AdminRoute><Admin /></AdminRoute></SetupGuard>} />
                            </Route>

                            <Route path="*" element={<Navigate to="/" />} />
                            </Routes>
                        </Suspense>
                        </AppGuard>
                        </HashRouter>
                    </GridProvider>
                </CartProvider>
            </ServerTaskProvider>
        </UploadProvider>
      </NotificationProvider>
    </AuthProvider>
    </SettingsProvider>
    </ToastProvider>
  );
}
