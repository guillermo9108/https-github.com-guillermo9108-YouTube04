
import React, { useState, useEffect } from 'react';
import { 
  Cpu, HardDrive, Activity, Users, Battery, Zap, Power, 
  RefreshCw, ArrowUp, ArrowDown, AlertTriangle, BatteryCharging,
  Settings, Save, History, Calculator, TrendingUp
} from 'lucide-react';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine 
} from 'recharts';
import { motion, AnimatePresence } from 'motion/react';
import { db } from '../../../services/db';
import { useToast } from '../../../context/ToastContext';

interface ServerStats {
  cpu: number;
  storage: {
    total: string;
    used: string;
    percent: number;
  };
  network: {
    up: number;
    down: number;
  };
  activeUsers: number;
  uptime: string;
  battery: BatteryConfig | null;
  batteryHistory?: BatteryHistoryPoint[];
}

interface BatteryConfig {
  voltage: number;
  minWatts: number;
  maxWatts: number;
  isCharging: boolean;
  cellHealth: number;
  currentWh: number;
  lastUpdate: number;
  chargePower: number;
  cellsSeries: number;
  cellsParallel: number;
  cellCapacityMah: number;
  pSys?: number;
  lastChargeTime?: number;
}

interface BatteryHistoryPoint {
  t: number;
  v: number;
  c: number;
  cpu: number;
}

