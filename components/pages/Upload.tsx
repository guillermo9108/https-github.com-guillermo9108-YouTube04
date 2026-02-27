import React, { useState, useRef, useEffect } from 'react';
import { Upload as UploadIcon, FileVideo, X, Plus, Image as ImageIcon, Tag, Layers, Loader2, DollarSign, Settings, Save, Edit3, Wand2, Clock, Sparkles, Music } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useUpload } from '../../context/UploadContext';
import { useNavigate } from '../Router';
import { VideoCategory, Category, SystemSettings } from '../../types';
import { db } from '../../services/db';
import { useToast } from '../../context/ToastContext';
import { generateThumbnail } from '../../utils/videoGenerator';
import { aiService } from '../../services/ai';

const ThumbnailPreview = ({ file }: { file: File }) => {
    const [src, setSrc] = useState<string>('');
    useEffect(() => {
        const url = URL.createObjectURL(file); setSrc(url);
        return () => URL.revokeObjectURL(url);
    }, [file]);
    return <img src={src} alt="Thumb" className="w-full h-full object-cover transition-opacity duration-500 animate-in fade-in" />;
};

export default function Upload() {
  const { user } = useAuth();
  const { addToQueue } = useUpload();
  const navigate = useNavigate();
  const toast = useToast();
  
  const [files, setFiles] = useState<File[]>([]);
  const [titles, setTitles] = useState<string[]>([]);
  const [thumbnails, setThumbnails] = useState<(File | null)[]>([]);
  const [durations, setDurations] = useState<number[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [prices, setPrices] = useState<number[]>([]); 
  
  const [bulkDesc, setBulkDesc] = useState('');
  const [bulkCategory, setBulkCategory] = useState<string>(VideoCategory.PERSONAL);
  const [bulkPrice, setBulkPrice] = useState<string>('');

  const [availableCategories, setAvailableCategories] = useState<string[]>([VideoCategory.PERSONAL, ...Object.values(VideoCategory).filter(v => v !== VideoCategory.PERSONAL)]);
  const [systemSettings, setSystemSettings] = useState<SystemSettings | null>(null);
  
  const [isProcessingQueue, setIsProcessingQueue] = useState(false);
  const [queueProgress, setQueueProgress] = useState({ current: 0, total: 0 });
  const processingRef = useRef(false); 
  const queueRef = useRef<{file: File, index: number}[]>([]);
  const isMounted = useRef(true);

  useEffect(() => {
      isMounted.current = true;
      const loadConfig = async () => {
          try {
              const settings = await db.getSystemSettings();
              if (isMounted.current && settings) {
                setSystemSettings(settings);
                const sysCatNames = (settings.categories || []).map(c => c.name);
                const standard = Object.values(VideoCategory) as string[];
                const combined = Array.from(new Set([VideoCategory.PERSONAL, ...sysCatNames, ...standard]));
                setAvailableCategories(combined);
              }
          } catch(e) {}
      };
      loadConfig();
      return () => { isMounted.current = false; };
  }, []);

  const getPriceForCategory = (catName: string) => {
      if (user?.defaultPrices && user.defaultPrices[catName] !== undefined) return Number(user.defaultPrices[catName]);
      if (systemSettings?.categories) {
          const cat = systemSettings.categories.find(c => c.name === catName);
          if (cat) return Number(cat.price);
      }
      return 1.00;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const newFiles = Array.from(e.target.files) as File[];
      const startIndex = files.length;
      const newTitles = newFiles.map(f => f.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " "));
      
      const defaultCat = VideoCategory.PERSONAL;
      const defaultPrice = getPriceForCategory(defaultCat);

      setFiles(prev => [...prev, ...newFiles]);
      setTitles(prev => [...prev, ...newTitles]);
      setThumbnails(prev => [...prev, ...new Array(newFiles.length).fill(null)]);
      setDurations(prev => [...prev, ...new Array(newFiles.length).fill(0)]);
      setCategories(prev => [...prev, ...new Array(newFiles.length).fill(defaultCat)]);
      setPrices(prev => [...prev, ...new Array(newFiles.length).fill(defaultPrice)]);

      newFiles.forEach((f, i) => queueRef.current.push({ file: f, index: startIndex + i }));
      setQueueProgress(prev => ({ ...prev, total: prev.total + newFiles.length }));
      if (!processingRef.current) processQueue();
    }
  };

  const processQueue = async () => {
      if (!isMounted.current) return;
      if (queueRef.current.length === 0) { 
          processingRef.current = false; 
          setIsProcessingQueue(false); 
          setQueueProgress({ current: 0, total: 0 });
          return; 
      }
      
      processingRef.current = true; 
      setIsProcessingQueue(true);
      const task = queueRef.current.shift(); 
      
      if (task) {
          setQueueProgress(prev => ({ ...prev, current: prev.current + 1 }));
          try {
              const res = await generateThumbnail(task.file);
              if (isMounted.current) {
                  setThumbnails(prev => { 
                      const n = [...prev]; 
                      if (n.length > task.index) n[task.index] = res.thumbnail; 
                      return n; 
                  });
                  setDurations(prev => { 
                      const n = [...prev]; 
                      if (n.length > task.index) n[task.index] = res.duration || 0; 
                      return n; 
                  });
              }
          } catch (e) {
              console.error("Error procesando archivo en cola:", e);
          }
          // Pequeña pausa para no bloquear el hilo principal
          await new Promise(r => setTimeout(r, 50)); 
          processQueue();
      }
  };

  const removeFile = (i: number) => {
    if (isProcessingQueue) { toast.error("Espera a que termine el análisis"); return; }
    const f = (_: any, idx: number) => idx !== i;
    setFiles(prev => prev.filter(f)); setTitles(prev => prev.filter(f)); setThumbnails(prev => prev.filter(f)); setDurations(prev => prev.filter(f)); setCategories(prev => prev.filter(f)); setPrices(prev => prev.filter(f));
  };

  const updateTitle = (i: number, v: string) => setTitles(p => { const n = [...p]; n[i] = v; return n; });
  const updateCategory = (i: number, v: string) => { setCategories(p => { const n = [...p]; n[i] = v; return n; }); updatePrice(i, getPriceForCategory(v)); };
  const updatePrice = (i: number, v: number) => setPrices(p => { const n = [...p]; n[i] = v; return n; });
  const updateDuration = (i: number, v: number) => setDurations(p => { const n = [...p]; n[i] = v; return n; });

  const applyBulkChanges = () => {
      if (files.length === 0) return;
      if (bulkCategory) {
          setCategories(p => p.map(() => bulkCategory));
          if (bulkPrice === '') setPrices(p => p.map(() => getPriceForCategory(bulkCategory)));
      }
      if (bulkPrice !== '') { const pVal = parseFloat(bulkPrice); if (!isNaN(pVal)) setPrices(p => p.map(() => pVal)); }
      toast.success("Cambios aplicados");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || files.length === 0) return;
    
    const queue = files.map((f, i) => ({ 
        title: titles[i], 
        description: bulkDesc, 
        price: prices[i], 
        category: categories[i] as any, 
        duration: durations[i] || 0, 
        file: f, 
        thumbnail: thumbnails[i] 
    }));
    
    addToQueue(queue, user); 
    toast.success("Añadido a cola de subida"); 
    navigate('/'); 
  };

  return (
    <div className="max-w-6xl mx-auto px-2 pb-20 animate-in fade-in duration-500">
      <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-black flex items-center gap-2 text-white uppercase italic tracking-tighter"><UploadIcon className="text-indigo-500" /> Subir Contenido</h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-4">
           <div className={`relative border-2 border-dashed border-slate-700 rounded-3xl p-6 text-center hover:bg-slate-800/50 transition-all group cursor-pointer h-44 flex flex-col items-center justify-center bg-slate-900/50 ${isProcessingQueue ? 'pointer-events-none opacity-50' : ''}`}>
            <input type="file" accept="video/*,audio/*" multiple onChange={handleFileChange} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" disabled={isProcessingQueue} />
            <div className="flex flex-col items-center justify-center gap-2 pointer-events-none">
                {isProcessingQueue ? (
                    <>
                        <Loader2 size={32} className="text-indigo-500 animate-spin" />
                        <span className="text-slate-400 text-[10px] mt-2 font-black uppercase tracking-widest">Analizando...</span>
                        <div className="w-40 h-1.5 bg-slate-800 rounded-full mt-2 overflow-hidden border border-white/5"><div className="h-full bg-indigo-500 transition-all duration-300" style={{ width: `${queueProgress.total > 0 ? (queueProgress.current / queueProgress.total) * 100 : 0}%`}}></div></div>
                    </>
                ) : (
                    <>
                        <div className="w-14 h-14 rounded-2xl bg-slate-800 flex items-center justify-center group-hover:scale-110 group-hover:rotate-3 transition-all shadow-2xl border border-white/5"><Plus size={28} className="text-indigo-400" /></div>
                        <span className="text-slate-400 text-xs font-black uppercase tracking-widest mt-2">Seleccionar Archivos</span>
                    </>
                )}
            </div>
          </div>
          
          <div className="bg-slate-900 rounded-3xl border border-slate-800 overflow-hidden shadow-xl">
            <div className="p-4 border-b border-slate-800 bg-slate-950/50 flex items-center gap-2"><Edit3 size={18} className="text-indigo-400"/><h3 className="font-black text-xs text-white uppercase tracking-widest">Edición Masiva</h3></div>
            <div className="p-5 space-y-4">
                <div><label className="block text-[10px] font-black text-slate-500 uppercase mb-1.5 ml-1">Descripción</label><textarea rows={3} value={bulkDesc} onChange={e => setBulkDesc(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-xs focus:border-indigo-500 outline-none text-white resize-none shadow-inner" placeholder="Escribe para todos..." /></div>
                <div className="grid grid-cols-2 gap-3">
                    <div><label className="block text-[10px] font-black text-slate-500 uppercase mb-1.5 ml-1">Categoría</label>
                        <select value={bulkCategory} onChange={e => setBulkCategory(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white font-bold focus:border-indigo-500 outline-none cursor-pointer">
                            {availableCategories.map(c => <option key={c} value={c}>{c.replace('_', ' ')}</option>)}
                        </select>
                    </div>
                    <div><label className="block text-[10px] font-black text-slate-500 uppercase mb-1.5 ml-1">Precio ($)</label><input type="number" min="0" step="0.1" value={bulkPrice} onChange={e => setBulkPrice(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white font-bold focus:border-indigo-500 outline-none" placeholder="0.00"/></div>
                </div>
                <button type="button" onClick={applyBulkChanges} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 shadow-lg active:scale-95 mt-2"><Wand2 size={16}/> Aplicar Cambios</button>
            </div>
          </div>
        </div>

        <div className="lg:col-span-2">
           <form onSubmit={handleSubmit} className="bg-slate-900 rounded-3xl border border-slate-800 shadow-2xl overflow-hidden flex flex-col h-full max-h-[75vh]">
              <div className="p-5 border-b border-slate-800 flex justify-between items-center bg-slate-950/50"><h3 className="font-black text-white text-xs uppercase tracking-widest">Cola ({files.length})</h3>
                 {files.length > 0 && !isProcessingQueue && (
                     <button type="button" onClick={() => { setFiles([]); setTitles([]); setThumbnails([]); setDurations([]); setCategories([]); setPrices([]); }} className="text-[10px] text-red-400 hover:text-red-300 font-black uppercase tracking-widest bg-red-500/10 px-3 py-1.5 rounded-lg border border-red-500/20">Limpiar Lista</button>
                 )}
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-slate-950/30 custom-scrollbar">
                {files.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-slate-700 py-20"><FileVideo size={64} className="mb-4 opacity-20" /><p className="text-xs font-black uppercase tracking-[0.2em] opacity-30">No hay contenido</p></div>
                ) : (
                  files.map((f, idx) => (
                    <div key={`${f.name}-${idx}`} className="flex flex-col md:flex-row gap-4 bg-slate-900 p-4 rounded-2xl border border-slate-800 items-start md:items-center group hover:border-slate-600 transition-all animate-in slide-in-from-right-4">
                       <div className="w-full md:w-32 aspect-video rounded-xl bg-black shrink-0 overflow-hidden relative border border-slate-700 shadow-inner">
                         {thumbnails[idx] ? <ThumbnailPreview file={thumbnails[idx]!} /> : (
                             <div className="w-full h-full flex flex-col items-center justify-center bg-slate-950 text-slate-800">
                                {f.type.startsWith('audio') ? <Music size={32} className="opacity-20 animate-pulse"/> : <Loader2 className="w-5 h-5 text-indigo-500 animate-spin" />}
                             </div>
                         )}
                         <div className="absolute bottom-1 right-1 bg-black/80 backdrop-blur-md text-[9px] px-2 py-0.5 rounded-md text-white font-mono font-bold border border-white/10">{Math.floor((durations[idx]||0)/60)}:{((durations[idx]||0)%60).toFixed(0).padStart(2,'0')}</div>
                       </div>
                       <div className="flex-1 min-w-0 w-full space-y-3">
                          <div className="flex items-center gap-2">
                              <input type="text" value={titles[idx]} onChange={(e) => updateTitle(idx, e.target.value)} className="flex-1 bg-transparent border-b border-white/5 focus:border-indigo-500 outline-none text-sm font-black text-white p-1 transition-all placeholder:text-slate-700" placeholder="Título" required />
                              <button type="button" onClick={() => aiService.suggestMetadata(f.name).then(s => s && updateTitle(idx, s.title))} className="p-2 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 rounded-xl active:scale-90 transition-all"><Sparkles size={16}/></button>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                              <div className="relative"><Tag size={12} className="absolute left-3 top-3 text-slate-500"/><select value={categories[idx]} onChange={(e) => updateCategory(idx, e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl text-[11px] text-slate-300 py-2.5 pl-9 pr-3 outline-none focus:border-indigo-500 uppercase font-black appearance-none cursor-pointer">{availableCategories.map(c => <option key={c} value={c}>{c.replace('_', ' ')}</option>)}</select></div>
                              <div className="relative"><DollarSign size={12} className="absolute left-3 top-3 text-amber-500"/><input type="number" min="0" step="0.1" value={prices[idx]} onChange={(e) => updatePrice(idx, parseFloat(e.target.value))} className="w-full bg-slate-950 border border-slate-800 rounded-xl text-[11px] text-amber-400 font-black py-2.5 pl-9 pr-3 outline-none focus:border-indigo-500 shadow-inner" /></div>
                              <div className="relative"><Clock size={12} className="absolute left-3 top-3 text-slate-500"/><input type="number" min="0" value={durations[idx]} onChange={(e) => updateDuration(idx, parseInt(e.target.value) || 0)} className="w-full bg-slate-950 border border-slate-800 rounded-xl text-[11px] text-slate-300 font-mono py-2.5 pl-9 pr-3 outline-none focus:border-indigo-500 shadow-inner" /></div>
                          </div>
                       </div>
                       <button type="button" onClick={() => removeFile(idx)} disabled={isProcessingQueue} className="text-slate-600 hover:text-red-400 p-2 rounded-full transition-all self-end md:self-center"><X size={22} /></button>
                    </div>
                  ))
                )}
              </div>
              <div className="p-5 bg-slate-900 border-t border-slate-800">
                <button type="submit" disabled={isProcessingQueue || files.length === 0} className={`w-full py-4 rounded-2xl font-black text-sm text-white shadow-2xl transition-all flex justify-center items-center gap-3 uppercase tracking-widest ${isProcessingQueue || files.length === 0 ? 'bg-slate-800 text-slate-500 cursor-not-allowed opacity-50' : 'bg-indigo-600 hover:bg-indigo-500 active:scale-95 shadow-indigo-500/20'}`}>
                  {isProcessingQueue ? <><Loader2 className="animate-spin" size={20} /> Procesando...</> : <><UploadIcon size={20}/> Publicar {files.length} Archivos</>}
                </button>
              </div>
           </form>
        </div>
      </div>
    </div>
  );
}