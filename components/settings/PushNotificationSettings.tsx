import React, { useState, useEffect } from 'react';
import { Bell, BellOff, Send, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { 
  isPushSupported, 
  getNotificationPermission, 
  subscribeUserToPush, 
  unsubscribeFromPush, 
  isSubscribedToPush,
  sendTestNotification
} from '../../utils/push';
import { useAuth } from '../../context/AuthContext';

export const PushNotificationSettings: React.FC = () => {
  const { user } = useAuth();
  const [supported, setSupported] = useState(true);
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    checkStatus();
  }, []);

  const checkStatus = async () => {
    const isSup = isPushSupported();
    setSupported(isSup);
    if (isSup) {
      const isSub = await isSubscribedToPush();
      setSubscribed(isSub);
    }
    setLoading(false);
  };

  const handleToggle = async () => {
    if (!user) return;
    setError(null);
    setSuccess(null);
    setActionLoading(true);

    try {
      if (subscribed) {
        const ok = await unsubscribeFromPush();
        if (ok) {
          setSubscribed(false);
          setSuccess("Notificaciones desactivadas correctamente.");
        } else {
          setError("Error al desactivar las notificaciones.");
        }
      } else {
        const ok = await subscribeUserToPush(user.id);
        if (ok) {
          setSubscribed(true);
          setSuccess("¡Notificaciones activadas con éxito!");
        } else {
          const permission = getNotificationPermission();
          if (permission === 'denied') {
            setError("Permiso denegado. Por favor, activa las notificaciones en la configuración de tu navegador.");
          } else {
            setError("Error al activar las notificaciones. Asegúrate de estar en un entorno seguro (HTTPS).");
          }
        }
      }
    } catch (err) {
      setError("Ocurrió un error inesperado.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleTest = async () => {
    if (!user) return;
    setActionLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const ok = await sendTestNotification(user.id);
      if (ok) {
        setSuccess("Notificación de prueba enviada. Deberías recibirla en unos segundos.");
      } else {
        setError("Error al enviar la notificación de prueba.");
      }
    } catch (err) {
      setError("Error al conectar con el servidor.");
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  if (!supported) {
    return (
      <div className="bg-amber-500/10 border border-amber-500/20 p-4 rounded-xl flex gap-3">
        <AlertCircle className="text-amber-500 shrink-0" />
        <div>
          <h4 className="font-bold text-amber-500">Push no soportado</h4>
          <p className="text-sm text-slate-400">
            Tu navegador actual no soporta notificaciones push. Prueba con Chrome, Firefox o Edge en una conexión segura.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-900/50 border border-white/5 p-6 rounded-2xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`p-3 rounded-xl ${subscribed ? 'bg-emerald-500/20' : 'bg-slate-800'}`}>
            {subscribed ? <Bell className="text-emerald-500" /> : <BellOff className="text-slate-400" />}
          </div>
          <div>
            <h3 className="font-bold text-white">Notificaciones Push</h3>
            <p className="text-sm text-slate-400">
              Recibe avisos de nuevos videos, ventas y actualizaciones en tiempo real.
            </p>
          </div>
        </div>
        <button
          onClick={handleToggle}
          disabled={actionLoading}
          className={`px-6 py-2 rounded-xl font-bold transition-all flex items-center gap-2 ${
            subscribed 
              ? 'bg-red-500/10 text-red-500 hover:bg-red-500/20' 
              : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-lg shadow-indigo-500/20'
          }`}
        >
          {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : (subscribed ? 'Desactivar' : 'Activar')}
        </button>
      </div>

      {subscribed && (
        <div className="pt-4 border-t border-white/5">
          <button
            onClick={handleTest}
            disabled={actionLoading}
            className="flex items-center gap-2 text-sm font-bold text-indigo-400 hover:text-indigo-300 transition-colors"
          >
            <Send size={16} /> Enviar notificación de prueba
          </button>
        </div>
      )}

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 p-3 rounded-lg flex gap-2 text-sm text-red-500">
          <AlertCircle size={18} className="shrink-0" />
          {error}
        </div>
      )}

      {success && (
        <div className="bg-emerald-500/10 border border-emerald-500/20 p-3 rounded-lg flex gap-2 text-sm text-emerald-500">
          <CheckCircle2 size={18} className="shrink-0" />
          {success}
        </div>
      )}
    </div>
  );
};

export default PushNotificationSettings;
