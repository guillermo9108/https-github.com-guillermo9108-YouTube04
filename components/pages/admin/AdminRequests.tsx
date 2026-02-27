
import React, { useState, useEffect } from 'react';
import { db } from '../../../services/db';
import { ContentRequest } from '../../../types';
import { useToast } from '../../../context/ToastContext';
import { DownloadCloud, Check, X, Clock, Trash2, RefreshCw } from 'lucide-react';

export default function AdminRequests() {
    const toast = useToast();
    const [requests, setRequests] = useState<ContentRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<'ALL' | 'PENDING' | 'COMPLETED'>('ALL');

    const loadData = async () => {
        setLoading(true);
        try {
            const data = await db.getRequests('ALL'); // Get all and filter client side for better UX or server side
            setRequests(data);
        } catch(e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    const handleStatus = async (id: string, status: string) => {
        try {
            await db.updateRequestStatus(id, status);
            toast.success("Estado actualizado");
            loadData();
        } catch(e: any) {
            toast.error(e.message);
        }
    };

    const handleDelete = async (id: string) => {
        if(!confirm("¿Eliminar esta petición?")) return;
        try {
            await db.deleteRequest(id);
            setRequests(prev => prev.filter(r => r.id !== id));
            toast.success("Eliminado");
        } catch(e: any) {
            toast.error(e.message);
        }
    };

    const filtered = requests.filter(r => filter === 'ALL' || r.status === filter);

    return (
        <div className="space-y-6 animate-in fade-in">
            <div className="flex justify-between items-center bg-slate-900 p-4 rounded-xl border border-slate-800">
                <div className="flex items-center gap-3">
                    <DownloadCloud size={24} className="text-purple-400"/>
                    <div>
                        <h3 className="font-bold text-white">Peticiones de Contenido</h3>
                        <p className="text-xs text-slate-400">Lo que los usuarios quieren ver</p>
                    </div>
                </div>
                <div className="flex gap-2">
                    {['ALL', 'PENDING', 'COMPLETED'].map((f: any) => (
                        <button 
                            key={f} 
                            onClick={() => setFilter(f)} 
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${filter === f ? 'bg-purple-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
                        >
                            {f === 'ALL' ? 'Todas' : f}
                        </button>
                    ))}
                    <button onClick={loadData} className="p-2 bg-slate-800 text-slate-400 hover:text-white rounded-lg"><RefreshCw size={14}/></button>
                </div>
            </div>

            <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
                <table className="w-full text-sm text-left">
                    <thead className="text-xs text-slate-500 uppercase bg-slate-950/50">
                        <tr>
                            <th className="px-4 py-3">Usuario</th>
                            <th className="px-4 py-3">Petición</th>
                            <th className="px-4 py-3">Estado</th>
                            <th className="px-4 py-3 text-right">Acciones</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                        {filtered.length === 0 ? (
                            <tr><td colSpan={4} className="text-center py-8 text-slate-500">No hay peticiones</td></tr>
                        ) : (
                            filtered.map(req => (
                                <tr key={req.id} className="hover:bg-slate-800/50">
                                    <td className="px-4 py-3 font-bold text-white">{(req as any).username || 'Usuario'}</td>
                                    <td className="px-4 py-3 text-slate-300">
                                        {req.query}
                                        <div className="text-[10px] text-slate-500 mt-0.5">{new Date(req.createdAt * 1000).toLocaleString()}</div>
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className={`px-2 py-1 rounded text-[10px] font-bold ${
                                            req.status === 'COMPLETED' ? 'bg-emerald-500/20 text-emerald-400' : 
                                            req.status === 'PENDING' ? 'bg-amber-500/20 text-amber-400' : 
                                            'bg-slate-700 text-slate-300'
                                        }`}>
                                            {req.status}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                        <div className="flex justify-end gap-2">
                                            {req.status !== 'COMPLETED' && (
                                                <button onClick={() => handleStatus(req.id, 'COMPLETED')} className="p-1.5 bg-emerald-900/30 text-emerald-400 rounded hover:bg-emerald-900/50" title="Marcar completado"><Check size={16}/></button>
                                            )}
                                            {req.status !== 'FAILED' && (
                                                <button onClick={() => handleStatus(req.id, 'FAILED')} className="p-1.5 bg-red-900/30 text-red-400 rounded hover:bg-red-900/50" title="Marcar fallido"><X size={16}/></button>
                                            )}
                                            <button onClick={() => handleDelete(req.id)} className="p-1.5 text-slate-500 hover:text-red-400 transition-colors"><Trash2 size={16}/></button>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
