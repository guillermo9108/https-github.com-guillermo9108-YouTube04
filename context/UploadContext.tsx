
import React, { createContext, useContext, useState, useRef, useCallback } from 'react';
import { db } from '../services/db';
import { User, VideoCategory } from '../types';

export interface UploadItem {
  title: string;
  description: string;
  price: number;
  category: VideoCategory;
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
  addToQueue: (items: UploadItem[], user: User) => Promise<void>;
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

  const addToQueue = useCallback(async (items: UploadItem[], user: User) => {
    if (isUploading) {
        alert("Wait for current upload to finish");
        return;
    }

    setIsUploading(true);
    setTotalFiles(items.length);
    setCurrentFileIndex(0);
    setProgress(0);

    for (let i = 0; i < items.length; i++) {
        setCurrentFileIndex(i + 1);
        const item = items[i];
        
        lastLoaded.current = 0;
        lastTime.current = Date.now();

        try {
            await db.uploadVideo(
                item.title,
                item.description,
                item.price,
                item.category,
                item.duration,
                user,
                item.file,
                item.thumbnail,
                (percent, loaded, total) => {
                    setProgress(percent);
                    
                    // Calculate speed
                    const now = Date.now();
                    const diffTime = now - lastTime.current;
                    if (diffTime >= 1000) {
                        const diffLoaded = loaded - lastLoaded.current;
                        const mbps = (diffLoaded / 1024 / 1024) / (diffTime / 1000);
                        setUploadSpeed(`${mbps.toFixed(1)} MB/s`);
                        
                        lastLoaded.current = loaded;
                        lastTime.current = now;
                    }
                }
            );
        } catch (error) {
            console.error(`Failed to upload ${item.title}`, error);
            // Optionally add to a "failed" list, but for now we continue
        }
    }

    setIsUploading(false);
    setUploadSpeed("0 MB/s");
    setTotalFiles(0);
    setCurrentFileIndex(0);
    alert("All uploads completed!");
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
