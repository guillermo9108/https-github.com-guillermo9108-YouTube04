import React, { useState } from 'react';
import { ArrowLeft, X, Upload, Image as ImageIcon, Send, Loader2, Globe, ChevronDown, User, Plus, Play } from 'lucide-react';
import { useNavigate } from '../Router';
import { db } from '../../services/db';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';

export default function CreatePost() {
    const navigate = useNavigate();
    const { user } = useAuth();
    const toast = useToast();
    
    const [files, setFiles] = useState<File[]>([]);
    const [previews, setPreviews] = useState<string[]>([]);
    const [description, setDescription] = useState('');
    const [tagSuggestions, setTagSuggestions] = useState<any[]>([]);
    const [showTags, setShowTags] = useState(false);
    const [cursorPos, setCursorPos] = useState(0);

    const handleTextChange = async (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const val = e.target.value;
        const pos = e.target.selectionStart;
        setDescription(val);
        setCursorPos(pos);

        // Buscar si el usuario acaba de escribir un # o está dentro de uno
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
        const textBefore = description.slice(0, cursorPos);
        const textAfter = description.slice(cursorPos);
        
        const newTextBefore = textBefore.replace(/#(\w*)$/, tag + ' ');
        setDescription(newTextBefore + textAfter);
        setShowTags(false);
    };
    const [isUploading, setIsUploading] = useState(false);
    const [durations, setDurations] = useState<number[]>([]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            const newFiles = Array.from(e.target.files);
            setFiles(prev => [...prev, ...newFiles]);
            
            const newPreviews = newFiles.map(file => URL.createObjectURL(file));
            setPreviews(prev => [...prev, ...newPreviews]);

            // Extract durations
            newFiles.forEach((file, index) => {
                if (file.type.startsWith('video/')) {
                    const video = document.createElement('video');
                    video.preload = 'metadata';
                    video.onloadedmetadata = () => {
                        window.URL.revokeObjectURL(video.src);
                        const duration = Math.round(video.duration);
                        setDurations(prev => {
                            const updated = [...prev];
                            // Using a temporary length since setFiles hasn't updated yet in this tick
                            updated[files.length + index] = duration;
                            return updated;
                        });
                    };
                    video.src = URL.createObjectURL(file);
                } else {
                    setDurations(prev => {
                        const updated = [...prev];
                        updated[files.length + index] = 0;
                        return updated;
                    });
                }
            });
        }
    };

    const removeFile = (index: number) => {
        setFiles(prev => prev.filter((_, i) => i !== index));
        setDurations(prev => prev.filter((_, i) => i !== index));
        setPreviews(prev => {
            URL.revokeObjectURL(prev[index]);
            return prev.filter((_, i) => i !== index);
        });
    };

    const formatDuration = (seconds: number) => {
        if (!seconds) return '0:00';
        const m = Math.floor(seconds / 60);
        const s = Math.round(seconds % 60);
        return `${m}:${s.toString().padStart(2, '0')}`;
    };

    const handleUpload = async () => {
        if (!user || (files.length === 0 && !description.trim())) {
            toast.error("Agrega contenido a tu publicación");
            return;
        }

        setIsUploading(true);
        try {
            const fd = new FormData();
            fd.append('userId', user.id);
            fd.append('title', description.slice(0, 50) || 'Publicación');
            fd.append('description', description);
            fd.append('type', files.length > 1 ? 'ALBUM' : 'POST');
            
            files.forEach((file, i) => {
                fd.append(`image_${i}`, file);
                if (durations[i]) fd.append(`duration_${i}`, String(durations[i]));
            });
            fd.append('count', String(files.length));

            await db.uploadChannelImages(fd);

            toast.success("Publicación creada correctamente");
            navigate('/');
        } catch (error) {
            console.error("Upload failed", error);
            toast.error("Error al crear la publicación");
        } finally {
            setIsUploading(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#1c1e21] text-[#e4e6eb] flex flex-col">
            {/* Header */}
            <header className="sticky top-0 z-50 bg-[#1c1e21] flex items-center justify-between px-4 h-14 border-b border-[#3e4042]">
                <div className="flex items-center gap-4">
                    <button onClick={() => navigate(-1)} className="text-[#e4e6eb]">
                        <ArrowLeft size={24} />
                    </button>
                    <h1 className="text-xl font-bold">Crear publicación</h1>
                </div>
                <button 
                    onClick={handleUpload}
                    disabled={isUploading || (files.length === 0 && !description.trim())}
                    className="text-[#1877f2] font-bold disabled:text-[#4e4f50]"
                >
                    {isUploading ? <Loader2 className="animate-spin" size={20} /> : 'PUBLICAR'}
                </button>
            </header>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {/* User Info */}
                <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-full overflow-hidden bg-[#3a3b3c]">
                        {user?.avatarUrl ? (
                            <img src={user.avatarUrl} className="w-full h-full object-cover" alt={user.username} referrerPolicy="no-referrer" />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center text-lg font-bold text-white">
                                {user?.username?.[0]?.toUpperCase() || '?'}
                            </div>
                        )}
                    </div>
                    <div>
                        <h2 className="text-base font-bold">{user?.username || 'Usuario'}</h2>
                        <div className="flex items-center gap-1 bg-[#3a3b3c] px-2 py-0.5 rounded-md mt-0.5 w-fit">
                            <Globe size={12} className="text-[#b0b3b8]" />
                            <span className="text-xs text-[#b0b3b8] font-medium">Público</span>
                            <ChevronDown size={12} className="text-[#b0b3b8]" />
                        </div>
                    </div>
                </div>

                <div className="relative">
                    <textarea 
                        value={description}
                        onChange={handleTextChange}
                        onKeyUp={e => setCursorPos((e.target as any).selectionStart)}
                        placeholder="¿Qué estás pensando?"
                        className="w-full bg-transparent border-none text-lg text-[#e4e6eb] placeholder-[#b0b3b8] focus:ring-0 resize-none min-h-[120px]"
                    />
                    
                    {showTags && tagSuggestions.length > 0 && (
                        <div className="absolute top-full left-0 right-0 bg-[#242526] border border-[#3e4042] rounded-lg shadow-xl z-[100] max-h-[180px] overflow-y-auto mt-1">
                            {tagSuggestions.map((s, idx) => (
                                <button
                                    key={idx}
                                    onClick={() => selectHashtag(s.label)}
                                    className="w-full text-left px-4 py-2.5 hover:bg-[#3a3b3c] flex items-center justify-between group transition-colors"
                                >
                                    <span className="text-sm font-bold text-[#1877f2]">{s.label}</span>
                                    {s.count > 0 && <span className="text-[10px] text-[#b0b3b8]">{s.count} usos</span>}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Image Previews */}
                {previews.length > 0 && (
                    <div className={`grid gap-1 ${previews.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
                        {previews.map((src, i) => (
                            <div key={i} className="relative aspect-square rounded-lg overflow-hidden group bg-slate-800">
                                {files[i]?.type.startsWith('video/') ? (
                                    <div className="w-full h-full flex items-center justify-center relative">
                                        <video src={src} className="w-full h-full object-cover" />
                                        <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                                            <Play className="text-white opacity-80" size={48} />
                                        </div>
                                        {durations[i] > 0 && (
                                            <div className="absolute bottom-2 right-2 bg-black/60 px-1.5 py-0.5 rounded text-[10px] font-bold text-white">
                                                {formatDuration(durations[i])}
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <img src={src} className="w-full h-full object-cover" alt="" />
                                )}
                                <button 
                                    onClick={(e) => { e.stopPropagation(); removeFile(i); }}
                                    className="absolute top-2 right-2 p-1.5 bg-black/60 text-white rounded-full"
                                >
                                    <X size={16} />
                                </button>
                            </div>
                        ))}
                        <label className="aspect-square rounded-lg border-2 border-dashed border-[#3e4042] flex flex-col items-center justify-center gap-2 text-[#b0b3b8] hover:bg-[#3a3b3c] cursor-pointer transition-all">
                            <Plus size={24} />
                            <span className="text-xs font-bold">Añadir más</span>
                            <input type="file" multiple accept="image/*" className="hidden" onChange={handleFileChange} />
                        </label>
                    </div>
                )}

                {/* Bottom Actions */}
                {previews.length === 0 && (
                    <div className="border-t border-[#3e4042] pt-4">
                        <label className="flex items-center gap-3 p-3 hover:bg-[#3a3b3c] rounded-lg cursor-pointer transition-colors">
                            <div className="w-9 h-9 flex items-center justify-center bg-[#45bd62]/10 rounded-full">
                                <ImageIcon size={22} className="text-[#45bd62]" />
                            </div>
                            <span className="text-base font-medium">Fotos/videos</span>
                            <input type="file" multiple accept="image/*,video/*" className="hidden" onChange={handleFileChange} />
                        </label>
                    </div>
                )}
            </div>
        </div>
    );
}
