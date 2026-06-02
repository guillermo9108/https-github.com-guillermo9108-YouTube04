
import React, { createContext, useContext, useState, useRef, useCallback } from 'react';
import { db } from '../services/db';
import { User, VideoCategory } from '../types';

export interface UploadItem {
  title: string;
  description: string;
  price: number;
  category: string;
  duration: number;
  file: File;
  thumbnail: File | null;
}

interface UploadContextType {
  isUploading: boolean;
  progress: number; // 0-100 for current file
  currentFileIndex: number;
  totalFiles: number;
  uploadSpeed: string; // "1.2 MB/s"
  addToQueue: (items: UploadItem[], user: User, folder?: string) => Promise<void>;
  cancelUploads: () => void;
}

const UploadContext = createContext<UploadContextType | null>(null);

export const useUpload = () => {
  const context = useContext(UploadContext);
  if (!context) throw new Error("useUpload must be used within UploadProvider");
  return context;
};

export const UploadProvider = ({ children }: { children?: React.ReactNode }) => {
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentFileIndex, setCurrentFileIndex] = useState(0);
  const [totalFiles, setTotalFiles] = useState(0);
  const [uploadSpeed, setUploadSpeed] = useState("0 MB/s");
  const abortController = useRef<AbortController | null>(null);

  // Speed calculation vars
  const lastLoaded = useRef(0);
  const lastTime = useRef(0);

  const addToQueue = useCallback(async (items: UploadItem[], user: User, folder?: string) => {
    if (isUploading) {
        alert("En progreso. Espera a que termine la subida actual.");
        return;
    }

    setIsUploading(true);
    setTotalFiles(items.length);
    setCurrentFileIndex(0);
    setProgress(0);

    try {
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            setCurrentFileIndex(i + 1);
            setProgress(0);
            setUploadSpeed("0 MB/s");

            lastLoaded.current = 0;
            lastTime.current = Date.now();

            // Perform chunked upload
            await new Promise<void>(async (resolve, reject) => {
                const CHUNK_SIZE = 2 * 1024 * 1024; // 2MB chunks
                const file = item.file;
                const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
                const uploadId = "up_" + Math.random().toString(36).substring(2) + Date.now();

                for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
                    const start = chunkIndex * CHUNK_SIZE;
                    const end = Math.min(start + CHUNK_SIZE, file.size);
                    const chunkBlob = file.slice(start, end);

                    await new Promise<void>((resolveChunk, rejectChunk) => {
                        const xhr = new XMLHttpRequest();
                        const fd = new FormData();
                        
                        fd.append('action', 'upload_chunk');
                        fd.append('uploadId', uploadId);
                        fd.append('chunkIndex', String(chunkIndex));
                        fd.append('totalChunks', String(totalChunks));
                        fd.append('fileName', file.name);
                        fd.append('file', chunkBlob);

                        fd.append('title', item.title);
                        fd.append('description', item.description);
                        fd.append('price', String(item.price));
                        fd.append('category', item.category);
                        fd.append('duration', String(item.duration));
                        fd.append('userId', user.id);
                        if (item.thumbnail && chunkIndex === totalChunks - 1) {
                            fd.append('thumbnail', item.thumbnail);
                        }

                        const targetFolder = folder || (item.category !== 'PERSONAL' ? item.category : '');
                        if (targetFolder) {
                            fd.append('folder', targetFolder);
                        }

                        const token = localStorage.getItem('sp_session_token') || sessionStorage.getItem('sp_session_token');
                        xhr.open('POST', '/api/index.php');
                        if (token) {
                            xhr.setRequestHeader('Authorization', `Bearer ${token}`);
                        }

                        xhr.upload.onprogress = (e) => {
                            if (e.lengthComputable) {
                                const totalUploadedBytes = start + e.loaded;
                                const percent = Math.min(100, Math.round((totalUploadedBytes / file.size) * 100));
                                setProgress(percent);

                                const now = Date.now();
                                const diffTime = now - lastTime.current;
                                if (diffTime >= 1000) {
                                    const diffLoaded = totalUploadedBytes - lastLoaded.current;
                                    const mbps = (diffLoaded / 1024 / 1024) / (diffTime / 1000);
                                    setUploadSpeed(`${mbps.toFixed(1)} MB/s`);
                                    
                                    lastLoaded.current = totalUploadedBytes;
                                    lastTime.current = now;
                                }
                            }
                        };

                        xhr.onload = () => {
                            if (xhr.status >= 200 && xhr.status < 300) {
                                try {
                                    const res = JSON.parse(xhr.responseText);
                                    if (res.success) {
                                        resolveChunk();
                                    } else {
                                        rejectChunk(new Error(res.error || 'Subida errónea del fragmento'));
                                    }
                                } catch (e) {
                                    rejectChunk(new Error("Respuesta inválida del servidor"));
                                }
                            } else {
                                rejectChunk(new Error(`Servicio devolvió código ${xhr.status}`));
                            }
                        };

                        xhr.onerror = () => rejectChunk(new Error("Error de red durante la subida del fragmento"));
                        xhr.send(fd);
                    });
                }
                resolve();
            });
        }

        db.invalidateCache('sp_cache_videos');
        db.setHomeDirty();
    } catch (error: any) {
        console.error(`Sequential upload failed`, error);
        throw error;
    } finally {
        setIsUploading(false);
        setUploadSpeed("0 MB/s");
        setTotalFiles(0);
        setCurrentFileIndex(0);
    }
  }, [isUploading]);

  const cancelUploads = () => {
    // Requires deeper DB integration to abort XHR, simplified for now
    setIsUploading(false);
    window.location.reload(); 
  };

  return (
    <UploadContext.Provider value={{ isUploading, progress, currentFileIndex, totalFiles, uploadSpeed, addToQueue, cancelUploads }}>
      {children}
    </UploadContext.Provider>
  );
};
