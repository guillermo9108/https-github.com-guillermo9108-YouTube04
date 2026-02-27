
import React, { useState, useEffect } from 'react';
import { DownloadCloud, Send, Loader2, Clock, Trash2, MessageSquare, Info } from 'lucide-react';
import { db } from '../../services/db';
import { ContentRequest } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from '../Router';
import { useToast } from '../../context/ToastContext';

export default function Requests() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  
  const [query, setQuery] = useState('');
  const [myRequests, setMyRequests] = useState<ContentRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadMyRequests = async () => {
      setLoading(true);
      try {
          const all = await db.getRequests();
          if (user) setMyRequests(all.filter((r: ContentRequest) => r.userId === user.id));
      } finally { setLoading(false); }
  };

  useEffect(() => { loadMyRequests(); }, [user?.id]);

  const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!user || !query.trim() || isSubmitting) return;
      
      setIsSubmitting(true);
      try {
          await db.requestContent(user.id, query.trim(), false);
          setQuery('');
          toast.success("Tu sugerencia ha sido enviada al administrador.");
          loadMyRequests();
      } catch (e: any) { 
          toast.error("Fallo al enviar: " + e.message); 
      } finally {
          setIsSubmitting(false);
      }
  };

  const handleDeleteRequest = async (id: string) => {
      if (!confirm("¿Eliminar esta sugerencia?")) return;
      try {
          await db.deleteRequest(id);
          setMyRequests(prev => prev.filter(r => r.id !== id));
          toast.success("Sugerencia eliminada");
      } catch(e: any) {
          toast.error("No se pudo eliminar");
      }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-8 pb-20 px-2 animate-in fade-in">
      <div className="flex flex-col items-center text-center mt-8">
         <div className="w-20 h-20 bg-indigo-600/20 rounded-[32px] flex items-center justify-center mb-4 text-indigo-400 shadow-inner">
            <DownloadCloud size={40} />
         </div>
         <h2 className="text-3xl font-black text-white uppercase italic tracking-tighter">Buzón de Contenido</h2>
         <p className="text-slate-500 text-xs font-bold uppercase tracking-widest max-w-sm mt-2">
            ¿Buscas algo específico? Cuéntanos qué te gustaría ver en el servidor y haremos lo posible por añadirlo.
         </p>
      </div>

      <div className="bg-slate-900/50 p-8 rounded-[40px] border border-slate-800 shadow-2xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none group-hover:scale-110 transition-transform duration-700">
             <MessageSquare size={120}/>
          </div>
          
          <form onSubmit={handleSubmit} className="space-y-6 relative z-10">
              <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-3 ml-1">Descripción de tu pedido</label>
                  <textarea 
                    value={query} 
                    onChange={e => setQuery(e.target.value)} 
                    rows={4}
                    className="w-full bg-slate-950 border border-slate-800 rounded-3xl px-6 py-5 text-white font-bold outline-none focus:ring-2 focus:ring-indigo-500 transition-all shadow-inner resize-none" 
                    placeholder="Ej: La última temporada de Yellowstone, el concierto de ColdPlay en Argentina..." 
                    required
                  />
              </div>
              <button 
                type="submit" 
                disabled={isSubmitting || !query.trim()}
                className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-600 text-white py-5 rounded-[24px] font-black text-xs uppercase tracking-[0.3em] shadow-xl active:scale-95 transition-all flex items-center justify-center gap-3"
              >
                  {isSubmitting ? <Loader2 className="animate-spin" size={20}/> : <Send size={20}/>}
                  Enviar Sugerencia
              </button>
          </form>
      </div>

      <div className="space-y-6">
          <div className="flex items-center justify-between px-4">
              <h3 className="font-black text-white text-sm uppercase tracking-tighter flex items-center gap-2">
                 <Clock size={18} className="text-amber-500"/> Mis Peticiones
              </h3>
              <span className="bg-slate-800 px-3 py-1 rounded-full text-[10px] font-black text-slate-400 uppercase tracking-widest">{myRequests.length} Enviadas</span>
          </div>

          {loading ? (
              <div className="flex justify-center py-10"><Loader2 className="animate-spin text-indigo-500" /></div>
          ) : myRequests.length === 0 ? (
              <div className="text-center p-12 bg-slate-900/30 rounded-[40px] border-2 border-dashed border-slate-800/50 text-slate-600 flex flex-col items-center">
                  <Info size={40} className="mb-4 opacity-20"/>
                  <p className="text-[10px] font-black uppercase tracking-widest">No has enviado ninguna petición todavía</p>
              </div>
          ) : (
              <div className="space-y-3">
                  {myRequests.map((req) => (
                      <div key={req.id} className="bg-slate-900/80 backdrop-blur-md p-6 rounded-[32px] border border-slate-800 flex justify-between items-center group hover:border-indigo-500/30 transition-all shadow-lg">
                          <div className="min-w-0 flex-1">
                              <h4 className="font-black text-white text-sm uppercase tracking-tighter leading-snug pr-4">{req.query}</h4>
                              <div className="flex items-center gap-4 mt-3">
                                  <span className={`text-[8px] font-black px-2.5 py-1 rounded-lg uppercase tracking-widest ${req.status === 'PENDING' ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20' : 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'}`}>
                                      {req.status === 'PENDING' ? 'En espera' : 'Completado'}
                                  </span>
                                  <span className="text-[9px] text-slate-500 font-bold uppercase">{new Date(req.createdAt * 1000).toLocaleDateString()}</span>
                              </div>
                          </div>
                          <button 
                            onClick={() => handleDeleteRequest(req.id)} 
                            className="p-4 text-slate-500 hover:text-red-500 hover:bg-red-500/10 rounded-2xl transition-all active:scale-90 opacity-0 group-hover:opacity-100"
                          >
                              <Trash2 size={20} />
                          </button>
                      </div>
                  ))}
              </div>
          )}
      </div>
    </div>
  );
}
