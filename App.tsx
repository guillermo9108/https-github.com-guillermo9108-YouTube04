
import React, { Suspense, useState, useEffect } from 'react';
// Page Imports
import Login from './components/pages/Login';
import Home from './components/pages/Home';
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
import EditVideo from './components/pages/EditVideo';
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
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div 
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="bg-slate-900 border border-slate-800 p-8 rounded-[2.5rem] max-w-sm w-full text-center space-y-6 shadow-2xl shadow-indigo-500/20"
            >
                <div className="w-20 h-20 bg-indigo-600 rounded-3xl flex items-center justify-center mx-auto shadow-xl shadow-indigo-500/40">
                    <Download size={40} className="text-white" />
                </div>
                <div className="space-y-2">
                    <h2 className="text-2xl font-black italic uppercase tracking-tight">Actualización <span className="text-indigo-500">Disponible</span></h2>
                    <p className="text-slate-400 text-sm font-medium leading-relaxed">
                        Hay una nueva versión de StreamPay ({version}) con mejoras y correcciones importantes.
                    </p>
                </div>
                <div className="grid gap-3 pt-2">
                    <a 
                        href={url} 
                        download
                        className="bg-white text-black font-black py-4 rounded-2xl hover:bg-indigo-50 transition-all active:scale-95 flex items-center justify-center gap-2"
                    >
                        DESCARGAR V{version}
                    </a>
                    <button 
                        onClick={onClose}
                        className="text-slate-500 hover:text-white text-xs font-black uppercase tracking-widest transition-colors py-2"
                    >
                        Recordar más tarde
                    </button>
                </div>
            </motion.div>
        </div>
    );
};

const AppGuard = ({ children }: { children: React.ReactNode }) => {
    const [updateInfo, setUpdateInfo] = useState<{version: string, url: string} | null>(null);
    const [showUpdate, setShowUpdate] = useState(false);
    const isAPK = navigator.userAgent.includes('StreamPayAPK');
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    const currentVersion = "0.0.1"; // Versión actual de la web/app

    useEffect(() => {
        // Redirigir a descarga si es móvil y no es la APK
        if (isMobile && !isAPK && !window.location.hash.includes('/download')) {
            window.location.hash = '#/download';
        }

        // Solo verificar actualizaciones si estamos en la APK
        if (isAPK) {
            db.getLatestVersion().then(latest => {
                if (latest && latest.version && latest.url && latest.version !== currentVersion) {
                    setUpdateInfo({ version: latest.version, url: latest.url });
                    setShowUpdate(true);
                }
            });
        }
    }, [isAPK, isMobile]);

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
                                <Route path="/shorts" element={<SetupGuard><ProtectedRoute><Shorts /></ProtectedRoute></SetupGuard>} />
                                <Route path="/watch/:id" element={<SetupGuard><ProtectedRoute><Watch /></ProtectedRoute></SetupGuard>} />
                                <Route path="/channel/:userId" element={<SetupGuard><ProtectedRoute><Channel /></ProtectedRoute></SetupGuard>} />
                                <Route path="/upload" element={<SetupGuard><ProtectedRoute><Upload /></ProtectedRoute></SetupGuard>} />
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
