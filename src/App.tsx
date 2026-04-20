import React from 'react';
import { HashRouter, Routes, Route } from '../components/Router';
import { AuthProvider } from '../context/AuthContext';
import { SettingsProvider } from '../context/SettingsContext';
import { NotificationProvider } from '../context/NotificationContext';
import { ToastProvider } from '../context/ToastContext';
import { UploadProvider } from '../context/UploadContext';
import { CartProvider } from '../context/CartContext';
import { ServerTaskProvider } from '../context/ServerTaskContext';
import { DownloadProvider } from '../context/DownloadContext';
import Layout from '../components/Layout';
import { APP_VERSION } from './constants';

// Pages
import Home from '../components/pages/Home';
import Watch from '../components/pages/Watch';
import Channel from '../components/pages/Channel';
import Profile from '../components/pages/Profile';
import Login from '../components/pages/Login';
import Upload from '../components/pages/Upload';
import Marketplace from '../components/pages/Marketplace';
import MarketplaceItem from '../components/pages/MarketplaceItem';
import MarketplaceCreate from '../components/pages/MarketplaceCreate';
import MarketplaceEdit from '../components/pages/MarketplaceEdit';
import SellerDashboard from '../components/pages/SellerDashboard';
import Cart from '../components/pages/Cart';
import Notifications from '../components/pages/Notifications';
import MenuPage from '../components/pages/MenuPage';
import SettingsPage from '../components/pages/SettingsPage';
import VipStore from '../components/pages/VipStore';
import WalletPage from '../components/pages/WalletPage';
import RechargePage from '../components/pages/RechargePage';
import HistoryPage from '../components/pages/HistoryPage';
import LikedPage from '../components/pages/LikedPage';
import WatchLater from '../components/pages/WatchLater';
import SearchPage from '../components/pages/SearchPage';
import CategoriesPage from '../components/pages/CategoriesPage';
import FolderExplorerPage from '../components/pages/FolderExplorerPage';
import DownloadQueuePage from '../components/pages/DownloadQueuePage';
import Shorts from '../components/pages/Shorts';
import HelpPage from '../components/pages/HelpPage';
import ReportPage from '../components/pages/ReportPage';
import EditVideo from '../components/pages/EditVideo';
import Admin from '../components/pages/admin/Admin';

const App: React.FC = () => {
  return (
    <AuthProvider>
      <SettingsProvider>
        <AppContent />
      </SettingsProvider>
    </AuthProvider>
  );
};

const AppContent: React.FC = () => {
  const { settings } = useSettings();

  React.useEffect(() => {
    // Set dark mode by default
    document.documentElement.setAttribute('data-theme', 'dark');
    
    if (settings?.latestApkVersion && settings.latestApkVersion !== APP_VERSION) {
      console.log(`Version mismatch: Local ${APP_VERSION} vs Server ${settings.latestApkVersion}. Updating...`);
      
      // Clear cache and reload
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then(registrations => {
          for (let registration of registrations) {
            registration.update();
          }
          // Give it a moment to update then reload
          setTimeout(() => {
            window.location.reload();
          }, 1000);
        });
      } else {
        window.location.reload();
      }
    }
  }, [settings?.latestApkVersion]);

  return (
    <NotificationProvider>
      <ToastProvider>
        <UploadProvider>
          <DownloadProvider>
            <CartProvider>
              <ServerTaskProvider>
                <HashRouter>
                  <Routes>
                    <Route path="/login" element={<Login />} />
                    <Route element={<Layout />}>
                      <Route path="/" element={<Home />} />
                      <Route path="/watch/:id" element={<Watch />} />
                      <Route path="/channel/:userId" element={<Channel />} />
                      <Route path="/profile" element={<Profile />} />
                      <Route path="/upload" element={<Upload />} />
                      <Route path="/edit/:id" element={<EditVideo />} />
                      <Route path="/marketplace" element={<Marketplace />} />
                      <Route path="/marketplace/:id" element={<MarketplaceItem />} />
                      <Route path="/marketplace/create" element={<MarketplaceCreate />} />
                      <Route path="/marketplace/edit/:id" element={<MarketplaceEdit />} />
                      <Route path="/seller-dashboard" element={<SellerDashboard />} />
                      <Route path="/cart" element={<Cart />} />
                      <Route path="/notifications" element={<Notifications />} />
                      <Route path="/menu" element={<MenuPage />} />
                      <Route path="/settings" element={<SettingsPage />} />
                      <Route path="/vip" element={<VipStore />} />
                      <Route path="/wallet" element={<WalletPage />} />
                      <Route path="/recharge" element={<RechargePage />} />
                      <Route path="/history" element={<HistoryPage />} />
                      <Route path="/liked" element={<LikedPage />} />
                      <Route path="/watch-later" element={<WatchLater />} />
                      <Route path="/search" element={<SearchPage />} />
                      <Route path="/categories" element={<CategoriesPage />} />
                      <Route path="/folders" element={<FolderExplorerPage />} />
                      <Route path="/download-queue" element={<DownloadQueuePage />} />
                      <Route path="/shorts" element={<Shorts />} />
                      <Route path="/help" element={<HelpPage />} />
                      <Route path="/report" element={<ReportPage />} />
                      <Route path="/admin" element={<Admin />} />
                    </Route>
                  </Routes>
                </HashRouter>
              </ServerTaskProvider>
            </CartProvider>
          </DownloadProvider>
        </UploadProvider>
      </ToastProvider>
    </NotificationProvider>
  );
};

export default App;
