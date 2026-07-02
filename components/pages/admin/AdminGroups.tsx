import React, { useState, useEffect } from 'react';
import { db } from '../../../services/db';
import { useToast } from '../../../context/ToastContext';
import { 
  Folder, Search, Users, CheckSquare, Trash2, Settings, AlertTriangle, 
  Plus, RefreshCw, Upload, Shield, Activity, FileText, Check, Layers, 
  Eye, Heart, MessageSquare, X, ToggleLeft, ToggleRight, Info, HelpCircle
} from 'lucide-react';

interface GroupPhysical {
  physicalPath: string;
  videoCount: number;
  audioCount: number;
  imageCount: number;
  fileCount: number;
  hasCover: boolean;
}

interface GroupItem {
  folderPath: string;
  creatorId: string;
  description: string;
  coverUrl: string | null;
  isPrivate: number;
  isUnified: number;
  allowUpload: number;
  isSeries: number;
  createdAt: number;
  autoDetected: number;
  scheduled_deletion_time: number | null;
  physical: GroupPhysical | null;
  dbVideoCount: number;
}

interface AdminUser {
  id: string;
  username: string;
  name: string;
}

interface AppError {
  id: string;
  source: string;
  message: string;
  file: string | null;
  line: number | null;
  trace: string | null;
  timestamp: number;
}

interface CleanupPreviewData {
  inactiveVideos: any[];
  inactiveSeries: any[];
  config: {
    normalDays: number;
    seriesDays: number;
  };
}

