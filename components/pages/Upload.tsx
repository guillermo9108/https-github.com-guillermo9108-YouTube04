import React, { useState, useRef, useEffect } from 'react';
import { Upload as UploadIcon, FileVideo, X, Plus, Image as ImageIcon, Tag, Layers, Loader2, DollarSign, Settings, Save, Edit3, Wand2, Clock, Music, ArrowLeft } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useUpload } from '../../context/UploadContext';
import { useNavigate } from '../Router';
import { VideoCategory, Category, SystemSettings } from '../../types';
import { db } from '../../services/db';
import { useToast } from '../../context/ToastContext';
import { generateThumbnail } from '../../utils/videoGenerator';

const ThumbnailPreview = ({ file }: { file: File }) => {
    const [src, setSrc] = useState<string>('');
    useEffect(() => {
        const url = URL.createObjectURL(file); setSrc(url);
        return () => URL.revokeObjectURL(url);
    }, [file]);
    return <img src={src} alt="Thumb" className="w-full h-full object-cover" />;
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
      
      const newCategories = newFiles.map(f => {
          if (f.type.startsWith('image/')) return VideoCategory.IMAGES;
          return VideoCategory.PERSONAL;
      });
      const newPrices = newCategories.map(cat => getPriceForCategory(cat));

      setFiles(prev => [...prev, ...newFiles]);
      setTitles(prev => [...prev, ...newTitles]);
      setThumbnails(prev => [...prev, ...new Array(newFiles.length).fill(null)]);
      setDurations(prev => [...prev, ...new Array(newFiles.length).fill(0)]);
      setCategories(prev => [...prev, ...newCategories]);
      setPrices(prev => [...prev, ...newPrices]);

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
    <div className="flex flex-col min-h-screen bg-[#1c1e21]">
      {/* Facebook Lite Style Header */}
      <header className="sticky top-0 z-50 bg-[#3b5998] text-white px-4 h-12 flex items-center justify-between shadow-md">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="hover:bg-white/10 p-1 rounded-full transition-colors">
            <ArrowLeft size={22} />
          </button>
          <span className="font-bold text-lg">Subir archivos</span>
        </div>
        <div className="flex items-center gap-2">
            {isProcessingQueue && <Loader2 size={18} className="animate-spin text-white/70" />}
            <span className="text-[10px] uppercase font-bold text-white/70">
                {files.length} seleccionados
            </span>
        </div>
      </header>

      <main className="flex-1 p-2 space-y-3 max-w-2xl mx-auto w-full pb-24">
        {/* Selection Area */}
        <div className="bg-[#242526] rounded-sm border border-[#3e4042] p-4">
            <label className={`block text-center p-6 border-2 border-dashed border-[#3e4042] rounded-md cursor-pointer hover:bg-[#303031] transition-colors ${isProcessingQueue ? 'opacity-50 pointer-events-none' : ''}`}>
                <input type="file" accept="video/*,audio/*,image/*" multiple onChange={handleFileChange} className="hidden" />
                <div className="flex flex-col items-center gap-2">
                    <div className="w-12 h-12 rounded-full bg-[#3a3b3c] flex items-center justify-center">
                        <Plus size={24} className="text-[#2e89ff]" />
                    </div>
                    <span className="text-sm font-bold text-[#e4e6eb]">Agregar fotos o videos</span>
                    <span className="text-xs text-[#b0b3b8]">O arrastra aquí los archivos</span>
                </div>
            </label>
            {isProcessingQueue && (
                <div className="mt-3">
                    <div className="flex justify-between text-[10px] font-bold text-[#b0b3b8] uppercase mb-1">
                        <span>Analizando archivos...</span>
                        <span>{queueProgress.current}/{queueProgress.total}</span>
                    </div>
                    <div className="h-1 bg-[#3a3b3c] rounded-full overflow-hidden">
                        <div 
                            className="h-full bg-[#2e89ff] transition-all duration-300"
                            style={{ width: `${(queueProgress.current / queueProgress.total) * 100}%` }}
                        ></div>
                    </div>
                </div>
            )}
        </div>

        {/* Bulk Editing Card */}
        {files.length > 0 && (
            <div className="bg-[#242526] rounded-sm border border-[#3e4042] overflow-hidden">
                <div className="px-4 py-2 bg-[#303031] border-b border-[#3e4042] flex items-center gap-2">
                    <Edit3 size={16} className="text-[#2e89ff]" />
                    <span className="text-xs font-bold text-[#e4e6eb] uppercase tracking-wide">Configuración rápida</span>
                </div>
                <div className="p-4 space-y-4">
                    <div>
                        <textarea 
                            value={bulkDesc}
                            onChange={e => setBulkDesc(e.target.value)}
                            placeholder="Añade una descripción para todos..."
                            className="w-full bg-[#3a3b3c] border border-[#3e4042] rounded-md px-3 py-2 text-sm text-[#e4e6eb] outline-none focus:border-[#2e89ff] resize-none h-20"
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <select 
                            value={bulkCategory}
                            onChange={e => setBulkCategory(e.target.value)}
                            className="bg-[#3a3b3c] border border-[#3e4042] rounded-md px-2 py-2 text-xs text-[#e4e6eb] font-bold outline-none"
                        >
                            {availableCategories.map(c => <option key={c} value={c}>{c.replace('_', ' ')}</option>)}
                        </select>
                        <input 
                            type="number" 
                            value={bulkPrice}
                            onChange={e => setBulkPrice(e.target.value)}
                            placeholder="Precio ($)"
                            className="bg-[#3a3b3c] border border-[#3e4042] rounded-md px-2 py-2 text-xs text-[#e4e6eb] font-bold outline-none"
                        />
                    </div>
                    <button 
                        onClick={applyBulkChanges}
                        className="w-full bg-[#3a3b3c] text-[#e4e6eb] py-2 rounded-md font-bold text-xs hover:bg-[#4e4f50] transition-colors flex items-center justify-center gap-2"
                    >
                        <Wand2 size={14} /> Aplicar a la lista
                    </button>
                </div>
            </div>
        )}

        {/* List of Files */}
        <form onSubmit={handleSubmit} className="space-y-3 pb-20">
            {files.map((f, idx) => (
                <div key={`${f.name}-${idx}`} className="bg-[#242526] rounded-sm border border-[#3e4042] overflow-hidden flex flex-col sm:flex-row gap-3 p-3">
                    <div className="w-full sm:w-28 aspect-video bg-black rounded-md overflow-hidden relative border border-[#3e4042] shrink-0">
                        {thumbnails[idx] ? <ThumbnailPreview file={thumbnails[idx]!} /> : (
                            <div className="w-full h-full flex items-center justify-center">
                                {f.type.startsWith('audio') ? <Music className="text-[#2e89ff]/50" /> : <Loader2 className="animate-spin text-[#2e89ff]/50" size={18} />}
                            </div>
                        )}
                        {durations[idx] > 0 && (
                            <div className="absolute bottom-1 right-1 bg-black/70 text-[9px] px-1 py-0.5 rounded text-white font-bold">
                                {Math.floor(durations[idx]/60)}:{(durations[idx]%60).toString().padStart(2,'0')}
                            </div>
                        )}
                    </div>
                    
                    <div className="flex-1 space-y-3">
                        <div className="flex items-start justify-between gap-2">
                            <input 
                                type="text"
                                value={titles[idx]}
                                onChange={e => updateTitle(idx, e.target.value)}
                                className="flex-1 bg-transparent border-b border-[#3e4042] focus:border-[#2e89ff] outline-none text-sm font-bold text-[#e4e6eb] pb-1 transition-all"
                                placeholder="Título del archivo"
                                required
                            />
                            <button 
                                type="button" 
                                onClick={() => removeFile(idx)}
                                disabled={isProcessingQueue}
                                className="text-[#b0b3b8] hover:text-white"
                            >
                                <X size={20} />
                            </button>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-2">
                            <div className="flex items-center gap-2 bg-[#1c1e21] px-2 py-1.5 rounded border border-[#3e4042]">
                                <Tag size={12} className="text-[#b0b3b8]" />
                                <select 
                                    value={categories[idx]}
                                    onChange={e => updateCategory(idx, e.target.value)}
                                    className="bg-transparent text-[10px] text-[#e4e6eb] font-bold outline-none flex-1 truncate uppercase"
                                >
                                    {availableCategories.map(c => <option key={c} value={c}>{c.replace('_', ' ')}</option>)}
                                </select>
                            </div>
                            <div className="flex items-center gap-2 bg-[#1c1e21] px-2 py-1.5 rounded border border-[#3e4042]">
                                <DollarSign size={12} className="text-green-500" />
                                <input 
                                    type="number"
                                    step="0.1"
                                    value={prices[idx]}
                                    onChange={e => updatePrice(idx, parseFloat(e.target.value))}
                                    className="bg-transparent text-[10px] text-[#e4e6eb] font-bold outline-none flex-1"
                                />
                            </div>
                        </div>
                    </div>
                </div>
            ))}

            {files.length > 0 && (
                <div className="fixed bottom-0 left-0 right-0 p-4 bg-[#242526] border-t border-[#3e4042] z-40">
                    <button 
                        type="submit"
                        disabled={isProcessingQueue || files.length === 0}
                        className="w-full bg-[#2e89ff] hover:bg-[#4195ff] text-white font-bold py-3 rounded-md transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
                    >
                        {isProcessingQueue ? 'Analizando archivos...' : `Publicar ${files.length} archivos`}
                    </button>
                </div>
            )}
        </form>

        {files.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-[#b0b3b8]">
                <FileVideo size={48} className="mb-2 opacity-20" />
                <p className="text-xs">No hay archivos para subir</p>
            </div>
        )}
      </main>
    </div>
  );
}
