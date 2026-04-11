import React, { useState, useEffect } from 'react';
import { useNavigate } from '../Router';
import { ArrowLeft, Wallet, Plus, ArrowUpRight, ArrowDownLeft, History, Clock, CheckCircle2, XCircle } from 'lucide-react';
import { db } from '../../services/db';
import { useAuth } from '../../context/AuthContext';
import { motion } from 'motion/react';

const WalletPage: React.FC = () => {
  const navigate = useNavigate();
  const { user, refreshUser } = useAuth();
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTransactions = async () => {
      if (!user) return;
      try {
        const data = await db.getTransactions(user.id);
        setTransactions(data);
      } catch (error) {
        console.error('Error fetching transactions:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchTransactions();
    refreshUser();
  }, [user?.id]);

  const getTransactionIcon = (type: string) => {
    switch (type) {
      case 'DEPOSIT':
      case 'ADMIN_ADJUSTMENT':
        return <ArrowDownLeft className="w-5 h-5 text-green-500" />;
      case 'PURCHASE':
      case 'MARKET_PURCHASE':
      case 'VIP':
        return <ArrowUpRight className="w-5 h-5 text-red-500" />;
      default:
        return <History className="w-5 h-5 text-blue-500" />;
    }
  };

  const getTransactionLabel = (tx: any) => {
    switch (tx.type) {
      case 'DEPOSIT': return 'Recarga de Saldo';
      case 'PURCHASE': return `Compra: ${tx.videoTitle || 'Video'}`;
      case 'MARKET_PURCHASE': return `Compra Market: ${tx.videoTitle || 'Artículo'}`;
      case 'VIP': return `Membresía: ${tx.videoTitle || 'VIP'}`;
      case 'ADMIN_ADJUSTMENT': return 'Ajuste Administrativo';
      default: return tx.type;
    }
  };

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)] pb-20">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-[var(--bg-secondary)] border-b border-[var(--divider)] px-4 py-3 flex items-center gap-4">
        <button onClick={() => navigate(-1)} className="p-1 hover:bg-[var(--hover-overlay)] rounded-full transition-colors">
          <ArrowLeft className="w-6 h-6" />
        </button>
        <h1 className="text-xl font-bold">Mi Billetera</h1>
      </header>

      <main className="p-4 max-w-md mx-auto space-y-6">
        {/* Balance Card */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-gradient-to-br from-blue-600 to-blue-800 rounded-2xl p-6 shadow-xl shadow-blue-600/20 relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <Wallet className="w-32 h-32 rotate-12" />
          </div>
          
          <div className="relative z-10">
            <p className="text-blue-100 text-sm font-medium mb-1">Saldo Disponible</p>
            <h2 className="text-4xl font-bold mb-6">${user?.balance?.toFixed(2) || '0.00'}</h2>
            
            <button
              onClick={() => navigate('/recharge')}
              className="w-full bg-white text-blue-700 font-bold py-3 rounded-xl flex items-center justify-center gap-2 hover:bg-blue-50 transition-colors shadow-lg"
            >
              <Plus className="w-5 h-5" />
              Recargar Saldo
            </button>
          </div>
        </motion.div>

        {/* Recent Transactions */}
        <div className="space-y-4">
          <div className="flex items-center justify-between px-1">
            <h3 className="font-bold text-lg">Transacciones Recientes</h3>
            <button className="text-blue-500 text-sm font-medium hover:underline">Ver todo</button>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-20 bg-[var(--bg-secondary)] rounded-xl animate-pulse" />
              ))}
            </div>
          ) : transactions.length > 0 ? (
            <div className="space-y-3">
              {transactions.map((tx) => (
                <motion.div
                  key={tx.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="bg-[var(--bg-secondary)] p-4 rounded-xl border border-[var(--divider)] flex items-center justify-between"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-[var(--bg-primary)] rounded-full flex items-center justify-center border border-[var(--divider)]">
                      {getTransactionIcon(tx.type)}
                    </div>
                    <div>
                      <p className="font-bold text-sm line-clamp-1">{getTransactionLabel(tx)}</p>
                      <p className="text-xs text-[var(--text-secondary)]">
                        {new Date(tx.timestamp * 1000).toLocaleDateString()} • {new Date(tx.timestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`font-bold ${['DEPOSIT', 'ADMIN_ADJUSTMENT'].includes(tx.type) ? 'text-green-500' : 'text-red-500'}`}>
                      {['DEPOSIT', 'ADMIN_ADJUSTMENT'].includes(tx.type) ? '+' : '-'}${parseFloat(tx.amount).toFixed(2)}
                    </p>
                    <div className="flex items-center justify-end gap-1">
                      <CheckCircle2 className="w-3 h-3 text-green-500" />
                      <span className="text-[10px] text-green-500 font-medium uppercase">Completado</span>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          ) : (
            <div className="bg-[var(--bg-secondary)] rounded-xl p-8 text-center border border-[var(--divider)]">
              <div className="w-16 h-16 bg-[var(--bg-primary)] rounded-full flex items-center justify-center mx-auto mb-4 border border-[var(--divider)]">
                <Clock className="w-8 h-8 text-[var(--text-secondary)]" />
              </div>
              <p className="text-[var(--text-secondary)]">No tienes transacciones aún</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default WalletPage;
