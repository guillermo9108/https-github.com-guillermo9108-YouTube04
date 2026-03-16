import React, { useState } from 'react';
import { X, Upload, Image as ImageIcon, Layers, Send, Loader2 } from 'lucide-react';
import { db } from '../../services/db';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';

interface ImageUploadModalProps {
    onClose: () => void;
    onSuccess: () => void;
}

const ImageUploadModal: React.FC<ImageUploadModalProps> = ({ onClose, onSuccess }) => {
    const { user } = useAuth();
    const toast = useToast();
    const [files, setFiles] = useState<File[]>([]);
    const [previews, setPreviews] = useState<string[]>([]);
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [uploadType, setUploadType] = useState<'INDEPENDENT' | 'ALBUM' | 'POST'>('INDEPENDENT');
    const [isUploading, setIsUploading] = useState(false);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            const newFiles = Array.from(e.target.files);
            setFiles(prev => [...prev, ...newFiles]);
            
            const newPreviews = newFiles.map(file => URL.createObjectURL(file));
            setPreviews(prev => [...prev, ...newPreviews]);
        }
    };

    const removeFile = (index: number) => {
        setFiles(prev => prev.filter((_, i) => i !== index));
        setPreviews(prev => {
            URL.revokeObjectURL(prev[index]);
            return prev.filter((_, i) => i !== index);
        });
    };

    const handleUpload = async () => {
        if (!user || files.length === 0 || !title.trim()) {
            toast.error("Completa los campos requeridos");
            return;
        }

        setIsUploading(true);
        try {
            // We'll use a new action 'upload_images' or similar
            // For now, let's assume we can use a loop or a single request
            const fd = new FormData();
            fd.append('userId', user.id);
            fd.append('title', title);
            fd.append('description', description);
            fd.append('type', uploadType);
            
            files.forEach((file, i) => {
                fd.append(`image_${i}`, file);
            });
            fd.append('count', String(files.length));

            await db.request('action=upload_channel_images', {
                method: 'POST',
                body: fd
            });

            toast.success("Imágenes subidas correctamente");
            onSuccess();
            onClose();
        } catch (error) {
            console.error("Upload failed", error);
            toast.error("Error al subir imágenes");
        } finally {
            setIsUploading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="bg-slate-900 border border-white/10 rounded-[40px] w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95">
                <div className="p-6 border-b border-white/5 flex justify-between items-center bg-slate-950/50">
                    <div>
                        <h3 className="font-black text-white uppercase text-sm tracking-widest flex items-center gap-2">
                            <ImageIcon size={18} className="text-indigo-400" /> Subir Imágenes
                        </h3>
                        <p className="text-[10px] text-slate-500 font-bold uppercase mt-1">Comparte tus fotos con tu audiencia</p>
                    </div>
                    <button onClick={onClose} className="text-slate-400 bg-slate-800 p-2.5 rounded-2xl hover:text-white transition-all">
                        <X size={20} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="space-y-6">
                            <div>
                                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Título de la Publicación</label>
                                <input 
                                    type="text" 
                                    value={title}
                                    onChange={e => setTitle(e.target.value)}
                                    placeholder="Ej: Mi viaje a la playa"
                                    className="w-full bg-slate-950 border border-white/10 rounded-2xl px-5 py-4 text-sm text-white focus:border-indigo-500 outline-none transition-all"
                                />
                            </div>

                            <div>
                                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Descripción (Opcional)</label>
                                <textarea 
                                    value={description}
                                    onChange={e => setDescription(e.target.value)}
                                    placeholder="Cuenta algo sobre estas imágenes..."
                                    className="w-full bg-slate-950 border border-white/10 rounded-2xl px-5 py-4 text-sm text-white focus:border-indigo-500 outline-none transition-all h-32 resize-none"
                                />
                            </div>

                            <div>
                                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Tipo de Publicación</label>
                                <div className="grid grid-cols-3 gap-2">
                                    {[
                                        { id: 'INDEPENDENT', label: 'Simple', icon: ImageIcon },
                                        { id: 'ALBUM', label: 'Álbum', icon: Layers },
                                        { id: 'POST', label: 'Post', icon: Send }
                                    ].map(t => (
                                        <button
                                            key={t.id}
                                            onClick={() => setUploadType(t.id as any)}
                                            className={`flex flex-col items-center gap-2 p-3 rounded-2xl border transition-all ${
                                                uploadType === t.id 
                                                ? 'bg-indigo-600 border-indigo-500 text-white' 
                                                : 'bg-slate-950 border-white/5 text-slate-500 hover:bg-slate-800'
                                            }`}
                                        >
                                            <t.icon size={16} />
                                            <span className="text-[8px] font-black uppercase tracking-tighter">{t.label}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="space-y-6">
                            <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Archivos Seleccionados ({files.length})</label>
                            <div className="grid grid-cols-2 gap-3 max-h-[300px] overflow-y-auto p-1">
                                {previews.map((src, i) => (
                                    <div key={i} className="relative aspect-square rounded-2xl overflow-hidden group border border-white/10">
                                        <img src={src} className="w-full h-full object-cover" />
                                        <button 
                                            onClick={() => removeFile(i)}
                                            className="absolute top-1 right-1 p-1.5 bg-red-600 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                                        >
                                            <X size={12} />
                                        </button>
                                    </div>
                                ))}
                                <label className="aspect-square rounded-2xl border-2 border-dashed border-white/10 flex flex-col items-center justify-center gap-2 text-slate-500 hover:border-indigo-500 hover:text-indigo-400 cursor-pointer transition-all bg-slate-950/50">
                                    <Upload size={24} />
                                    <span className="text-[8px] font-black uppercase">Añadir</span>
                                    <input type="file" multiple accept="image/*" className="hidden" onChange={handleFileChange} />
                                </label>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="p-8 bg-slate-950/50 border-t border-white/5 flex gap-4">
                    <button 
                        onClick={onClose}
                        className="flex-1 py-4 bg-slate-800 hover:bg-slate-700 text-white font-black rounded-2xl transition-all uppercase text-xs tracking-widest"
                    >
                        Cancelar
                    </button>
                    <button 
                        onClick={handleUpload}
                        disabled={isUploading || files.length === 0 || !title.trim()}
                        className="flex-[2] py-4 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-black rounded-2xl transition-all shadow-xl shadow-indigo-600/20 uppercase text-xs tracking-widest flex items-center justify-center gap-2"
                    >
                        {isUploading ? <Loader2 className="animate-spin" size={18} /> : <Upload size={18} />}
                        {isUploading ? 'Subiendo...' : 'Publicar Imágenes'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ImageUploadModal;
