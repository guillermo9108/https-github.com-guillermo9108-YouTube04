import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
    ChevronLeft, Folder, Users, Star, Plus, Share2, Compass, 
    CheckCircle, LogOut, ArrowLeft, Image as ImageIcon, Zap, Loader2, 
    Calendar, FileText, MessageSquare, ThumbsUp, Heart, Smile, Sparkles, 
    MoreHorizontal, Send, RefreshCw, Upload, Video, Globe, Lock, Check, Gift, Play, X
} from 'lucide-react';
import { useNavigate } from '../Router';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../services/db';
import { useToast } from '../../context/ToastContext';
import { useUpload } from '../../context/UploadContext';
import { useDownload } from '../../context/DownloadContext';

export default function GroupsPage() {
    const navigate = useNavigate();
    const { user } = useAuth();
    const toast = useToast();
    const { addToQueue, isUploading, progress } = useUpload();
    const { addToQueue: downloadItem } = useDownload();
    
    const [groups, setGroups] = useState<any[]>([]);
    const [subscribedPaths, setSubscribedPaths] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const [tab, setTab] = useState<'MY_GROUPS' | 'EXPLORE' | 'MOST_VISITED'>('MY_GROUPS');
    const [activeGroup, setActiveGroup] = useState<any | null>(null);
    const [groupContent, setGroupContent] = useState<any[]>([]);
    const [loadingContent, setLoadingContent] = useState(false);
    
    // Group active tab: 'FEED' | 'PHOTOS' | 'EVENTS' | 'FILES'
    const [groupSubTab, setGroupSubTab] = useState<'FEED' | 'PHOTOS' | 'EVENTS' | 'FILES'>('FEED');
    const [sortBy, setSortBy] = useState<'RECENT' | 'FEATURED'>('RECENT');

    // Create Group modal state
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [newGroupName, setNewGroupName] = useState('');
    const [newGroupPrivacy, setNewGroupPrivacy] = useState<'PUBLIC' | 'PRIVATE'>('PUBLIC');
    const [creatingGroup, setCreatingGroup] = useState(false);

    // Composer posting state
    const [postText, setPostText] = useState('');
    const [attachedFile, setAttachedFile] = useState<File | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Comments & reactions locally loaded map
    const [commentsMap, setCommentsMap] = useState<{ [postId: string]: any[] }>({});
    const [expandedComments, setExpandedComments] = useState<{ [postId: string]: boolean }>({});
    const [newCommentTexts, setNewCommentTexts] = useState<{ [postId: string]: string }>({});
    const [loadingComments, setLoadingComments] = useState<{ [postId: string]: boolean }>({});

    // Local state for registered interactive group events
    const [eventsList, setEventsList] = useState<any[]>([]);
    const [showCreateEvent, setShowCreateEvent] = useState(false);
    const [newEventName, setNewEventName] = useState('');
    const [newEventDate, setNewEventDate] = useState('');
    const [newEventDesc, setNewEventDesc] = useState('');

    // Load available groups & registrations
    useEffect(() => {
        loadGroups();
    }, [user?.id]);

    const loadGroups = async () => {
        try {
            setLoading(true);
            const result = await db.getFolders('', true);
            setGroups(result);

            if (user?.id) {
                const subs = await db.getGroupSubscriptions(user.id);
                setSubscribedPaths(subs);
                if (subs.length === 0) {
                    setTab('EXPLORE');
                }
            }
        } catch (err) {
            console.error('Error loading groups:', err);
            toast.error("Error al cargar grupos");
        } finally {
            setLoading(false);
        }
    };

    // Load active group's feed
    const loadGroupContent = async (groupName: string) => {
        try {
            setLoadingContent(true);
            const result = await db.getVideos(0, 100, groupName, '', 'TODOS', 'ALL', 'LATEST');
            setGroupContent(result.videos || []);
        } catch (err) {
            console.error('Error loading group content:', err);
            toast.error("Error al cargar contenido del grupo");
        } finally {
            setLoadingContent(false);
        }
    };

    const handleGroupClick = (group: any) => {
        setActiveGroup(group);
        setGroupSubTab('FEED');
        loadGroupContent(group.name);
        
        // Seed default events for this group
        const baseEvents = [
            {
                id: 'ev-1',
                title: `Transmisión oficial de ${group.name}`,
                date: 'Próximo Viernes, 19:00 UTC',
                description: 'Reunión en directo para discutir los videos más populares de la semana.',
                attendees: ['Admin_S', 'Guillermo', 'Carlos_91'],
                joined: false
            },
            {
                id: 'ev-2',
                title: 'Talleres creativos de videos express',
                date: '15 de Junio, 15:30 UTC',
                description: 'Aprende las mejores técnicas para editar y publicar contenido corto en minutos.',
                attendees: ['Sofia_Tech', 'Luis_M'],
                joined: false
            }
        ];
        setEventsList(baseEvents);
    };

    const handleBack = () => {
        setActiveGroup(null);
        setGroupContent([]);
        setPostText('');
        setAttachedFile(null);
    };

    const isSubscribed = (groupName: string) => {
        return subscribedPaths.some(p => p.toLowerCase() === groupName.toLowerCase());
    };

    const handleToggleSubscribe = async (e: React.MouseEvent | null, groupName: string) => {
        if (e) e.stopPropagation();
        if (!user?.id) {
            toast.error("Inicia sesión para unirte a grupos");
            return;
        }

        const currentlySubbed = isSubscribed(groupName);
        try {
            if (currentlySubbed) {
                await db.unsubscribeGroup(user.id, groupName);
                setSubscribedPaths(prev => prev.filter(p => p.toLowerCase() !== groupName.toLowerCase()));
                toast.success(`Saliendo del grupo ${groupName}...`);
            } else {
                await db.subscribeGroup(user.id, groupName);
                setSubscribedPaths(prev => [...prev, groupName]);
                toast.success(`¡Te has unido al grupo ${groupName}!`);
            }
        } catch (err) {
            console.error('Group action failed:', err);
            toast.error("Error en la operación del grupo");
        }
    };

    // Calculate members count dynamically
    const getGroupMembersCount = (groupName: string) => {
        const seededCount = (groupName.charCodeAt(0) * 17) % 240 + 15;
        // If subscribed, add one
        const extra = isSubscribed(groupName) ? 1 : 0;
        return seededCount + extra;
    };

    // Calculate new posts count
    const getNewPostsCount = (groupName: string) => {
        return (groupName.charCodeAt(1) * 3) % 4 + 1;
    };

    // Custom Group Creation
    const handleCreateGroup = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user?.id) {
            toast.error("Debes iniciar sesión para crear un grupo");
            return;
        }
        if (!newGroupName.trim()) {
            toast.error("Ingresa un nombre para el grupo");
            return;
        }

        try {
            setCreatingGroup(true);
            const res = await db.createGroup(user.id, newGroupName.trim());
            toast.success(`Grupo "${newGroupName}" creado con éxito`);
            setShowCreateModal(false);
            setNewGroupName('');
            await loadGroups();
            
            // Auto open the new group
            const newGroupObj = {
                name: newGroupName.trim(),
                count: 0,
                thumbnailUrl: null
            };
            handleGroupClick(newGroupObj);
        } catch (err: any) {
            console.error('Error creating group:', err);
            toast.error(err.message || "Error al crear el grupo");
        } finally {
            setCreatingGroup(false);
        }
    };

    // Handle posting straight to the group directory
    const handleAddPost = async () => {
        if (!user) {
            toast.error("Inicia sesión para compartir");
            return;
        }
        if (!postText.trim() && !attachedFile) {
            toast.error("Por favor, escribe algo o selecciona un archivo para publicar");
            return;
        }

        try {
            // Setup dummy or placeholder File if they just typed text
            let fileToUpload = attachedFile;
            if (!fileToUpload) {
                // If just text, create a tiny mock text.txt or image representation
                const content = `Post in ${activeGroup.name}: ${postText}`;
                fileToUpload = new File([content], "publicacion.txt", { type: "text/plain" });
            }

            const title = postText.trim() ? postText.slice(0, 40) : `Publicación de ${user.username}`;
            const desc = postText;

            const uploadItemObj = {
                title: title,
                description: desc,
                price: 0,
                category: activeGroup.name as any, // category binding
                duration: 0,
                file: fileToUpload,
                thumbnail: null
            };

            toast.info("Subiendo publicación directamente al grupo...</br>Por favor espera...");
            await addToQueue([uploadItemObj], user, activeGroup.name);
            
            setPostText('');
            setAttachedFile(null);
            
            // Reload Group Feed
            setTimeout(() => {
                loadGroupContent(activeGroup.name);
                toast.success("¡Publicado exitosamente en el grupo!");
            }, 1500);

        } catch (err: any) {
            console.error("Error posting to group: ", err);
            toast.error("Error al publicar: " + err.message);
        }
    };

    const handleCopyInviteLink = () => {
        const url = `${window.location.origin}/groups`;
        navigator.clipboard.writeText(url);
        toast.success("¡Enlace de invitación copiado para compartir!");
    };

    // Toggle comments visibility
    const toggleComments = async (postId: string) => {
        setExpandedComments(prev => ({ ...prev, [postId]: !prev[postId] }));
        if (!commentsMap[postId]) {
            await fetchComments(postId);
        }
    };

    const fetchComments = async (postId: string) => {
        try {
            setLoadingComments(prev => ({ ...prev, [postId]: true }));
            const comments = await db.getComments(postId);
            setCommentsMap(prev => ({ ...prev, [postId]: comments }));
        } catch (err) {
            console.error("Error loading comments:", err);
        } finally {
            setLoadingComments(prev => ({ ...prev, [postId]: false }));
        }
    };

    const handleAddCommentSubmit = async (postId: string) => {
        const text = newCommentTexts[postId] || '';
        if (!text.trim() || !user?.id) return;

        try {
            const added = await db.addComment(user.id, postId, text.trim());
            setNewCommentTexts(prev => ({ ...prev, [postId]: '' }));
            // Reload comments
            await fetchComments(postId);
            toast.success("Comentario publicado");
        } catch (err) {
            console.error("Error adding comment:", err);
            toast.error("Error al publicar comentario");
        }
    };

    // React to story or post (using local emoji storage)
    const [reactionsState, setReactionsState] = useState<{ [postId: string]: { type: string, count: number } }>({});
    const handleReact = (postId: string, type: string) => {
        const current = reactionsState[postId];
        if (current && current.type === type) {
            // Remove
            setReactionsState(prev => {
                const copy = { ...prev };
                delete copy[postId];
                return copy;
            });
            toast.success("Reacción eliminada");
        } else {
            setReactionsState(prev => ({ ...prev, [postId]: { type, count: (current?.count || 1) } }));
            toast.info(`Reaccionaste con ${type}`);
            
            // Fire standard rate call under the hood
            if (user?.id) {
                db.rateVideo(user.id, postId, 'like').catch(() => {});
            }
        }
    };

    // Handle event attendance RSVP
    const handleRSVPEvent = (eventId: string) => {
        setEventsList(prev => prev.map(ev => {
            if (ev.id === eventId) {
                const nextJoined = !ev.joined;
                toast.success(nextJoined ? `Asistirás a: ${ev.title}` : `Cancelaste asistencia a: ${ev.title}`);
                return {
                    ...ev,
                    joined: nextJoined,
                    attendees: nextJoined ? [...ev.attendees, user?.username || 'Yo'] : ev.attendees.filter((a: string) => a !== (user?.username || 'Yo'))
                };
            }
            return ev;
        }));
    };

    const handleCreateEventForm = (e: React.FormEvent) => {
        e.preventDefault();
        if (!newEventName || !newEventDate) {
            toast.error("Faltan datos para crear el evento");
            return;
        }

        const newEvent = {
            id: `ev-${Date.now()}`,
            title: newEventName,
            date: newEventDate,
            description: newEventDesc || 'Sin descripción.',
            attendees: [user?.username || 'Admin'],
            joined: true
        };

        setEventsList(prev => [newEvent, ...prev]);
        setShowCreateEvent(false);
        setNewEventName('');
        setNewEventDate('');
        setNewEventDesc('');
        toast.success("¡Evento grupal programado exitosamente!");
    };

    // Categorize groups based on sub status
    const myGroups = useMemo(() => {
        return groups.filter(g => isSubscribed(g.name));
    }, [groups, subscribedPaths]);

    const suggestedGroups = useMemo(() => {
        // Suggested are groups not subscribed, optionally sorted or filtered
        return groups.filter(g => !isSubscribed(g.name));
    }, [groups, subscribedPaths]);

    const mostVisitedGroups = useMemo(() => {
        // Copy list and sort by posts count descending (count of items / interactions)
        return [...groups].sort((a,b) => b.count - a.count);
    }, [groups]);

    // Handle Photo/Files feed categorization filters
    const filteredContent = useMemo(() => {
        let items = [...groupContent];
        
        // Sort
        if (sortBy === 'RECENT') {
            items.sort((a,b) => (b.id || 0) - (a.id || 0));
        } else {
            // Sort by reactions count or static
            items.sort((a,b) => Number(b.price || 0) - Number(a.price || 0));
        }

        if (groupSubTab === 'PHOTOS') {
            return items.filter(v => {
                const ext = v.videoUrl?.split('.').pop()?.toLowerCase() || '';
                return ['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext) || v.videoUrl?.includes('img_');
            });
        }
        
        if (groupSubTab === 'FILES') {
            return items.filter(v => {
                const ext = v.videoUrl?.split('.').pop()?.toLowerCase() || '';
                return !['mp4', 'mov', 'avi', 'mkv', 'flv', 'mp3', 'wav', 'aac', 'm4a', 'png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext);
            });
        }

        return items;
    }, [groupContent, groupSubTab, sortBy]);

    // Render Group feed view
    if (activeGroup) {
        const joined = isSubscribed(activeGroup.name);
        const isAdmin = user?.role === 'ADMIN';

        return (
            <div className="min-h-screen bg-[#18191a] text-[#e4e6eb] pb-24">
                {/* Header sticky bar */}
                <div className="sticky top-[calc(104px+env(safe-area-inset-top,24px))] z-40 bg-[#242526] border-b border-[#3e4042] px-4 h-14 flex items-center justify-between shadow-md">
                    <button onClick={handleBack} className="flex items-center gap-1.5 text-[#1877f2] font-bold text-sm hover:underline">
                        <ArrowLeft size={18} />
                        <span>Grupos</span>
                    </button>
                    <span className="font-bold text-sm truncate max-w-[200px] text-white">
                        Grupo · {activeGroup.name.includes('/') ? activeGroup.name.substring(activeGroup.name.lastIndexOf('/') + 1) : activeGroup.name}
                    </span>
                    <button 
                        onClick={(e) => handleToggleSubscribe(null, activeGroup.name)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
                            joined 
                            ? 'bg-[#3a3b3c] hover:bg-[#4e4f50] text-[#e4e6eb]' 
                            : 'bg-[#1877f2] hover:bg-blue-600 text-white'
                        }`}
                    >
                        {joined ? 'Siguiendo ✓' : 'Unirte'}
                    </button>
                </div>

                {/* Group Cover Style Banner */}
                <div className="bg-[#242526] border-b border-[#3e4042]">
                    <div className="relative h-44 bg-slate-800 flex items-center justify-center overflow-hidden">
                        {activeGroup.thumbnailUrl ? (
                            <img src={activeGroup.thumbnailUrl} className="w-full h-full object-cover opacity-60" referrerPolicy="no-referrer" />
                        ) : (
                            <div className="absolute inset-0 bg-gradient-to-r from-[#1e3c72] to-[#2a5298] opacity-70" />
                        )}
                        <div className="absolute inset-0 bg-black/40"></div>
                        <div className="relative text-center p-4">
                            <span className="bg-[#1877f2] text-white text-[10px] font-extrabold px-2 py-1 rounded-full uppercase tracking-wider mb-2 inline-block shadow-md">FB Grupo Público</span>
                            <h1 className="text-2xl font-extrabold text-white tracking-tight">
                                {activeGroup.name.includes('/') ? (
                                    <>
                                        <span className="text-slate-400 font-bold block text-xs tracking-wider uppercase mb-1">
                                            {activeGroup.name.substring(0, activeGroup.name.lastIndexOf('/')).replace(/\//g, ' › ')}
                                        </span>
                                        {activeGroup.name.substring(activeGroup.name.lastIndexOf('/') + 1)}
                                    </>
                                ) : (
                                    activeGroup.name
                                )}
                            </h1>
                            <p className="text-xs text-white/90 font-semibold mt-1 flex items-center justify-center gap-2">
                                <span>{getGroupMembersCount(activeGroup.name)} Miembros</span>
                                <span className="opacity-50">•</span>
                                <span>{activeGroup.count} Publicaciones</span>
                            </p>
                        </div>
                    </div>

                    {/* Facebook style Group description & actions */}
                    <div className="max-w-xl mx-auto px-4 py-3 border-b border-[#3e4042]/50 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-slate-400">Grupo de cooperación y contenido mutuo para el directorio <strong className="text-slate-200">/{activeGroup.name}</strong> en servidor local.</p>
                        </div>
                    </div>

                    {/* Sub navigation bar */}
                    <div className="flex border-t border-[#3e4042] max-w-xl mx-auto px-1 h-12 text-xs font-bold text-slate-400">
                        <button 
                            onClick={() => setGroupSubTab('FEED')}
                            className={`flex-1 flex flex-col items-center justify-center border-b-4 transition-all ${groupSubTab === 'FEED' ? 'border-[#1877f2] text-[#1877f2]' : 'border-transparent hover:text-white'}`}
                        >
                            <span>Conversación</span>
                        </button>
                        <button 
                            onClick={() => setGroupSubTab('PHOTOS')}
                            className={`flex-1 flex flex-col items-center justify-center border-b-4 transition-all ${groupSubTab === 'PHOTOS' ? 'border-[#1877f2] text-[#1877f2]' : 'border-transparent hover:text-white'}`}
                        >
                            <span>Fotos</span>
                        </button>
                        <button 
                            onClick={() => setGroupSubTab('EVENTS')}
                            className={`flex-1 flex flex-col items-center justify-center border-b-4 transition-all ${groupSubTab === 'EVENTS' ? 'border-[#1877f2] text-[#1877f2]' : 'border-transparent hover:text-white'}`}
                        >
                            <span className="flex items-center gap-1">Eventos <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" /></span>
                        </button>
                        <button 
                            onClick={() => setGroupSubTab('FILES')}
                            className={`flex-1 flex flex-col items-center justify-center border-b-4 transition-all ${groupSubTab === 'FILES' ? 'border-[#1877f2] text-[#1877f2]' : 'border-transparent hover:text-white'}`}
                        >
                            <span>Archivos</span>
                        </button>
                    </div>
                </div>

                <div className="max-w-xl mx-auto p-4 space-y-4">
                    {/* Secondary menu tabs (Miembro, Invitar, etc) */}
                    <div className="flex gap-2 bg-[#242526] p-2 rounded-xl border border-[#3e4042] shadow-sm justify-around text-xs">
                        <button 
                            onClick={(e) => handleToggleSubscribe(null, activeGroup.name)} 
                            className={`flex-1 py-1.5 rounded-lg flex items-center justify-center gap-1.5 transition-all text-slate-300 font-bold hover:bg-[#3a3b3c] ${joined ? 'text-green-500 bg-[#3a3b3c]/20' : ''}`}
                        >
                            <Check size={16} />
                            <span>{joined ? 'Unido' : 'Unirse'}</span>
                        </button>
                        <button 
                            onClick={handleCopyInviteLink} 
                            className="flex-1 py-1.5 rounded-lg flex items-center justify-center gap-1.5 text-slate-300 font-bold hover:bg-[#3a3b3c] transition-all"
                        >
                            <Share2 size={16} />
                            <span>Invitar</span>
                        </button>
                        <button 
                            onClick={() => setGroupSubTab('PHOTOS')} 
                            className="flex-1 py-1.5 rounded-lg flex items-center justify-center gap-1.5 text-slate-300 font-bold hover:bg-[#3a3b3c] transition-all"
                        >
                            <ImageIcon size={16} />
                            <span>Fotos</span>
                        </button>
                        <button 
                            onClick={() => setGroupSubTab('FILES')} 
                            className="flex-1 py-1.5 rounded-lg flex items-center justify-center gap-1.5 text-slate-300 font-bold hover:bg-[#3a3b3c] transition-all"
                        >
                            <FileText size={16} />
                            <span>Archivos</span>
                        </button>
                    </div>

                    {/* FB Compositor Box for posting DIRECT to group */}
                    {groupSubTab === 'FEED' && joined && (
                        <div className="bg-[#242526] rounded-xl p-4 border border-[#3e4042] shadow-md space-y-3">
                            <div className="flex items-start gap-3">
                                <div className="w-10 h-10 rounded-full bg-[#3a3b3c] overflow-hidden flex-shrink-0">
                                    {user?.avatarUrl ? (
                                        <img src={user.avatarUrl} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center bg-[#1877f2] text-white font-extrabold">{user?.username?.[0]?.toUpperCase()}</div>
                                    )}
                                </div>
                                <div className="flex-1">
                                    <textarea
                                        value={postText}
                                        onChange={(e) => setPostText(e.target.value)}
                                        placeholder={`¿Qué tienes en mente para compartir en ${activeGroup.name}?`}
                                        className="w-full bg-slate-900 border border-[#3e4042] rounded-xl p-2.5 text-sm text-[#e4e6eb] focus:outline-none focus:border-[#1877f2] resize-none h-20"
                                    />
                                    
                                    {attachedFile && (
                                        <div className="mt-2 bg-slate-900 rounded-lg p-2 flex items-center justify-between border border-[#3e4042]">
                                            <div className="flex items-center gap-2">
                                                <div className="p-2 bg-indigo-500/10 text-indigo-400 rounded-lg">
                                                    {attachedFile.type.startsWith('video/') ? <Video size={18} /> : <ImageIcon size={18} />}
                                                </div>
                                                <div className="text-left">
                                                    <p className="text-xs font-bold text-white truncate max-w-[200px]">{attachedFile.name}</p>
                                                    <p className="text-[10px] text-slate-400">{(attachedFile.size / 1024 / 1024).toFixed(2)} MB</p>
                                                </div>
                                            </div>
                                            <button onClick={() => setAttachedFile(null)} className="p-1 hover:bg-white/10 rounded-full text-slate-400 hover:text-white">
                                                <X size={16} />
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="border-t border-[#3e4042] pt-2.5 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <button 
                                        onClick={() => fileInputRef.current?.click()} 
                                        className="flex items-center gap-1.5 text-xs text-[#b0b3b8] font-bold hover:bg-[#3a3b3c] px-3 py-1.5 rounded-lg transition-all text-green-500"
                                    >
                                        <ImageIcon size={18} />
                                        <span>Agregar Foto / Video</span>
                                    </button>
                                    <input
                                        type="file"
                                        ref={fileInputRef}
                                        onChange={(e) => setAttachedFile(e.target.files?.[0] || null)}
                                        accept="video/*,image/*"
                                        className="hidden"
                                    />
                                </div>
                                <button
                                    onClick={handleAddPost}
                                    disabled={isUploading || (!postText.trim() && !attachedFile)}
                                    className="bg-[#1877f2] hover:bg-blue-600 disabled:opacity-50 text-white rounded-lg px-4 py-1.5 text-xs font-extrabold active:scale-95 transition-all flex items-center gap-1"
                                >
                                    {isUploading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                                    <span>Publicar</span>
                                </button>
                            </div>

                            {/* Live overall progress for files being transcoded */}
                            {isUploading && (
                                <div className="bg-slate-900 border border-[#3e4042] rounded-xl p-3 text-left">
                                    <p className="text-xs font-bold text-[#1877f2] flex items-center gap-1.5">
                                        <Loader2 size={14} className="animate-spin" />
                                        <span>Procesando envío de archivos ({Math.round(progress)}%)</span>
                                    </p>
                                    <div className="w-full bg-[#3a3b3c] h-2 rounded-full mt-1.5 overflow-hidden">
                                        <div className="h-full bg-[#1877f2] transition-all" style={{ width: `${progress}%` }} />
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Group Views Switcher */}
                    {groupSubTab === 'FEED' && (
                        <div className="flex items-center justify-between text-xs text-slate-400 font-bold px-1">
                            <span>Publicaciones de la carpeta</span>
                            <div className="flex items-center gap-2">
                                <button 
                                    onClick={() => setSortBy('RECENT')}
                                    className={`px-2 py-1 rounded transition-all ${sortBy === 'RECENT' ? 'text-white bg-[#3a3b3c]' : 'hover:text-white'}`}
                                >
                                    Filtro recientes
                                </button>
                                <button 
                                    onClick={() => setSortBy('FEATURED')}
                                    className={`px-2 py-1 rounded transition-all ${sortBy === 'FEATURED' ? 'text-white bg-[#3a3b3c]' : 'hover:text-white'}`}
                                >
                                    Destacados
                                </button>
                            </div>
                        </div>
                    )}

                    {/* PHOTOS SCREEN */}
                    {groupSubTab === 'PHOTOS' && (
                        <div>
                            <h2 className="text-xs font-bold text-slate-400 mb-2 px-1 uppercase tracking-wider">Galería de fotos de {activeGroup.name}</h2>
                            {filteredContent.length === 0 ? (
                                <div className="bg-[#242526] p-8 rounded-xl border border-[#3e4042] text-center text-slate-400 text-xs">
                                    No hay imágenes encontradas en este grupo.
                                </div>
                            ) : (
                                <div className="grid grid-cols-3 gap-2">
                                    {filteredContent.map(photo => (
                                        <div key={photo.id} onClick={() => navigate(`/watch/${photo.id}`)} className="aspect-square bg-slate-900 rounded-lg overflow-hidden border border-[#3e4042] relative group cursor-pointer">
                                            <img src={photo.thumbnailUrl || photo.videoUrl} className="w-full h-full object-cover group-hover:scale-105 transition-transform" referrerPolicy="no-referrer" />
                                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                                <MessageSquare size={16} className="text-white" />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* EVENTS SCREEN */}
                    {groupSubTab === 'EVENTS' && (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                                    <Calendar size={16} className="text-red-500" />
                                    <span>Programación de Eventos</span>
                                </h2>
                                <button 
                                    onClick={() => setShowCreateEvent(!showCreateEvent)}
                                    className="bg-red-600 hover:bg-red-700 text-white rounded-lg px-2.5 py-1 text-[11px] font-bold flex items-center gap-1 transition-all"
                                >
                                    <Plus size={14} />
                                    <span>Crear evento</span>
                                </button>
                            </div>

                            {showCreateEvent && (
                                <form onSubmit={handleCreateEventForm} className="bg-[#242526] border-2 border-red-500/20 rounded-xl p-4 space-y-3 animate-in fade-in-20">
                                    <h3 className="text-xs font-bold text-slate-200">Nuevo evento grupal</h3>
                                    <div>
                                        <label className="block text-[10px] text-slate-400 mb-1 font-bold">NOMBRE DEL EVENTO</label>
                                        <input 
                                            type="text" 
                                            value={newEventName}
                                            onChange={(e) => setNewEventName(e.target.value)}
                                            placeholder="Ej: Análisis del nuevo transcodificador"
                                            className="w-full bg-slate-900 border border-[#3e4042] p-2 text-xs rounded-lg text-white"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] text-slate-400 mb-1 font-bold">FECHA Y HORA</label>
                                        <input 
                                            type="text" 
                                            value={newEventDate}
                                            onChange={(e) => setNewEventDate(e.target.value)}
                                            placeholder="Ej: Jueves 18 de Junio, 20:00"
                                            className="w-full bg-slate-900 border border-[#3e4042] p-2 text-xs rounded-lg text-white"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] text-slate-400 mb-1 font-bold">DESCRIPCIÓN</label>
                                        <textarea 
                                            value={newEventDesc}
                                            onChange={(e) => setNewEventDesc(e.target.value)}
                                            placeholder="Detalles sobre lo que haremos..."
                                            className="w-full bg-slate-900 border border-[#3e4042] p-2 text-xs rounded-lg text-white h-16 resize-none"
                                        />
                                    </div>
                                    <div className="flex justify-end gap-2 text-xs">
                                        <button type="button" onClick={() => setShowCreateEvent(false)} className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300">Cancelar</button>
                                        <button type="submit" className="px-3 py-1.5 rounded-lg bg-red-600 text-white font-bold hover:bg-red-700">Programar</button>
                                    </div>
                                </form>
                            )}

                            <div className="space-y-3">
                                {eventsList.map(ev => (
                                    <div key={ev.id} className="bg-[#242526] rounded-xl border border-[#3e4042] p-4 shadow-sm relative overflow-hidden flex flex-col gap-2">
                                        <div className="absolute right-0 top-0 h-full w-1.5 bg-red-600" />
                                        <div className="flex items-start justify-between">
                                            <div>
                                                <h3 className="font-extrabold text-sm text-white">{ev.title}</h3>
                                                <p className="text-[11px] text-red-400 font-bold mt-1 uppercase tracking-wider">{ev.date}</p>
                                            </div>
                                        </div>
                                        <p className="text-xs text-slate-300 mt-1">{ev.description}</p>
                                        
                                        <div className="border-t border-[#3e4042] pt-2 mt-2 flex items-center justify-between text-[11px]">
                                            <span className="text-slate-400 font-bold">{ev.attendees.length} asistirán</span>
                                            <button 
                                                onClick={() => handleRSVPEvent(ev.id)}
                                                className={`px-3 py-1.5 rounded-lg font-bold transition-all ${ev.joined ? 'bg-[#3a3b3c] text-white hover:bg-red-950 hover:text-red-500' : 'bg-red-600 text-white hover:bg-red-700'}`}
                                            >
                                                {ev.joined ? 'Asistiré ✓' : 'Voy a Ir'}
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* FILES SCREEN (Non-media files or files explorer downloads) */}
                    {groupSubTab === 'FILES' && (
                        <div className="space-y-3">
                            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1">
                                <FileText size={16} className="text-amber-500" />
                                <span>Lista de Archivos en Carpeta</span>
                            </h2>
                            {filteredContent.length === 0 ? (
                                <div className="bg-[#242526] p-8 rounded-xl border border-[#3e4042] text-center text-slate-400 text-xs">
                                    No hay archivos descargables de este grupo (no-media) disponibles de forma directa.
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {filteredContent.map(file => (
                                        <div key={file.id} className="bg-[#242526] rounded-xl border border-[#3e4042] p-3 flex items-center justify-between hover:border-slate-500 transition-all shadow-sm">
                                            <div className="flex items-center gap-3">
                                                <div className="p-2.5 bg-blue-500/10 text-blue-400 rounded-lg">
                                                    <FileText size={20} />
                                                </div>
                                                <div className="text-left">
                                                    <p className="text-xs font-bold text-ellipsis overflow-hidden max-w-[240px] text-white">{file.title}</p>
                                                    <p className="text-[10px] text-slate-400 font-mono">ID: {file.id} · Creador: {file.creatorName || 'Servidor'}</p>
                                                </div>
                                            </div>
                                            <button 
                                                onClick={() => {
                                                    downloadItem(file);
                                                    toast.success(`Iniciando descarga: ${file.title}`);
                                                }}
                                                className="bg-[#3a3b3c] text-slate-200 hover:text-white px-3 py-1.5 rounded-lg text-[11px] font-bold hover:bg-slate-700 transition"
                                            >
                                                Descargar
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* MAIN FEED LIST */}
                    {groupSubTab === 'FEED' && (
                        groupContent.length === 0 ? (
                            <div className="bg-[#242526] rounded-xl p-8 border border-[#3e4042] text-center max-w-sm mx-auto shadow-md">
                                <Folder size={48} className="mx-auto text-slate-600 mb-3" />
                                <h3 className="font-bold text-sm text-[#e4e6eb]">Grupo sin publicaciones</h3>
                                <p className="text-xs text-[#b0b3b8] mt-1">Todavía nadie ha publicado nada en {activeGroup.name}. ¡Sé el primero!</p>
                                {joined && (
                                    <button
                                        onClick={() => fileInputRef.current?.click()}
                                        className="mt-4 bg-[#1877f2] text-white rounded-lg px-4 py-2 text-xs font-bold hover:bg-blue-600 active:scale-95 transition-all inline-flex items-center gap-1.5"
                                    >
                                        <Plus size={16} />
                                        Subir Archivo
                                    </button>
                                )}
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 gap-4">
                                {filteredContent.map((v) => {
                                    const isVideo = v.videoUrl?.match(/\.(mp4|mov|avi|mkv|flv|webm)$/i) || v.videoUrl?.includes('vid_');
                                    const isPic = v.videoUrl?.match(/\.(png|jpg|jpeg|gif|webp)$/i) || v.videoUrl?.includes('img_');
                                    const react = reactionsState[v.id];

                                    return (
                                        <div key={v.id} className="bg-[#242526] rounded-xl border border-[#3e4042] overflow-hidden shadow-md flex flex-col text-left">
                                            {/* FB Post Header */}
                                            <div className="p-3.5 flex items-center justify-between border-b border-[#3e4042]/30">
                                                <div className="flex items-center gap-2.5">
                                                    <div className="w-10 h-10 rounded-full bg-[#3a3b3c] overflow-hidden">
                                                        {v.creatorAvatarUrl ? (
                                                            <img src={v.creatorAvatarUrl} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                                        ) : (
                                                            <div className="w-full h-full flex items-center justify-center font-bold text-[#1877f2] bg-[#3a3b3c]">{v.creatorName?.[0] || 'G'}</div>
                                                        )}
                                                    </div>
                                                    <div>
                                                        <div className="flex items-center gap-1">
                                                            <span className="font-extrabold text-sm text-[#e4e6eb] hover:underline cursor-pointer">{v.creatorName || 'Usuario'}</span>
                                                            <span className="text-[11px] text-[#b0b3b8] font-medium">publicó en</span>
                                                            <span className="font-extrabold text-sm text-[#1877f2] hover:underline cursor-pointer flex items-center gap-0.5">
                                                                {activeGroup.name}
                                                            </span>
                                                        </div>
                                                        <p className="text-[10px] text-[#b0b3b8] font-bold flex items-center gap-1">
                                                            <span>{new Date(v.createdAt).toLocaleDateString()}</span>
                                                            <span>•</span>
                                                            <Globe size={11} />
                                                        </p>
                                                    </div>
                                                </div>
                                                <button className="text-slate-400 hover:text-white p-1 rounded-full hover:bg-slate-800 transition">
                                                    <MoreHorizontal size={18} />
                                                </button>
                                            </div>

                                            {/* Post Description caption */}
                                            {v.description && (
                                                <div className="px-3.5 pt-2 pb-2.5 text-xs text-[#e4e6eb] whitespace-pre-wrap leading-relaxed">
                                                    {v.description}
                                                </div>
                                            )}

                                            {/* Nested Media player / renderer */}
                                            <div className="bg-black/40 flex items-center justify-center overflow-hidden border-t border-b border-[#3e4042]/20 cursor-pointer" onClick={() => navigate(`/watch/${v.id}`)}>
                                                {isVideo ? (
                                                    <div className="relative w-full aspect-video bg-black flex items-center justify-center border-b border-[#3e4042]">
                                                        {v.thumbnailUrl ? (
                                                            <img src={v.thumbnailUrl} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                                        ) : (
                                                            <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-800 dark:bg-slate-900">
                                                                <Video size={36} className="text-[#1877f2]" />
                                                                <span className="text-xs mt-2 font-bold font-mono">Reproductor de Video</span>
                                                            </div>
                                                        )}
                                                        <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
                                                            <div className="w-12 h-12 bg-black/65 hover:bg-black/85 rounded-full flex items-center justify-center text-[#1877f2] border-2 border-slate-600 shadow-xl select-none transition-all">
                                                                <Play size={20} className="ml-0.5 fill-current" />
                                                            </div>
                                                        </div>
                                                    </div>
                                                ) : isPic ? (
                                                    <div className="w-full max-h-[380px] bg-slate-900 flex items-center justify-center">
                                                        <img src={v.videoUrl} className="w-full h-full object-contain" referrerPolicy="no-referrer" />
                                                    </div>
                                                ) : (
                                                    <div className="w-full bg-slate-900 border border-[#3e4042] p-5 flex items-center justify-between text-xs my-0.5">
                                                        <div className="flex items-center gap-2">
                                                            <FileText size={24} className="text-amber-500" />
                                                            <div className="text-left">
                                                                <p className="font-bold text-white truncate max-w-[200px]">{v.title}</p>
                                                                <p className="text-[10px] text-slate-400">Archivo descargable</p>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Reactions count review */}
                                            <div className="px-3.5 py-2 flex items-center justify-between text-[11px] text-slate-400 font-bold border-b border-[#3e4042]/20">
                                                <div className="flex items-center gap-1.5 cursor-pointer hover:underline">
                                                    <span className="flex items-center gap-0.5">
                                                        <ThumbsUp size={12} className="text-blue-500 fill-current" />
                                                        <Heart size={12} className="text-red-500 fill-current" />
                                                    </span>
                                                    <span>{react ? 12 + react.count : 12} personas reaccionaron</span>
                                                </div>
                                                <button onClick={() => toggleComments(v.id)} className="hover:underline">
                                                    Ver comentarios
                                                </button>
                                            </div>

                                            {/* FB Post Action Bar */}
                                            <div className="flex border-b border-[#3e4042]/20 relative">
                                                {/* Reacciones FB Hover Menu */}
                                                <div className="flex-1 relative group py-2">
                                                    <button className="w-full flex items-center justify-center gap-1.5 text-xs font-extrabold text-[#b0b3b8] hover:text-[#1877f2] transition-colors py-1">
                                                        {react ? (
                                                            <span className="flex items-center gap-1 text-[#1877f2]">
                                                                <span>{react.type}</span>
                                                                <span className="capitalize">{react.type === '👍' ? 'Me gusta' : react.type === '❤️' ? 'Me encanta' : 'Reaccionado'}</span>
                                                            </span>
                                                        ) : (
                                                            <>
                                                                <ThumbsUp size={16} />
                                                                <span>Me gusta</span>
                                                            </>
                                                        )}
                                                    </button>
                                                    
                                                    {/* Floating FB reactions drawer */}
                                                    <div className="absolute bottom-10 left-3 bg-[#242526] border border-[#3e454e] rounded-full px-2.5 py-1.5 hidden group-hover:flex items-center gap-2 shadow-2xl animate-in slide-in-from-bottom-2 duration-300 z-50">
                                                        {['👍', '❤️', '🥰', '😆', '😮', '😢', '😡'].map(emoji => (
                                                            <button 
                                                                key={emoji}
                                                                onClick={() => handleReact(v.id, emoji)}
                                                                className="text-lg hover:scale-130 active:scale-90 transition-transform p-0.5"
                                                            >
                                                                {emoji}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>

                                                <button 
                                                    onClick={() => toggleComments(v.id)}
                                                    className="flex-1 flex items-center justify-center gap-1.5 text-xs font-extrabold text-[#b0b3b8] hover:text-white py-3 transition-colors"
                                                >
                                                    <MessageSquare size={16} />
                                                    <span>Comentar</span>
                                                </button>
                                                
                                                <button 
                                                    onClick={() => {
                                                        navigator.clipboard.writeText(`${window.location.origin}/watch/${v.id}`);
                                                        toast.success("¡Enlace de publicación copiado al portapapeles!");
                                                    }}
                                                    className="flex-1 flex items-center justify-center gap-1.5 text-xs font-extrabold text-[#b0b3b8] hover:text-white py-3 transition-colors"
                                                >
                                                    <Share2 size={16} />
                                                    <span>Compartir</span>
                                                </button>
                                            </div>

                                            {/* FB COMMENTS BLOCK */}
                                            {expandedComments[v.id] && (
                                                <div className="bg-slate-900/60 p-3 space-y-3">
                                                    {loadingComments[v.id] ? (
                                                        <div className="flex items-center justify-center py-4">
                                                            <Loader2 size={18} className="animate-spin text-[#1877f2]" />
                                                        </div>
                                                    ) : !commentsMap[v.id] || commentsMap[v.id].length === 0 ? (
                                                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider text-center">Sin comentarios aún. sé el primero!</p>
                                                    ) : (
                                                        <div className="space-y-2 max-h-[180px] overflow-y-auto">
                                                            {commentsMap[v.id].map((com: any, cidx: number) => (
                                                                <div key={com.id || cidx} className="flex gap-2 items-start text-xs text-left">
                                                                    <div className="w-8 h-8 rounded-full bg-slate-700 overflow-hidden shrink-0 mt-0.5">
                                                                        {com.avatarUrl ? (
                                                                            <img src={com.avatarUrl} className="w-full h-full object-cover" />
                                                                        ) : (
                                                                            <div className="w-full h-full bg-[#1877f2] flex items-center justify-center text-[10px] text-white font-bold uppercase">{com.username?.[0]}</div>
                                                                        )}
                                                                    </div>
                                                                    <div className="bg-[#3a3b3c] rounded-2xl px-3 py-2 max-w-[85%] text-[#e4e6eb]">
                                                                        <span className="font-extrabold text-[11px] block text-white">{com.username}</span>
                                                                        <p className="mt-0.5 leading-relaxed">{com.text}</p>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}

                                                    {/* Comments write text */}
                                                    {user && (
                                                        <div className="flex items-center gap-2 border-t border-[#3e4042]/40 pt-2">
                                                            <input
                                                                type="text"
                                                                value={newCommentTexts[v.id] || ''}
                                                                onChange={(e) => setNewCommentTexts(prev => ({ ...prev, [v.id]: e.target.value }))}
                                                                onKeyDown={(e) => {
                                                                    if (e.key === 'Enter') handleAddCommentSubmit(v.id);
                                                                }}
                                                                placeholder="Escribe un comentario..."
                                                                className="flex-1 bg-[#3a3b3c] border border-[#3e4042] rounded-full px-3 py-1.5 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-[#1877f2]"
                                                            />
                                                            <button 
                                                                onClick={() => handleAddCommentSubmit(v.id)}
                                                                className="text-[#1877f2] hover:text-blue-400 transition-colors p-1 rounded-full hover:bg-slate-800"
                                                            >
                                                                <Send size={16} />
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#18191a] text-[#e4e6eb] pb-24">
            {/* Header section styled elegantly like FB Groups */}
            <div className="sticky top-[calc(104px+env(safe-area-inset-top,24px))] z-40 bg-[#242526] border-b border-[#3e4042] shadow-md">
                <div className="px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Users size={24} className="text-[#1877f2]" />
                        <h1 className="text-lg font-extrabold tracking-tight">Grupos</h1>
                    </div>
                    <button
                        onClick={() => setShowCreateModal(true)}
                        className="bg-[#1877f2] hover:bg-blue-600 text-white text-xs font-bold px-3 py-2 rounded-xl transition-all shadow-md flex items-center gap-1 active:scale-95"
                    >
                        <Plus size={16} />
                        Crear grupo
                    </button>
                </div>

                {/* FB styled tab headers */}
                <div className="flex border-t border-[#3e4042] px-2 h-12">
                    <button 
                        onClick={() => setTab('MY_GROUPS')}
                        className={`flex-1 flex items-center justify-center gap-2 h-full text-xs font-bold border-b-4 transition-all ${
                            tab === 'MY_GROUPS' 
                            ? 'border-[#1877f2] text-[#1877f2]' 
                            : 'border-transparent text-[#b0b3b8] hover:text-white'
                        }`}
                    >
                        <Star size={16} />
                        Mis Grupos ({myGroups.length})
                    </button>
                    <button 
                        onClick={() => setTab('EXPLORE')}
                        className={`flex-1 flex items-center justify-center gap-2 h-full text-xs font-bold border-b-4 transition-all ${
                            tab === 'EXPLORE' 
                            ? 'border-[#1877f2] text-[#1877f2]' 
                            : 'border-transparent text-[#b0b3b8] hover:text-white'
                        }`}
                    >
                        <Compass size={16} />
                        Sugerencias ({suggestedGroups.length})
                    </button>
                    <button 
                        onClick={() => setTab('MOST_VISITED')}
                        className={`flex-1 flex items-center justify-center gap-2 h-full text-xs font-bold border-b-4 transition-all ${
                            tab === 'MOST_VISITED' 
                            ? 'border-[#1877f2] text-[#1877f2]' 
                            : 'border-transparent text-[#b0b3b8] hover:text-white'
                        }`}
                    >
                        <Sparkles size={16} />
                        Más Visitados
                    </button>
                </div>
            </div>

            {/* List directory content with different tabs */}
            <div className="max-w-xl mx-auto p-4">
                {loading ? (
                    <div className="flex flex-col items-center justify-center py-32 gap-3">
                        <Loader2 className="animate-spin text-[#1877f2]" size={36} />
                        <p className="text-xs font-bold text-[#b0b3b8] uppercase tracking-wider">Cargando grupos del servidor...</p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {tab === 'MY_GROUPS' ? (
                            myGroups.length === 0 ? (
                                <div className="bg-[#242526] border border-[#3e4042] rounded-xl p-8 py-10 text-center max-w-sm mx-auto shadow-md">
                                    <Users size={48} className="mx-auto text-slate-500 mb-3" />
                                    <h3 className="font-bold text-base text-[#e4e6eb]">Aún no sigues ningún grupo</h3>
                                    <p className="text-xs text-[#b0b3b8] mt-1.5 mb-5 leading-normal">
                                        Únete a los grupos para que sus publicaciones y novedades aparezcan directamente en este apartado y en tu feed principal de noticias.
                                    </p>
                                    <button
                                        onClick={() => setTab('EXPLORE')}
                                        className="bg-[#1877f2] text-white rounded-lg px-4 py-2 text-xs font-bold hover:bg-blue-600 active:scale-95 transition-all inline-flex items-center gap-1.5"
                                    >
                                        <Compass size={16} />
                                        Ver grupos Sugeridos
                                    </button>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    {myGroups.map((group) => (
                                        <GroupCard 
                                            key={group.name} 
                                            group={group} 
                                            joined={true}
                                            membersCount={getGroupMembersCount(group.name)}
                                            newPosts={getNewPostsCount(group.name)}
                                            onClick={handleGroupClick} 
                                            onToggle={handleToggleSubscribe} 
                                        />
                                    ))}
                                </div>
                            )
                        ) : tab === 'EXPLORE' ? (
                            suggestedGroups.length === 0 ? (
                                <div className="text-center py-24 bg-[#242526] border border-[#3e4042] rounded-2xl p-8 max-w-sm mx-auto shadow">
                                    <CheckCircle size={44} className="mx-auto text-green-500 mb-3" />
                                    <p className="text-sm font-semibold text-[#e4e6eb] uppercase tracking-widest text-[#1877f2]">¡Estás en todo!</p>
                                    <p className="text-xs text-slate-400 mt-1">Te has unido a todos los grupos de la plataforma.</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    {suggestedGroups.map((group) => (
                                        <GroupCard 
                                            key={group.name} 
                                            group={group} 
                                            joined={false}
                                            membersCount={getGroupMembersCount(group.name)}
                                            newPosts={getNewPostsCount(group.name)}
                                            onClick={handleGroupClick} 
                                            onToggle={handleToggleSubscribe} 
                                        />
                                    ))}
                                </div>
                            )
                        ) : (
                            /* MOST VISITED */
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {mostVisitedGroups.map((group) => {
                                    const joined = isSubscribed(group.name);
                                    return (
                                        <GroupCard 
                                            key={group.name} 
                                            group={group} 
                                            joined={joined}
                                            membersCount={getGroupMembersCount(group.name)}
                                            newPosts={getNewPostsCount(group.name)}
                                            onClick={handleGroupClick} 
                                            onToggle={handleToggleSubscribe} 
                                        />
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* CREATE GROUP DIALOG MODAL */}
            {showCreateModal && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                    <div className="bg-[#242526] border border-[#3e4042] rounded-2xl w-full max-w-sm overflow-hidden text-left animate-in zoom-in-95 duration-200">
                        <div className="p-4 border-b border-[#3e4042] flex items-center justify-between">
                            <h3 className="font-extrabold text-white text-sm flex items-center gap-1.5">
                                <Users size={18} className="text-[#1877f2]" />
                                Crear nuevo Grupo (Carpeta)
                            </h3>
                            <button onClick={() => setShowCreateModal(false)} className="text-slate-400 hover:text-white">
                                <X size={20} />
                            </button>
                        </div>
                        <form onSubmit={handleCreateGroup} className="p-4 space-y-4">
                            <div>
                                <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Nombre de la carpeta / grupo</label>
                                <input
                                    type="text"
                                    value={newGroupName}
                                    onChange={(e) => setNewGroupName(e.target.value)}
                                    placeholder="Ej: VideosGraciosos"
                                    className="w-full bg-slate-900 border border-[#3e4042] rounded-xl p-2.5 text-xs text-[#e4e6eb] placeholder-slate-500 focus:outline-none focus:border-[#1877f2]"
                                    required
                                />
                                <p className="text-[10px] text-slate-400 mt-1 leading-normal">
                                    Esto creará físicamente un subdirectorio en el servidor de almacenamiento. Los archivos subidos se dirigirán ahí.
                                </p>
                            </div>

                            <div>
                                <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Privacidad del grupo</label>
                                <div className="space-y-2">
                                    <label className="flex items-center gap-2.5 cursor-pointer p-2 rounded-lg bg-slate-900 border border-[#3e4042] hover:border-slate-500 transition-all">
                                        <input
                                            type="radio"
                                            name="privacy"
                                            checked={newGroupPrivacy === 'PUBLIC'}
                                            onChange={() => setNewGroupPrivacy('PUBLIC')}
                                            className="accent-[#1877f2]"
                                        />
                                        <div>
                                            <span className="text-xs font-bold text-white flex items-center gap-1"><Globe size={12} />Público</span>
                                            <span className="text-[9px] text-slate-400 block">Cualquiera puede unirse y ver publicaciones.</span>
                                        </div>
                                    </label>
                                    <label className="flex items-center gap-2.5 cursor-pointer p-2 rounded-lg bg-slate-900 border border-[#3e4042] hover:border-slate-500 transition-all">
                                        <input
                                            type="radio"
                                            name="privacy"
                                            checked={newGroupPrivacy === 'PRIVATE'}
                                            onChange={() => setNewGroupPrivacy('PRIVATE')}
                                            className="accent-[#1877f2]"
                                        />
                                        <div>
                                            <span className="text-xs font-bold text-white flex items-center gap-1"><Lock size={12} />Privado (Suscritos)</span>
                                            <span className="text-[9px] text-slate-400 block">Solo miembros invitados.</span>
                                        </div>
                                    </label>
                                </div>
                            </div>

                            <button
                                type="submit"
                                disabled={creatingGroup}
                                className="w-full bg-[#1877f2] hover:bg-blue-600 disabled:opacity-50 text-white rounded-xl py-2.5 text-xs font-bold mt-2 hover:shadow-lg transition-all flex items-center justify-center gap-1"
                            >
                                {creatingGroup ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                                <span>Crear Grupo</span>
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}

// Inner Component for Group Listing Card
interface GroupCardProps {
    group: any;
    joined: boolean;
    membersCount: number;
    newPosts: number;
    onClick: (g: any) => void;
    onToggle: (e: React.MouseEvent, n: string) => void;
}

function GroupCard({ group, joined, membersCount, newPosts, onClick, onToggle }: GroupCardProps) {
    // Elegant random bg gradients for groups without thumbnails
    const gradient = useMemo(() => {
        const presets = [
            'from-[#4158D0] via-[#C850C0] to-[#FFCC70]',
            'from-[#0093E9] to-[#80D0C7]',
            'from-[#8EC5FC] to-[#E0C3FC]',
            'from-[#D9AFD9] to-[#97D9E1]',
            'from-[#3A1C71] via-[#D76D77] to-[#FFAF7B]'
        ];
        const idx = group.name.charCodeAt(0) % presets.length;
        return presets[idx];
    }, [group.name]);

    return (
        <div 
            onClick={() => onClick(group)} 
            className="bg-[#242526] rounded-xl border border-[#3e4042] overflow-hidden shadow-sm flex flex-col h-full cursor-pointer hover:border-[#4e4f50] transition-transform active:scale-98 text-left relative"
        >
            {/* New Posts Indicator Badge */}
            {newPosts > 0 && (
                <span className="absolute top-2 right-2 bg-red-600 text-white text-[9px] font-extrabold px-1.5 py-0.5 rounded-full z-10 flex items-center gap-0.5 animate-pulse">
                    <Zap size={8} />
                    <span>+{newPosts} nuevos</span>
                </span>
            )}

            <div className="relative h-28 bg-slate-800 flex items-center justify-center overflow-hidden">
                {group.thumbnailUrl ? (
                    <img src={group.thumbnailUrl} className="w-full h-full object-cover opacity-65" referrerPolicy="no-referrer" />
                ) : (
                    <div className={`absolute inset-0 bg-gradient-to-br ${gradient} opacity-80`} />
                )}
                <div className="absolute inset-0 bg-black/25" />
                <div className="absolute bottom-2 left-3 text-white">
                    <span className="text-[9px] bg-black/50 px-1.5 py-0.5 rounded uppercase tracking-wider font-extrabold">Carpeta</span>
                </div>
            </div>
            
            <div className="p-3.5 flex flex-col flex-1 justify-between gap-3 bg-[#242526]">
                <div>
                    <h3 className="font-extrabold text-[#e4e6eb] truncate leading-tight flex flex-col gap-0.5 select-none">
                        {group.name.includes('/') ? (
                            <>
                                <span className="text-[9px] text-[#1877f2] font-bold tracking-wider uppercase leading-none">
                                    {group.name.substring(0, group.name.lastIndexOf('/')).replace(/\//g, ' › ')}
                                </span>
                                <span className="text-sm font-extrabold text-[#e4e6eb]">{group.name.substring(group.name.lastIndexOf('/') + 1)}</span>
                            </>
                        ) : (
                            <span className="text-sm font-extrabold hover:underline">{group.name}</span>
                        )}
                    </h3>
                    <p className="text-[10px] text-[#b0b3b8] font-semibold mt-1 flex items-center gap-1.5">
                        <Users size={12} className="text-slate-400" />
                        <span>{membersCount} Miembros</span>
                        <span>•</span>
                        <span>{group.count} publicaciones</span>
                    </p>
                </div>
                
                <button
                    onClick={(e) => onToggle(e, group.name)}
                    className={`w-full py-2 rounded-lg text-xs font-bold transition-all ${
                        joined 
                        ? 'bg-[#3a3b3c] hover:bg-[#4e4f50] text-[#e4e6eb]' 
                        : 'bg-[#1877f2] hover:bg-blue-600 text-white'
                    }`}
                >
                    {joined ? 'Miembro ✓' : 'Unirse al Grupo'}
                </button>
            </div>
        </div>
    );
}
