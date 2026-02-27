
import React, { useState, useEffect } from 'react';
import { db } from '../../../services/db';
import { SystemSettings, Category, VipPlan, FtpSettings } from '../../../types';
import { useToast } from '../../../context/ToastContext';
import { 
    Save, Tag, Loader2, Trash2, Plus, PlusCircle, Sparkles, 
    CreditCard, ChevronRight, DollarSign, Database,
    Clock, Percent, HardDrive, Crown, X, Info, Smartphone, Wallet, Globe,
    Cpu, Settings2, Shield, Activity, Network, ListPlus, Bug, Watch, Maximize,
    Zap, Trash, SortAsc, Server, Banknote, Coins
} from 'lucide-react';

export default function AdminConfig() {
    const toast = useToast();
    const [settings, setSettings] = useState<SystemSettings | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    
    const [activeSection, setActiveSection] = useState<string | null>('GENERAL');
    const [newLibPath, setNewLibPath] = useState('');

    const loadSettings = async () => {
        setLoading(true);
        try {
            const s: any = await db.getSystemSettings();
            
            let rawVip = s.vipPlans;
            let plans: VipPlan[] = [];
            
            if (Array.isArray(rawVip)) {
                plans = rawVip;
            } else if (typeof rawVip === 'string' && rawVip.trim().length > 2) {
                try { plans = JSON.parse(rawVip); } catch(e) { plans = []; }
            }

            plans = plans.map(p => {
                if (!p.type) {
                    if (p.durationDays && Number(p.durationDays) > 0) return { ...p, type: 'ACCESS' };
                    if (p.bonusPercent && Number(p.bonusPercent) > 0) return { ...p, type: 'BALANCE' };
                    return { ...p, type: 'ACCESS' };
                }
                return p;
            });

            s.vipPlans = plans;

            if (!s.categories) s.categories = [];
            if (!s.libraryPaths) s.libraryPaths = [];
            if (!s.paymentMethods) s.paymentMethods = {
                tropipay: { enabled: false, instructions: '', exchangeRate: 1, currencySymbol: 'EUR' },
                card: { enabled: false, instructions: '', exchangeRate: 1, currencySymbol: '$' },
                mobile: { enabled: false, instructions: '', exchangeRate: 1, currencySymbol: 'CUP' },
                manual: { enabled: true, instructions: 'Contacta al admin para recargar.', exchangeRate: 1, currencySymbol: '$' },
                cash: { enabled: false, instructions: 'Pago directo en persona.', exchangeRate: 1, currencySymbol: '$' }
            };
            if (!s.ftpSettings) s.ftpSettings = { host: '', port: 21, user: '', pass: '', rootPath: '/' };
            
            setSettings(s);
        } catch(e) { 
            toast.error("Error al conectar con la base de datos"); 
        } finally { 
            setLoading(false); 
        }
    };

    useEffect(() => { loadSettings(); }, []);

    const handleSaveConfig = async () => {
        if (!settings) return;
        setSaving(true);
        try {
            await db.updateSystemSettings(settings);
            toast.success("Configuración guardada en MariaDB");
            await loadSettings();
        } catch(e: any) { 
            toast.error("Error al guardar: " + e.message); 
        } finally { 
            setSaving(false); 
        }
    };

    const updateValue = (key: keyof SystemSettings, val: any) => {
        setSettings(prev => prev ? { ...prev, [key]: val } : null);
    };

    const addVipPlan = () => {
        const newPlan: VipPlan = { 
            id: 'p_' + Date.now(), 
            name: 'NUEVO PLAN', 
            price: 10, 
            type: 'ACCESS', 
            durationDays: 30 
        };
        updateValue('vipPlans', [...(settings?.vipPlans || []), newPlan]);
    };

    const removeVipPlan = (id: string) => {
        updateValue('vipPlans', (settings?.vipPlans || []).filter(p => p.id !== id));
    };

    const updateVipPlan = (id: string, field: keyof VipPlan, val: any) => {
        const updated = (settings?.vipPlans || []).map(p => 
            p.id === id ? { ...p, [field]: val } : p
        );
        updateValue('vipPlans', updated);
    };

    const addLibraryPath = () => {
        if (!newLibPath.trim()) return;
        const paths = [...(settings?.libraryPaths || [])];
        if (!paths.includes(newLibPath)) {
            paths.push(newLibPath);
            updateValue('libraryPaths', paths);
            setNewLibPath('');
        }
    };

    const removeLibraryPath = (path: string) => {
        updateValue('libraryPaths', (settings?.libraryPaths || []).filter(p => p !== path));
    };

    const updatePaymentMethod = (
        method: 'tropipay' | 'card' | 'mobile' | 'manual' | 'cash', 
        field: string, 
        val: any
    ) => {
        if (!settings) return;
        const currentMethods = { ...(settings.paymentMethods || {}) } as any;
        const methodConfig = { ...(currentMethods[method] || { enabled: false, instructions: '', exchangeRate: 1, currencySymbol: '$' }) };
        
        methodConfig[field] = val;
        currentMethods[method] = methodConfig;
        
        updateValue('paymentMethods', currentMethods);
    };

    if (loading) return <div className="flex justify-center p-20"><Loader2 className="animate-spin text-indigo-500" size={32}/></div>;

    const SectionHeader = ({ id, label, icon: Icon, color = "text-indigo-400" }: any) => (
        <button 
            onClick={() => setActiveSection(activeSection === id ? null : id)}
            className={`w-full flex items-center justify-between p-4 bg-slate-900 border border-slate-800 rounded-2xl transition-all ${activeSection === id ? 'ring-2 ring-indigo-500/50 bg-slate-800/40' : 'hover:bg-slate-800/20'}`}
        >
            <div className="flex items-center gap-3">
                <div className={`p-2 rounded-xl ${activeSection === id ? 'bg-indigo-600 text-white' : 'bg-slate-800 ' + color}`}>
                    <Icon size={18} />
                </div>
                <span className="font-black text-white uppercase text-[10px] tracking-[0.15em]">{label}</span>
            </div>
            <ChevronRight size={16} className={`text-slate-600 transition-transform duration-300 ${activeSection === id ? 'rotate-90 text-indigo-400' : ''}`} />
        </button>
    );

    return (
        <div className="max-w-4xl mx-auto space-y-3 animate-in fade-in pb-32 px-1">
            
            <div className="bg-slate-900/95 backdrop-blur-md p-3 rounded-[24px] border border-slate-800 shadow-2xl flex items-center justify-between sticky top-2 z-40">
                <div className="flex items-center gap-3 ml-2">
                    <Settings2 size={18} className="text-indigo-500"/>
                    <div>
                        <h2 className="text-sm font-black text-white uppercase tracking-tighter italic leading-none">Panel Admin</h2>
                        <p className="text-[8px] text-slate-500 font-bold uppercase mt-1">Configuración Global</p>
                    </div>
                </div>
                <button onClick={handleSaveConfig} disabled={saving} className="bg-indigo-600 hover:bg-indigo-500 text-white font-black py-2.5 px-8 rounded-xl flex items-center gap-2 active:scale-95 transition-all text-[10px] uppercase tracking-widest shadow-lg shadow-indigo-900/40">
                    {saving ? <Loader2 size={14} className="animate-spin"/> : <Save size={14}/>} Guardar Cambios
                </button>
            </div>

            <SectionHeader id="GENERAL" label="Economía & AI" icon={Shield} color="text-emerald-400" />
            {activeSection === 'GENERAL' && (
                <div className="bg-slate-900/50 p-5 rounded-3xl border border-slate-800 space-y-5 animate-in slide-in-from-top-2">
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        <div className="space-y-1">
                            <label className="text-[9px] font-black text-slate-500 uppercase ml-1">Comisión Video %</label>
                            <input type="number" value={settings?.videoCommission} onChange={e => updateValue('videoCommission', parseInt(e.target.value))} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white font-bold text-xs focus:border-indigo-500 outline-none" />
                        </div>
                        <div className="space-y-1">
                            <label className="text-[9px] font-black text-slate-500 uppercase ml-1">Comisión Market %</label>
                            <input type="number" value={settings?.marketCommission} onChange={e => updateValue('marketCommission', parseInt(e.target.value))} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white font-bold text-xs focus:border-indigo-500 outline-none" />
                        </div>
                        <div className="space-y-1">
                            <label className="text-[9px] font-black text-slate-500 uppercase ml-1">Tarifa Envío $</label>
                            <input type="number" value={settings?.transferFee} onChange={e => updateValue('transferFee', parseFloat(e.target.value))} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white font-bold text-xs focus:border-indigo-500 outline-none" />
                        </div>
                    </div>
                    
                    <div className="space-y-1">
                        <label className="text-[9px] font-black text-indigo-400 uppercase flex items-center gap-1 ml-1"><Sparkles size={10}/> Gemini AI API Key</label>
                        <input type="password" value={settings?.geminiKey} onChange={e => updateValue('geminiKey', e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white font-mono text-[10px] focus:border-indigo-500 outline-none" placeholder="Ingresa tu clave de Google AI..." />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-white/5">
                        <div className="space-y-1">
                            <label className="text-[9px] font-black text-slate-500 uppercase ml-1">Tropipay Client ID</label>
                            <input type="text" value={settings?.tropipayClientId} onChange={e => updateValue('tropipayClientId', e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white text-[10px] focus:border-indigo-500 outline-none" />
                        </div>
                        <div className="space-y-1">
                            <label className="text-[9px] font-black text-slate-500 uppercase ml-1">Tropipay Client Secret</label>
                            <input type="password" value={settings?.tropipayClientSecret} onChange={e => updateValue('tropipayClientSecret', e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white text-[10px] focus:border-indigo-500 outline-none" />
                        </div>
                    </div>
                </div>
            )}

            <SectionHeader id="VIP" label="Planes & Membresías" icon={Crown} color="text-amber-400" />
            {activeSection === 'VIP' && (
                <div className="bg-slate-900/50 p-5 rounded-3xl border border-slate-800 space-y-4 animate-in slide-in-from-top-2">
                    <button onClick={addVipPlan} className="w-full bg-amber-500/10 hover:bg-amber-500/20 py-4 rounded-2xl flex items-center justify-center gap-2 text-[10px] font-black uppercase text-amber-500 border border-amber-500/20 transition-all shadow-lg active:scale-95">
                        <PlusCircle size={16}/> Crear Nueva Oferta VIP
                    </button>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {settings?.vipPlans?.map(plan => (
                            <div key={plan.id} className="bg-slate-950 p-5 rounded-3xl border border-slate-800 space-y-4 relative group hover:border-amber-500/30 transition-all shadow-xl">
                                <button onClick={() => removeVipPlan(plan.id)} className="absolute top-3 right-3 text-slate-700 hover:text-red-500 transition-colors"><Trash2 size={16}/></button>
                                
                                <div className="space-y-1">
                                    <label className="text-[8px] font-black text-slate-600 uppercase ml-1">Nombre del Plan</label>
                                    <input value={plan.name} onChange={e => updateVipPlan(plan.id, 'name', e.target.value.toUpperCase())} className="bg-transparent border-b border-white/5 text-white font-black text-sm w-full p-1 outline-none focus:border-amber-500 transition-all" placeholder="EJ: ACCESO PREMIUM"/>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1">
                                        <label className="text-[8px] font-black text-slate-600 uppercase ml-1">Tipo</label>
                                        <select value={plan.type} onChange={e => updateVipPlan(plan.id, 'type', e.target.value)} className="w-full bg-slate-900 border border-slate-800 rounded-xl p-2 text-[10px] font-bold text-amber-400 uppercase outline-none appearance-none cursor-pointer">
                                            <option value="ACCESS">Acceso Total</option>
                                            <option value="BALANCE">Bono de Saldo</option>
                                        </select>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[8px] font-black text-slate-600 uppercase ml-1">Precio $</label>
                                        <input type="number" value={plan.price} onChange={e => updateVipPlan(plan.id, 'price', parseFloat(e.target.value))} className="w-full bg-slate-900 border border-slate-800 rounded-xl p-2 text-xs font-black text-white outline-none" />
                                    </div>
                                </div>

                                {plan.type === 'ACCESS' ? (
                                    <div className="space-y-1">
                                        <label className="text-[8px] font-black text-slate-600 uppercase ml-1">Duración (Días)</label>
                                        <input type="number" value={plan.durationDays} onChange={e => updateVipPlan(plan.id, 'durationDays', parseInt(e.target.value))} className="w-full bg-slate-900 border border-slate-800 rounded-xl p-2 text-xs text-white outline-none" />
                                    </div>
                                ) : (
                                    <div className="space-y-1">
                                        <label className="text-[8px] font-black text-slate-600 uppercase ml-1">Bono Adicional %</label>
                                        <input type="number" value={plan.bonusPercent} onChange={e => updateVipPlan(plan.id, 'bonusPercent', parseInt(e.target.value))} className="w-full bg-slate-900 border border-slate-800 rounded-xl p-2 text-xs text-emerald-400 font-bold outline-none" />
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <SectionHeader id="SYSTEM" label="Almacenamiento & NAS" icon={Database} color="text-blue-400" />
            {activeSection === 'SYSTEM' && (
                <div className="bg-slate-900/50 p-5 rounded-3xl border border-slate-800 space-y-6 animate-in slide-in-from-top-2">
                    
                    <div className="space-y-3">
                        <label className="text-[10px] font-black text-slate-500 uppercase flex items-center gap-2 ml-1"><HardDrive size={12}/> Gestión de Volúmenes (Librería)</label>
                        
                        <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2">
                            <span className="text-[9px] font-black text-slate-600 uppercase">Volumen Principal (Root)</span>
                            <input type="text" value={settings?.localLibraryPath} onChange={e => updateValue('localLibraryPath', e.target.value)} className="w-full bg-transparent text-white font-mono text-xs outline-none focus:text-indigo-400" placeholder="/volume1/videos/..." />
                        </div>

                        <div className="space-y-2">
                            {(settings?.libraryPaths || []).map(path => (
                                <div key={path} className="flex items-center gap-3 bg-slate-950 p-3 rounded-xl border border-slate-800 group shadow-inner">
                                    <Database size={14} className="text-slate-600"/>
                                    <span className="flex-1 text-[10px] font-mono text-slate-300 truncate">{path}</span>
                                    <button onClick={() => removeLibraryPath(path)} className="text-slate-700 hover:text-red-500 transition-colors"><Trash2 size={14}/></button>
                                </div>
                            ))}
                        </div>

                        <div className="flex gap-2">
                            <input 
                                type="text" value={newLibPath} onChange={e => setNewLibPath(e.target.value)} 
                                placeholder="Añadir otro disco (ej: /volumeUSB1/videos)" 
                                className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-xs text-white outline-none focus:border-indigo-500"
                            />
                            <button onClick={addLibraryPath} className="bg-slate-800 text-white p-3 rounded-xl hover:bg-indigo-600 transition-colors shadow-lg active:scale-90"><ListPlus size={20}/></button>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/5">
                        <div className="space-y-1">
                            <label className="text-[9px] font-black text-slate-500 uppercase ml-1">Ruta FFmpeg</label>
                            <input type="text" value={settings?.ffmpegPath} onChange={e => updateValue('ffmpegPath', e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white font-mono text-[10px] outline-none" />
                        </div>
                        <div className="space-y-1">
                            <label className="text-[9px] font-black text-slate-500 uppercase ml-1">Ruta YT-DLP</label>
                            <input type="text" value={settings?.ytDlpPath} onChange={e => updateValue('ytDlpPath', e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white font-mono text-[10px] outline-none" />
                        </div>
                    </div>
                </div>
            )}

            <SectionHeader id="CATEGORIES" label="Categorías & Precios" icon={Tag} color="text-pink-400" />
            {activeSection === 'CATEGORIES' && (
                <div className="bg-slate-900/50 p-4 rounded-3xl border border-slate-800 space-y-3 animate-in slide-in-from-top-2">
                    <button onClick={() => {
                        const newCat: Category = { id: 'c_' + Date.now(), name: 'NUEVA', price: 1.0, autoSub: false, sortOrder: 'LATEST' };
                        updateValue('categories', [...(settings?.categories || []), newCat]);
                    }} className="w-full bg-pink-600/10 hover:bg-pink-600/20 py-3 rounded-2xl flex items-center justify-center gap-2 text-[10px] font-black uppercase text-pink-500 border border-pink-500/20 transition-all active:scale-95"><Plus size={14}/> Añadir Categoría</button>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {settings?.categories.map(cat => (
                            <div key={cat.id} className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-3 relative group shadow-lg">
                                <button onClick={() => updateValue('categories', settings.categories.filter(c => c.id !== cat.id))} className="absolute top-3 right-3 text-slate-700 hover:text-red-500 transition-colors"><X size={14}/></button>
                                <input value={cat.name} onChange={e => updateValue('categories', settings.categories.map(c => c.id === cat.id ? {...c, name: e.target.value.toUpperCase()} : c))} className="bg-transparent border-b border-white/5 text-white font-black text-xs w-full p-1 outline-none focus:border-pink-500 transition-all"/>
                                
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="relative">
                                        <DollarSign size={10} className="absolute left-2 top-3 text-emerald-500"/>
                                        <input type="number" step="0.1" value={cat.price} onChange={e => updateValue('categories', settings.categories.map(c => c.id === cat.id ? {...c, price: parseFloat(e.target.value)} : c))} className="w-full bg-slate-900 rounded-lg p-2.5 pl-6 text-white text-[11px] font-black outline-none border border-white/5 shadow-inner"/>
                                    </div>
                                    <div className="relative">
                                        <SortAsc size={10} className="absolute left-2 top-3 text-indigo-400"/>
                                        <select 
                                            value={cat.sortOrder || 'LATEST'} 
                                            onChange={e => updateValue('categories', settings.categories.map(c => c.id === cat.id ? {...c, sortOrder: e.target.value as any} : c))} 
                                            className="w-full bg-slate-900 rounded-lg p-2.5 pl-6 text-slate-300 text-[9px] font-black outline-none border border-white/5 shadow-inner appearance-none cursor-pointer uppercase"
                                        >
                                            <option value="LATEST">Recientes</option>
                                            <option value="ALPHA">A-Z</option>
                                            <option value="RANDOM">Aleatorio</option>
                                        </select>
                                    </div>
                                </div>

                                <label className="flex items-center gap-2 cursor-pointer pt-1">
                                    <input type="checkbox" checked={cat.autoSub} onChange={e => updateValue('categories', settings.categories.map(c => c.id === cat.id ? {...c, autoSub: e.target.checked} : c))} className="w-4 h-4 rounded accent-pink-500" />
                                    <span className="text-[9px] text-slate-500 font-black uppercase">Auto-Subcategorizar carpetas</span>
                                </label>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <SectionHeader id="PAYMENTS" label="Gestión de Cobros" icon={CreditCard} color="text-emerald-400" />
            {activeSection === 'PAYMENTS' && (
                <div className="bg-slate-900/50 p-5 rounded-3xl border border-slate-800 space-y-5 animate-in slide-in-from-top-2">
                    {[
                        { id: 'tropipay', label: 'Tropipay (Automático)', icon: Globe, color: 'text-blue-400' },
                        { id: 'card', label: 'Tarjeta / Zelle (Manual)', icon: CreditCard, color: 'text-emerald-400' },
                        { id: 'mobile', label: 'Saldo Móvil / Transfer', icon: Smartphone, color: 'text-pink-400' },
                        { id: 'cash', label: 'Pago en Efectivo', icon: Banknote, color: 'text-emerald-400' },
                        { id: 'manual', label: 'Soporte Directo', icon: Wallet, color: 'text-amber-400' }
                    ].map(m => {
                        const methodKey = m.id as 'tropipay' | 'card' | 'mobile' | 'manual' | 'cash';
                        const config = settings?.paymentMethods?.[methodKey] || { enabled: false, instructions: '', exchangeRate: 1, currencySymbol: '$' };
                        return (
                            <div key={m.id} className="space-y-4 p-4 bg-slate-950 rounded-2xl border border-slate-800 shadow-xl group">
                                <div className="flex justify-between items-center">
                                    <div className="flex items-center gap-3">
                                        <div className={`p-2 rounded-xl bg-slate-900 ${m.color} shadow-inner group-hover:scale-110 transition-transform`}><m.icon size={18}/></div>
                                        <span className="text-[10px] font-black text-white uppercase tracking-widest">{m.label}</span>
                                    </div>
                                    <label className="relative inline-flex items-center cursor-pointer">
                                        <input type="checkbox" checked={config.enabled} onChange={e => updatePaymentMethod(methodKey, 'enabled', e.target.checked)} className="sr-only peer"/>
                                        <div className="w-10 h-5 bg-slate-800 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500 shadow-inner"></div>
                                    </label>
                                </div>

                                {/* Nuevos campos de Tasa y Símbolo */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1">
                                        <label className="text-[9px] font-black text-slate-500 uppercase ml-1 flex items-center gap-1"><Coins size={10}/> Tasa de Cambio (Divisora)</label>
                                        <input 
                                            type="number" step="0.01" 
                                            value={config.exchangeRate || 1} 
                                            onChange={e => updatePaymentMethod(methodKey, 'exchangeRate', parseFloat(e.target.value))} 
                                            className="w-full bg-slate-900 border border-slate-800 rounded-xl p-3 text-white font-black text-xs outline-none focus:border-indigo-500" 
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[9px] font-black text-slate-500 uppercase ml-1 flex items-center gap-1"><Banknote size={10}/> Símbolo Moneda</label>
                                        <input 
                                            type="text" 
                                            value={config.currencySymbol || '$'} 
                                            onChange={e => updatePaymentMethod(methodKey, 'currencySymbol', e.target.value.toUpperCase())} 
                                            className="w-full bg-slate-900 border border-slate-800 rounded-xl p-3 text-white font-black text-xs outline-none focus:border-indigo-500" 
                                            placeholder="CUP, EUR..."
                                        />
                                    </div>
                                </div>

                                <textarea 
                                    value={config.instructions} 
                                    onChange={e => updatePaymentMethod(methodKey, 'instructions', e.target.value)}
                                    placeholder={`Configura los datos para ${m.label}...`}
                                    className="w-full bg-slate-900 border border-slate-800 rounded-xl p-4 text-[10px] text-slate-400 min-h-[70px] outline-none focus:border-indigo-500 transition-all italic leading-relaxed font-medium"
                                />
                            </div>
                        );
                    })}
                </div>
            )}

            <div className="p-10 text-center opacity-5 pointer-events-none">
                <Shield size={32} className="mx-auto mb-2"/>
                <p className="text-[8px] font-black uppercase tracking-[0.8em]">StreamPay V1.9.2 Core Security</p>
            </div>
        </div>
    );
}
