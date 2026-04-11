import React, { useState } from 'react';
import { useNavigate } from '../Router';
import { ArrowLeft, Flag, AlertTriangle, Bug, ShieldAlert, Send, CheckCircle2, Camera } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { motion, AnimatePresence } from 'motion/react';

const ReportPage: React.FC = () => {
  const navigate = useNavigate();
  const { success: showSuccess, error: showError } = useToast();
  const [type, setType] = useState<string>('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const reportTypes = [
    { id: 'bug', label: 'Error en la App', icon: Bug, color: 'text-amber-500', bg: 'bg-amber-500/10' },
    { id: 'content', label: 'Contenido Inapropiado', icon: Flag, color: 'text-red-500', bg: 'bg-red-500/10' },
    { id: 'user', label: 'Comportamiento de Usuario', icon: ShieldAlert, color: 'text-blue-500', bg: 'bg-blue-500/10' },
    { id: 'other', label: 'Otro Problema', icon: AlertTriangle, color: 'text-slate-500', bg: 'bg-slate-500/10' },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!type || !description) {
      showError('Por favor completa todos los campos');
      return;
    }

    setLoading(true);
    // Simular envío de reporte (en una app real esto iría a una tabla 'reports' en la DB)
    setTimeout(() => {
      setLoading(false);
      setSuccess(true);
      showSuccess('Reporte enviado correctamente');
    }, 1500);
  };

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)] pb-20">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-[var(--bg-secondary)] border-b border-[var(--divider)] px-4 py-3 flex items-center gap-4">
        <button onClick={() => navigate(-1)} className="p-1 hover:bg-[var(--hover-overlay)] rounded-full transition-colors">
          <ArrowLeft className="w-6 h-6" />
        </button>
        <h1 className="text-xl font-bold">Reportar Problema</h1>
      </header>

      <main className="p-4 max-w-md mx-auto">
        <AnimatePresence mode="wait">
          {!success ? (
            <motion.div
              key="form"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <div className="bg-[var(--bg-secondary)] rounded-2xl p-6 border border-[var(--divider)] shadow-lg">
                <h2 className="font-bold text-lg mb-4">¿Qué quieres reportar?</h2>
                <div className="grid grid-cols-2 gap-3">
                  {reportTypes.map((rt) => (
                    <button
                      key={rt.id}
                      type="button"
                      onClick={() => setType(rt.id)}
                      className={`p-4 rounded-xl border transition-all flex flex-col items-center gap-2 text-center ${
                        type === rt.id
                          ? 'bg-blue-600 border-blue-600 text-white'
                          : 'bg-[var(--bg-primary)] border-[var(--divider)] hover:border-blue-500'
                      }`}
                    >
                      <div className={`w-10 h-10 ${type === rt.id ? 'bg-white/20' : rt.bg} rounded-full flex items-center justify-center`}>
                        <rt.icon className={`w-5 h-5 ${type === rt.id ? 'text-white' : rt.color}`} />
                      </div>
                      <span className="text-xs font-bold">{rt.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="bg-[var(--bg-secondary)] rounded-2xl p-6 border border-[var(--divider)] shadow-lg">
                <h2 className="font-bold text-lg mb-4">Detalles del problema</h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Describe lo que sucedió..."
                      className="w-full bg-[var(--bg-primary)] border border-[var(--divider)] rounded-xl p-4 min-h-[150px] focus:outline-none focus:border-blue-500 transition-colors resize-none"
                      required
                    />
                  </div>

                  <button
                    type="button"
                    className="w-full py-3 px-4 bg-[var(--bg-primary)] border border-dashed border-[var(--divider)] rounded-xl flex items-center justify-center gap-2 text-[var(--text-secondary)] hover:border-blue-500 hover:text-blue-500 transition-all"
                  >
                    <Camera className="w-5 h-5" />
                    <span className="text-sm font-medium">Adjuntar captura (opcional)</span>
                  </button>

                  <button
                    type="submit"
                    disabled={loading || !type || !description}
                    className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-4 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20"
                  >
                    {loading ? (
                      <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <>
                        <Send className="w-5 h-5" />
                        Enviar Reporte
                      </>
                    )}
                  </button>
                </form>
              </div>

              <p className="text-xs text-[var(--text-secondary)] text-center px-4">
                Tu reporte será revisado por nuestro equipo de moderación. Gracias por ayudarnos a mejorar StreamPay.
              </p>
            </motion.div>
          ) : (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center justify-center py-12 text-center"
            >
              <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mb-6">
                <CheckCircle2 className="w-12 h-12 text-green-500" />
              </div>
              <h2 className="text-2xl font-bold mb-2">¡Reporte Enviado!</h2>
              <p className="text-[var(--text-secondary)] mb-8 max-w-xs">
                Gracias por informarnos. Revisaremos tu reporte lo antes posible.
              </p>
              <button
                onClick={() => navigate('/menu')}
                className="bg-[var(--bg-secondary)] hover:bg-[var(--hover-overlay)] border border-[var(--divider)] px-8 py-3 rounded-xl font-bold transition-all"
              >
                Volver al Menú
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
};

export default ReportPage;
