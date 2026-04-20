import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { Video } from '../types';
import { db } from '../services/db';
import { useAuth } from './AuthContext';

interface DownloadItem {
    video: Video;
    progress: number;
    status: 'PENDING' | 'DOWNLOADING' | 'COMPLETED' | 'ERROR';
    error?: string;
}

interface DownloadContextType {
    queue: DownloadItem[];
    addToQueue: (video: Video) => void;
    addFolderToQueue: (folderPath: string) => Promise<void>;
    removeFromQueue: (videoId: string) => void;
    clearQueue: () => void;
    startDownload: (videoId: string) => Promise<boolean>;
    isAutoDownload: boolean;
    setIsAutoDownload: (val: boolean) => void;
}

const DownloadContext = createContext<DownloadContextType | undefined>(undefined);

export function DownloadProvider({ children }: { children: React.ReactNode }) {
    const { user, refreshUser } = useAuth();
    const [queue, setQueue] = useState<DownloadItem[]>([]);
    const [isAutoDownload, setIsAutoDownload] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);

    const addToQueue = useCallback((video: Video) => {
        setQueue(prev => {
            if (prev.find(item => item.video.id === video.id)) return prev;
            return [...prev, { video, progress: 0, status: 'PENDING' as const }];
        });
    }, []);

    const addFolderToQueue = useCallback(async (folderPath: string) => {
        try {
            const res = await db.getVideos(0, 1000, folderPath, '', 'TODOS', 'ALL', 'LATEST');
            const videos = res.videos;
            setQueue(prev => {
                const newItems: DownloadItem[] = videos
                    .filter(v => !prev.find(item => item.video.id === v.id))
                    .map(v => ({ 
                        video: v, 
                        progress: 0, 
                        status: 'PENDING'
                    }));
                return [...prev, ...newItems];
            });
        } catch (error) {
            console.error("Failed to add folder to queue", error);
        }
    }, []);

    const removeFromQueue = useCallback((videoId: string) => {
        setQueue(prev => prev.filter(item => item.video.id !== videoId));
    }, []);

    const clearQueue = useCallback(() => {
        setQueue([]);
    }, []);

    const startDownload = useCallback(async (videoId: string): Promise<boolean> => {
        const item = queue.find(i => i.video.id === videoId);
        if (!item || !user) return false;

        // Permission Check (similar to Watch.tsx handleDownload)
        const isAdmin = user.role?.trim().toUpperCase() === 'ADMIN';
        const isCreator = user.id === item.video.creatorId;
        const isVipActive = !!(user.vipExpiry && user.vipExpiry > Date.now() / 1000);
        const isVipContent = item.video.creatorRole === 'ADMIN';
        
        // Criterio de Watch.tsx: isAdmin || (isVipActive && isVipContent) || isCreator
        // + hasPurchased check
        let hasAccess = isAdmin || isCreator || (isVipActive && isVipContent);
        
        if (!hasAccess) {
            const purchased = await db.hasPurchased(user.id, item.video.id);
            if (purchased) {
                hasAccess = true;
            } else if (Number(item.video.price || 0) <= 0) {
                hasAccess = true;
            } else if (Number(user.balance) >= Number(item.video.price)) {
                // Auto-purchase if possible
                try {
                    await db.purchaseVideo(user.id, item.video.id);
                    await refreshUser();
                    hasAccess = true;
                } catch (e) {
                    hasAccess = false;
                }
            }
        }

        if (!hasAccess) {
            setQueue(prev => prev.map(i => i.video.id === videoId ? { ...i, status: 'ERROR', error: 'Sin permisos o saldo insuficiente' } : i));
            return false;
        }

        setQueue(prev => prev.map(i => i.video.id === videoId ? { ...i, status: 'DOWNLOADING', progress: 0 } : i));

        try {
            const streamUrl = db.getStreamerUrl(videoId, user.sessionToken);
            const filename = encodeURIComponent((item.video.title || 'video').replace(/[^a-z0-9]/gi, '_').toLowerCase());
            const ext = item.video.is_audio ? 'mp3' : 'mp4';
            const downloadUrl = `${streamUrl}&download=1&filename=${filename}.${ext}`;

            const link = document.createElement('a');
            link.href = downloadUrl;
            link.download = `${filename}.${ext}`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            setQueue(prev => prev.map(i => i.video.id === videoId ? { ...i, status: 'COMPLETED', progress: 100 } : i));
            return true;
        } catch (error) {
            setQueue(prev => prev.map(i => i.video.id === videoId ? { ...i, status: 'ERROR', error: 'Error al descargar' } : i));
            return false;
        }
    }, [queue, user, refreshUser]);

    // Handle Auto Download
    useEffect(() => {
        if (!isAutoDownload || isProcessing) return;

        const nextItem = queue.find(i => i.status === 'PENDING');
        if (nextItem) {
            setIsProcessing(true);
            startDownload(nextItem.video.id).finally(() => {
                // Wait a bit between downloads to let the browser handle it
                setTimeout(() => setIsProcessing(false), 2000);
            });
        }
    }, [isAutoDownload, queue, isProcessing, startDownload]);

    return (
        <DownloadContext.Provider value={{ 
            queue, 
            addToQueue, 
            addFolderToQueue, 
            removeFromQueue, 
            clearQueue, 
            startDownload,
            isAutoDownload,
            setIsAutoDownload
        }}>
            {children}
        </DownloadContext.Provider>
    );
}

export function useDownload() {
    const context = useContext(DownloadContext);
    if (!context) throw new Error('useDownload must be used within a DownloadProvider');
    return context;
}
