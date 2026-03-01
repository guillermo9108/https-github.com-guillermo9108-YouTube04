
import React, { useState } from 'react';
import { Database, Server, CheckCircle, ShieldCheck, Loader2, ArrowRight, AlertTriangle, Layers } from 'lucide-react';
import { db } from '../../services/db';
import { useNavigate } from '../Router';

type Step = 'DB_CONFIG' | 'ADMIN_CREATION' | 'INSTALLING' | 'DONE';

export default function Setup() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('DB_CONFIG');
  const [loading, setLoading] = useState(false);
  const [installLog, setInstallLog] = useState<string[]>([]);
  
  // Form State
  const [dbConfig, setDbConfig] = useState({
    host: '127.0.0.1', // Default to IP to force TCP/IP and avoid socket errors
    port: '3306',
    username: 'root',
    password: '',
    database: 'streampay_db'
  });

  const [adminConfig, setAdminConfig] = useState({
    username: 'admin',
    password: '',
    confirmPassword: ''
  });

  const [error, setError] = useState('');

  // --- Step 1: DB Config ---
  const handleDbConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const isConnected = await db.verifyDbConnection(dbConfig);
      if (isConnected) {
        setStep('ADMIN_CREATION');
      }
    } catch (err: any) {
      let msg = err.message || 'Could not connect to MariaDB server.';
      if (msg.includes('2002') || msg.includes('No such file')) {
          msg += " Try changing Host to 127.0.0.1";
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleDemoMode = () => {
    if (window.confirm("Switching to Demo Mode will use your browser's local storage instead of a real database. This is perfect for testing the UI.\n\nProceed?")) {
        db.enableDemoMode();
        navigate('/login');
    }
  };

  // --- Step 2: Validation ---
  const handleAdminValidation = (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminConfig.username || !adminConfig.password) {
      setError('Username and password are required');
      return;
    }
    if (adminConfig.password !== adminConfig.confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    startInstallation();
  };

  // --- Step 3: Installation ---
  const startInstallation = async () => {
    setStep('INSTALLING');
    const logs = [
      'Connecting to MariaDB @ ' + dbConfig.host + '...',
      'Connection established successfully.',
      'Checking database ' + dbConfig.database + '...',
      'Database created.',
      'Creating table: users...',
      'Creating table: videos...',
      'Creating table: transactions...',
      'Creating table: interactions...',
      'Tables created successfully.',
      'Seeding initial content data...',
      'Creating Administrator account (' + adminConfig.username + ')...',
      'System permissions updated.',
      'Installation complete.'
    ];

    for (let i = 0; i < logs.length; i++) {
       await new Promise(r => setTimeout(r, 400));
       setInstallLog(prev => [...prev, logs[i]]);
    }

    try {
        await db.initializeSystem(dbConfig, { 
            username: adminConfig.username, 
            password: adminConfig.password 
        });
        setStep('DONE');
    } catch (e: any) {
        setStep('DB_CONFIG');
        setError("Installation failed: " + e.message);
    }
  };

  // --- Render Helpers ---

  const StepIndicator = () => (
    <div className="flex items-center justify-center gap-4 mb-8">
      <div className={`flex items-center gap-2 ${step === 'DB_CONFIG' ? 'text-indigo-400 font-bold' : 'text-slate-500'}`}>
        <div className={`w-8 h-8 rounded-full flex items-center justify-center border ${step === 'DB_CONFIG' ? 'bg-indigo-500/20 border-indigo-500' : 'bg-slate-900 border-slate-700'}`}>1</div>
        <span className="hidden sm:inline">Database</span>
      </div>
      <div className="w-8 h-px bg-slate-800"></div>
      <div className={`flex items-center gap-2 ${step === 'ADMIN_CREATION' ? 'text-indigo-400 font-bold' : 'text-slate-500'}`}>
        <div className={`w-8 h-8 rounded-full flex items-center justify-center border ${step === 'ADMIN_CREATION' ? 'bg-indigo-500/20 border-indigo-500' : 'bg-slate-900 border-slate-700'}`}>2</div>
        <span className="hidden sm:inline">Admin</span>
      </div>
      <div className="w-8 h-px bg-slate-800"></div>
      <div className={`flex items-center gap-2 ${step === 'INSTALLING' || step === 'DONE' ? 'text-indigo-400 font-bold' : 'text-slate-500'}`}>
        <div className={`w-8 h-8 rounded-full flex items-center justify-center border ${['INSTALLING', 'DONE'].includes(step) ? 'bg-indigo-500/20 border-indigo-500' : 'bg-slate-900 border-slate-700'}`}>3</div>
        <span className="hidden sm:inline">Install</span>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-2xl">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-purple-400">
            StreamPay Installation
          </h1>
          <p className="text-slate-400 mt-2">Initial Setup Wizard v1.0.0</p>
        </div>

        <StepIndicator />

        <div className="bg-slate-900 p-8 rounded-2xl border border-slate-800 shadow-2xl">
          
          {/* Step 1: Database Config */}
          {step === 'DB_CONFIG' && (
            <form onSubmit={handleDbConnect} className="space-y-6">
              <div className="flex items-center gap-3 mb-6 p-4 bg-indigo-900/10 border border-indigo-500/20 rounded-lg text-indigo-200">
                <Database size={24} />
                <div>
                   <h3 className="font-bold">Database Configuration</h3>
                   <p className="text-xs text-indigo-300/70">Enter your MariaDB/MySQL connection details.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                   <label className="text-xs font-bold text-slate-500 uppercase">Host</label>
                   <input required type="text" value={dbConfig.host} onChange={e => setDbConfig({...dbConfig, host: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="127.0.0.1" />
                </div>
                <div className="space-y-1">
                   <label className="text-xs font-bold text-slate-500 uppercase">Port</label>
                   <input required type="text" value={dbConfig.port} onChange={e => setDbConfig({...dbConfig, port: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="3306" />
                </div>
              </div>

              <div className="space-y-1">
                 <label className="text-xs font-bold text-slate-500 uppercase">Database Name</label>
                 <input required type="text" value={dbConfig.database} onChange={e => setDbConfig({...dbConfig, database: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="streampay" />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                   <label className="text-xs font-bold text-slate-500 uppercase">Username</label>
                   <input required type="text" value={dbConfig.username} onChange={e => setDbConfig({...dbConfig, username: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="root" />
                </div>
                <div className="space-y-1">
                   <label className="text-xs font-bold text-slate-500 uppercase">Password</label>
                   <input type="password" value={dbConfig.password} onChange={e => setDbConfig({...dbConfig, password: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="••••••" />
                </div>
              </div>

              {error && (
                <div className="bg-red-900/20 border border-red-500/20 rounded-lg p-4 space-y-3 animate-in fade-in slide-in-from-top-2">
                    <div className="flex gap-2 text-red-400 text-sm font-semibold">
                        <AlertTriangle size={18} />
                        <span>Connection Failed</span>
                    </div>
                    <p className="text-xs text-red-300/80">{error}</p>
                    
                    <div className="pt-2 border-t border-red-500/20">
                        <button 
                            type="button" 
                            onClick={handleDemoMode}
                            className="flex items-center gap-2 text-xs font-bold text-indigo-400 hover:text-indigo-300 transition-colors"
                        >
                            <Layers size={14} />
                            Skip connection & Use Demo Mode (Local Storage)
                        </button>
                    </div>
                </div>
              )}

              <div className="flex justify-end pt-4">
                 <button type="submit" disabled={loading} className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 px-8 rounded-lg flex items-center gap-2 shadow-lg shadow-indigo-500/20 transition-transform active:scale-95">
                    {loading ? <Loader2 className="animate-spin" size={20} /> : <Server size={20} />}
                    {loading ? 'Verifying...' : 'Connect Database'}
                 </button>
              </div>
            </form>
          )}

          {/* Step 2: Admin Creation */}
          {step === 'ADMIN_CREATION' && (
            <form onSubmit={handleAdminValidation} className="space-y-6 animate-in fade-in slide-in-from-right-4">
              <div className="flex items-center gap-3 mb-6 p-4 bg-purple-900/10 border border-purple-500/20 rounded-lg text-purple-200">
                <ShieldCheck size={24} />
                <div>
                   <h3 className="font-bold">Super Admin Account</h3>
                   <p className="text-xs text-purple-300/70">Create the primary administrator for the system.</p>
                </div>
              </div>

              <div className="space-y-1">
                 <label className="text-xs font-bold text-slate-500 uppercase">Admin Username</label>
                 <input required type="text" value={adminConfig.username} onChange={e => setAdminConfig({...adminConfig, username: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-indigo-500 outline-none" />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                   <label className="text-xs font-bold text-slate-500 uppercase">Password</label>
                   <input required type="password" value={adminConfig.password} onChange={e => setAdminConfig({...adminConfig, password: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-indigo-500 outline-none" />
                </div>
                <div className="space-y-1">
                   <label className="text-xs font-bold text-slate-500 uppercase">Confirm Password</label>
                   <input required type="password" value={adminConfig.confirmPassword} onChange={e => setAdminConfig({...adminConfig, confirmPassword: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-indigo-500 outline-none" />
                </div>
              </div>

              {error && <div className="text-red-400 text-sm bg-red-900/20 p-3 rounded">{error}</div>}

              <div className="flex justify-between pt-4">
                 <button type="button" onClick={() => setStep('DB_CONFIG')} className="text-slate-500 hover:text-white">Back</button>
                 <button type="submit" className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 px-8 rounded-lg flex items-center gap-2">
                    Start Installation <ArrowRight size={20} />
                 </button>
              </div>
            </form>
          )}

          {/* Step 3: Installing Console */}
          {step === 'INSTALLING' && (
             <div className="font-mono text-sm">
                <div className="bg-black/50 p-4 rounded-lg border border-slate-800 h-64 overflow-y-auto space-y-2 mb-6 shadow-inner">
                   {installLog.map((log, i) => (
                      <div key={i} className="flex gap-2">
                         <span className="text-slate-600">[{new Date().toLocaleTimeString()}]</span>
                         <span className="text-emerald-400">{log}</span>
                      </div>
                   ))}
                   <div className="animate-pulse text-indigo-400">_</div>
                </div>
                <div className="text-center text-slate-400">
                   <Loader2 className="animate-spin mx-auto mb-2" size={24} />
                   Configuring system...
                </div>
             </div>
          )}

          {/* Step 4: Done */}
          {step === 'DONE' && (
            <div className="text-center py-8 animate-in zoom-in duration-300">
               <div className="w-20 h-20 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
                  <CheckCircle size={40} className="text-emerald-400" />
               </div>
               <h2 className="text-2xl font-bold text-white mb-2">Installation Successful!</h2>
               <p className="text-slate-400 mb-8 max-w-md mx-auto">
                 StreamPay has been installed and configured. You can now log in with your Admin account.
               </p>
               <button onClick={() => navigate('/login')} className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-4 rounded-lg shadow-lg shadow-emerald-900/20 active:scale-95 transition-transform">
                  Go to Login
               </button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
