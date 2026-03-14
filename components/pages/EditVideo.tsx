import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from '../Router';
import { db } from '../../services/db';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Save, ArrowLeft, Loader2 } from 'lucide-react';
import { Video } from '../../types';

const EditVideo: React.FC = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { user, isLoading: authLoading } = useAuth();
    const isAdmin = user?.role?.trim().toUpperCase() === 'ADMIN';
    const toast = useToast();
    const [video, setVideo] = useState<Video | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    
    const [formData, setFormData] = useState({
        title: '',
        description: '',
        price: 1.00,
        category: ''
    });

    useEffect(() => {
        const loadVideo = async () => {
            if (authLoading) return; // Esperar a que el auth esté listo
            
            console.log("EditVideo: Loading video with ID:", id);
            if (!id) {
                console.warn("EditVideo: No ID provided");
                setLoading(false);
                return;
            }
            try {
                const v = await db.getVideo(id);
                console.log("EditVideo: Video data received:", v);
                if (v) {
                    // Verificar permisos
                    if (v.creatorId !== user?.id && !isAdmin) {
                        console.warn("EditVideo: Permission denied. Creator:", v.creatorId, "User:", user?.id, "isAdmin:", isAdmin);
                        toast.error("No tienes permiso para editar este video");
                        navigate('/');
                        return;
                    }
                    setVideo(v);
                    setFormData({
                        title: v.title || '',
                        description: v.description || '',
                        price: Number(v.price) || 1.00,
                        category: v.category || ''
                    });
                } else {
                    console.warn("EditVideo: Video not found");
                }
            } catch (e) {
                console.error("EditVideo: Error loading video:", e);
                toast.error("Error al cargar el video");
            } finally {
                setLoading(false);
                console.log("EditVideo: Loading finished");
            }
        };
        loadVideo();
    }, [id, user?.id, isAdmin, authLoading, navigate, toast]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!id || !user) return;
        
        setSaving(true);
        try {
            await db.updateVideo(id, user.id, formData);
            toast.success("Video actualizado correctamente");
            navigate(-1);
        } catch (e: any) {
            toast.error(e.message || "Error al actualizar el video");
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
            </div>
        );
    }

    if (!video) {
        return (
            <div className="text-center py-20">
                <p className="text-slate-400">Video no encontrado</p>
                <button onClick={() => navigate(-1)} className="mt-4 text-indigo-400 hover:underline">Volver</button>
            </div>
        );
    }

    return (
        <div className="max-w-2xl mx-auto px-4 py-8">
            <button 
                onClick={() => navigate(-1)}
                className="flex items-center gap-2 text-slate-400 hover:text-white mb-6 transition-colors"
            >
                <ArrowLeft size={20} />
                <span>Volver</span>
            </button>

            <div className="bg-slate-900/50 backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl">
                <h1 className="text-2xl font-black text-white mb-8">Editar Video</h1>
                
                <form onSubmit={handleSubmit} className="space-y-6">
                    <div>
                        <label className="block text-sm font-medium text-slate-400 mb-2">Título</label>
                        <input 
                            type="text"
                            value={formData.title}
                            onChange={e => setFormData({...formData, title: e.target.value})}
                            className="w-full bg-slate-950 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-indigo-500 transition-colors"
                            required
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-400 mb-2">Descripción</label>
                        <textarea 
                            value={formData.description}
                            onChange={e => setFormData({...formData, description: e.target.value})}
                            className="w-full bg-slate-950 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-indigo-500 transition-colors min-h-[120px]"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-6">
                        <div>
                            <label className="block text-sm font-medium text-slate-400 mb-2">Precio ($)</label>
                            <input 
                                type="number"
                                step="0.01"
                                value={formData.price}
                                onChange={e => setFormData({...formData, price: Number(e.target.value)})}
                                className="w-full bg-slate-950 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-indigo-500 transition-colors"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-400 mb-2">Categoría</label>
                            <input 
                                type="text"
                                value={formData.category}
                                onChange={e => setFormData({...formData, category: e.target.value})}
                                className="w-full bg-slate-950 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-indigo-500 transition-colors"
                                required
                            />
                        </div>
                    </div>

                    <button 
                        type="submit"
                        disabled={saving}
                        className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-indigo-500/20 active:scale-[0.98]"
                    >
                        {saving ? (
                            <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                            <>
                                <Save size={20} />
                                <span>Guardar Cambios</span>
                            </>
                        )}
                    </button>
                </form>
            </div>
        </div>
    );
};

export default EditVideo;
