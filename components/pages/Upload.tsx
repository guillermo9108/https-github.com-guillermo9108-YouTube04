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
  const [descriptions, setDescriptions] = useState<string[]>([]);
  const [thumbnails, setThumbnails] = useState<(File | null)[]>([]);
  const [durations, setDurations] = useState<number[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [prices, setPrices] = useState<number[]>([]); 
  
  const [bulkDesc, setBulkDesc] = useState('');
  const [tagSuggestions, setTagSuggestions] = useState<any[]>([]);
  const [showTags, setShowTags] = useState(false);
  const [activeInput, setActiveInput] = useState<{idx: number | 'bulk', pos: number} | null>(null);

  const handleTextChange = async (val: string, pos: number, idx: number | 'bulk') => {
    if (idx === 'bulk') setBulkDesc(val);
    else updateDescription(idx, val);
    
    setActiveInput({ idx, pos });

    const textBeforeCursor = val.slice(0, pos);
    const match = textBeforeCursor.match(/#(\w*)$/);
    
    if (match) {
        const query = match[1];
        const suggestions = await db.getHashtagSuggestions(query);
        setTagSuggestions(suggestions);
        setShowTags(true);
    } else {
        setShowTags(false);
    }
  };

  const selectHashtag = (tag: string) => {
    if (!activeInput) return;
    const { idx, pos } = activeInput;
    const currentVal = idx === 'bulk' ? bulkDesc : descriptions[idx as number];
    
    const textBefore = currentVal.slice(0, pos);
    const textAfter = currentVal.slice(pos);
    const newTextBefore = textBefore.replace(/#(\w*)$/, tag + ' ');
    
    if (idx === 'bulk') setBulkDesc(newTextBefore + textAfter);
    else updateDescription(idx as number, newTextBefore + textAfter);
    
    setShowTags(false);
  };
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
      setDescriptions(prev => [...prev, ...new Array(newFiles.length).fill('')]);
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
    setFiles(prev => prev.filter(f)); setTitles(prev => prev.filter(f)); setDescriptions(prev => prev.filter(f)); setThumbnails(prev => prev.filter(f)); setDurations(prev => prev.filter(f)); setCategories(prev => prev.filter(f)); setPrices(prev => prev.filter(f));
  };

  const updateTitle = (i: number, v: string) => setTitles(p => { const n = [...p]; n[i] = v; return n; });
  const updateDescription = (i: number, v: string) => setDescriptions(p => { const n = [...p]; n[i] = v; return n; });
  const updateCategory = (i: number, v: string) => { setCategories(p => { const n = [...p]; n[i] = v; return n; }); updatePrice(i, getPriceForCategory(v)); };
  const updatePrice = (i: number, v: number) => setPrices(p => { const n = [...p]; n[i] = v; return n; });
  const updateDuration = (i: number, v: number) => setDurations(p => { const n = [...p]; n[i] = v; return n; });

  const applyBulkChanges = () => {
      if (files.length === 0) return;
      if (bulkCategory) {
          setCategories(p => p.map(() => bulkCategory));
          if (bulkPrice === '') setPrices(p => p.map(() => getPriceForCategory(bulkCategory)));
      }
      if (bulkDesc) setDescriptions(p => p.map(() => bulkDesc));
      if (bulkPrice !== '') { const pVal = parseFloat(bulkPrice); if (!isNaN(pVal)) setPrices(p => p.map(() => pVal)); }
      toast.success("Cambios aplicados");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || files.length === 0) return;
    
    const queue = files.map((f, i) => ({ 
        title: titles[i], 
        description: descriptions[i] || bulkDesc, 
        price: prices[i], 
        category: categories[i] as any, 
        duration: durations[i] || 0, 
        file: f, 
        thumbnail: thumbnails[i] 
    }));
    
    try {
        // Enviar todo como un lote para mayor confiabilidad como en "Qué estás pensando"
        // pero manteniendo la UI de carga
        await addToQueue(queue, user); 
        toast.success("¡Publicado correctamente!"); 
        navigate('/'); 
    } catch (err: any) {
        toast.error("Error al publicar: " + err.message);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-[#18191a] text-[#e4e6eb]">
      {/* Dark Facebook Style Header */}
      <header className="sticky top-0 z-50 bg-[#242526] text-white px-4 h-12 flex items-center justify-between shadow-md border-b border-[#3e4042]">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="hover:bg-white/10 p-1 rounded-full transition-colors">
            <ArrowLeft size={22} />
          </button>
          <span className="font-bold text-[15px]">Crear publicación</span>
        </div>
        <div className="flex items-center gap-2">
            {isProcessingQueue && <Loader2 size={16} className="animate-spin text-[#2e89ff]" />}
            <span className="text-[10px] uppercase font-bold text-[#b0b3b8]">
                {files.length} ITEMS
            </span>
        </div>
      </header>

      <main className="flex-1 p-0 space-y-2 max-w-2xl mx-auto w-full pb-24">
        {/* User Info Bar (Social Style Dark) */}
        {user && (
            <div className="bg-[#242526] p-3 flex items-center gap-3 border-b border-[#3e4042]">
                <div className="w-10 h-10 rounded-full bg-[#3a3b3c] overflow-hidden border border-[#3e4042]">
                    {user.avatarUrl ? <img src={user.avatarUrl} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center font-bold text-[#2e89ff]">{user.username[0]}</div>}
                </div>
                <div>
                   <div className="font-bold text-[14px] text-[#e4e6eb]">{user.username}</div>
                   <div className="flex items-center gap-1 text-[11px] text-[#b0b3b8] font-medium">
                       <Layers size={10} /> Público
                   </div>
                </div>
            </div>
        )}

        {/* Selection Area Dark */}
        <div className="bg-[#242526] p-4 border-b border-[#3e4042]">
            <label className={`block text-center p-8 border-2 border-dashed border-[#3e4042] rounded-lg cursor-pointer hover:bg-[#303031] transition-colors ${isProcessingQueue ? 'opacity-50 pointer-events-none' : ''}`}>
                <input type="file" accept="video/*,audio/*,image/*" multiple onChange={handleFileChange} className="hidden" />
                <div className="flex flex-col items-center gap-2">
                    <div className="w-14 h-14 rounded-full bg-[#2d88ff]/10 flex items-center justify-center">
                        <UploadIcon size={28} className="text-[#2d88ff]" />
                    </div>
                    <span className="text-[14px] font-bold text-[#e4e6eb]">Añadir fotos o videos</span>
                    <span className="text-[12px] text-[#b0b3b8]">Selecciona varios archivos a la vez</span>
                </div>
            </label>
            {isProcessingQueue && (
                <div className="mt-4">
                    <div className="flex justify-between text-[10px] font-bold text-[#b0b3b8] uppercase mb-1">
                        <span>Preparando archivos...</span>
                        <span>{queueProgress.current}/{queueProgress.total}</span>
                    </div>
                    <div className="h-1.5 bg-[#3a3b3c] rounded-full overflow-hidden">
                        <div 
                            className="h-full bg-[#2d88ff] transition-all duration-300"
                            style={{ width: `${(queueProgress.current / queueProgress.total) * 100}%` }}
                        ></div>
                    </div>
                </div>
            )}
        </div>

        {/* Bulk Editing - Dark Style Cards */}
        {files.length > 0 && (
            <div className="bg-[#242526] border-y border-[#3e4042] p-3 space-y-3">
                <div className="flex items-center gap-2 text-[#2d88ff]">
                    <Edit3 size={16} />
                    <span className="text-xs font-bold uppercase">Ajustes para todos</span>
                </div>
                <div className="relative">
                    <textarea 
                        value={bulkDesc}
                        onChange={e => handleTextChange(e.target.value, e.target.selectionStart, 'bulk')}
                        onKeyUp={e => handleTextChange((e.target as any).value, (e.target as any).selectionStart, 'bulk')}
                        placeholder="Descripción para todos los archivos..."
                        className="w-full bg-[#3a3b3c] border border-[#3e4042] rounded-md px-3 py-2 text-sm text-[#e4e6eb] outline-none focus:border-[#2d88ff] resize-none h-20 placeholder-[#b0b3b8]"
                    />
                    {showTags && activeInput?.idx === 'bulk' && tagSuggestions.length > 0 && (
                        <div className="absolute bottom-full left-0 right-0 bg-[#242526] border border-[#3e4042] rounded-lg shadow-xl z-[100] max-h-[150px] overflow-y-auto mb-1">
                            {tagSuggestions.map((s, idx) => (
                                <button
                                    key={idx}
                                    type="button"
                                    onClick={() => selectHashtag(s.label)}
                                    className="w-full text-left px-3 py-2 hover:bg-[#3a3b3c] flex items-center justify-between transition-colors"
                                >
                                    <span className="text-xs font-bold text-[#1877f2]">{s.label}</span>
                                    {s.count > 0 && <span className="text-[10px] text-[#b0b3b8]">{s.count}</span>}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                    <div className="bg-[#3a3b3c] border border-[#3e4042] rounded-md px-2 py-1">
                        <label className="block text-[9px] font-bold text-[#b0b3b8] uppercase">Categoría</label>
                        <select 
                            value={bulkCategory}
                            onChange={e => setBulkCategory(e.target.value)}
                            className="w-full bg-transparent text-xs font-bold outline-none text-[#e4e6eb]"
                        >
                            {availableCategories.map(c => <option key={c} value={c} className="bg-[#242526]">{c.replace('_', ' ')}</option>)}
                        </select>
                    </div>
                    <div className="bg-[#3a3b3c] border border-[#3e4042] rounded-md px-2 py-1">
                        <label className="block text-[9px] font-bold text-[#b0b3b8] uppercase">Precio Sugerido ($)</label>
                        <input 
                            type="number" 
                            value={bulkPrice}
                            onChange={e => setBulkPrice(e.target.value)}
                            placeholder="Ej: 5.00"
                            className="w-full bg-transparent text-xs font-bold outline-none text-[#e4e6eb]"
                        />
                    </div>
                </div>
                <button 
                    onClick={applyBulkChanges}
                    className="w-full bg-[#4e4f50] text-[#e4e6eb] py-2.5 rounded-md font-bold text-xs hover:bg-[#5e5f60] transition-colors border border-[#3e4042]"
                >
                    Aplicar a toda la lista
                </button>
            </div>
        )}

        {/* List of Files organized in Social style Cards Dark */}
        <form onSubmit={handleSubmit} className="space-y-2 pb-20">
            {files.map((f, idx) => (
                <div key={`${f.name}-${idx}`} className="bg-[#242526] border-y border-[#3e4042] p-3 animate-in slide-in-from-bottom-2 duration-300">
                    <div className="flex gap-3">
                        <div className="w-24 aspect-video bg-[#000] rounded-md overflow-hidden relative border border-[#3e4042] shrink-0">
                            {thumbnails[idx] ? <ThumbnailPreview file={thumbnails[idx]!} /> : (
                                <div className="w-full h-full flex items-center justify-center">
                                    {f.type.startsWith('audio') ? <Music className="text-[#2d88ff]/30" /> : <Loader2 className="animate-spin text-[#2d88ff]/30" size={18} />}
                                </div>
                            )}
                            {durations[idx] > 0 && (
                                <div className="absolute bottom-1 right-1 bg-black/70 text-[9px] px-1 py-0.5 rounded text-white font-bold">
                                    {Math.floor(durations[idx]/60)}:{(durations[idx]%60).toString().padStart(2,'0')}
                                </div>
                            )}
                        </div>
                        
                        <div className="flex-1 min-w-0">
                             <div className="flex items-start justify-between gap-2">
                                <input 
                                    type="text"
                                    value={titles[idx]}
                                    onChange={e => updateTitle(idx, e.target.value)}
                                    className="flex-1 bg-transparent border-b border-transparent focus:border-[#2d88ff] outline-none text-[14px] font-bold text-[#e4e6eb] pb-1 transition-all truncate"
                                    placeholder="Añade un título..."
                                    required
                                />
                                <button 
                                    type="button" 
                                    onClick={() => removeFile(idx)}
                                    disabled={isProcessingQueue}
                                    className="text-[#b0b3b8] hover:text-[#fa3e3e] transition-colors"
                                >
                                    <X size={18} />
                                </button>
                            </div>
                            <div className="text-[11px] text-[#b0b3b8] truncate mt-0.5 uppercase font-bold tracking-tight">
                                {f.name} • {(f.size / (1024 * 1024)).toFixed(2)} MB
                            </div>
                        </div>
                    </div>

                    <div className="mt-3 space-y-2 relative">
                        <textarea 
                            value={descriptions[idx]}
                            onChange={e => handleTextChange(e.target.value, e.target.selectionStart, idx)}
                            onKeyUp={e => handleTextChange((e.target as any).value, (e.target as any).selectionStart, idx)}
                            className="w-full bg-[#18191a] border border-[#3e4042] rounded-md px-3 py-2 text-[12px] text-[#e4e6eb] outline-none focus:border-[#2d88ff] resize-none h-16 placeholder-[#b0b3b8]"
                            placeholder="Escribe algo sobre este archivo..."
                        />
                        {showTags && activeInput?.idx === idx && tagSuggestions.length > 0 && (
                            <div className="absolute bottom-full left-0 right-0 bg-[#242526] border border-[#3e4042] rounded-lg shadow-xl z-[100] max-h-[150px] overflow-y-auto mb-1">
                                {tagSuggestions.map((s, sidx) => (
                                    <button
                                        key={sidx}
                                        type="button"
                                        onClick={() => selectHashtag(s.label)}
                                        className="w-full text-left px-3 py-2 hover:bg-[#3a3b3c] flex items-center justify-between transition-colors"
                                    >
                                        <span className="text-xs font-bold text-[#1877f2]">{s.label}</span>
                                        {s.count > 0 && <span className="text-[10px] text-[#b0b3b8]">{s.count}</span>}
                                    </button>
                                ))}
                            </div>
                        )}
                        
                        <div className="grid grid-cols-2 gap-2">
                            <div className="flex flex-col bg-[#3a3b3c] px-3 py-1.5 rounded border border-[#3e4042]">
                                <span className="text-[9px] font-bold text-[#b0b3b8] uppercase">Carpeta</span>
                                <select 
                                    value={categories[idx]}
                                    onChange={e => updateCategory(idx, e.target.value)}
                                    className="bg-transparent text-xs font-bold text-[#e4e6eb] outline-none truncate"
                                >
                                    {availableCategories.map(c => <option key={c} value={c} className="bg-[#242526]">{c.replace('_', ' ')}</option>)}
                                </select>
                            </div>
                            <div className="flex flex-col bg-[#3a3b3c] px-3 py-1.5 rounded border border-[#3e4042]">
                                <span className="text-[9px] font-bold text-[#b0b3b8] uppercase">Precio ($)</span>
                                <input 
                                    type="number"
                                    step="0.1"
                                    value={prices[idx]}
                                    onChange={e => updatePrice(idx, parseFloat(e.target.value))}
                                    className="bg-transparent text-xs font-bold text-[#e4e6eb] outline-none"
                                />
                            </div>
                        </div>
                    </div>
                </div>
            ))}

            {files.length > 0 && (
                <div className="fixed bottom-0 left-0 right-0 p-3 bg-[#242526] border-t border-[#3e4042] z-40 shadow-[0_-2px_10px_rgba(0,0,0,0.3)]">
                    <button 
                        type="submit"
                        disabled={isProcessingQueue || files.length === 0}
                        className="w-full bg-[#2e89ff] hover:bg-[#3e95ff] text-white font-bold py-3.5 rounded-md transition-all active:scale-95 disabled:opacity-50"
                    >
                        {isProcessingQueue ? 'Analizando archivos...' : `Publicar ${files.length} archivos`}
                    </button>
                </div>
            )}
        </form>

        {files.length === 0 && (
            <div className="flex flex-col items-center justify-center py-32 text-[#b0b3b8]">
                <div className="w-20 h-20 bg-[#242526] rounded-full flex items-center justify-center mb-4 shadow-sm border border-[#3e4042]">
                    <UploadIcon size={40} className="text-[#2d88ff] opacity-40" />
                </div>
                <p className="font-bold text-[#e4e6eb]">No has seleccionado archivos</p>
                <p className="text-xs">Sube fotos o videos para tu canal</p>
            </div>
        )}
      </main>
    </div>
  );
}
