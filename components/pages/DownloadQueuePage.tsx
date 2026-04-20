import React from 'react';
import { useNavigate } from '../Router';
import { 
    ChevronLeft, Download, Trash2, Play, CheckCircle, 
    AlertCircle, Loader2, X, Music, Image as ImageIcon
} from 'lucide-react';
import { useDownload } from '../../context/DownloadContext';

export default function DownloadQueuePage() {
    const navigate = useNavigate();
    const { queue, removeFromQueue, clearQueue, startDownload } = useDownload();

    const pending = queue.filter(i => i.status === 'PENDING').length;
    const completed = queue.filter(i => i.status === 'COMPLETED').length;
    const downloading = queue.filter(i => i.status === 'DOWNLOADING').length;

    return (
        <div className="min-h-screen bg-[#18191a] text-[#e4e6eb] pb-24">
            {/* Header */}
            <header className="sticky top-0 z-50 bg-[#242526] border-b border-[#3e4042] px-4 h-14 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <button onClick={() => navigate(-1)} className="p-2 hover:bg-white/10 rounded-full transition-colors font-bold">
                        <ChevronLeft size={22} />
                    </button>
                    <h1 className="text-sm font-bold">Cola de descarga</h1>
                </div>
                {queue.length > 0 && (
                    <button onClick={clearQueue} className="text-[#fa3e3e] text-[10px] font-bold uppercase tracking-wider p-2 hover:bg-red-500/10 rounded-lg">
                        Limpiar cola
                    </button>
                )}
            </header>

            {/* Stats Bar */}
            <div className="bg-[#1c1e21] border-b border-[#3e4042] px-4 py-2 flex items-center justify-between">
                <div className="flex gap-4">
                    <div className="flex flex-col">
                        <span className="text-[10px] font-bold text-[#b0b3b8] uppercase">Pendientes</span>
                        <span className="text-sm font-bold">{pending}</span>
                    </div>
                    <div className="flex flex-col">
                        <span className="text-[10px] font-bold text-[#b0b3b8] uppercase">Descargando</span>
                        <span className="text-sm font-bold text-[#2e89ff]">{downloading}</span>
                    </div>
                    <div className="flex flex-col">
                        <span className="text-[10px] font-bold text-[#b0b3b8] uppercase">Listos</span>
                        <span className="text-sm font-bold text-[#45bd62]">{completed}</span>
                    </div>
                </div>
            </div>

            <main className="max-w-2xl mx-auto p-3 space-y-2">
                {queue.length === 0 ? (
                    <div className="py-32 flex flex-col items-center justify-center text-[#b0b3b8] gap-4">
                        <Download size={64} className="opacity-10" />
                        <div className="text-center">
                            <p className="font-bold text-lg text-[#e4e6eb]">Cola vacía</p>
                            <p className="text-sm">No has añadido archivos para descargar</p>
                            <button 
                                onClick={() => navigate('/folders')}
                                className="mt-6 px-6 py-2 bg-[#2e89ff] text-white rounded-lg font-bold text-sm"
                            >
                                Explorar archivos
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-1">
                        {queue.map((item) => (
                            <div key={item.video.id} className="bg-[#242526] border border-[#3e4042] rounded-xl p-3 flex gap-3 items-center group">
                                {/* Thumbnail */}
                                <div className="w-16 h-10 bg-[#3a3b3c] rounded overflow-hidden relative shrink-0">
                                    {item.video.thumbnailUrl ? (
                                        <img src={item.video.thumbnailUrl} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center">
                                            {item.video.is_audio ? <Music size={14} className="text-[#2d88ff]" /> : <Play size={14} className="text-[#2d88ff]" />}
                                        </div>
                                    )}
                                </div>

                                <div className="flex-1 min-w-0">
                                    <div className="text-[13px] font-bold truncate leading-tight mb-1">{item.video.title}</div>
                                    <div className="flex items-center gap-2">
                                        <span className={`text-[10px] font-bold uppercase tracking-wider ${
                                            item.status === 'COMPLETED' ? 'text-[#45bd62]' : 
                                            item.status === 'DOWNLOADING' ? 'text-[#2e89ff]' : 
                                            item.status === 'ERROR' ? 'text-[#fa3e3e]' : 'text-[#b0b3b8]'
                                        }`}>
                                            {item.status === 'PENDING' ? 'Pendiente' : 
                                             item.status === 'DOWNLOADING' ? 'Descargando...' : 
                                             item.status === 'COMPLETED' ? 'Completado' : 'Error'}
                                        </span>
                                        {item.status === 'DOWNLOADING' && (
                                            <div className="flex-1 h-1 bg-[#3a3b3c] rounded-full overflow-hidden">
                                                <div className="h-full bg-[#2e89ff] animate-pulse" style={{ width: '100%' }}></div>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="flex items-center gap-1">
                                    {item.status === 'PENDING' && (
                                        <button 
                                            onClick={() => startDownload(item.video.id)}
                                            className="p-2 text-[#2e89ff] hover:bg-[#2d88ff]/10 rounded-full transition-colors"
                                        >
                                            <Download size={18} />
                                        </button>
                                    )}
                                    {item.status === 'COMPLETED' && (
                                        <CheckCircle size={18} className="text-[#45bd62]" />
                                    )}
                                    <button 
                                        onClick={() => removeFromQueue(item.video.id)}
                                        className="p-2 text-[#b0b3b8] hover:text-[#fa3e3e] hover:bg-red-500/10 rounded-full transition-colors"
                                    >
                                        <X size={18} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </main>

            {downloading > 0 && (
                <div className="fixed bottom-0 left-0 right-0 p-4 bg-[#2e89ff] text-white text-center font-bold text-sm animate-pulse">
                    Descargando archivos... no cierres la ventana
                </div>
            )}
        </div>
    );
}
