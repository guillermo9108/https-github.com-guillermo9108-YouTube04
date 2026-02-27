import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useAuth } from './AuthContext';
import { db } from '../services/db';
import { Video } from '../types';

interface GridContextType {
    activeTask: Video | null;
    completeTask: (duration: number, thumbnail: File | null) => Promise<void>;
    skipTask: () => void;
    isIdle: boolean;
    setThrottled: (isThrottled: boolean) => void;
}

const GridContext = createContext<GridContextType | null>(null);

export const useGrid = () => {
    const context = useContext(GridContext);
    if (!context) throw new Error("useGrid must be used within GridProvider");
    return context;
};

const TIMEOUT_BETWEEN_TASKS = 10000; 

export const GridProvider = ({ children }: { children?: React.ReactNode }) => {
    const { user } = useAuth();
    const [activeTask, setActiveTask] = useState<Video | null>(null);
    const [isIdle, setIsIdle] = useState(true);
    const [isThrottled, setIsThrottled] = useState(false);
    
    const intervalRef = useRef<number | null>(null);
    const processingRef = useRef(false);
    const nextFetchTimeRef = useRef<number>(0);

    const fetchNextTask = async () => {
        // No buscar tareas si estamos en modo throttle (viendo un video) o ya hay una activa
        if (isThrottled || activeTask || processingRef.current || Date.now() < nextFetchTimeRef.current) return;
        
        try {
            const pending = await db.getUnprocessedVideos(1, 'normal');
            
            if (pending && pending.length > 0) {
                processingRef.current = true;
                setIsIdle(false);
                setActiveTask(pending[0]);
            } else {
                setIsIdle(true);
            }
        } catch (e) {
            console.warn("Grid Fetch Error", e);
            setIsIdle(true);
        }
    };

    const completeTask = async (duration: number, thumbnail: File | null) => {
        if (!activeTask) return;
        
        try {
            await db.updateVideoMetadata(activeTask.id, duration, thumbnail);
            await new Promise(resolve => setTimeout(resolve, 2000));
        } catch (e) {
            console.error("Task submission failed", e);
        } finally {
            setActiveTask(null);
            processingRef.current = false;
            
            nextFetchTimeRef.current = Date.now() + TIMEOUT_BETWEEN_TASKS;
            setIsIdle(true);
        }
    };

    const skipTask = () => {
        setActiveTask(null);
        processingRef.current = false;
        nextFetchTimeRef.current = Date.now() + 5000; 
        setIsIdle(true);
    };

    const setThrottled = (val: boolean) => {
        setIsThrottled(val);
        if (val) {
            // Si entramos en throttle, limpiamos la tarea activa para liberar recursos inmediatos
            setActiveTask(null);
            processingRef.current = false;
        }
    };

    useEffect(() => {
        if (user) {
            intervalRef.current = window.setInterval(() => {
                if (!document.hidden && !activeTask && !isThrottled) {
                    fetchNextTask();
                }
            }, 5000); 
        }

        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
        };
    }, [user, activeTask, isThrottled]);

    return (
        <GridContext.Provider value={{ activeTask, completeTask, skipTask, isIdle, setThrottled }}>
            {children}
        </GridContext.Provider>
    );
};
