
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
import Cart from './components/pages/Cart';
import VipStore from './components/pages/VipStore';
import WatchLater from './components/pages/WatchLater';

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

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <UploadProvider>
            <ServerTaskProvider>
                <CartProvider>
                    <GridProvider>
                        <HashRouter>
                        <OfflineBanner />
                        <Suspense fallback={<div className="min-h-screen bg-black text-white flex items-center justify-center">Cargando...</div>}>
                            <Routes>
                            <Route path="/setup" element={<Setup />} />
                            
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
                                <Route path="/marketplace/:id" element={<SetupGuard><ProtectedRoute><MarketplaceItem /></ProtectedRoute></SetupGuard>} />
                                
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
                        </HashRouter>
                    </GridProvider>
                </CartProvider>
            </ServerTaskProvider>
        </UploadProvider>
      </AuthProvider>
    </ToastProvider>
  );
}