export default function AdminServerStats() {
  const [stats, setStats] = useState<ServerStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [battery, setBattery] = useState<BatteryConfig>({
    voltage: 14.8,
    minWatts: 200,
    maxWatts: 300,
    isCharging: false,
    cellHealth: 89,
    currentWh: 150,
    lastUpdate: Date.now(),
    chargePower: 45,
    cellsSeries: 4,
    cellsParallel: 4,
    cellCapacityMah: 5000,
    lastChargeTime: Date.now()
  });
  const [history, setHistory] = useState<BatteryHistoryPoint[]>([]);
  const [showCalibration, setShowCalibration] = useState(false);
  const [calibData, setCalibData] = useState({
    vStart: 14.5,
    vEnd: 13.9,
    tStart: "13:00",
    tEnd: "15:00"
  });
  const [calibResult, setCalibResult] = useState<any>(null);
  const [isEditing, setIsEditing] = useState(false);
  const isEditingRef = React.useRef(false);

  useEffect(() => {
    isEditingRef.current = isEditing;
  }, [isEditing]);
  const { addToast, success: toastSuccess, error: toastError } = useToast();

  const fetchStats = async () => {
    try {
      const data = await db.adminGetServerStats();
      setStats(data);
      if (data.battery && !isEditingRef.current) {
        setBattery(prev => ({ ...prev, ...data.battery }));
      }
      if (data.batteryHistory) {
        setHistory(data.batteryHistory);
      }
    } catch (error) {
      console.error("Error fetching stats:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchSettings = async () => {
    try {
      const settings = await db.getSystemSettings();
      if (settings && settings.batteryConfig) {
        const config = typeof settings.batteryConfig === 'string' 
          ? JSON.parse(settings.batteryConfig) 
          : settings.batteryConfig;
        setBattery(prev => ({ ...prev, ...config }));
      }
    } catch (error) {
      console.error("Error fetching battery config:", error);
    }
  };

  useEffect(() => {
    fetchStats();
    fetchSettings();
    const interval = setInterval(fetchStats, 3000);
    return () => clearInterval(interval);
  }, []);

  // Simulación de batería en el cliente para suavidad entre peticiones al servidor
  useEffect(() => {
    if (!stats) return;

    const simInterval = setInterval(() => {
      if (isEditingRef.current) return; // Pausar simulación si el admin está ajustando manualmente

      setBattery(prev => {
        const now = Date.now();
        const elapsedHours = (now - prev.lastUpdate) / (1000 * 60 * 60);
        
        // 1. Consumo Dinámico (P_sys)
        const pSys = prev.minWatts + (prev.maxWatts - prev.minWatts) * (stats.cpu / 100);
        
        // 2. Capacidad Total (Wh)
        const soh = prev.cellHealth / 100;
        const nominalVoltage = prev.cellsSeries * 3.7;
        const totalAh = (prev.cellCapacityMah * prev.cellsParallel) / 1000;
        const maxWh = nominalVoltage * totalAh * soh;
        
        let newWh = prev.currentWh;
        let v = prev.voltage;

        if (prev.isCharging) {
          // AC Conectado
          const chargerLimit = prev.chargePower || 45;
          const pDisp = chargerLimit - pSys;
          const pChargeMax = chargerLimit * soh;
          
          let pReal = 0;
          if (v < 16.0) {
            pReal = Math.min(pDisp, pChargeMax);
          } else if (v < 16.8) {
            const factor = (16.8 - v) / (16.8 - 16.0);
            pReal = Math.min(pDisp, pChargeMax) * factor;
          }
          
          newWh += pReal * elapsedHours;
        } else {
          // Descarga
          newWh -= pSys * elapsedHours;
        }

        if (newWh > maxWh) newWh = maxWh;
        if (newWh < 0) newWh = 0;

        // 4. Actualización de Voltaje (V)
        const percentage = (newWh / maxWh) * 100;
        let newVoltage = 12 + (4.8 * (percentage / 100));

        // Simular Caída de Voltaje (Sag)
        if (!prev.isCharging) {
          const sag = (1 - soh) * (pSys / 50);
          newVoltage -= sag;
        }

        return {
          ...prev,
          currentWh: newWh,
          voltage: parseFloat(newVoltage.toFixed(2)),
          lastUpdate: now,
          pSys: parseFloat(pSys.toFixed(2))
        };
      });
    }, 1000);

    return () => clearInterval(simInterval);
  }, [stats?.cpu]);

  const saveBatteryConfig = async () => {
    try {
      await db.updateSystemSettings({ batteryConfig: battery });
      toastSuccess("Configuración de batería guardada");
    } catch (error) {
      toastError("Error al guardar configuración");
    }
  };

  const handleServerControl = async (action: 'shutdown' | 'reboot') => {
    const confirmMsg = action === 'shutdown' 
      ? "¿Estás seguro de que deseas APAGAR el servidor Xpenology?" 
      : "¿Estás seguro de que deseas REINICIAR el servidor Xpenology?";
    
    if (!window.confirm(confirmMsg)) return;

    try {
      const data = await db.adminServerControl(action);
      toastSuccess(data || "Comando enviado correctamente");
    } catch (error) {
      toastError("Error al ejecutar comando");
    }
  };

  const handleCalibrate = () => {
    // Lógica de calibración basada en el historial manual del admin
    const [h1, m1] = calibData.tStart.split(':').map(Number);
    const [h2, m2] = calibData.tEnd.split(':').map(Number);
    const durationHours = (h2 * 60 + m2 - (h1 * 60 + m1)) / 60;
    
    if (durationHours <= 0) {
      toastError("La duración debe ser positiva");
      return;
    }

    const vDrop = calibData.vStart - calibData.vEnd;
    const dropRate = vDrop / durationHours; // V/h real observado

    // Calcular lo que el simulador esperaría
    const avgCpu = 25; // Asumimos un promedio de carga
    const pSys = battery.minWatts + (battery.maxWatts - battery.minWatts) * (avgCpu / 100);
    const nominalVoltage = battery.cellsSeries * 3.7;
    const totalAh = (battery.cellCapacityMah * battery.cellsParallel) / 1000;
    const soh = battery.cellHealth / 100;
    const maxWh = nominalVoltage * totalAh * soh;
    
    // El simulador dice que en 1h cae 4.8V / (maxWh / pSys)
    const simDropRate = 4.8 / (maxWh / pSys);

    const diff = dropRate / simDropRate;
    
    setCalibResult({
      observedRate: dropRate.toFixed(3),
      simulatedRate: simDropRate.toFixed(3),
      suggestion: diff > 1.1 ? "Aumentar Rango de Consumo (W) o reducir Salud de Celdas (%)" : 
                  diff < 0.9 ? "Reducir Rango de Consumo (W) o aumentar Salud de Celdas (%)" : 
                  "El simulador está bien calibrado",
      factor: diff.toFixed(2)
    });
  };

  if (loading || !stats) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="animate-spin text-indigo-500" size={32} />
      </div>
    );
  }

  const batteryPercentage = Math.min(100, Math.max(0, (battery.voltage - 12) / 4.8 * 100));
  const isLowBattery = batteryPercentage < 15;
  const isFullBattery = batteryPercentage > 95;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-black text-white flex items-center gap-2">
          <Activity className="text-indigo-500" /> Estado del Servidor
        </h2>
        <div className="flex gap-2">
          <button 
            onClick={() => handleServerControl('reboot')}
            className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-bold transition-colors"
          >
            <RefreshCw size={18} /> Reiniciar
          </button>
          <button 
            onClick={() => handleServerControl('shutdown')}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-bold transition-colors"
          >
            <Power size={18} /> Apagar
          </button>
        </div>
      </div>

      {/* Grid de Estadísticas Reales */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard 
          icon={<Cpu className="text-blue-400" />} 
          label="Procesador" 
          value={`${stats.cpu}%`} 
          subValue="Carga actual"
          progress={stats.cpu}
          color="blue"
        />
        <StatCard 
          icon={<HardDrive className="text-emerald-400" />} 
          label="Almacenamiento Total" 
          value={stats.storage.used} 
          subValue={`de ${stats.storage.total} (Rutas Admin)`}
          progress={stats.storage.percent}
          color="emerald"
        />
        <StatCard 
          icon={<Users className="text-amber-400" />} 
          label="Usuarios Activos" 
          value={stats.activeUsers.toString()} 
          subValue="Últimos 5 min"
          color="amber"
        />
      </div>

      {/* Network & Uptime */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-slate-900/50 border border-white/5 p-6 rounded-2xl">
          <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <Activity size={20} className="text-indigo-400" /> Red en Tiempo Real
          </h3>
          <div className="flex items-center justify-around">
            <div className="text-center">
              <div className="flex items-center justify-center w-12 h-12 bg-emerald-500/10 rounded-full mb-2 mx-auto">
                <ArrowDown className="text-emerald-500" />
              </div>
              <div className="text-2xl font-black text-white">{stats.network.down} KB/s</div>
              <div className="text-xs text-slate-400 uppercase font-bold">Descarga</div>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center w-12 h-12 bg-blue-500/10 rounded-full mb-2 mx-auto">
                <ArrowUp className="text-blue-400" />
              </div>
              <div className="text-2xl font-black text-white">{stats.network.up} KB/s</div>
              <div className="text-xs text-slate-400 uppercase font-bold">Subida</div>
            </div>
          </div>
        </div>
        <div className="bg-slate-900/50 border border-white/5 p-6 rounded-2xl flex flex-col justify-center">
          <div className="flex justify-between items-end">
            <div>
              <div className="text-slate-400 font-bold uppercase text-xs mb-1">Tiempo de Actividad</div>
              <div className="text-3xl font-black text-white">{stats.uptime}</div>
            </div>
            {!battery.isCharging && (
              <div className="text-right">
                <div className="text-slate-400 font-bold uppercase text-[10px] mb-1">Autonomía Est.</div>
                <div className="text-xl font-black text-amber-500">
                  {(() => {
                    const pSys = battery.minWatts + (battery.maxWatts - battery.minWatts) * (stats.cpu / 100);
                    const hours = battery.currentWh / pSys;
                    const h = Math.floor(hours);
                    const m = Math.floor((hours - h) * 60);
                    return `${h}h ${m}m`;
                  })()}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Simulador de Batería */}
      <div className="bg-slate-900/50 border border-white/5 p-6 rounded-2xl">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-black text-white flex items-center gap-2">
            <Battery className={isLowBattery ? 'text-red-500 animate-pulse' : 'text-indigo-400'} /> 
            Simulador de Batería (Xpenology UPS)
          </h3>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Visualización de Batería */}
          <div className="lg:col-span-2 space-y-6">
            <div className="relative h-24 bg-slate-800 rounded-3xl border-4 border-slate-700 p-2 overflow-hidden">
              <motion.div 
                initial={false}
                animate={{ width: `${batteryPercentage}%` }}
                className={`h-full rounded-2xl transition-colors duration-500 ${
                  battery.isCharging ? 'bg-emerald-500' : 
                  batteryPercentage < 20 ? 'bg-red-500' : 
                  batteryPercentage < 50 ? 'bg-amber-500' : 'bg-indigo-500'
                }`}
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-3xl font-black text-white drop-shadow-lg flex items-center gap-2">
                  {battery.isCharging && <BatteryCharging className="animate-bounce" />}
                  {Math.round(batteryPercentage)}%
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-white/5 p-4 rounded-xl text-center">
                <div className="text-xs text-slate-400 font-bold uppercase mb-1">Voltaje</div>
                <div className="text-xl font-black text-white">{battery.voltage}V</div>
              </div>
              <div className="bg-white/5 p-4 rounded-xl text-center">
                <div className="text-xs text-slate-400 font-bold uppercase mb-1">Última Carga</div>
                <div className="text-xl font-black text-white">
                  {battery.lastChargeTime ? (() => {
                    const diff = Math.floor((Date.now() - battery.lastChargeTime) / 60000);
                    if (diff < 60) return `${diff}m`;
                    const h = Math.floor(diff / 60);
                    const m = diff % 60;
                    return `${h}h ${m}m`;
                  })() : '---'}
                </div>
              </div>
              <div className="bg-white/5 p-4 rounded-xl text-center">
                <div className="text-xs text-slate-400 font-bold uppercase mb-1">Capacidad</div>
                <div className="text-xl font-black text-white">{Math.round(battery.currentWh)}Wh</div>
              </div>
              <div className="bg-white/5 p-4 rounded-xl text-center">
                <div className="text-xs text-slate-400 font-bold uppercase mb-1">Consumo P_sys</div>
                <div className="text-xl font-black text-white">
                  {battery.pSys || 0}W
                </div>
              </div>
            </div>

            {/* Gráfica de Historial */}
            <div className="bg-white/5 p-6 rounded-2xl border border-white/5">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-sm font-bold text-white flex items-center gap-2 uppercase tracking-wider">
                  <TrendingUp size={16} className="text-indigo-400" /> Historial 24h (Voltaje)
                </h4>
                <button 
                  onClick={() => setShowCalibration(!showCalibration)}
                  className="text-xs font-bold text-indigo-400 hover:text-indigo-300 flex items-center gap-1 transition-colors"
                >
                  <Calculator size={14} /> Calibrar Simulador
                </button>
              </div>
              
              <div className="h-48 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={history.map(p => ({ ...p, time: new Date(p.t * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }))}>
                    <defs>
                      <linearGradient id="colorV" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" vertical={false} />
                    <XAxis 
                      dataKey="time" 
                      stroke="#475569" 
                      fontSize={10} 
                      tickLine={false} 
                      axisLine={false}
                      interval={Math.floor(history.length / 6)}
                    />
                    <YAxis 
                      domain={[11.5, 17]} 
                      stroke="#475569" 
                      fontSize={10} 
                      tickLine={false} 
                      axisLine={false}
                      tickFormatter={(v) => `${v}V`}
                    />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #ffffff10', borderRadius: '12px' }}
                      itemStyle={{ color: '#fff', fontSize: '12px' }}
                      labelStyle={{ color: '#64748b', fontSize: '10px', marginBottom: '4px' }}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="v" 
                      stroke="#6366f1" 
                      strokeWidth={2}
                      fillOpacity={1} 
                      fill="url(#colorV)" 
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <AnimatePresence>
              {showCalibration && (
                <motion.div 
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="bg-indigo-500/5 border border-indigo-500/20 p-6 rounded-2xl space-y-4">
                    <h4 className="text-sm font-bold text-white flex items-center gap-2 uppercase tracking-wider">
                      <Calculator size={16} className="text-indigo-400" /> Herramienta de Calibración
                    </h4>
                    <p className="text-xs text-slate-400">
                      Ingresa los datos observados manualmente (ej. con un voltímetro) para ajustar la precisión del simulador.
                    </p>
                    
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase">V. Inicial</label>
                        <input 
                          type="number" step="0.1" value={calibData.vStart}
                          onChange={e => setCalibData({...calibData, vStart: parseFloat(e.target.value)})}
                          className="w-full bg-slate-800 border border-white/5 rounded-lg px-3 py-1.5 text-white text-xs"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase">V. Final</label>
                        <input 
                          type="number" step="0.1" value={calibData.vEnd}
                          onChange={e => setCalibData({...calibData, vEnd: parseFloat(e.target.value)})}
                          className="w-full bg-slate-800 border border-white/5 rounded-lg px-3 py-1.5 text-white text-xs"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase">Hora Inicio</label>
                        <input 
                          type="time" value={calibData.tStart}
                          onChange={e => setCalibData({...calibData, tStart: e.target.value})}
                          className="w-full bg-slate-800 border border-white/5 rounded-lg px-3 py-1.5 text-white text-xs"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase">Hora Fin</label>
                        <input 
                          type="time" value={calibData.tEnd}
                          onChange={e => setCalibData({...calibData, tEnd: e.target.value})}
                          className="w-full bg-slate-800 border border-white/5 rounded-lg px-3 py-1.5 text-white text-xs"
                        />
                      </div>
                    </div>

                    <button 
                      onClick={handleCalibrate}
                      className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all"
                    >
                      Calcular Sugerencias
                    </button>

                    {calibResult && (
                      <div className="bg-white/5 p-4 rounded-xl border border-white/5 space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] text-slate-400 uppercase font-bold">Tasa Real vs Sim</span>
                          <span className="text-xs font-mono text-white">{calibResult.observedRate}V/h vs {calibResult.simulatedRate}V/h</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] text-slate-400 uppercase font-bold">Desviación</span>
                          <span className={`text-xs font-bold ${Math.abs(1 - calibResult.factor) > 0.1 ? 'text-amber-400' : 'text-emerald-400'}`}>
                            {Math.round(calibResult.factor * 100)}%
                          </span>
                        </div>
                        <div className="pt-2 border-t border-white/5">
                          <div className="text-[10px] text-indigo-400 uppercase font-black mb-1">Sugerencia:</div>
                          <p className="text-xs text-white leading-relaxed">{calibResult.suggestion}</p>
                        </div>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {isLowBattery && (
              <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-xl flex items-center gap-3 text-red-400 animate-pulse">
                <AlertTriangle />
                <span className="font-bold">ALERTA: Batería Crítica. Conecte el cargador inmediatamente.</span>
              </div>
            )}
            {isFullBattery && battery.isCharging && (
              <div className="bg-emerald-500/10 border border-emerald-500/20 p-4 rounded-xl flex items-center gap-3 text-emerald-400">
                <Zap />
                <span className="font-bold">Batería completamente cargada.</span>
              </div>
            )}
          </div>

          {/* Configuración del Simulador */}
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-400 uppercase">Voltaje Actual (V)</label>
              <input 
                type="number" 
                step="0.01"
                min="12"
                max="16.8"
                value={battery.voltage}
                onFocus={() => setIsEditing(true)}
                onBlur={() => setIsEditing(false)}
                onChange={e => {
                  const v = parseFloat(e.target.value) || 0;
                  const soh = battery.cellHealth / 100;
                  const nominalVoltage = battery.cellsSeries * 3.7;
                  const totalAh = (battery.cellCapacityMah * battery.cellsParallel) / 1000;
                  const maxWh = nominalVoltage * totalAh * soh;
                  const percentage = Math.max(0, Math.min(1, (v - 12) / 4.8));
                  const newWh = maxWh * percentage;
                  setBattery({...battery, voltage: v, currentWh: newWh});
                }}
                className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:border-indigo-500 outline-none transition-all"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-400 uppercase">Rango de Consumo (Min - Max W)</label>
              <div className="flex gap-2">
                <input 
                  type="number" 
                  value={battery.minWatts}
                  onFocus={() => setIsEditing(true)}
                  onBlur={() => setIsEditing(false)}
                  onChange={e => setBattery({...battery, minWatts: parseInt(e.target.value) || 0})}
                  className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:border-indigo-500 outline-none transition-all"
                  placeholder="Mínimo (W)"
                />
                <input 
                  type="number" 
                  value={battery.maxWatts}
                  onFocus={() => setIsEditing(true)}
                  onBlur={() => setIsEditing(false)}
                  onChange={e => setBattery({...battery, maxWatts: parseInt(e.target.value) || 0})}
                  className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:border-indigo-500 outline-none transition-all"
                  placeholder="Máximo (W)"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-400 uppercase">Config (S)</label>
                <input 
                  type="number" 
                  value={battery.cellsSeries}
                  onFocus={() => setIsEditing(true)}
                  onBlur={() => setIsEditing(false)}
                  onChange={e => setBattery({...battery, cellsSeries: parseInt(e.target.value) || 4})}
                  className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-white text-sm"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-400 uppercase">Config (P)</label>
                <input 
                  type="number" 
                  value={battery.cellsParallel}
                  onFocus={() => setIsEditing(true)}
                  onBlur={() => setIsEditing(false)}
                  onChange={e => setBattery({...battery, cellsParallel: parseInt(e.target.value) || 4})}
                  className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-white text-sm"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-400 uppercase">Capacidad Celda (mAh)</label>
                <input 
                  type="number" 
                  value={battery.cellCapacityMah}
                  onFocus={() => setIsEditing(true)}
                  onBlur={() => setIsEditing(false)}
                  onChange={e => setBattery({...battery, cellCapacityMah: parseInt(e.target.value) || 5000})}
                  className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-white text-sm"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-400 uppercase">Límite Cargador (W)</label>
              <input 
                type="number" 
                value={battery.chargePower}
                onFocus={() => setIsEditing(true)}
                onBlur={() => setIsEditing(false)}
                onChange={e => setBattery({...battery, chargePower: parseInt(e.target.value) || 45})}
                className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-white text-sm"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-400 uppercase">Salud de Celdas (%)</label>
              <input 
                type="range" 
                min="1" 
                max="100"
                value={battery.cellHealth}
                onFocus={() => setIsEditing(true)}
                onBlur={() => setIsEditing(false)}
                onChange={e => setBattery({...battery, cellHealth: parseInt(e.target.value)})}
                className="w-full accent-indigo-500"
              />
              <div className="text-right text-xs text-slate-400">{battery.cellHealth}%</div>
            </div>

            <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl">
              <span className="text-sm font-bold text-white">Estado de Carga</span>
              <button 
                onClick={() => setBattery({...battery, isCharging: !battery.isCharging})}
                className={`w-12 h-6 rounded-full transition-colors relative ${battery.isCharging ? 'bg-emerald-500' : 'bg-slate-700'}`}
              >
                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${battery.isCharging ? 'left-7' : 'left-1'}`} />
              </button>
            </div>

            <button 
              onClick={saveBatteryConfig}
              className="w-full flex items-center justify-center gap-2 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold transition-all shadow-lg shadow-indigo-500/20"
            >
              <Save size={18} /> Guardar Configuración
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, subValue, progress, color }: any) {
  const colors: any = {
    blue: 'bg-blue-500',
    purple: 'bg-purple-500',
    emerald: 'bg-emerald-500',
    amber: 'bg-amber-500'
  };

  return (
    <div className="bg-slate-900/50 border border-white/5 p-5 rounded-2xl">
      <div className="flex items-center gap-3 mb-3">
        <div className="p-2 bg-white/5 rounded-lg">
          {icon}
        </div>
        <div>
          <div className="text-xs text-slate-400 font-bold uppercase">{label}</div>
          <div className="text-xl font-black text-white">{value}</div>
        </div>
      </div>
      {progress !== undefined && (
        <div className="space-y-1.5">
          <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
            <motion.div 
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              className={`h-full ${colors[color]}`}
            />
          </div>
          <div className="text-[10px] text-slate-500 font-bold text-right uppercase">{subValue}</div>
        </div>
      )}
      {progress === undefined && (
        <div className="text-[10px] text-slate-500 font-bold uppercase">{subValue}</div>
      )}
    </div>
  );
}
