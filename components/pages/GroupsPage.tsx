import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
    ChevronLeft, Folder, Users, Star, Plus, Share2, Compass, 
    CheckCircle, LogOut, ArrowLeft, Image as ImageIcon, Zap, Loader2, 
    Calendar, FileText, MessageSquare, ThumbsUp, Heart, Smile, Sparkles, 
    MoreHorizontal, Send, RefreshCw, Upload, Video, Globe, Lock, Check, Gift, Play, X, Music, Search,
    Clock, Settings, Save
} from 'lucide-react';
import { useNavigate, useLocation } from '../Router';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../services/db';
import { useToast } from '../../context/ToastContext';
import { useUpload } from '../../context/UploadContext';
import { useDownload } from '../../context/DownloadContext';
import VideoCard from '../VideoCard';

export default function GroupsPage() {
    const navigate = useNavigate();
    const location = useLocation();
    const { user } = useAuth();
    const toast = useToast();
    const { addToQueue, isUploading, progress } = useUpload();
    const { addToQueue: downloadItem } = useDownload();
    
    const [groups, setGroups] = useState<any[]>([]);
    const [subscribedPaths, setSubscribedPaths] = useState<string[]>([]);
    const [allSubscriptions, setAllSubscriptions] = useState<{ folderPath: string; approved: number }[]>([]);
    const [pendingSubscriptions, setPendingSubscriptions] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [tab, setTab] = useState<'MY_GROUPS' | 'EXPLORE' | 'MOST_VISITED'>('MY_GROUPS');
    const [activeGroup, setActiveGroup] = useState<any | null>(null);
    const [groupContent, setGroupContent] = useState<any[]>([]);
    const [loadingContent, setLoadingContent] = useState(false);
    const [playingVideo, setPlayingVideo] = useState<any | null>(null);
    const [groupSearchQuery, setGroupSearchQuery] = useState('');
    
    // Group active tab: 'FEED' | 'PHOTOS' | 'EVENTS' | 'FILES' | 'SOLICITUDES'
    const [groupSubTab, setGroupSubTab] = useState<'FEED' | 'PHOTOS' | 'EVENTS' | 'FILES' | 'SOLICITUDES'>('FEED');
    const [sortBy, setSortBy] = useState<'RECENT' | 'FEATURED'>('RECENT');

    // Create Group modal state
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [newGroupName, setNewGroupName] = useState('');
    const [newGroupPrivacy, setNewGroupPrivacy] = useState<'PUBLIC' | 'PRIVATE'>('PUBLIC');
    const [newGroupDescription, setNewGroupDescription] = useState('');
    const [newGroupCover, setNewGroupCover] = useState('');
    const [newGroupAllowUpload, setNewGroupAllowUpload] = useState(true);
    const [creatingGroup, setCreatingGroup] = useState(false);

    // Edit Group Modal States
    const [showEditModal, setShowEditModal] = useState(false);
    const [editGroupName, setEditGroupName] = useState('');
    const [editGroupDesc, setEditGroupDesc] = useState('');
    const [editGroupPrivacy, setEditGroupPrivacy] = useState<'PUBLIC' | 'PRIVATE'>('PUBLIC');
    const [editGroupCover, setEditGroupCover] = useState('');
    const [editGroupUnified, setEditGroupUnified] = useState(false);
    const [editGroupAllowUpload, setEditGroupAllowUpload] = useState(true);
    const [updatingGroup, setUpdatingGroup] = useState(false);

    // Composer posting state
    const [postText, setPostText] = useState('');
    const [attachedFile, setAttachedFile] = useState<File | null>(null);

    // Load pending subscriptions list
    const loadPendingSubscriptions = async () => {
        if (!user?.id) return;
        try {
            const list = await db.getPendingGroupSubscriptions(user.id);
            setPendingSubscriptions(list);
        } catch (e) {
            console.error("Error loading pending subscriptions:", e);
        }
    };
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

    // Handle query parameter folder & play video redirections
    useEffect(() => {
        const queryParams = new URLSearchParams(location.search);
        const folderParam = queryParams.get('folder');
        const playParam = queryParams.get('play');

        if (groups.length > 0 && folderParam) {
            const foundGroup = groups.find((g: any) => g.name === folderParam || g.relativePath === folderParam || g.name.toLowerCase() === folderParam.toLowerCase());
            if (foundGroup) {
                if (!activeGroup || activeGroup.name !== foundGroup.name) {
                    setActiveGroup(foundGroup);
                    setGroupSubTab('FEED');
                    loadGroupContent(foundGroup.name);
                }
                
                if (playParam && (!playingVideo || playingVideo.id !== playParam)) {
                    db.getVideo(playParam).then(v => {
                        if (v) setPlayingVideo(v);
                    }).catch(err => {
                        console.error("Failed to load overlay player video:", err);
                    });
                }
            }
        }
    }, [location.search, groups]);

    const loadGroups = async () => {
        try {
            setLoading(true);
            const result = await db.getFolders('', true);
            // Show folders with content, or empty folders if they are explicitly created groups (have creatorId)
            const activeGroups = (result || []).filter((g: any) => g.count > 0 || (g.creatorId !== undefined && g.creatorId !== null));
            setGroups(activeGroups);

            if (user?.id) {
                const subs = await db.getGroupSubscriptions(user.id);
                setSubscribedPaths(subs);
                const allSubs = await db.getUserAllSubscriptions(user.id);
                setAllSubscriptions(allSubs);
                await loadPendingSubscriptions();
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

    const isGroupPending = (groupName: string) => {
        return allSubscriptions.some(sub => sub.folderPath.toLowerCase() === groupName.toLowerCase() && sub.approved === 0);
    };

    const handleToggleSubscribe = async (e: React.MouseEvent | null, groupName: string) => {
        if (e) e.stopPropagation();
        if (!user?.id) {
            toast.error("Inicia sesión para unirte a grupos");
            return;
        }

        const currentlySubbed = isSubscribed(groupName);
        const pending = isGroupPending(groupName);
        try {
            if (currentlySubbed) {
                await db.unsubscribeGroup(user.id, groupName);
                setSubscribedPaths(prev => prev.filter(p => p.toLowerCase() !== groupName.toLowerCase()));
                setAllSubscriptions(prev => prev.filter(sub => sub.folderPath.toLowerCase() !== groupName.toLowerCase()));
                toast.success(`Saliendo del grupo ${groupName}...`);
            } else if (pending) {
                await db.unsubscribeGroup(user.id, groupName);
                setAllSubscriptions(prev => prev.filter(sub => sub.folderPath.toLowerCase() !== groupName.toLowerCase()));
                toast.success(`Solicitud de unión para el grupo ${groupName} cancelada`);
            } else {
                const res = await db.subscribeGroup(user.id, groupName);
                if (res && res.approved === false) {
                    setAllSubscriptions(prev => [...prev, { folderPath: groupName, approved: 0 }]);
                    toast.success("Solicitud de unión enviada. Esperando aprobación del administrador.");
                } else {
                    setSubscribedPaths(prev => [...prev, groupName]);
                    setAllSubscriptions(prev => [...prev, { folderPath: groupName, approved: 1 }]);
                    toast.success(`¡Te has unido al grupo ${groupName}!`);
                }
            }
        } catch (err: any) {
            console.error('Group action failed:', err);
            toast.error(err.message || "Error en la operación del grupo");
        }
    };

    // Calculate members count dynamically
    const getGroupMembersCount = (groupName: string) => {
        const seededCount = (groupName.charCodeAt(0) * 17) % 240 + 15;
        // If subscribed, add one
        const extra = isSubscribed(groupName) ? 1 : 0;
        return seededCount + extra;
    };

    // Calculate new posts count using real backend metadata
    const getNewPostsCount = (groupName: string) => {
        const found = groups.find((g: any) => g.name === groupName || g.relativePath === groupName);
        return found ? (Number(found.newPosts) || 0) : 0;
    };

    const handleCoverFileChange = (e: React.ChangeEvent<HTMLInputElement>, isEdit: boolean) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                const base64Str = reader.result as string;
                if (isEdit) {
                    setEditGroupCover(base64Str);
                } else {
                    setNewGroupCover(base64Str);
                }
                toast.success("Foto de portada cargada con éxito");
            };
            reader.readAsDataURL(file);
        }
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
            const res = await db.createGroup(
                user.id,
                newGroupName.trim(),
                newGroupDescription.trim(),
                newGroupPrivacy === 'PRIVATE',
                newGroupCover.trim(),
                newGroupAllowUpload
            );
            toast.success(`Grupo "${newGroupName}" creado con éxito`);
            setShowCreateModal(false);
            setNewGroupName('');
            setNewGroupDescription('');
            setNewGroupCover('');
            setNewGroupAllowUpload(true);
            await loadGroups();
            
            // Auto open the new group
            const newGroupObj = {
                name: res.name || newGroupName.trim(),
                count: 0,
                thumbnailUrl: newGroupCover.trim() || null,
                creatorId: user.id,
                description: newGroupDescription.trim() || 'Grupo sin descripción.',
                isPrivate: newGroupPrivacy === 'PRIVATE' ? 1 : 0,
                allowUpload: newGroupAllowUpload ? 1 : 0,
                membersCount: 1
            };
            handleGroupClick(newGroupObj);
        } catch (err: any) {
            console.error('Error creating group:', err);
            toast.error(err.message || "Error al crear el grupo");
        } finally {
            setCreatingGroup(false);
        }
    };

    const handleOpenEditModal = () => {
        if (!activeGroup) return;
        setEditGroupName(activeGroup.name);
        setEditGroupDesc(activeGroup.description || '');
        setEditGroupPrivacy(activeGroup.isPrivate === 1 ? 'PRIVATE' : 'PUBLIC');
        setEditGroupCover(activeGroup.coverUrl || '');
        setEditGroupUnified(activeGroup.isUnified === 1);
        setEditGroupAllowUpload(activeGroup.allowUpload !== 0);
        setShowEditModal(true);
    };

    const handleEditGroupSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user?.id || !activeGroup) return;
        if (!editGroupName.trim()) {
            toast.error("El nombre del grupo no puede estar vacío");
            return;
        }
        try {
            setUpdatingGroup(true);
            const res = await db.editGroup(
                user.id,
                activeGroup.name,
                editGroupName.trim(),
                editGroupDesc.trim(),
                editGroupPrivacy === 'PRIVATE',
                editGroupCover.trim(),
                editGroupUnified,
                editGroupAllowUpload
            );
            toast.success("Grupo actualizado con éxito");
            setShowEditModal(false);
            
            const updatedName = res.folderPath || activeGroup.name;
            await loadGroups();
            
            setActiveGroup((prev: any) => ({
                ...prev,
                name: updatedName,
                description: editGroupDesc.trim(),
                isPrivate: editGroupPrivacy === 'PRIVATE' ? 1 : 0,
                isUnified: editGroupUnified ? 1 : 0,
                allowUpload: editGroupAllowUpload ? 1 : 0,
                coverUrl: editGroupCover.trim()
            }));
        } catch (err: any) {
            console.error("Error updating group:", err);
            toast.error(err.message || "Error al actualizar grupo");
        } finally {
            setUpdatingGroup(false);
        }
    };

    const handleApproveSub = async (sub: any) => {
        if (!user?.id) return;
        try {
            await db.approveGroupSubscription(user.id, sub.userId, sub.folderPath);
            toast.success(`Suscripción de ${sub.username} aprobada con éxito`);
            await loadPendingSubscriptions();
            await loadGroups();
        } catch (err: any) {
            console.error(err);
            toast.error(err.message || "Error al aprobar");
        }
    };

    const handleDeclineSub = async (sub: any) => {
        if (!user?.id) return;
        try {
            await db.declineGroupSubscription(user.id, sub.userId, sub.folderPath);
            toast.success(`Solicitud de ${sub.username} rechazada`);
            await loadPendingSubscriptions();
            await loadGroups();
        } catch (err: any) {
            console.error(err);
            toast.error(err.message || "Error al rechazar");
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

    // Categorize groups based on sub status with search query integration
    const filteredGroups = useMemo(() => {
        if (!groupSearchQuery.trim()) return groups;
        const q = groupSearchQuery.toLowerCase();
        return groups.filter(g => 
            g.name.toLowerCase().includes(q) || 
            (g.relativePath && g.relativePath.toLowerCase().includes(q))
        );
    }, [groups, groupSearchQuery]);

    const myGroups = useMemo(() => {
        return filteredGroups.filter(g => isSubscribed(g.name));
    }, [filteredGroups, subscribedPaths]);

    const suggestedGroups = useMemo(() => {
        // Suggested are groups not subscribed, optionally sorted or filtered
        return filteredGroups.filter(g => !isSubscribed(g.name));
    }, [filteredGroups, subscribedPaths]);

    const mostVisitedGroups = useMemo(() => {
        // Copy list and sort by posts count descending (count of items / interactions)
        return [...filteredGroups].sort((a,b) => b.count - a.count);
    }, [filteredGroups]);

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
        const isCreator = user?.id && activeGroup.creatorId === user.id;
        const isAuthorizedToView = !activeGroup.isPrivate || joined || isCreator || isAdmin;

        const groupPendingCount = pendingSubscriptions.filter(p => p.folderPath.toLowerCase() === activeGroup.name.toLowerCase()).length;
        const groupPendingList = pendingSubscriptions.filter(p => p.folderPath.toLowerCase() === activeGroup.name.toLowerCase());

        return (
            <div className="min-h-screen bg-[#18191a] text-[#e4e6eb] pb-24">
                {/* Header sticky bar */}
                <div className="sticky top-[calc(104px+env(safe-area-inset-top,24px))] z-40 bg-[#242526] border-b border-[#3e4042] px-4 h-14 flex items-center justify-between shadow-md">
                    <button onClick={handleBack} className="flex items-center gap-1.5 text-[#1877f2] font-bold text-sm hover:underline">
                        <ArrowLeft size={18} />
                        <span>Grupos</span>
                    </button>
                    <span className="font-bold text-sm truncate max-w-[200px] text-white flex items-center gap-1">
                        {activeGroup.isPrivate ? <Lock size={13} className="text-amber-500" /> : <Globe size={13} className="text-[#1877f2]" />}
                        {activeGroup.name.includes('/') ? activeGroup.name.substring(activeGroup.name.lastIndexOf('/') + 1) : activeGroup.name}
                    </span>
                    <button 
                        onClick={(e) => handleToggleSubscribe(e, activeGroup.name)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
                            joined 
                            ? 'bg-[#3a3b3c] hover:bg-[#4e4f50] text-[#e4e6eb]' 
                            : isGroupPending(activeGroup.name)
                            ? 'bg-amber-500/20 text-amber-500 border border-amber-500/30'
                            : 'bg-[#1877f2] hover:bg-blue-600 text-white'
                        }`}
                        disabled={!joined && isGroupPending(activeGroup.name)}
                    >
                        {joined ? 'Siguiendo ✓' : isGroupPending(activeGroup.name) ? 'Pendiente ⌛' : 'Unirte'}
                    </button>
                </div>

                {/* Group Cover Style Banner */}
                <div className="bg-[#242526] border-b border-[#3e4042]">
                    <div className="relative h-44 bg-slate-800 flex items-center justify-center overflow-hidden">
                        {activeGroup.coverUrl || activeGroup.thumbnailUrl ? (
                            <img src={activeGroup.coverUrl || activeGroup.thumbnailUrl} className="w-full h-full object-cover opacity-60" referrerPolicy="no-referrer" />
                        ) : (
                            <div className="absolute inset-0 bg-gradient-to-r from-[#1e3c72] to-[#2a5298] opacity-70" />
                        )}
                        <div className="absolute inset-0 bg-black/40"></div>
                        <div className="relative text-center p-4">
                            <span className={`text-white text-[10px] font-extrabold px-2 py-1 rounded-full uppercase tracking-wider mb-2 inline-block shadow-md ${activeGroup.isPrivate ? 'bg-amber-600' : 'bg-[#1877f2]'}`}>
                                {activeGroup.isPrivate ? '🔒 FB Grupo Privado' : '🌎 FB Grupo Público'}
                            </span>
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
                        {(isCreator || isAdmin) && (
                            <button 
                                onClick={handleOpenEditModal}
                                className="absolute bottom-3 right-3 bg-black/60 hover:bg-black/80 rounded-full p-2.5 text-white transition-all shadow-md active:scale-95 z-10"
                                title="Editar Grupo"
                            >
                                <Settings size={16} />
                            </button>
                        )}
                    </div>

                    {/* Facebook style Group description & actions */}
                    <div className="max-w-xl mx-auto px-4 py-3 border-b border-[#3e4042]/50 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-slate-300 italic mb-1">Ruta de almacenamiento: /{activeGroup.name}</p>
                            <p className="text-xs text-slate-400">
                                {activeGroup.description || 'Grupo de cooperación y contenido mutuo en servidor local.'}
                            </p>
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
                            onClick={() => { if (isAuthorizedToView) setGroupSubTab('PHOTOS'); else toast.error('Debes ser miembro para ver fotos'); }}
                            disabled={!isAuthorizedToView}
                            className={`flex-1 flex flex-col items-center justify-center border-b-4 transition-all ${!isAuthorizedToView ? 'opacity-30' : ''} ${groupSubTab === 'PHOTOS' ? 'border-[#1877f2] text-[#1877f2]' : 'border-transparent hover:text-white'}`}
                        >
                            <span>Fotos</span>
                        </button>
                        <button 
                            onClick={() => { if (isAuthorizedToView) setGroupSubTab('EVENTS'); else toast.error('Debes ser miembro para ver eventos'); }}
                            disabled={!isAuthorizedToView}
                            className={`flex-1 flex flex-col items-center justify-center border-b-4 transition-all ${!isAuthorizedToView ? 'opacity-30' : ''} ${groupSubTab === 'EVENTS' ? 'border-[#1877f2] text-[#1877f2]' : 'border-transparent hover:text-white'}`}
                        >
                            <span className="flex items-center gap-1">Eventos <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" /></span>
                        </button>
                        <button 
                            onClick={() => { if (isAuthorizedToView) setGroupSubTab('FILES'); else toast.error('Debes ser miembro para ver archivos'); }}
                            disabled={!isAuthorizedToView}
                            className={`flex-1 flex flex-col items-center justify-center border-b-4 transition-all ${!isAuthorizedToView ? 'opacity-30' : ''} ${groupSubTab === 'FILES' ? 'border-[#1877f2] text-[#1877f2]' : 'border-transparent hover:text-white'}`}
                        >
                            <span>Archivos</span>
                        </button>
                        {(isCreator || isAdmin) && (
                            <button 
                                onClick={() => setGroupSubTab('SOLICITUDES')}
                                className={`flex-1 flex flex-col items-center justify-center border-b-4 transition-all ${groupSubTab === 'SOLICITUDES' ? 'border-[#1877f2] text-[#1877f2]' : 'border-transparent hover:text-white'}`}
                            >
                                <span className="flex items-center gap-1">
                                    Solicitudes
                                    {groupPendingCount > 0 && (
                                        <span className="bg-red-500 text-white rounded-full text-[9px] px-1 min-w-[14px] h-3.5 flex items-center justify-center font-extrabold animate-pulse">
                                            {groupPendingCount}
                                        </span>
                                    )}
                                </span>
                            </button>
                        )}
                    </div>
                </div>

                <div className="max-w-xl mx-auto p-4 space-y-4">
                    {!isAuthorizedToView ? (
                        <div className="bg-[#242526] rounded-2xl p-8 border border-[#3e4042] text-center max-w-sm mx-auto shadow-xl space-y-4 my-8 animate-in zoom-in-95 duration-200">
                            <div className="w-16 h-16 bg-red-500/10 border border-red-500/20 text-red-500 rounded-full flex items-center justify-center mx-auto shadow-inner animate-pulse">
                                <Lock size={32} />
                            </div>
                            <h3 className="font-extrabold text-[#e4e6eb] text-base">Grupo de Acceso Privado</h3>
                            <p className="text-xs text-[#b0b3b8] leading-relaxed">
                                Este grupo es privado. El contenido compartido, las fotos, los videos y los archivos están restringidos exclusivamente para los miembros aprobados por el administrador.
                            </p>
                            {isGroupPending(activeGroup.name) ? (
                                <div className="inline-flex items-center gap-1.5 bg-[#3a3b3c] text-white px-4 py-2.5 rounded-xl font-bold text-xs shadow">
                                    <Clock size={16} className="text-amber-500 animate-pulse" />
                                    <span>Solicitud pendiente de aprobación</span>
                                </div>
                            ) : (
                                <button
                                    onClick={(e) => handleToggleSubscribe(e, activeGroup.name)}
                                    className="bg-[#1877f2] hover:bg-blue-600 active:scale-95 text-white font-bold text-xs px-5 py-2.5 rounded-xl transition-all inline-flex items-center gap-1.5 shadow-md animate-bounce"
                                >
                                    <Plus size={16} />
                                    <span>Solicitar Unirse al Grupo</span>
                                </button>
                            )}
                        </div>
                    ) : groupSubTab === 'SOLICITUDES' ? (
                        <div className="bg-[#242526] rounded-xl p-4 border border-[#3e4042] shadow-md space-y-4 animate-in fade-in duration-200">
                            <h3 className="font-extrabold text-sm text-white border-b border-[#3e4042] pb-2 flex items-center gap-1.5">
                                <Clock size={16} className="text-amber-400" />
                                Solicitudes de Suscripción Pendientes
                            </h3>
                            {groupPendingList.length === 0 ? (
                                <p className="text-xs text-slate-400 text-center py-6">No hay solicitudes pendientes para este grupo.</p>
                            ) : (
                                <div className="divide-y divide-[#3e4042]/50">
                                    {groupPendingList.map((sub: any) => (
                                        <div key={sub.userId} className="flex items-center justify-between py-3">
                                            <div className="flex items-center gap-2">
                                                <div className="w-9 h-9 rounded-full bg-[#1877f2] text-white font-extrabold flex items-center justify-center text-xs">
                                                    {sub.username?.[0]?.toUpperCase() || 'U'}
                                                </div>
                                                <div>
                                                    <p className="text-xs font-bold text-white">{sub.username}</p>
                                                    <p className="text-[10px] text-slate-400">Solicitado el {new Date(sub.requestedAt).toLocaleDateString()}</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <button 
                                                    onClick={() => handleApproveSub(sub)}
                                                    className="bg-green-600 hover:bg-green-700 text-white text-[11px] font-bold px-3 py-1.5 rounded-lg transition-colors shadow"
                                                >
                                                    Aprobar
                                                </button>
                                                <button 
                                                    onClick={() => handleDeclineSub(sub)}
                                                    className="bg-[#3a3b3c] hover:bg-red-700 text-slate-200 text-[11px] font-bold px-3 py-1.5 rounded-lg transition-colors border border-[#4e4f50]"
                                                >
                                                    Rechazar
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    ) : (
                        <>
                            {/* Secondary menu tabs (Miembro, Invitar, etc) */}
                            <div className="flex gap-2 bg-[#242526] p-2 rounded-xl border border-[#3e4042] shadow-sm justify-around text-xs animate-in slide-in-from-top-1">
                                <button 
                                    onClick={(e) => handleToggleSubscribe(e, activeGroup.name)} 
                                    className={`flex-1 py-1.5 rounded-lg flex items-center justify-center gap-1.5 transition-all text-slate-300 font-bold hover:bg-[#3a3b3c] ${joined ? 'text-green-500 bg-[#3a3b3c]/20' : ''}`}
                                >
                                    <Check size={16} />
                                    <span>{joined ? 'Unido' : isGroupPending(activeGroup.name) ? 'Pendiente' : 'Unirse'}</span>
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
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1 bg-[var(--divider)]">
                                {filteredContent.map((v) => (
                                    <div key={v.id} className="bg-[var(--bg-secondary)] relative group">
                                        <VideoCard 
                                            video={v} 
                                            isUnlocked={isAdmin || user?.id === v.creatorId || !!(user?.vipExpiry && user.vipExpiry > Date.now() / 1000) || Number(v.price || 0) <= 0} 
                                            isWatched={false} 
                                            onCategoryClick={() => {}}
                                            showDownload={!isAdmin}
                                            onDownload={() => downloadItem(v)}
                                        />
                                    </div>
                                ))}
                            </div>
                        )
                    )}
                    </>
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

                {/* Subheader Search input */}
                <div className="px-4 pb-3">
                    <div className="relative">
                        <input
                            type="text"
                            placeholder="Buscar grupos por nombre o ruta..."
                            value={groupSearchQuery}
                            onChange={(e) => setGroupSearchQuery(e.target.value)}
                            className="w-full bg-[#3a3b3c] hover:bg-[#4e4f50] focus:bg-[#3a3b3c] text-sm text-[#e4e6eb] placeholder-slate-400 pl-10 pr-4 py-2 rounded-xl border border-transparent focus:border-[#1877f2] transition-colors focus:outline-none"
                        />
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        {groupSearchQuery && (
                            <button 
                                onClick={() => setGroupSearchQuery('')} 
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#b0b3b8] hover:text-white"
                            >
                                <X size={14} />
                            </button>
                        )}
                    </div>
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
                                            pending={isGroupPending(group.name)}
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
                                    const pending = isGroupPending(group.name);
                                    return (
                                        <GroupCard 
                                            key={group.name} 
                                            group={group} 
                                            joined={joined}
                                            pending={pending}
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
                    <div id="create-group-modal" className="bg-[#242526] border border-[#3e4042] rounded-2xl w-full max-w-sm max-h-[85vh] flex flex-col overflow-hidden text-left animate-in zoom-in-95 duration-200 shadow-2xl">
                        {/* Fixed Header */}
                        <div className="p-4 border-b border-[#3e4042] flex items-center justify-between shrink-0">
                            <h3 className="font-extrabold text-white text-sm flex items-center gap-1.5">
                                <Users size={18} className="text-[#1877f2]" />
                                Crear nuevo Grupo (Carpeta)
                            </h3>
                            <button onClick={() => setShowCreateModal(false)} className="text-slate-400 hover:text-white">
                                <X size={20} />
                            </button>
                        </div>
                        
                        {/* Scrollable Content */}
                        <form onSubmit={handleCreateGroup} className="flex flex-col flex-1 overflow-hidden">
                            <div className="p-4 space-y-4 overflow-y-auto flex-1 scrollbar-thin scrollbar-thumb-slate-700">
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

                                <div>
                                    <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Descripción</label>
                                    <textarea
                                        value={newGroupDescription}
                                        onChange={(e) => setNewGroupDescription(e.target.value)}
                                        placeholder="Describe el propósito del grupo para los nuevos miembros..."
                                        className="w-full bg-slate-900 border border-[#3e4042] rounded-xl p-2.5 text-xs text-[#e4e6eb] focus:outline-none focus:border-[#1877f2] h-16 resize-none placeholder-slate-500"
                                    />
                                </div>

                                <div>
                                    <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Portada del grupo</label>
                                    <div className="space-y-2">
                                        <input
                                            type="text"
                                            value={newGroupCover}
                                            onChange={(e) => setNewGroupCover(e.target.value)}
                                            placeholder="Enlace o URL de portada (https://...)"
                                            className="w-full bg-slate-900 border border-[#3e4042] rounded-xl p-2.5 text-xs text-[#e4e6eb] focus:outline-none focus:border-[#1877f2] placeholder-slate-500"
                                        />
                                        <div className="flex items-center gap-2">
                                            <label className="flex-1 flex items-center justify-center gap-1.5 bg-slate-800 hover:bg-slate-700 transition-all text-xs font-bold text-[#e4e6eb] rounded-xl py-2 px-3 border border-[#3e4042] cursor-pointer">
                                                <ImageIcon size={14} className="text-blue-500" />
                                                <span>Subir desde dispositivo</span>
                                                <input
                                                    type="file"
                                                    accept="image/*"
                                                    onChange={(e) => handleCoverFileChange(e, false)}
                                                    className="hidden"
                                                />
                                            </label>
                                            {newGroupCover && (
                                                <button
                                                    type="button"
                                                    onClick={() => setNewGroupCover('')}
                                                    className="bg-red-950/40 hover:bg-red-950 text-red-500 border border-red-500/20 text-xs font-bold rounded-xl py-2 px-3 transition-all"
                                                >
                                                    Quitar
                                                </button>
                                            )}
                                        </div>
                                        {newGroupCover && newGroupCover.length > 0 && (
                                            <div className="relative rounded-lg overflow-hidden border border-[#3e4042] aspect-video w-full bg-slate-950">
                                                <img src={newGroupCover} alt="Preview" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div>
                                    <label className="flex items-center gap-2.5 cursor-pointer p-2 rounded-lg bg-slate-900 border border-[#3e4042] hover:border-slate-500 transition-all">
                                        <input
                                            type="checkbox"
                                            checked={newGroupAllowUpload}
                                            onChange={(e) => setNewGroupAllowUpload(e.target.checked)}
                                            className="w-4 h-4 rounded text-[#1877f2] bg-slate-800 border-[#3e4042] cursor-pointer accent-[#1877f2]"
                                        />
                                        <div>
                                            <span className="text-xs font-bold text-white block">Permitir subir contenido al grupo</span>
                                            <span className="text-[9px] text-slate-400 block font-normal">Los miembros suscritos podrán publicar contenido directamente en este grupo.</span>
                                        </div>
                                    </label>
                                </div>
                            </div>

                            {/* Fixed Footer */}
                            <div className="p-4 border-t border-[#3e4042] bg-[#242526] shrink-0">
                                <button
                                    type="submit"
                                    disabled={creatingGroup}
                                    className="w-full bg-[#1877f2] hover:bg-blue-600 disabled:opacity-50 text-white rounded-xl py-2.5 text-xs font-bold hover:shadow-lg transition-all flex items-center justify-center gap-1 cursor-pointer"
                                >
                                    {creatingGroup ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                                    <span>Crear Grupo</span>
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* EDIT GROUP DIALOG MODAL */}
            {showEditModal && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                    <div id="edit-group-modal" className="bg-[#242526] border border-[#3e4042] rounded-2xl w-full max-w-sm max-h-[85vh] flex flex-col overflow-hidden text-left animate-in zoom-in-95 duration-200 shadow-2xl">
                        {/* Fixed Header */}
                        <div className="p-4 border-b border-[#3e4042] flex items-center justify-between shrink-0">
                            <h3 className="font-extrabold text-white text-sm flex items-center gap-1.5">
                                <Settings size={18} className="text-[#1877f2]" />
                                Editar Detalles de Grupo
                            </h3>
                            <button onClick={() => setShowEditModal(false)} className="text-slate-400 hover:text-white">
                                <X size={20} />
                            </button>
                        </div>
                        
                        {/* Scrollable Content */}
                        <form onSubmit={handleEditGroupSubmit} className="flex flex-col flex-1 overflow-hidden">
                            <div className="p-4 space-y-4 overflow-y-auto flex-1 scrollbar-thin scrollbar-thumb-slate-700">
                                <div>
                                    <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Nombre de la carpeta</label>
                                    <input
                                        type="text"
                                        value={editGroupName}
                                        onChange={(e) => setEditGroupName(e.target.value)}
                                        placeholder="Nombre de la carpeta"
                                        className="w-full bg-slate-900 border border-[#3e4042] rounded-xl p-2.5 text-xs text-[#e4e6eb] focus:outline-none focus:border-[#1877f2]"
                                        required
                                    />
                                </div>

                                <div>
                                    <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Descripción</label>
                                    <textarea
                                        value={editGroupDesc}
                                        onChange={(e) => setEditGroupDesc(e.target.value)}
                                        placeholder="Describe el propósito del grupo para los nuevos miembros..."
                                        className="w-full bg-slate-900 border border-[#3e4042] rounded-xl p-2.5 text-xs text-[#e4e6eb] focus:outline-none focus:border-[#1877f2] h-20 resize-none"
                                    />
                                </div>

                                <div>
                                    <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Foto de portada</label>
                                    <div className="space-y-2">
                                        <input
                                            type="text"
                                            value={editGroupCover}
                                            onChange={(e) => setEditGroupCover(e.target.value)}
                                            placeholder="https://ejemplo.com/banner.jpg"
                                            className="w-full bg-slate-900 border border-[#3e4042] rounded-xl p-2.5 text-xs text-[#e4e6eb] focus:outline-none focus:border-[#1877f2]"
                                        />
                                        <div className="flex items-center gap-2">
                                            <label className="flex-1 flex items-center justify-center gap-1.5 bg-slate-800 hover:bg-slate-700 transition-all text-xs font-bold text-[#e4e6eb] rounded-xl py-2 px-3 border border-[#3e4042] cursor-pointer">
                                                <ImageIcon size={14} className="text-blue-500" />
                                                <span>Subir desde dispositivo</span>
                                                <input
                                                    type="file"
                                                    accept="image/*"
                                                    onChange={(e) => handleCoverFileChange(e, true)}
                                                    className="hidden"
                                                />
                                            </label>
                                            {editGroupCover && (
                                                <button
                                                    type="button"
                                                    onClick={() => setEditGroupCover('')}
                                                    className="bg-red-950/40 hover:bg-red-950 text-red-500 border border-red-500/20 text-xs font-bold rounded-xl py-2 px-3 transition-all"
                                                >
                                                    Quitar
                                                </button>
                                            )}
                                        </div>
                                        {editGroupCover && editGroupCover.length > 0 && (
                                            <div className="relative rounded-lg overflow-hidden border border-[#3e4042] aspect-video w-full bg-slate-950">
                                                <img src={editGroupCover} alt="Preview" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Privacidad del grupo</label>
                                    <div className="space-y-2">
                                        <label className="flex items-center gap-2.5 cursor-pointer p-2 rounded-lg bg-slate-900 border border-[#3e4042] hover:border-slate-500 transition-all">
                                            <input
                                                type="radio"
                                                name="editPrivacy"
                                                checked={editGroupPrivacy === 'PUBLIC'}
                                                onChange={() => setEditGroupPrivacy('PUBLIC')}
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
                                                name="editPrivacy"
                                                checked={editGroupPrivacy === 'PRIVATE'}
                                                onChange={() => setEditGroupPrivacy('PRIVATE')}
                                                className="accent-[#1877f2]"
                                            />
                                            <div>
                                                <span className="text-xs font-bold text-white flex items-center gap-1"><Lock size={12} />Privado (Suscripciones aprobadas)</span>
                                                <span className="text-[9px] text-slate-400 block">Requiere aprobación del administrador del grupo.</span>
                                            </div>
                                        </label>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="flex items-center gap-2.5 cursor-pointer p-2 rounded-lg bg-slate-900 border border-[#3e4042] hover:border-slate-500 transition-all">
                                        <input
                                            type="checkbox"
                                            checked={editGroupUnified}
                                            onChange={(e) => setEditGroupUnified(e.target.checked)}
                                            className="w-4 h-4 rounded text-[#1877f2] bg-slate-800 border-[#3e4042] cursor-pointer accent-[#1877f2]"
                                        />
                                        <div>
                                            <span className="text-xs font-bold text-white block">Unificar como grupo</span>
                                            <span className="text-[9px] text-slate-400 block font-normal">Integra las publicaciones de todas sus subcarpetas como contenido de este feed de grupo.</span>
                                        </div>
                                    </label>

                                    <label className="flex items-center gap-2.5 cursor-pointer p-2 rounded-lg bg-slate-900 border border-[#3e4042] hover:border-slate-500 transition-all">
                                        <input
                                            type="checkbox"
                                            checked={editGroupAllowUpload}
                                            onChange={(e) => setEditGroupAllowUpload(e.target.checked)}
                                            className="w-4 h-4 rounded text-[#1877f2] bg-slate-800 border-[#3e4042] cursor-pointer accent-[#1877f2]"
                                        />
                                        <div>
                                            <span className="text-xs font-bold text-white block">Permitir subir contenido al grupo</span>
                                            <span className="text-[9px] text-slate-400 block font-normal">Los miembros suscritos podrán publicar contenido directamente en este grupo.</span>
                                        </div>
                                    </label>
                                </div>
                            </div>

                            {/* Fixed Footer */}
                            <div className="p-4 border-t border-[#3e4042] bg-[#242526] shrink-0">
                                <button
                                    type="submit"
                                    disabled={updatingGroup}
                                    className="w-full bg-[#1877f2] hover:bg-blue-600 disabled:opacity-50 text-white rounded-xl py-2.5 text-xs font-bold hover:shadow-lg transition-all flex items-center justify-center gap-1 cursor-pointer"
                                >
                                    {updatingGroup ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                                    <span>Guardar Cambios</span>
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Direct Video Player Overlay Modal for FASE 4 redirections */}
            {playingVideo && (
                <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-[9999] flex items-center justify-center p-4">
                    <div className="bg-[#18191a] max-w-4xl w-full rounded-2xl border border-[#3e4042] overflow-hidden shadow-2xl flex flex-col md:flex-row relative">
                        {/* Close button */}
                        <button 
                            onClick={() => {
                                setPlayingVideo(null);
                                // Clean up URL query parameters cleanly
                                const q = new URLSearchParams(location.search);
                                q.delete('play');
                                const route = q.toString() ? `/groups?${q.toString()}` : '/groups';
                                navigate(route, { replace: true });
                            }}
                            className="absolute top-4 right-4 z-50 bg-black/60 text-white hover:bg-black/80 rounded-full p-2 transition-all cursor-pointer"
                        >
                            <X size={20} />
                        </button>
                        
                        {/* Left Side: Video/Audio Player */}
                        <div className="flex-1 bg-black aspect-video md:aspect-auto md:h-[500px] flex items-center justify-center relative">
                            {playingVideo.is_audio ? (
                                <div className="flex flex-col items-center justify-center p-8 text-center w-full h-full bg-gradient-to-b from-[#242526] to-black">
                                    <div className="w-24 h-24 rounded-2xl bg-[#1877f2]/10 border border-[#1877f2]/20 flex items-center justify-center mb-4 text-[#1877f2] shadow-inner">
                                        <Music size={44} className="animate-pulse" />
                                    </div>
                                    <p className="text-sm font-bold text-white max-w-[200px] truncate">{playingVideo.title}</p>
                                    <p className="text-[10px] text-slate-400 mt-1 font-semibold">{playingVideo.creatorName}</p>
                                    <audio 
                                        controls 
                                        autoPlay 
                                        src={db.getStreamerUrl(playingVideo.id, user?.sessionToken)} 
                                        className="w-full max-w-[260px] mt-6 accent-[#1877f2]" 
                                    />
                                </div>
                            ) : (
                                <video 
                                    controls 
                                    autoPlay 
                                    src={db.getStreamerUrl(playingVideo.id, user?.sessionToken)} 
                                    className="w-full h-full object-contain"
                                />
                            )}
                        </div>

                        {/* Right Side: Details, Like Action and Facebook Format info */}
                        <div className="w-full md:w-[320px] bg-[#18191a] border-l border-[#3e4042]/50 flex flex-col p-4 justify-between min-h-[250px] md:min-h-0 md:h-[500px]">
                            <div className="flex flex-col gap-3 overflow-y-auto pr-1">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full overflow-hidden bg-slate-800 border border-[#3e4042]">
                                        <img src={playingVideo.creatorAvatarUrl || 'uploads/avatars/default.png'} className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).src = 'uploads/avatars/default.png'; }} />
                                    </div>
                                    <div>
                                        <p className="text-sm font-bold text-white leading-tight">{playingVideo.creatorName}</p>
                                        <p className="text-[10px] text-slate-400 font-semibold">{playingVideo.category || 'GRUPO'}</p>
                                    </div>
                                </div>
                                <div>
                                    <h4 className="text-base font-extrabold text-white leading-snug">{playingVideo.title}</h4>
                                    <p className="text-xs text-slate-300 mt-2 whitespace-pre-wrap leading-relaxed max-h-[160px] overflow-y-auto pr-1">{playingVideo.description || 'Sin descripción.'}</p>
                                </div>
                            </div>

                            <div className="border-t border-[#3e4042] pt-4 mt-4 flex flex-col gap-3">
                                <div className="flex justify-between items-center text-xs text-slate-400">
                                    <span className="font-semibold flex items-center gap-1"><ThumbsUp size={12} className="text-[#1877f2]" /> {playingVideo.likes || 0} Likes</span>
                                    <span className="font-semibold">{playingVideo.comments || 0} Comentarios</span>
                                </div>
                                <div className="flex gap-2">
                                    <button 
                                        onClick={async () => {
                                            try {
                                                await db.rateVideo(user?.id || '', playingVideo.id, 'like');
                                                setPlayingVideo((prev: any) => prev ? { ...prev, likes: (prev.likes || 0) + 1 } : null);
                                                toast.success("¡Reaccionado con me gusta!");
                                            } catch (err) {
                                                toast.error("Error al dar like");
                                            }
                                        }}
                                        className="flex-1 py-2 rounded-lg bg-[#242526] hover:bg-[#323436] text-white text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                                    >
                                        <ThumbsUp size={14} className="text-[#1877f2]" fill="#1877f2" />
                                        <span>Me gusta</span>
                                    </button>
                                    <button 
                                        onClick={() => {
                                            setPlayingVideo(null);
                                            navigate(`/watch/${playingVideo.id}`);
                                        }}
                                        className="flex-1 py-2 rounded-lg bg-[#1877f2] hover:bg-blue-600 text-white text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                                    >
                                        <span>Detalles</span>
                                    </button>
                                </div>
                            </div>
                        </div>
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
    pending?: boolean;
    membersCount: number;
    newPosts: number;
    onClick: (g: any) => void;
    onToggle: (e: React.MouseEvent, n: string) => void;
}

function GroupCard({ group, joined, pending = false, membersCount, newPosts, onClick, onToggle }: GroupCardProps) {
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
                                <span className="text-sm font-extrabold text-[#e4e6eb] flex items-center gap-1">
                                    {group.isPrivate === 1 && <Lock size={12} className="text-amber-500 fill-amber-500/10 flex-shrink-0" />}
                                    {group.name.substring(group.name.lastIndexOf('/') + 1)}
                                </span>
                            </>
                        ) : (
                            <span className="text-sm font-extrabold hover:underline flex items-center gap-1 text-[#e4e6eb]">
                                {group.isPrivate === 1 && <Lock size={12} className="text-amber-500 fill-amber-500/10 flex-shrink-0" />}
                                {group.name}
                            </span>
                        )}
                    </h3>
                    <p className="text-[10px] text-[#b0b3b8] font-semibold mt-1 flex items-center gap-1.5">
                        <Users size={12} className="text-slate-400" />
                        <span>{membersCount} Miembros</span>
                        <span>•</span>
                        <span>{group.count} publicaciones</span>
                        {group.isPrivate === 1 && (
                            <span className="text-amber-500 font-bold bg-amber-500/10 px-1 py-0.5 rounded text-[8px]">Privado</span>
                        )}
                    </p>
                </div>
                
                <button
                    onClick={(e) => onToggle(e, group.name)}
                    className={`w-full py-2 rounded-lg text-xs font-bold transition-all ${
                        joined 
                        ? 'bg-[#3a3b3c] hover:bg-[#4e4f50] text-[#e4e6eb]' 
                        : pending
                        ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20'
                        : 'bg-[#1877f2] hover:bg-blue-600 text-white'
                    }`}
                >
                    {joined ? 'Miembro ✓' : pending ? 'Pendiente ⌛' : 'Unirse al Grupo'}
                </button>
            </div>
        </div>
    );
}
