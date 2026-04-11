import React, { createContext, useContext, useEffect, useState } from 'react';
import { SystemSettings } from '../types';
import { db } from '../services/db';

interface SettingsContextType {
    settings: SystemSettings | null;
    refreshSettings: () => Promise<void>;
    isLoading: boolean;
}

const SettingsContext = createContext<SettingsContextType | null>(null);

export const useSettings = () => {
    const context = useContext(SettingsContext);
    if (!context) throw new Error("useSettings must be used within SettingsProvider");
    return context;
};

export const SettingsProvider = ({ children }: { children: React.ReactNode }) => {
    const [settings, setSettings] = useState<SystemSettings | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    const refreshSettings = async () => {
        try {
            const s = await db.getSystemSettings();
            setSettings(s);
        } catch (e) {
            console.error("Failed to load settings", e);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        refreshSettings();
    }, []);

    return (
        <SettingsContext.Provider value={{ settings, refreshSettings, isLoading }}>
            {children}
        </SettingsContext.Provider>
    );
};
