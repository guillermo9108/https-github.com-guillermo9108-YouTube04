import React, { useState } from 'react';
import { useNavigate } from '../Router';
import { ArrowLeft, CreditCard, DollarSign, ShieldCheck, AlertCircle, CheckCircle2 } from 'lucide-react';
import { db } from '../../services/db';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { motion, AnimatePresence } from 'motion/react';

const RechargePage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { success: showSuccess, error: showError } = useToast();
  const [amount, setAmount] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleRecharge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      showError('Por favor ingresa un monto válido');
      return;
    }

    setLoading(true);
    try {
      await db.submitBalanceRequest(user.id, numAmount);
      setSuccess(true);
      showSuccess('Solicitud enviada correctamente');
    } catch (error) {
      console.error('Error recharging:', error);
      showError('Error al enviar la solicitud');
    } finally {
      setLoading(false);
    }
  };

  const quickAmounts = [5, 10, 20, 50, 100];

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)] pb-20">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-[var(--bg-secondary)] border-b border-[var(--divider)] px-4 py-3 flex items-center gap-4">
        <button onClick={() => navigate(-1)} className="p-1 hover:bg-[var(--hover-overlay)] rounded-full transition-colors">
          <ArrowLeft className="w-6 h-6" />
        </button>
        <h1 className="text-xl font-bold">Recargar Saldo</h1>
      </header>

      <main className="p-4 max-w-md mx-auto">
        <AnimatePresence mode="wait">
          {!success ? (
            <motion.div
              key="form"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <div className="bg-[var(--bg-secondary)] rounded-xl p-6 shadow-lg border border-[var(--divider)] mb-6">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-12 h-12 bg-blue-500/20 rounded-full flex items-center justify-center">
                    <DollarSign className="w-6 h-6 text-blue-500" />
                  </div>
                  <div>
                    <h2 className="font-bold text-lg">Ingresa el monto</h2>
                    <p className="text-sm text-[var(--text-secondary)]">El saldo será revisado por un administrador</p>
                  </div>
                </div>

                <form onSubmit={handleRecharge} className="space-y-6">
                  <div>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl font-bold text-[var(--text-secondary)]">$</span>
                      <input
                        type="number"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        placeholder="0.00"
                        className="w-full bg-[var(--bg-primary)] border border-[var(--divider)] rounded-xl py-4 pl-10 pr-4 text-3xl font-bold focus:outline-none focus:border-blue-500 transition-colors"
                        required
                        min="1"
                        step="0.01"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    {quickAmounts.map((amt) => (
                      <button
                        key={amt}
                        type="button"
                        onClick={() => setAmount(amt.toString())}
                        className={`py-2 rounded-lg border transition-all ${
                          amount === amt.toString()
                            ? 'bg-blue-600 border-blue-600 text-white'
                            : 'bg-[var(--bg-primary)] border-[var(--divider)] hover:border-blue-500'
                        }`}
                      >
                        ${amt}
                      </button>
                    ))}
                  </div>

                  <button
                    type="submit"
                    disabled={loading || !amount}
                    className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-4 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20"
                  >
                    {loading ? (
                      <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <>
                        <CreditCard className="w-5 h-5" />
                        Solicitar Recarga
                      </>
                    )}
                  </button>
                </form>
              </div>

              <div className="space-y-4">
                <div className="flex gap-3 p-4 bg-blue-500/10 rounded-xl border border-blue-500/20">
                  <ShieldCheck className="w-6 h-6 text-blue-500 shrink-0" />
                  <p className="text-sm text-blue-200">
                    Tu transacción es segura. Una vez enviada, un administrador verificará el pago y acreditará el saldo.
                  </p>
                </div>
                <div className="flex gap-3 p-4 bg-amber-500/10 rounded-xl border border-amber-500/20">
                  <AlertCircle className="w-6 h-6 text-amber-500 shrink-0" />
                  <p className="text-sm text-amber-200">
                    Asegúrate de haber realizado la transferencia antes de solicitar la recarga para evitar demoras.
                  </p>
                </div>
              </div>
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
              <h2 className="text-2xl font-bold mb-2">¡Solicitud Enviada!</h2>
              <p className="text-[var(--text-secondary)] mb-8 max-w-xs">
                Hemos recibido tu solicitud de recarga por ${amount}. Te notificaremos cuando sea aprobada.
              </p>
              <button
                onClick={() => navigate('/wallet')}
                className="bg-[var(--bg-secondary)] hover:bg-[var(--hover-overlay)] border border-[var(--divider)] px-8 py-3 rounded-xl font-bold transition-all"
              >
                Ir a mi Billetera
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
};

export default RechargePage;
