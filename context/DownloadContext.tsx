import React, { createContext, useContext, useState, useCallback } from 'react';
import { Video } from '../types';
import { db } from '../services/db';

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
    startDownload: (videoId: string) => void;
}

const DownloadContext = createContext<DownloadContextType | undefined>(undefined);

export function DownloadProvider({ children }: { children: React.ReactNode }) {
    const [queue, setQueue] = useState<DownloadItem[]>([]);

    const addToQueue = useCallback((video: Video) => {
        setQueue(prev => {
            if (prev.find(item => item.video.id === video.id)) return prev;
            return [...prev, { video, progress: 0, status: 'PENDING' as const }];
        });
    }, []);

    const addFolderToQueue = useCallback(async (folderPath: string) => {
        try {
            // Get all videos in this folder recursively
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

    const startDownload = useCallback((videoId: string) => {
        const item = queue.find(i => i.video.id === videoId);
        if (!item) return;

        setQueue(prev => prev.map(i => i.video.id === videoId ? { ...i, status: 'DOWNLOADING', progress: 0 } : i));

        // In a real PWA context, we trigger a browser download.
        // For multiple files, we might want to do them one by one.
        const url = item.video.videoUrl;
        const link = document.createElement('a');
        link.href = url;
        link.download = item.video.title || 'video.mp4';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        setQueue(prev => prev.map(i => i.video.id === videoId ? { ...i, status: 'COMPLETED', progress: 100 } : i));
    }, [queue]);

    return (
        <DownloadContext.Provider value={{ queue, addToQueue, addFolderToQueue, removeFromQueue, clearQueue, startDownload }}>
            {children}
        </DownloadContext.Provider>
    );
}

export function useDownload() {
    const context = useContext(DownloadContext);
    if (!context) throw new Error('useDownload must be used within a DownloadProvider');
    return context;
}
