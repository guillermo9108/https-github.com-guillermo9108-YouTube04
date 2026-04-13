import React, { useState, useRef, useEffect } from 'react';
import { X, Upload, Image as ImageIcon, Video, Loader2, Type, Music, Send, Check } from 'lucide-react';
import { useNavigate } from '../Router';
import { db } from '../../services/db';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';

export default function CreateStory() {
    const navigate = useNavigate();
    const { user } = useAuth();
    const toast = useToast();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const audioInputRef = useRef<HTMLInputElement>(null);
    
    const [file, setFile] = useState<File | null>(null);
    const [preview, setPreview] = useState<string | null>(null);
    const [type, setType] = useState<'IMAGE' | 'VIDEO'>('IMAGE');
    const [isUploading, setIsUploading] = useState(false);

    // Text Overlay State
    const [text, setText] = useState('');
    const [showTextInput, setShowTextInput] = useState(false);
    const [textColor, setTextColor] = useState('#ffffff');
    const [textBg, setTextBg] = useState('rgba(0,0,0,0.5)');

    // Audio State
    const [audioFile, setAudioFile] = useState<File | null>(null);
    const [audioName, setAudioName] = useState<string | null>(null);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files?.[0]) {
            const selectedFile = e.target.files[0];
            setFile(selectedFile);
            setPreview(URL.createObjectURL(selectedFile));
            setType(selectedFile.type.startsWith('video/') ? 'VIDEO' : 'IMAGE');
        }
    };

    const handleAudioChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files?.[0]) {
            const selectedFile = e.target.files[0];
            setAudioFile(selectedFile);
            setAudioName(selectedFile.name);
            toast.success(`Música añadida: ${selectedFile.name}`);
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
            
            if (text) {
                fd.append('overlayText', text);
                fd.append('textColor', textColor);
                fd.append('textBg', textBg);
            }
            
            if (audioFile) {
                fd.append('audioFile', audioFile);
            }

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
            <div className="flex-1 flex flex-col items-center justify-center p-4 relative">
                {preview ? (
                    <div className="relative w-full max-w-sm aspect-[9/16] rounded-2xl overflow-hidden bg-zinc-900 shadow-2xl">
                        {type === 'IMAGE' ? (
                            <img src={preview} className="w-full h-full object-cover" alt="Preview" />
                        ) : (
                            <video src={preview} className="w-full h-full object-cover" autoPlay muted loop />
                        )}
                        
                        {/* Text Overlay Display */}
                        {text && (
                            <div 
                                className="absolute inset-0 flex items-center justify-center pointer-events-none p-6"
                            >
                                <div 
                                    style={{ backgroundColor: textBg, color: textColor }}
                                    className="px-4 py-2 rounded-lg text-center font-bold text-xl break-words max-w-full shadow-lg"
                                >
                                    {text}
                                </div>
                            </div>
                        )}

                        {/* Audio Badge */}
                        {audioName && (
                            <div className="absolute top-4 left-16 bg-black/40 backdrop-blur-md rounded-full px-3 py-1.5 flex items-center gap-2 border border-white/10">
                                <Music size={14} className="text-pink-500" />
                                <span className="text-[10px] font-bold truncate max-w-[100px]">{audioName}</span>
                            </div>
                        )}
                        
                        {/* Overlay Controls */}
                        <div className="absolute top-4 right-4 flex flex-col gap-4 z-20">
                            <button 
                                onClick={() => setShowTextInput(true)}
                                className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${text ? 'bg-blue-600' : 'bg-black/40 backdrop-blur-md'}`}
                            >
                                <Type size={20} />
                            </button>
                            <button 
                                onClick={() => audioInputRef.current?.click()}
                                className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${audioFile ? 'bg-pink-600' : 'bg-black/40 backdrop-blur-md'}`}
                            >
                                <Music size={20} />
                            </button>
                        </div>

                        <button 
                            onClick={() => { setFile(null); setPreview(null); setText(''); setAudioFile(null); }}
                            className="absolute top-4 left-4 w-10 h-10 bg-black/40 backdrop-blur-md rounded-full flex items-center justify-center z-20"
                        >
                            <X size={20} />
                        </button>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 gap-4 w-full max-w-md">
                        <button 
                            onClick={() => {
                                // Create a placeholder background for text-only stories
                                const canvas = document.createElement('canvas');
                                canvas.width = 1080;
                                canvas.height = 1920;
                                const ctx = canvas.getContext('2d');
                                if (ctx) {
                                    const grad = ctx.createLinearGradient(0, 0, 0, 1920);
                                    grad.addColorStop(0, '#833ab4');
                                    grad.addColorStop(0.5, '#fd1d1d');
                                    grad.addColorStop(1, '#fcb045');
                                    ctx.fillStyle = grad;
                                    ctx.fillRect(0, 0, 1080, 1920);
                                    canvas.toBlob((blob) => {
                                        if (blob) {
                                            const f = new File([blob], "text_story.jpg", { type: "image/jpeg" });
                                            setFile(f);
                                            setPreview(URL.createObjectURL(f));
                                            setType('IMAGE');
                                            setShowTextInput(true);
                                        }
                                    }, 'image/jpeg');
                                }
                            }}
                            className="aspect-[3/4] bg-gradient-to-br from-purple-600 to-pink-600 rounded-2xl flex flex-col items-center justify-center gap-3 shadow-lg active:scale-95 transition-transform"
                        >
                            <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
                                <Type size={28} />
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

                {/* Text Input Modal Overlay */}
                {showTextInput && (
                    <div className="fixed inset-0 z-[100] bg-black/90 flex flex-col p-6">
                        <div className="flex justify-between items-center mb-8">
                            <div className="flex gap-2">
                                {['#ffffff', '#000000', '#ff0000', '#00ff00', '#0000ff', '#ffff00'].map(c => (
                                    <button 
                                        key={c} 
                                        onClick={() => setTextColor(c)}
                                        className={`w-8 h-8 rounded-full border-2 ${textColor === c ? 'border-white' : 'border-transparent'}`}
                                        style={{ backgroundColor: c }}
                                    />
                                ))}
                            </div>
                            <button onClick={() => setShowTextInput(false)} className="bg-white text-black px-4 py-1 rounded-full font-bold flex items-center gap-1">
                                <Check size={18} /> Listo
                            </button>
                        </div>
                        <textarea 
                            autoFocus
                            value={text}
                            onChange={(e) => setText(e.target.value)}
                            placeholder="Escribe algo..."
                            className="flex-1 bg-transparent text-center text-3xl font-bold outline-none resize-none placeholder:text-white/30"
                            style={{ color: textColor }}
                        />
                        <div className="flex justify-center gap-4 mt-4">
                            <button 
                                onClick={() => setTextBg(textBg === 'transparent' ? 'rgba(0,0,0,0.5)' : 'transparent')}
                                className="px-4 py-2 bg-white/10 rounded-lg text-sm font-bold"
                            >
                                {textBg === 'transparent' ? 'Añadir fondo' : 'Quitar fondo'}
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Footer Action */}
            {preview && !showTextInput && (
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
            <input 
                type="file" 
                ref={audioInputRef}
                onChange={handleAudioChange}
                accept="audio/*"
                className="hidden"
            />
        </div>
    );
}
