
import React, { useState, useEffect } from 'react';
import { 
  Cpu, HardDrive, Activity, Users, Battery, Zap, Power, 
  RefreshCw, ArrowUp, ArrowDown, AlertTriangle, BatteryCharging,
  Settings, Save
} from 'lucide-react';
import { motion } from 'motion/react';
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
}

export default function AdminServerStats() {
  const [stats, setStats] = useState<ServerStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [battery, setBattery] = useState<BatteryConfig>({
    voltage: 14.8,
    minWatts: 200,
    maxWatts: 300,
    isCharging: false,
    cellHealth: 85,
    currentWh: 200,
    lastUpdate: Date.now(),
    chargePower: 65
  });
  const [isEditingVoltage, setIsEditingVoltage] = useState(false);
  const isEditingVoltageRef = React.useRef(false);

  useEffect(() => {
    isEditingVoltageRef.current = isEditingVoltage;
  }, [isEditingVoltage]);
  const { addToast, success: toastSuccess, error: toastError } = useToast();

  const fetchStats = async () => {
    try {
      const data = await db.adminGetServerStats();
      setStats(data);
      if (data.battery && !isEditingVoltageRef.current) {
        setBattery(prev => ({ ...prev, ...data.battery }));
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
      if (isEditingVoltageRef.current) return; // Pausar simulación si el admin está ajustando manualmente

      setBattery(prev => {
        const now = Date.now();
        const elapsedHours = (now - prev.lastUpdate) / (1000 * 60 * 60);
        
        // Cálculo de consumo actual basado en CPU
        const currentWatts = prev.minWatts + (prev.maxWatts - prev.minWatts) * (stats.cpu / 100);
        
        let newWh = prev.currentWh;
        if (prev.isCharging) {
          newWh += prev.chargePower * elapsedHours;
        } else {
          newWh -= currentWatts * elapsedHours;
        }

        const maxWh = 300 * (prev.cellHealth / 100);
        if (newWh > maxWh) newWh = maxWh;
        if (newWh < 0) newWh = 0;

        // Voltaje simulado (12V a 16.8V)
        const percentage = (newWh / maxWh) * 100;
        const newVoltage = 12 + (4.8 * (percentage / 100));

        return {
          ...prev,
          currentWh: newWh,
          voltage: parseFloat(newVoltage.toFixed(2)),
          lastUpdate: now
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
                    const currentWatts = battery.minWatts + (battery.maxWatts - battery.minWatts) * (stats.cpu / 100);
                    const hours = battery.currentWh / currentWatts;
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
                <div className="text-xs text-slate-400 font-bold uppercase mb-1">Consumo Est.</div>
                <div className="text-xl font-black text-white">
                  {Math.round(battery.minWatts + (battery.maxWatts - battery.minWatts) * (stats.cpu / 100))}W
                </div>
              </div>
              <div className="bg-white/5 p-4 rounded-xl text-center">
                <div className="text-xs text-slate-400 font-bold uppercase mb-1">Capacidad</div>
                <div className="text-xl font-black text-white">{Math.round(battery.currentWh)}Wh</div>
              </div>
              <div className="bg-white/5 p-4 rounded-xl text-center">
                <div className="text-xs text-slate-400 font-bold uppercase mb-1">Estado</div>
                <div className={`text-xl font-black ${battery.isCharging ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {battery.isCharging ? 'Cargando' : 'Descargando'}
                </div>
              </div>
            </div>

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
                onFocus={() => setIsEditingVoltage(true)}
                onBlur={() => setIsEditingVoltage(false)}
                onChange={e => {
                  const v = parseFloat(e.target.value) || 0;
                  const maxWh = 300 * (battery.cellHealth / 100);
                  const percentage = Math.max(0, Math.min(1, (v - 12) / 4.8));
                  const newWh = maxWh * percentage;
                  setBattery({...battery, voltage: v, currentWh: newWh});
                }}
                className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:border-indigo-500 outline-none transition-all"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-400 uppercase">Rango de Consumo (W)</label>
              <div className="flex gap-2">
                <input 
                  type="number" 
                  value={battery.minWatts}
                  onChange={e => setBattery({...battery, minWatts: parseInt(e.target.value)})}
                  className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-white text-sm"
                  placeholder="Min"
                />
                <input 
                  type="number" 
                  value={battery.maxWatts}
                  onChange={e => setBattery({...battery, maxWatts: parseInt(e.target.value)})}
                  className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-white text-sm"
                  placeholder="Max"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-400 uppercase">Potencia de Carga (W)</label>
              <input 
                type="number" 
                value={battery.chargePower}
                onChange={e => setBattery({...battery, chargePower: parseInt(e.target.value)})}
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
