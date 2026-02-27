
import React, { createContext, useContext, useState, useRef, useEffect } from 'react';
import { db } from '../services/db';

interface ServerTaskContextType {
    isScanning: boolean;
    progress: { current: number; total: number; percent: number };
    currentFile: string;
    log: string[];
    startScan: (path: string) => Promise<void>;
    cancelScan: () => void;
}

const ServerTaskContext = createContext<ServerTaskContextType | null>(null);

export const useServerTask = () => {
    const context = useContext(ServerTaskContext);
    if (!context) throw new Error("useServerTask must be used within ServerTaskProvider");
    return context;
};

export const ServerTaskProvider = ({ children }: { children?: React.ReactNode }) => {
    const [isScanning, setIsScanning] = useState(false);
    const [progress, setProgress] = useState({ current: 0, total: 0, percent: 0 });
    const [currentFile, setCurrentFile] = useState('');
    const [log, setLog] = useState<string[]>([]);
    
    const abortRef = useRef(false);

    const startScan = async (path: string) => {
        if (isScanning) return;
        setIsScanning(true);
        abortRef.current = false;
        setLog([]);
        
        try {
            // 1. Initialize
            setLog(['Initializing scan...', `Looking in: ${path}`]);
            const init = await db.scanLocalLibrary(path);
            
            if (init.errors && init.errors.length > 0) {
                setLog(prev => [...prev, ...init.errors!]);
                setIsScanning(false);
                return;
            }

            if (!init.newToImport || init.newToImport === 0) {
                setLog(prev => [...prev, 'No new videos found to import.']);
                setIsScanning(false);
                return;
            }

            setLog(prev => [...prev, `Found ${init.newToImport} new videos. Starting import...`]);
            setProgress({ current: 0, total: init.newToImport, percent: 0 });

            // 2. Start Batch Loop
            processBatchLoop(init.newToImport);

        } catch (e: any) {
            setLog(prev => [...prev, `Error: ${e.message}`]);
            setIsScanning(false);
        }
    };

    const processBatchLoop = async (total: number) => {
        if (abortRef.current) {
            setIsScanning(false);
            return;
        }

        try {
            const res = await db.processScanBatch();
            
            // Update Log
            if (res.processed && res.processed.length > 0) {
                res.processed.forEach((p: any) => {
                    if (p.error) {
                        setLog(prev => [...prev, `Failed: ${p.title} - ${p.error}`]);
                    } else {
                        setCurrentFile(p.title);
                        setLog(prev => [...prev, `Imported: ${p.title} (${p.category})`]);
                    }
                });
            }

            // Update Progress
            const remaining = res.remaining || 0;
            const current = total - remaining;
            const percent = Math.round((current / total) * 100);
            setProgress({ current, total, percent });

            if (!res.completed) {
                // Continue loop with small delay to let UI breathe
                setTimeout(() => processBatchLoop(total), 500);
            } else {
                setLog(prev => [...prev, 'Scan Completed Successfully!']);
                setIsScanning(false);
                setCurrentFile('');
                // Refresh App Data
                db.invalidateCache('index.php?action=get_videos');
                db.setHomeDirty();
            }

        } catch (e: any) {
            // RETRY LOGIC: If backend crashed/timed out on a file, it should have been popped from queue.
            // We log the error and try to continue with the next one.
            setLog(prev => [...prev, `Batch Error: ${e.message || 'Unknown'}. Retrying in 2s...`]);
            console.error("Scan Batch Error", e);
            
            // Retry after delay
            setTimeout(() => processBatchLoop(total), 2000);
        }
    };

    const cancelScan = () => {
        abortRef.current = true;
        setLog(prev => [...prev, 'Scan aborted by user.']);
        setIsScanning(false);
    };

    return (
        <ServerTaskContext.Provider value={{ isScanning, progress, currentFile, log, startScan, cancelScan }}>
            {children}
        </ServerTaskContext.Provider>
    );
};
