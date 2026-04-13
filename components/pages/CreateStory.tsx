import React, { useState, useRef } from 'react';
import { ArrowLeft, X, Upload, Image as ImageIcon, Video, Loader2, Plus, Type, Music, Send } from 'lucide-react';
import { useNavigate } from '../Router';
import { db } from '../../services/db';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';

export default function CreateStory() {
    const navigate = useNavigate();
    const { user } = useAuth();
    const toast = useToast();
    const fileInputRef = useRef<HTMLInputElement>(null);
    
    const [file, setFile] = useState<File | null>(null);
    const [preview, setPreview] = useState<string | null>(null);
    const [type, setType] = useState<'IMAGE' | 'VIDEO'>('IMAGE');
    const [isUploading, setIsUploading] = useState(false);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files?.[0]) {
            const selectedFile = e.target.files[0];
            setFile(selectedFile);
            setPreview(URL.createObjectURL(selectedFile));
            setType(selectedFile.type.startsWith('video/') ? 'VIDEO' : 'IMAGE');
        }
    };

    const handleUpload = async () => {
        if (!user || !file) {
            toast.error("Selecciona una foto o video");
            return;
        }

        setIsUploading(true);
        try {
            const fd = new FormData();
            fd.append('userId', user.id);
            fd.append('file', file);
            fd.append('type', type);

            await db.uploadStory(fd);

            toast.success("Historia creada correctamente");
            navigate('/');
        } catch (error) {
            console.error("Story upload failed", error);
            toast.error("Error al crear la historia");
        } finally {
            setIsUploading(false);
        }
    };

    return (
        <div className="min-h-screen bg-black text-white flex flex-col">
            {/* Header */}
            <header className="sticky top-0 z-50 bg-black/50 backdrop-blur-md flex items-center justify-between px-4 h-14">
                <button onClick={() => navigate(-1)} className="text-white p-2">
                    <X size={24} />
                </button>
                <h1 className="text-lg font-bold">Crear historia</h1>
                <div className="w-10" /> {/* Spacer */}
            </header>

            {/* Content */}
            <div className="flex-1 flex flex-col items-center justify-center p-4">
                {preview ? (
                    <div className="relative w-full max-w-sm aspect-[9/16] rounded-2xl overflow-hidden bg-zinc-900 shadow-2xl">
                        {type === 'IMAGE' ? (
                            <img src={preview} className="w-full h-full object-cover" alt="Preview" />
                        ) : (
                            <video src={preview} className="w-full h-full object-cover" autoPlay muted loop />
                        )}
                        
                        {/* Overlay Controls */}
                        <div className="absolute top-4 right-4 flex flex-col gap-4">
                            <button className="w-10 h-10 bg-black/40 backdrop-blur-md rounded-full flex items-center justify-center">
                                <Type size={20} />
                            </button>
                            <button className="w-10 h-10 bg-black/40 backdrop-blur-md rounded-full flex items-center justify-center">
                                <Music size={20} />
                            </button>
                        </div>

                        <button 
                            onClick={() => { setFile(null); setPreview(null); }}
                            className="absolute top-4 left-4 w-10 h-10 bg-black/40 backdrop-blur-md rounded-full flex items-center justify-center"
                        >
                            <X size={20} />
                        </button>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 gap-4 w-full max-w-md">
                        <button 
                            onClick={() => fileInputRef.current?.click()}
                            className="aspect-[3/4] bg-gradient-to-br from-purple-600 to-pink-600 rounded-2xl flex flex-col items-center justify-center gap-3 shadow-lg active:scale-95 transition-transform"
                        >
                            <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
                                <ImageIcon size={28} />
                            </div>
                            <span className="font-bold">Texto</span>
                        </button>
                        <button 
                            onClick={() => fileInputRef.current?.click()}
                            className="aspect-[3/4] bg-gradient-to-br from-blue-600 to-cyan-600 rounded-2xl flex flex-col items-center justify-center gap-3 shadow-lg active:scale-95 transition-transform"
                        >
                            <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
                                <Music size={28} />
                            </div>
                            <span className="font-bold">Música</span>
                        </button>
                        
                        <div className="col-span-2 mt-4">
                            <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest mb-4">Seleccionar de la galería</h3>
                            <div 
                                onClick={() => fileInputRef.current?.click()}
                                className="w-full py-12 border-2 border-dashed border-zinc-800 rounded-2xl flex flex-col items-center justify-center gap-3 text-zinc-500 hover:bg-zinc-900 cursor-pointer transition-colors"
                            >
                                <Upload size={32} />
                                <span className="font-medium">Subir foto o video</span>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Footer Action */}
            {preview && (
                <div className="p-6 bg-gradient-to-t from-black to-transparent">
                    <button 
                        onClick={handleUpload}
                        disabled={isUploading}
                        className="w-full py-4 bg-[#1877f2] hover:bg-[#166fe5] disabled:opacity-50 text-white font-bold rounded-xl transition-all flex items-center justify-center gap-2 shadow-xl shadow-blue-600/20"
                    >
                        {isUploading ? <Loader2 className="animate-spin" size={20} /> : <Send size={20} />}
                        {isUploading ? 'Compartiendo...' : 'Compartir en historia'}
                    </button>
                </div>
            )}

            <input 
                type="file" 
                ref={fileInputRef}
                onChange={handleFileChange}
                accept="image/*,video/*"
                className="hidden"
            />
        </div>
    );
}
