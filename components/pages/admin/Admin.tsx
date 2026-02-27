
import React from 'react';
// Added ShieldCheck to imports to fix error on line 71
import { User as UserIcon, Wallet, Store, Settings, Database, Wrench, TrendingUp, Network, DownloadCloud, HardDrive, Cpu, Package, Home as HomeIcon, XCircle, ShieldCheck } from 'lucide-react';
import { useLocation, Link } from '../../Router';

import AdminUsers from './AdminUsers';
import AdminFinance from './AdminFinance';
import AdminMarket from './AdminMarket';
import AdminConfig from './AdminConfig';
import AdminLibrary from './AdminLibrary';
import AdminMaintenance from './AdminMaintenance';
import AdminAnalytics from './AdminAnalytics';
import AdminFtp from './AdminFtp';
import AdminRequests from './AdminRequests';
import AdminLocalFiles from './AdminLocalFiles';
import AdminTranscoder from './AdminTranscoder';
import AdminPortability from './AdminPortability';

type TabID = 'USERS' | 'FINANCE' | 'MARKET' | 'CONFIG' | 'LIBRARY' | 'FILES' | 'FTP' | 'MAINTENANCE' | 'ANALYTICS' | 'REQUESTS' | 'TRANSCODER' | 'PORTABILITY';

export default function Admin() {
  const location = useLocation();
  
  // Mapeo de rutas a IDs de pestañas
  const pathToTab: Record<string, TabID> = {
    '/admin/users': 'USERS',
    '/admin/finance': 'FINANCE',
    '/admin/market': 'MARKET',
    '/admin/requests': 'REQUESTS',
    '/admin/library': 'LIBRARY',
    '/admin/transcoder': 'TRANSCODER',
    '/admin/portability': 'PORTABILITY',
    '/admin/files': 'FILES',
    '/admin/ftp': 'FTP',
    '/admin/analytics': 'ANALYTICS',
    '/admin/config': 'CONFIG',
    '/admin/maintenance': 'MAINTENANCE',
    '/admin': 'USERS' // Default
  };

  const activeTab = pathToTab[location.pathname] || 'USERS';

  const tabs: { id: TabID; icon: any; label: string; path: string }[] = [
       { id: 'USERS', icon: UserIcon, label: 'Users', path: '/admin/users' },
       { id: 'FINANCE', icon: Wallet, label: 'Finance', path: '/admin/finance' },
       { id: 'MARKET', icon: Store, label: 'Market', path: '/admin/market' },
       { id: 'REQUESTS', icon: DownloadCloud, label: 'Requests', path: '/admin/requests' },
       { id: 'LIBRARY', icon: Database, label: 'Library', path: '/admin/library' },
       { id: 'TRANSCODER', icon: Cpu, label: 'Conversión', path: '/admin/transcoder' },
       { id: 'PORTABILITY', icon: Package, label: 'Portabilidad', path: '/admin/portability' },
       { id: 'FILES', icon: HardDrive, label: 'Storage', path: '/admin/files' },
       { id: 'FTP', icon: Network, label: 'FTP', path: '/admin/ftp' },
       { id: 'ANALYTICS', icon: TrendingUp, label: 'Stats', path: '/admin/analytics' },
       { id: 'CONFIG', icon: Settings, label: 'Config', path: '/admin/config' },
       { id: 'MAINTENANCE', icon: Wrench, label: 'Tools', path: '/admin/maintenance' },
  ];

  return (
    <div className="space-y-6 pb-24 px-2 md:px-0">
      {/* Navegación Admin Sticky Header: top-0 para móvil (Encabezado Nativo), top-[72px] para escritorio */}
      <div className="flex items-center gap-2 overflow-x-auto bg-slate-900 p-2 md:rounded-xl scrollbar-hide sticky top-0 md:top-[72px] z-[60] shadow-2xl border-b md:border border-white/10 -mx-4 px-4 md:mx-0 md:px-2 transition-all">
           {/* Botón Salir Admin (Solo visible en móviles para navegación de retorno) */}
           <Link 
              to="/" 
              className="md:hidden flex items-center gap-1.5 px-3 py-2 bg-red-950/40 border border-red-500/20 text-red-400 rounded-lg font-black text-[10px] uppercase mr-1"
            >
               <XCircle size={14}/> Salir
           </Link>

           <div className="hidden md:flex items-center px-2 mr-2 border-r border-white/5">
                <ShieldCheck className="text-amber-500" size={18}/>
           </div>

           {tabs.map(t => (
               <Link 
                  key={t.id} 
                  to={t.path} 
                  className={`px-4 py-2 rounded-lg font-bold text-sm whitespace-nowrap flex items-center gap-2 transition-all ${activeTab === t.id ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
                >
                   <t.icon size={16}/> {t.label}
               </Link>
           ))}
      </div>

      <div className="min-h-[500px] animate-in fade-in duration-300 px-2 md:px-0 mt-4 md:mt-0">
          {activeTab === 'USERS' && <AdminUsers />}
          {activeTab === 'FINANCE' && <AdminFinance />}
          {activeTab === 'MARKET' && <AdminMarket />}
          {activeTab === 'REQUESTS' && <AdminRequests />}
          {activeTab === 'CONFIG' && <AdminConfig />}
          {activeTab === 'LIBRARY' && <AdminLibrary />}
          {activeTab === 'TRANSCODER' && <AdminTranscoder />}
          {activeTab === 'PORTABILITY' && <AdminPortability />}
          {activeTab === 'FILES' && <AdminLocalFiles />}
          {activeTab === 'FTP' && <AdminFtp />}
          {activeTab === 'MAINTENANCE' && <AdminMaintenance />}
          {activeTab === 'ANALYTICS' && <AdminAnalytics />}
      </div>
    </div>
  );
}