export default function AdminGroups() {
  const toast = useToast();
  const showToast = (message: string, type: 'error' | 'success' | 'info' = 'info') => {
    if (type === 'error') toast.error(message);
    else if (type === 'success') toast.success(message);
    else toast.info(message);
  };
  const [groups, setGroups] = useState<GroupItem[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [logs, setLogs] = useState<AppError[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [combining, setCombining] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  
  // Search and filters
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<'ALL' | 'NORMAL' | 'SERIES'>('ALL');
  const [filterSource, setFilterSource] = useState<'ALL' | 'MANUAL' | 'AUTO'>('ALL');
  const [filterDeletion, setFilterDeletion] = useState<'ALL' | 'SCHEDULED'>('ALL');

  // Selection
  const [selectedFolders, setSelectedFolders] = useState<string[]>([]);

  // Editing state for names
  const [editingFolder, setEditingFolder] = useState<string | null>(null);
  const [editNameValue, setEditNameValue] = useState('');

  // Modals / Panels
  const [showConfig, setShowConfig] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [expandedErrors, setExpandedErrors] = useState<Record<string, boolean>>({});
  const [showCleanupPreview, setShowCleanupPreview] = useState(false);
  const [cleanupPreview, setCleanupPreview] = useState<CleanupPreviewData | null>(null);

  const handleClearErrors = async () => {
    if (!confirm('¿Seguro que deseas vaciar todos los errores del sistema?')) return;
    try {
      const res = await db.request<{ success: boolean }>('action=admin_clear_errors');
      if (res.success) {
        showToast('Historial de errores vaciado', 'success');
        setLogs([]);
      } else {
        showToast('Error al vaciar errores', 'error');
      }
    } catch (e: any) {
      showToast(e.message || 'Error de conexión', 'error');
    }
  };

  // Cleanup config
  const [normalDays, setNormalDays] = useState(30);
  const [seriesDays, setSeriesDays] = useState(90);

  // Bulk Edit settings
  const [bulkCreatorId, setBulkCreatorId] = useState('');
  const [bulkIsSeries, setBulkIsSeries] = useState<number | null>(null);
  const [bulkAllowUpload, setBulkAllowUpload] = useState<number | null>(null);
  const [bulkIsPrivate, setBulkIsPrivate] = useState<number | null>(null);

  // Load primary data
  const loadData = async () => {
    setLoading(true);
    try {
      const data = await db.request<{ groups: GroupItem[]; users: AdminUser[] }>('action=groups_list');
      if (data && data.groups) {
        setGroups(data.groups);
        setUsers(data.users || []);
      }
      
      // Load configurations as well
      const config = await db.request<any>('action=get_system_settings');
      if (config) {
        setNormalDays(config.cleanNormalGroupsDays ?? 30);
        setSeriesDays(config.cleanSeriesGroupsDays ?? 90);
      }
    } catch (e: any) {
      showToast(e.message || 'Error de conexión', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadLogs = async () => {
    try {
      const data = await db.request<AppError[]>('action=admin_get_errors');
      if (data) {
        setLogs(data);
      }
    } catch (e) {}
  };

  useEffect(() => {
    loadData();
    loadLogs();
  }, []);

  // Action: Scan folder
  const handleScanDisk = async () => {
    setScanning(true);
    showToast('Escaneando carpetas en disco...', 'info');
    try {
      // Re-trigger scanning via list itself (which auto-registers new groups)
      const data = await db.request<{ groups: GroupItem[]; users: AdminUser[] }>('action=groups_list');
      if (data && data.groups) {
        setGroups(data.groups);
        showToast('Escaneo completado. Se sincronizaron los grupos.', 'success');
        loadLogs();
      }
    } catch (e: any) {
      showToast(e.message || 'Fallo de red al escanear', 'error');
    } finally {
      setScanning(false);
    }
  };

  // Action: Combined publication
  const handleCombinedPublishing = async () => {
    setCombining(true);
    showToast('Buscando carpetas de publicación combinada...', 'info');
    try {
      const data = await db.request<{ combinedCount: number }>('action=groups_combine_run');
      if (data) {
        showToast(`Se crearon ${data.combinedCount} publicaciones combinadas automáticas`, 'success');
        loadData();
        loadLogs();
      }
    } catch (e: any) {
      showToast(e.message || 'Fallo en publicaciones combinadas', 'error');
    } finally {
      setCombining(false);
    }
  };

  // Action: Smart Cleanup Preview
  const handleCleanupPreview = async () => {
    setCleaning(true);
    try {
      const data = await db.request<CleanupPreviewData>('action=groups_cleanup_preview');
      if (data) {
        setCleanupPreview(data);
        setShowCleanupPreview(true);
      }
    } catch (e: any) {
      showToast(e.message || 'Error obteniendo preview de limpieza', 'error');
    } finally {
      setCleaning(false);
    }
  };

  // Action: Smart Cleanup Run
  const handleCleanupRun = async () => {
    setCleaning(true);
    setShowCleanupPreview(false);
    showToast('Ejecutando limpieza inteligente de grupos...', 'info');
    try {
      await db.request<void>('action=groups_cleanup_run');
      showToast('Limpieza inteligente ejecutada correctamente', 'success');
      loadData();
      loadLogs();
    } catch (e: any) {
      showToast(e.message || 'Error al ejecutar limpieza', 'error');
    } finally {
      setCleaning(false);
    }
  };

  // Action: Save cleanup configurations
  const handleSaveCleanupConfig = async () => {
    try {
      await db.request<void>('action=update_system_settings', {
        method: 'POST',
        body: JSON.stringify({
          cleanNormalGroupsDays: normalDays,
          cleanSeriesGroupsDays: seriesDays
        })
      });
      showToast('Configuraciones de limpieza guardadas correctamente', 'success');
      setShowConfig(false);
    } catch (e: any) {
      showToast(e.message || 'Fallo al guardar configuraciones', 'error');
    }
  };

  // Single edit change
  const handleSingleSave = async (item: GroupItem, updatedFields: Partial<GroupItem>) => {
    const payload = {
      groups: [
        {
          folderPath: item.folderPath,
          creatorId: updatedFields.creatorId !== undefined ? updatedFields.creatorId : item.creatorId,
          isSeries: updatedFields.isSeries !== undefined ? updatedFields.isSeries : item.isSeries,
          allowUpload: updatedFields.allowUpload !== undefined ? updatedFields.allowUpload : item.allowUpload,
          isPrivate: updatedFields.isPrivate !== undefined ? updatedFields.isPrivate : item.isPrivate,
          description: updatedFields.description !== undefined ? updatedFields.description : item.description,
          newName: updatedFields.folderPath !== undefined ? updatedFields.folderPath : undefined
        }
      ]
    };

    try {
      await db.request<void>('action=groups_save', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      showToast('Grupo actualizado con éxito', 'success');
      loadData();
      loadLogs();
    } catch (e: any) {
      showToast(e.message || 'Error al actualizar grupo', 'error');
    }
  };

  // Bulk save action
  const handleBulkSave = async () => {
    if (selectedFolders.length === 0) return;

    const selectedGroups = groups.filter(g => selectedFolders.includes(g.folderPath));
    const payload = {
      groups: selectedGroups.map(g => ({
        folderPath: g.folderPath,
        creatorId: bulkCreatorId !== '' ? bulkCreatorId : g.creatorId,
        isSeries: bulkIsSeries !== null ? bulkIsSeries : g.isSeries,
        allowUpload: bulkAllowUpload !== null ? bulkAllowUpload : g.allowUpload,
        isPrivate: bulkIsPrivate !== null ? bulkIsPrivate : g.isPrivate,
        description: g.description
      }))
    };

    try {
      await db.request<void>('action=groups_save', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      showToast(`Se actualizaron ${selectedFolders.length} grupos correctamente`, 'success');
      setSelectedFolders([]);
      // Reset bulk selection controls
      setBulkCreatorId('');
      setBulkIsSeries(null);
      setBulkAllowUpload(null);
      setBulkIsPrivate(null);
      loadData();
      loadLogs();
    } catch (e: any) {
      showToast(e.message || 'Error al guardar cambios masivos', 'error');
    }
  };

  // Upload Cover Action
  const handleUploadCover = async (folderPath: string, file: File) => {
    const formData = new FormData();
    formData.append('folderPath', folderPath);
    formData.append('cover', file);

    showToast('Subiendo portada...', 'info');
    try {
      const data = await db.request<{ coverUrl: string }>('action=groups_upload_cover', {
        method: 'POST',
        body: formData
      });
      if (data) {
        showToast('Portada actualizada', 'success');
        loadData();
        loadLogs();
      }
    } catch (e: any) {
      showToast(e.message || 'Fallo al subir portada', 'error');
    }
  };

  // Renaming handling
  const handleStartRename = (item: GroupItem) => {
    setEditingFolder(item.folderPath);
    setEditNameValue(item.folderPath);
  };

  const handleFinishRename = async (item: GroupItem) => {
    if (editNameValue.trim() === '' || editNameValue === item.folderPath) {
      setEditingFolder(null);
      return;
    }
    // Validation for emojis and special characters: Emojis and standard folders work cleanly in utf8mb4.
    // Ensure it has valid length and doesn't contain physical path traversal symbols
    if (editNameValue.includes('/') || editNameValue.includes('\\') || editNameValue.includes('..')) {
      showToast('El nombre no puede contener símbolos de directorio', 'error');
      return;
    }

    setEditingFolder(null);
    await handleSingleSave(item, { folderPath: editNameValue.trim() });
  };

  // Selection helpers
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const visibleFolders = filteredGroups.map(g => g.folderPath);
      setSelectedFolders(visibleFolders);
    } else {
      setSelectedFolders([]);
    }
  };

  const handleSelectOne = (folderPath: string, checked: boolean) => {
    if (checked) {
      setSelectedFolders(prev => [...prev, folderPath]);
    } else {
      setSelectedFolders(prev => prev.filter(f => f !== folderPath));
    }
  };

  // Filters calculation
  const filteredGroups = groups.filter(g => {
    const matchesSearch = g.folderPath.toLowerCase().includes(search.toLowerCase()) || 
                          (g.description && g.description.toLowerCase().includes(search.toLowerCase()));
    
    const matchesType = filterType === 'ALL' || 
                        (filterType === 'NORMAL' && g.isSeries === 0) || 
                        (filterType === 'SERIES' && g.isSeries === 1);

    const matchesSource = filterSource === 'ALL' || 
                          (filterSource === 'AUTO' && g.autoDetected === 1) || 
                          (filterSource === 'MANUAL' && g.autoDetected === 0);

    const matchesDeletion = filterDeletion === 'ALL' || 
                            (filterDeletion === 'SCHEDULED' && g.scheduled_deletion_time !== null);

    return matchesSearch && matchesType && matchesSource && matchesDeletion;
  });

  // Stats calculation
  const totalGroups = groups.length;
  const totalSeries = groups.filter(g => g.isSeries === 1).length;
  const totalNormal = groups.filter(g => g.isSeries === 0).length;
  const totalAuto = groups.filter(g => g.autoDetected === 1).length;
  const totalScheduled = groups.filter(g => g.scheduled_deletion_time !== null).length;

  return (
    <div className="space-y-6">
      
      {/* Visual Identity Title Block */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900 border border-white/10 p-6 rounded-2xl shadow-xl">
        <div>
          <h2 className="text-2xl font-black text-white flex items-center gap-2 tracking-tight">
            <Folder className="text-indigo-500 animate-pulse" size={28} />
            SISTEMA DE GRUPOS AVANZADO
          </h2>
          <p className="text-slate-400 text-xs mt-1">
            Gestión inteligente, detección automática en disco, publicaciones combinadas y limpieza de grupos normales o series.
          </p>
        </div>
        
        {/* Actions Button Panel */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button 
            onClick={handleScanDisk}
            disabled={scanning || loading}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold text-xs rounded-xl transition-all cursor-pointer shadow-md"
          >
            <RefreshCw size={14} className={scanning ? 'animate-spin' : ''} />
            Escanear Disco
          </button>

          <button 
            onClick={handleCombinedPublishing}
            disabled={combining || loading}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-xs rounded-xl transition-all cursor-pointer shadow-md"
          >
            <Layers size={14} className={combining ? 'animate-pulse' : ''} />
            Combinación Auto
          </button>

          <button 
            onClick={handleCleanupPreview}
            disabled={cleaning || loading}
            className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-bold text-xs rounded-xl transition-all cursor-pointer shadow-md"
          >
            <Trash2 size={14} className={cleaning ? 'animate-spin' : ''} />
            Limpieza Inteligente
          </button>

          <button 
            onClick={() => setShowConfig(true)}
            className="flex items-center gap-1.5 p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition-all border border-white/5 cursor-pointer"
            title="Configurar limpieza"
          >
            <Settings size={16} />
          </button>

          <button 
            onClick={() => { setShowLogs(true); loadLogs(); }}
            className="flex items-center gap-1.5 p-2 bg-slate-800 hover:bg-slate-700 text-rose-400 rounded-xl transition-all border border-rose-500/20 cursor-pointer"
            title="Registro de Errores"
          >
            <AlertTriangle size={16} />
          </button>
        </div>
      </div>

      {/* Bento Grid Analytics Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="bg-slate-900/60 border border-white/5 p-4 rounded-xl flex flex-col justify-between">
          <span className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Total Grupos</span>
          <span className="text-2xl font-black text-white mt-1">{totalGroups}</span>
        </div>
        <div className="bg-slate-900/60 border border-white/5 p-4 rounded-xl flex flex-col justify-between">
          <span className="text-[10px] uppercase tracking-wider text-indigo-400 font-bold">Grupos Series</span>
          <span className="text-2xl font-black text-indigo-400 mt-1">{totalSeries}</span>
        </div>
        <div className="bg-slate-900/60 border border-white/5 p-4 rounded-xl flex flex-col justify-between">
          <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Grupos Normales</span>
          <span className="text-2xl font-black text-slate-300 mt-1">{totalNormal}</span>
        </div>
        <div className="bg-slate-900/60 border border-white/5 p-4 rounded-xl flex flex-col justify-between">
          <span className="text-[10px] uppercase tracking-wider text-emerald-400 font-bold">Auto-Detectados</span>
          <span className="text-2xl font-black text-emerald-400 mt-1">{totalAuto}</span>
        </div>
        <div className="bg-slate-900/60 border border-white/5 p-4 rounded-xl flex flex-col justify-between col-span-2 lg:col-span-1">
          <span className="text-[10px] uppercase tracking-wider text-amber-500 font-bold">En Alerta Delet</span>
          <span className="text-2xl font-black text-amber-500 mt-1">{totalScheduled}</span>
        </div>
      </div>

      {/* Bulk Editor Panel (Visible only when checkboxes selected) */}
      {selectedFolders.length > 0 && (
        <div className="bg-slate-950 border border-indigo-500/30 p-4 rounded-xl shadow-lg animate-in slide-in-from-top duration-200">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <CheckSquare className="text-indigo-400" size={18} />
              <span className="text-white text-xs font-black">
                {selectedFolders.length} grupos seleccionados para Edición Masiva
              </span>
            </div>
            <button 
              onClick={() => setSelectedFolders([])}
              className="text-slate-400 hover:text-white text-xs"
            >
              Cancelar Selección
            </button>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mt-4">
            {/* Admin Selector */}
            <div className="space-y-1">
              <label className="text-[10px] text-slate-400 uppercase font-black">Administrador Masivo</label>
              <select 
                value={bulkCreatorId} 
                onChange={e => setBulkCreatorId(e.target.value)}
                className="w-full bg-slate-900 text-white text-xs p-2 rounded-lg border border-white/10"
              >
                <option value="">(Sin cambios)</option>
                {users.map(u => (
                  <option key={u.id} value={u.id}>{u.username}</option>
                ))}
              </select>
            </div>

            {/* Type Selector */}
            <div className="space-y-1">
              <label className="text-[10px] text-slate-400 uppercase font-black">Tipo de Grupo</label>
              <select 
                value={bulkIsSeries === null ? '' : bulkIsSeries.toString()} 
                onChange={e => setBulkIsSeries(e.target.value === '' ? null : parseInt(e.target.value))}
                className="w-full bg-slate-900 text-white text-xs p-2 rounded-lg border border-white/10"
              >
                <option value="">(Sin cambios)</option>
                <option value="0">Normal</option>
                <option value="1">Serie</option>
              </select>
            </div>

            {/* Upload Selector */}
            <div className="space-y-1">
              <label className="text-[10px] text-slate-400 uppercase font-black">Permitir Subidas</label>
              <select 
                value={bulkAllowUpload === null ? '' : bulkAllowUpload.toString()} 
                onChange={e => setBulkAllowUpload(e.target.value === '' ? null : parseInt(e.target.value))}
                className="w-full bg-slate-900 text-white text-xs p-2 rounded-lg border border-white/10"
              >
                <option value="">(Sin cambios)</option>
                <option value="1">Sí (Habilitado)</option>
                <option value="0">No (Bloqueado)</option>
              </select>
            </div>

            {/* Save Button */}
            <div className="flex items-end">
              <button 
                onClick={handleBulkSave}
                className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-lg transition-all"
              >
                Aplicar Cambios Masivos
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main List & Table Box */}
      <div className="bg-slate-900/80 border border-white/10 rounded-2xl shadow-xl overflow-hidden">
        {/* Search, Filter & Sorters Header */}
        <div className="p-4 bg-slate-900 border-b border-white/10 flex flex-col md:flex-row items-center justify-between gap-3">
          {/* Search Box */}
          <div className="relative w-full md:max-w-xs">
            <Search className="absolute left-3 top-2.5 text-slate-500" size={14} />
            <input 
              type="text" 
              placeholder="Buscar grupo por nombre..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-slate-950 text-white text-xs pl-9 pr-4 py-2 rounded-xl outline-none border border-white/10 focus:border-indigo-500 transition-all font-bold"
            />
          </div>

          {/* Filters Selectors */}
          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
            <select 
              value={filterType} 
              onChange={e => setFilterType(e.target.value as any)}
              className="bg-slate-950 text-slate-300 text-xs p-2 rounded-xl border border-white/10 font-bold"
            >
              <option value="ALL">Todos los Tipos</option>
              <option value="NORMAL">Solo Normales</option>
              <option value="SERIES">Solo Series</option>
            </select>

            <select 
              value={filterSource} 
              onChange={e => setFilterSource(e.target.value as any)}
              className="bg-slate-950 text-slate-300 text-xs p-2 rounded-xl border border-white/10 font-bold"
            >
              <option value="ALL">Cualquier Origen</option>
              <option value="AUTO">Auto Detectados</option>
              <option value="MANUAL">Creados Manual</option>
            </select>

            <select 
              value={filterDeletion} 
              onChange={e => setFilterDeletion(e.target.value as any)}
              className="bg-slate-950 text-slate-300 text-xs p-2 rounded-xl border border-white/10 font-bold"
            >
              <option value="ALL">Cualquier Estado</option>
              <option value="SCHEDULED">En Alerta Delet</option>
            </select>
          </div>
        </div>

        {/* Loading Spinner */}
        {loading ? (
          <div className="p-16 flex flex-col items-center justify-center gap-3">
            <RefreshCw className="animate-spin text-indigo-500" size={32} />
            <span className="text-xs text-slate-400 font-bold">Obteniendo información del disco y base de datos...</span>
          </div>
        ) : filteredGroups.length === 0 ? (
          <div className="p-16 flex flex-col items-center justify-center text-center gap-2">
            <Folder className="text-slate-600" size={48} />
            <h3 className="text-white text-sm font-bold">No se encontraron grupos</h3>
            <p className="text-slate-500 text-xs max-w-sm">
              Prueba cambiando los filtros o presiona "Escanear Disco" para buscar carpetas nuevas con contenido.
            </p>
          </div>
        ) : (
          /* Table Layout */
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-950/40 text-[10px] text-slate-400 uppercase tracking-wider border-b border-white/5 font-black">
                  <th className="p-4 w-12 text-center">
                    <input 
                      type="checkbox" 
                      onChange={e => handleSelectAll(e.target.checked)}
                      checked={selectedFolders.length === filteredGroups.length && filteredGroups.length > 0}
                      className="rounded"
                    />
                  </th>
                  <th className="p-4 w-16">Portada</th>
                  <th className="p-4">Ruta / Nombre del Grupo</th>
                  <th className="p-4">Administrador</th>
                  <th className="p-4">Tipo</th>
                  <th className="p-4">Contenido Físico</th>
                  <th className="p-4">Contenido DB</th>
                  <th className="p-4 text-center">Subidas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredGroups.map(g => {
                  const isEditing = editingFolder === g.folderPath;
                  const isSelected = selectedFolders.includes(g.folderPath);
                  
                  return (
                    <tr 
                      key={g.folderPath} 
                      className={`hover:bg-white/5 transition-all ${isSelected ? 'bg-indigo-600/10 border-l-2 border-indigo-500' : ''}`}
                    >
                      {/* Checkbox */}
                      <td className="p-4 text-center">
                        <input 
                          type="checkbox"
                          checked={isSelected}
                          onChange={e => handleSelectOne(g.folderPath, e.target.checked)}
                          className="rounded"
                        />
                      </td>

                      {/* Cover Thumbnail */}
                      <td className="p-4">
                        <div className="relative group/cover w-11 h-11 bg-slate-950 rounded-lg overflow-hidden border border-white/10 flex items-center justify-center">
                          {g.coverUrl ? (
                            <img 
                              src={g.coverUrl} 
                              alt="Portada" 
                              className="w-full h-full object-cover"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <Folder className="text-slate-500" size={18} />
                          )}
                          <label className="absolute inset-0 bg-black/60 opacity-0 group-hover/cover:opacity-100 flex items-center justify-center cursor-pointer transition-all">
                            <Upload className="text-white" size={14} />
                            <input 
                              type="file" 
                              accept="image/*" 
                              onChange={e => {
                                if (e.target.files && e.target.files[0]) {
                                  handleUploadCover(g.folderPath, e.target.files[0]);
                                }
                              }}
                              className="hidden" 
                            />
                          </label>
                        </div>
                      </td>

                      {/* Group Name & Warning Alerts */}
                      <td className="p-4">
                        <div className="space-y-1">
                          {isEditing ? (
                            <div className="flex items-center gap-1.5">
                              <input 
                                type="text"
                                value={editNameValue}
                                onChange={e => setEditNameValue(e.target.value)}
                                className="bg-slate-950 text-white text-xs p-1 rounded border border-indigo-500 outline-none font-bold"
                              />
                              <button 
                                onClick={() => handleFinishRename(g)}
                                className="p-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded"
                              >
                                <Check size={12} />
                              </button>
                              <button 
                                onClick={() => setEditingFolder(null)}
                                className="p-1 bg-red-600 hover:bg-red-500 text-white rounded"
                              >
                                <X size={12} />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <span 
                                className="text-white text-xs font-black cursor-pointer hover:text-indigo-400 transition-colors"
                                onDoubleClick={() => handleStartRename(g)}
                                title="Doble clic para renombrar"
                              >
                                {g.folderPath}
                              </span>
                              
                              {/* Warning Deletion badge */}
                              {g.scheduled_deletion_time && (
                                <span className="bg-red-950/80 border border-red-500 text-red-400 font-bold text-[9px] px-1.5 py-0.5 rounded flex items-center gap-1 animate-pulse">
                                  <AlertTriangle size={10} />
                                  Alerta 24h
                                </span>
                              )}

                              {/* AutoDetected badge */}
                              {g.autoDetected === 1 && (
                                <span className="bg-emerald-950/60 border border-emerald-500/20 text-emerald-400 font-bold text-[9px] px-1.5 py-0.5 rounded">
                                  Auto
                                </span>
                              )}
                            </div>
                          )}

                          <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-500">
                            {g.description ? (
                              <span>{g.description}</span>
                            ) : (
                              <span className="italic">Sin descripción</span>
                            )}
                            <span>•</span>
                            <span>Creado: {new Date(g.createdAt * 1000).toLocaleDateString()}</span>
                          </div>
                        </div>
                      </td>

                      {/* Administrator Selector */}
                      <td className="p-4">
                        <select 
                          value={g.creatorId} 
                          onChange={e => handleSingleSave(g, { creatorId: e.target.value })}
                          className="bg-slate-950 text-slate-300 text-xs p-1 rounded-lg border border-white/5 font-bold outline-none"
                        >
                          {users.map(u => (
                            <option key={u.id} value={u.id}>{u.username}</option>
                          ))}
                        </select>
                      </td>

                      {/* Group Type Selector badge */}
                      <td className="p-4">
                        <button 
                          onClick={() => handleSingleSave(g, { isSeries: g.isSeries === 1 ? 0 : 1 })}
                          className={`font-black text-[10px] px-2.5 py-1 rounded-lg border cursor-pointer transition-all ${g.isSeries === 1 ? 'bg-indigo-950/60 border-indigo-500 text-indigo-400' : 'bg-slate-950 border-white/5 text-slate-400 hover:text-white'}`}
                        >
                          {g.isSeries === 1 ? 'SERIE' : 'NORMAL'}
                        </button>
                      </td>

                      {/* Physical content stats */}
                      <td className="p-4 text-xs font-mono text-slate-400">
                        {g.physical ? (
                          <div className="space-y-0.5">
                            <div>Files: {g.physical.fileCount}</div>
                            <div className="text-[10px] text-slate-500">
                              v: {g.physical.videoCount} | a: {g.physical.audioCount} | img: {g.physical.imageCount}
                            </div>
                          </div>
                        ) : (
                          <span className="text-red-500 italic">No en disco</span>
                        )}
                      </td>

                      {/* DB Content stats */}
                      <td className="p-4">
                        <div className="flex items-center gap-1.5">
                          <span className="text-white font-bold text-xs font-mono">{g.dbVideoCount}</span>
                          <span className="text-[10px] text-slate-500">pubs</span>
                        </div>
                      </td>

                      {/* Uploads Allowed Toggle */}
                      <td className="p-4 text-center">
                        <button 
                          onClick={() => handleSingleSave(g, { allowUpload: g.allowUpload === 1 ? 0 : 1 })}
                          className="text-slate-400 hover:text-white cursor-pointer transition-all"
                        >
                          {g.allowUpload === 1 ? (
                            <ToggleRight className="text-emerald-500" size={24} />
                          ) : (
                            <ToggleLeft className="text-slate-600" size={24} />
                          )}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* CONFIG MODAL PANEL */}
      {showConfig && (
        <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-white/10 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150">
            <div className="p-5 border-b border-white/10 flex items-center justify-between">
              <h3 className="text-white text-sm font-black flex items-center gap-1.5">
                <Settings className="text-indigo-500" size={18} />
                CONFIGURAR LIMPIEZA INTELIGENTE
              </h3>
              <button onClick={() => setShowConfig(false)} className="text-slate-400 hover:text-white cursor-pointer">
                <X size={18} />
              </button>
            </div>
            
            <div className="p-5 space-y-4">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs text-white font-bold">Grupos Normales (Inactivos)</label>
                  <span className="text-xs font-mono font-black text-indigo-400">{normalDays} días</span>
                </div>
                <p className="text-[10px] text-slate-500 leading-normal">
                  Tiempo máximo sin interacción (likes, comentarios, vistas) antes de enviar advertencia de 24h para borrar contenido.
                </p>
                <input 
                  type="range" 
                  min="5" 
                  max="120" 
                  value={normalDays} 
                  onChange={e => setNormalDays(parseInt(e.target.value))}
                  className="w-full h-1 bg-slate-950 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs text-white font-bold">Grupos Series (Inactivos)</label>
                  <span className="text-xs font-mono font-black text-indigo-400">{seriesDays} días</span>
                </div>
                <p className="text-[10px] text-slate-500 leading-normal">
                  Inactividad total en series (sin subidas, vistas, comentarios) antes de advertir sobre el borrado completo del grupo.
                </p>
                <input 
                  type="range" 
                  min="10" 
                  max="180" 
                  value={seriesDays} 
                  onChange={e => setSeriesDays(parseInt(e.target.value))}
                  className="w-full h-1 bg-slate-950 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                />
              </div>

              <div className="bg-slate-950/60 p-3 rounded-lg flex items-start gap-2 border border-white/5">
                <Info size={14} className="text-amber-500 mt-0.5 shrink-0" />
                <p className="text-[9px] text-slate-400 leading-normal">
                  <strong>Protección de Portada:</strong> El sistema nunca elimina la imagen de portada durante el borrado de publicaciones normales, resguardando la identidad estética del grupo.
                </p>
              </div>
            </div>

            <div className="p-5 border-t border-white/10 flex justify-end gap-2.5 bg-slate-950/40">
              <button 
                onClick={() => setShowConfig(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs rounded-xl transition-all cursor-pointer"
              >
                Cancelar
              </button>
              <button 
                onClick={handleSaveCleanupConfig}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl transition-all cursor-pointer shadow-md"
              >
                Guardar Configuración
              </button>
            </div>
          </div>
        </div>
      )}

      {/* LOGS MODAL PANEL (ERROR LOGS SYSTEM) */}
      {showLogs && (
        <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-white/10 w-full max-w-3xl rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150 flex flex-col max-h-[85vh]">
            <div className="p-5 border-b border-white/10 flex items-center justify-between bg-slate-950/40">
              <div className="flex items-center gap-2">
                <AlertTriangle className="text-rose-500 animate-pulse" size={20} />
                <div>
                  <h3 className="text-white text-sm font-black uppercase tracking-wider">
                    Registro de Errores de la App (Real-Time)
                  </h3>
                  <p className="text-[10px] text-slate-500 font-bold uppercase mt-0.5">Captura de excepciones PHP, JS, SQL y advertencias críticas</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {logs.length > 0 && (
                  <button 
                    onClick={handleClearErrors}
                    className="flex items-center gap-1 px-2.5 py-1.5 bg-rose-950/40 hover:bg-rose-900/60 text-rose-400 border border-rose-500/20 text-[10px] font-black uppercase rounded-lg transition-all cursor-pointer"
                  >
                    <Trash2 size={12} />
                    Limpiar Todo
                  </button>
                )}
                <button onClick={() => setShowLogs(false)} className="text-slate-400 hover:text-white cursor-pointer p-1">
                  <X size={18} />
                </button>
              </div>
            </div>
            
            <div className="p-5 overflow-y-auto space-y-3 flex-1 bg-slate-900/50">
              {logs.length === 0 ? (
                <div className="p-16 text-center flex flex-col items-center justify-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                    <Check size={24} />
                  </div>
                  <div className="text-slate-300 font-black uppercase tracking-wider text-xs">¡Sistema Estable y Limpio!</div>
                  <div className="text-slate-500 text-[10px] font-bold max-w-xs leading-relaxed">
                    No se han registrado errores o advertencias en la base de datos. La aplicación está operando correctamente.
                  </div>
                </div>
              ) : (
                logs.map(l => {
                  const isExpanded = !!expandedErrors[l.id];
                  const isFatal = l.source.includes('FATAL') || l.source.includes('CRITICAL');
                  const badgeColor = isFatal 
                    ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' 
                    : l.source.includes('JS') 
                      ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' 
                      : 'bg-amber-500/10 text-amber-400 border-amber-500/20';

                  return (
                    <div key={l.id} className="bg-slate-950 rounded-xl border border-white/5 overflow-hidden transition-all duration-150 hover:border-white/10">
                      <div className="p-4 flex flex-col gap-2">
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 pb-2">
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-0.5 border rounded text-[9px] font-mono font-black tracking-wider uppercase ${badgeColor}`}>
                              {l.source}
                            </span>
                            {l.line && (
                              <span className="text-[10px] text-slate-500 font-mono font-semibold">
                                Línea {l.line}
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-slate-500 font-mono font-semibold">
                            {new Date(l.timestamp * 1000).toLocaleString()}
                          </span>
                        </div>

                        {l.file && (
                          <div className="text-[10px] text-indigo-400 font-mono font-bold bg-slate-900/80 px-2 py-1 rounded border border-white/5 break-all">
                            Archivo: {l.file}
                          </div>
                        )}

                        <p className="text-slate-100 text-xs font-bold leading-relaxed whitespace-pre-wrap selection:bg-rose-500/30">
                          {l.message}
                        </p>

                        {l.trace && (
                          <div className="mt-2 pt-2 border-t border-white/5">
                            <button
                              onClick={() => setExpandedErrors(prev => ({ ...prev, [l.id]: !prev[l.id] }))}
                              className="text-[10px] font-black uppercase text-indigo-400 hover:text-indigo-300 flex items-center gap-1 cursor-pointer transition-all"
                            >
                              {isExpanded ? 'Ocultar Traza Técnica ▴' : 'Mostrar Traza Técnica / Stack Trace ▾'}
                            </button>
                            
                            {isExpanded && (
                              <div className="mt-2 bg-slate-900 p-3 rounded-lg border border-white/5 overflow-x-auto max-w-full font-mono text-[9px] text-slate-400 leading-normal whitespace-pre">
                                {l.trace}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="p-5 border-t border-white/10 flex justify-between items-center bg-slate-950/60">
              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                Total Registrado: {logs.length} error(es)
              </span>
              <button 
                onClick={() => setShowLogs(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-white/5 text-white font-black uppercase tracking-wider text-[10px] rounded-xl transition-all cursor-pointer shadow-md"
              >
                Cerrar Panel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CLEANUP PREVIEW MODAL PANEL */}
      {showCleanupPreview && cleanupPreview && (
        <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-white/10 w-full max-w-3xl rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150">
            <div className="p-5 border-b border-white/10 flex items-center justify-between">
              <h3 className="text-white text-sm font-black flex items-center gap-1.5">
                <AlertTriangle className="text-amber-500" size={18} />
                VISTA PREVIA DE LIMPIEZA INTELIGENTE
              </h3>
              <button onClick={() => setShowCleanupPreview(false)} className="text-slate-400 hover:text-white cursor-pointer">
                <X size={18} />
              </button>
            </div>
            
            <div className="p-6 max-h-[450px] overflow-y-auto space-y-6">
              {/* Section 1: Inactive normal videos */}
              <div className="space-y-2.5">
                <h4 className="text-xs font-black text-indigo-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Eye size={12} />
                  Publicaciones Normales Sin Interacción ({cleanupPreview.inactiveVideos.length})
                </h4>
                <p className="text-[10px] text-slate-500 leading-normal">
                  Videos sin interacción por más de {cleanupPreview.config.normalDays} días. Si es la primera vez, se les advertirá 24h antes por notificación. Si ya están advertidos y pasaron las 24h, serán eliminados físicamente del disco y BD.
                </p>
                
                {cleanupPreview.inactiveVideos.length === 0 ? (
                  <div className="bg-slate-950/40 p-4 rounded-lg text-center text-slate-500 text-xs italic border border-white/5">
                    No hay publicaciones inactivas que requieran limpieza.
                  </div>
                ) : (
                  <div className="bg-slate-950 rounded-lg overflow-hidden border border-white/5 divide-y divide-white/5 max-h-[160px] overflow-y-auto">
                    {cleanupPreview.inactiveVideos.map(v => (
                      <div key={v.id} className="p-2.5 flex items-center justify-between gap-3 text-xs">
                        <div>
                          <p className="text-white font-bold">{v.title}</p>
                          <p className="text-[10px] text-slate-500 font-mono">Grupo: {v.category} | De: {v.creatorName || 'admin'}</p>
                        </div>
                        <div>
                          {v.scheduled_deletion_time ? (
                            <span className="text-red-400 bg-red-950/60 border border-red-500/20 px-2 py-0.5 rounded text-[9px] font-bold">
                              Borrado inminente
                            </span>
                          ) : (
                            <span className="text-amber-400 bg-amber-950/60 border border-amber-500/20 px-2 py-0.5 rounded text-[9px] font-bold">
                              Se enviará advertencia 24h
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Section 2: Inactive series groups */}
              <div className="space-y-2.5">
                <h4 className="text-xs font-black text-indigo-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Folder size={12} />
                  Grupos Series Sin Actividad ({cleanupPreview.inactiveSeries.length})
                </h4>
                <p className="text-[10px] text-slate-500 leading-normal">
                  Series sin subidas ni interacciones por más de {cleanupPreview.config.seriesDays} días. Se les advertirá al administrador o se eliminará el grupo por completo si expira la alerta (borrando carpeta física y portada).
                </p>

                {cleanupPreview.inactiveSeries.length === 0 ? (
                  <div className="bg-slate-950/40 p-4 rounded-lg text-center text-slate-500 text-xs italic border border-white/5">
                    No hay grupos series inactivos que requieran limpieza.
                  </div>
                ) : (
                  <div className="bg-slate-950 rounded-lg overflow-hidden border border-white/5 divide-y divide-white/5 max-h-[160px] overflow-y-auto">
                    {cleanupPreview.inactiveSeries.map(s => (
                      <div key={s.folderPath} className="p-2.5 flex items-center justify-between gap-3 text-xs">
                        <div>
                          <p className="text-white font-bold">{s.folderPath}</p>
                          <p className="text-[10px] text-slate-500 font-mono">Admin: {s.creatorName} | Videos: {s.videoCount}</p>
                        </div>
                        <div>
                          {s.scheduled_deletion_time ? (
                            <span className="text-red-400 bg-red-950/60 border border-red-500/20 px-2 py-0.5 rounded text-[9px] font-bold">
                              Borrado total inminente
                            </span>
                          ) : (
                            <span className="text-amber-400 bg-amber-950/60 border border-amber-500/20 px-2 py-0.5 rounded text-[9px] font-bold">
                              Advertir 24h al admin
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-slate-950 p-4 rounded-xl flex items-start gap-3 border border-indigo-500/20">
                <HelpCircle size={18} className="text-indigo-400 shrink-0 mt-0.5" />
                <div className="text-xs text-slate-400 leading-relaxed">
                  <strong>¿Cómo funciona la cancelación automática?</strong> Si cualquiera de estos videos o series recibe una nueva interacción (visitas, likes o comentarios) antes de las 24 horas, la alerta se cancelará automáticamente y serán resguardados del borrado físico.
                </div>
              </div>
            </div>

            <div className="p-5 border-t border-white/10 flex justify-between bg-slate-950/40">
              <span className="text-slate-500 text-[10px] flex items-center font-bold">
                * Las acciones se guardarán en logs e historial
              </span>
              <div className="flex gap-2.5">
                <button 
                  onClick={() => setShowCleanupPreview(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs rounded-xl transition-all cursor-pointer"
                >
                  Cancelar
                </button>
                <button 
                  onClick={handleCleanupRun}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs rounded-xl transition-all cursor-pointer shadow-md"
                >
                  Confirmar y Ejecutar Limpieza
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
