import React, { useState, useEffect, useRef } from 'react';
import { ChevronLeft, Send, Image as ImageIcon, MoreVertical, Phone, Video, Info, Loader2, Mic, Paperclip, X, Play, Pause, File as FileIcon, Music, Film, Trash2, Plus, Lock } from 'lucide-react';
import { useNavigate, useParams } from '../Router';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../services/db';
import { ChatMessage, User, Video as VideoType } from '../../types';
import { motion, AnimatePresence } from 'motion/react';

const fixMediaUrl = (url?: string) => {
    if (!url) return '';
    if (url.startsWith('http') || url.startsWith('blob:') || url.startsWith('data:') || url.startsWith('api/') || url.startsWith('/')) return url;
    return 'api/' + url;
};

const SharedMediaItem: React.FC<{ 
    type: 'VIDEO' | 'AUDIO', 
    url: string, 
    videoId?: string,
    user: User | null,
    onNavigate: (path: string) => void
}> = ({ type, url, videoId, user, onNavigate }) => {
    const [isUnlocked, setIsUnlocked] = useState(false);
    const [isLoaded, setIsLoaded] = useState(false); // Lazy loading
    const [isValidating, setIsValidating] = useState(!!videoId);
    const [videoData, setVideoData] = useState<VideoType | null>(null);

    useEffect(() => {
        if (!videoId || !user) {
            setIsUnlocked(true);
            setIsValidating(false);
            return;
        }

        const checkAccess = async () => {
            try {
                const v = await db.getVideo(videoId);
                if (!v) { setIsUnlocked(true); return; }
                setVideoData(v);

                const res = await db.hasPurchased(user.id, videoId);
                const access = res;
                const isVipActive = !!(user.vipExpiry && user.vipExpiry > Date.now() / 1000);
                const isOwner = user.id === v.creatorId;
                const isAdmin = user.role === 'ADMIN';

                setIsUnlocked(Boolean(access || isAdmin || isVipActive || isOwner || v.price === 0));
            } catch (e) {
                setIsUnlocked(true); 
            } finally {
                setIsValidating(false);
            }
        };

        checkAccess();
    }, [videoId, user?.id, user?.vipExpiry, user?.role]);

    if (isValidating) return (
        <div className="w-full h-24 bg-slate-800/30 animate-pulse rounded-xl flex items-center justify-center">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Validando...</p>
        </div>
    );

    if (!isUnlocked && videoData) {
        return (
            <div className="p-4 bg-slate-950 border border-white/10 rounded-[20px] flex flex-col items-center gap-3 text-center shadow-xl">
                <Lock className="text-indigo-500" size={20} />
                <div>
                    <h4 className="text-[10px] font-black text-white uppercase tracking-tight truncate max-w-[120px]">{videoData.title}</h4>
                    <p className="text-[8px] text-indigo-400 font-bold uppercase mt-0.5 tracking-widest">${videoData.price}</p>
                </div>
                <button 
                    onClick={() => onNavigate(`/watch/${videoId}`)}
                    className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-[9px] font-black uppercase rounded-xl transition-all shadow-lg active:scale-95"
                >
                    Pagar
                </button>
            </div>
        );
    }

    const vidUrl = videoId ? db.getStreamerUrl(videoId) : fixMediaUrl(url); 

    if (!isLoaded) {
        return (
            <div 
                onClick={() => setIsLoaded(true)}
                className="w-full h-40 bg-slate-900 border border-white/5 rounded-2xl flex flex-col items-center justify-center gap-2 cursor-pointer hover:bg-slate-800 transition-all group overflow-hidden relative shadow-lg"
            >
                {videoData?.thumbnailUrl && (
                    <img 
                        src={fixMediaUrl(videoData.thumbnailUrl)} 
                        className="absolute inset-0 w-full h-full object-cover opacity-40 group-hover:scale-110 transition-transform duration-500" 
                        referrerPolicy="no-referrer"
                    />
                )}
                <div className="z-10 w-12 h-12 rounded-full bg-indigo-600 flex items-center justify-center shadow-indigo-500/50 shadow-xl group-hover:scale-110 group-active:scale-95 transition-all">
                    {type === 'VIDEO' ? <Play className="text-white fill-white ml-0.5" size={24} /> : <Music className="text-white" size={24} />}
                </div>
                <p className="z-10 text-[10px] font-black uppercase tracking-[0.2em] text-white drop-shadow-md">
                    {type === 'VIDEO' ? 'Reproducir Video' : 'Escuchar Audio'}
                </p>
                {type === 'VIDEO' && videoData?.duration && (
                    <div className="absolute bottom-3 right-3 px-2 py-0.5 bg-black/80 rounded-md text-[9px] font-bold text-white z-10">
                        {Math.floor(videoData.duration / 60)}:{(videoData.duration % 60).toString().padStart(2, '0')}
                    </div>
                )}
            </div>
        );
    }

    if (type === 'VIDEO') {
        return (
            <div className="w-full bg-black rounded-2xl overflow-hidden border border-white/5 shadow-2xl group relative">
                <video src={vidUrl} className="w-full aspect-video object-contain" controls autoPlay preload="auto" />
            </div>
        );
    } else {
        return (
            <div className="w-full bg-slate-900 p-2 rounded-2xl border border-white/5 shadow-xl">
                <audio src={vidUrl} className="w-full" controls autoPlay preload="auto" />
            </div>
        );
    }
};

export default function ChatDetailPage() {
    const { id: otherId } = useParams();
    const navigate = useNavigate();
    const { user, socket, onlineUserIds } = useAuth();
    const [otherUser, setOtherUser] = useState<User | null>(null);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [inputText, setInputText] = useState('');
    const [loading, setLoading] = useState(true);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [offset, setOffset] = useState(0);
    const [hasMore, setHasMore] = useState(true);
    const limit = 20;
    const [isUploading, setIsUploading] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [recordingTime, setRecordingTime] = useState(0);
    const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
    const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
    const [audioStream, setAudioStream] = useState<MediaStream | null>(null);
    const timerRef = useRef<any>(null);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (user && otherId) {
            loadChatData(true);
        }
    }, [user?.id, otherId]);

    // Safety Polling Fallback Every 15s when active/visible
    useEffect(() => {
        let interval: number | null = null;
        if (user && otherId) {
            interval = window.setInterval(() => {
                if (document.visibilityState === 'visible') {
                    syncNewMessages();
                }
            }, 15000);
        }
        return () => { if (interval) clearInterval(interval); };
    }, [user?.id, otherId]);

    const syncNewMessages = async () => {
        if (!user || !otherId) return;
        try {
            // Fetch only most recent page to see if anything is new
            const msgData = await db.getMessages(user.id, otherId, limit, 0);
            setMessages(prev => {
                const existingIds = new Set(prev.map(m => String(m.id)));
                const newMessages = msgData.filter(m => !existingIds.has(String(m.id)));
                if (newMessages.length === 0) return prev;
                return [...prev, ...newMessages].sort((a,b) => (a.timestamp || 0) - (b.timestamp || 0));
            });
        } catch(e){}
    };

    useEffect(() => {
        if (socket) {
            const handleMessage = (event: MessageEvent) => {
                try {
                    const data = JSON.parse(event.data);
                    if (data.type === 'CHAT_MESSAGE') {
                        const msg = data.payload;
                        const msgSenderId = String(msg.senderId || msg.sender_id || "");
                        const msgReceiverId = String(msg.receiverId || msg.receiver_id || "");
                        
                        // Check if message belongs to this conversation
                        const isFromOther = msgSenderId === String(otherId);
                        const isFromMeToOther = msgSenderId === String(user?.id) && msgReceiverId === String(otherId);
                        
                        if (isFromOther || isFromMeToOther) {
                            setMessages(prev => {
                                if (prev.some(m => String(m.id) === String(msg.id))) return prev;
                                // Add and ensure order
                                return [...prev, msg].sort((a,b) => (a.timestamp || 0) - (b.timestamp || 0));
                            });
                        }
                    }
                    if (data.type === 'USER_STATUS' && String(data.payload.userId) === String(otherId)) {
                        const isOnline = data.payload.status === 'online';
                        setOtherUser(prev => prev ? ({ 
                            ...prev, 
                            lastActive: isOnline ? Math.floor(Date.now() / 1000) : (prev.lastActive || 0),
                            isOnline
                        }) : null);
                    }
                } catch (e) {}
            };
            socket.addEventListener('message', handleMessage);
            return () => socket.removeEventListener('message', handleMessage);
        }
    }, [socket, otherId, user?.id]);

    useEffect(() => {
        if (offset === 0) scrollToBottom();
    }, [messages, offset]);

    const loadChatData = async (initial: boolean = false) => {
        if (!user || !otherId) return;
        if (initial) setLoading(true);
        else setIsLoadingMore(true);

        try {
            const currentOffset = initial ? 0 : offset;
            const [userData, msgData] = await Promise.all([
                initial ? db.getUser(otherId) : Promise.resolve(otherUser),
                db.getMessages(user.id, otherId, limit, currentOffset)
            ]);

            if (initial && userData) {
                userData.isOnline = onlineUserIds.has(String(otherId));
                setOtherUser(userData);
            }

            if (initial) {
                setMessages(msgData);
                setOffset(msgData.length);
            } else {
                setMessages(prev => {
                    const existingIds = new Set(prev.map(m => String(m.id)));
                    const filtered = msgData.filter(m => !existingIds.has(String(m.id)));
                    return [...filtered, ...prev].sort((a,b) => (a.timestamp || 0) - (b.timestamp || 0));
                });
                setOffset(prev => prev + msgData.length);
            }

            setHasMore(msgData.length === limit);
        } catch (error) {
            console.error("Error loading chat data", error);
        } finally {
            setLoading(false);
            setIsLoadingMore(false);
        }
    };

    const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
        const top = e.currentTarget.scrollTop;
        if (top < 50 && !isLoadingMore && hasMore && !loading) {
            loadChatData(false);
        }
    };

    useEffect(() => {
        if (otherUser && onlineUserIds.has(String(otherId))) {
            setOtherUser(prev => prev && !prev.isOnline ? { ...prev, isOnline: true } : prev);
        } else if (otherUser && !onlineUserIds.has(String(otherId))) {
            setOtherUser(prev => prev && prev.isOnline ? { ...prev, isOnline: false } : prev);
        }
    }, [onlineUserIds, otherId]);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    const handleSendMessage = async (e?: React.FormEvent, mediaData?: { url: string, type: 'IMAGE' | 'VIDEO' | 'AUDIO' | 'FILE' }) => {
        e?.preventDefault();
        if (!inputText.trim() && !mediaData && !audioBlob) return;
        if (!user || !otherId) return;

        const text = inputText.trim();
        setInputText('');

        try {
            let finalMedia = mediaData;

            // Handle pending audio blob if it exists and we're clicking send
            if (audioBlob && !mediaData) {
                const audioFile = new File([audioBlob], `recording_${Date.now()}.webm`, { type: 'audio/webm' });
                await uploadFile(audioFile, 'AUDIO');
                setAudioBlob(null);
                return; // uploadFile calls handleSendMessage again
            }

            const sendData: any = {
                userId: user.id,
                receiverId: otherId,
                text,
                mediaType: finalMedia?.type
            };

            if (finalMedia) {
                if (finalMedia.type === 'IMAGE') sendData.imageUrl = finalMedia.url;
                else if (finalMedia.type === 'VIDEO') sendData.videoUrl = finalMedia.url;
                else if (finalMedia.type === 'AUDIO') sendData.audioUrl = finalMedia.url;
                else sendData.fileUrl = finalMedia.url;
            }

            const newMsg = await db.sendMessage(sendData);
            setMessages(prev => [...prev, newMsg]);

            if (socket && socket.readyState === WebSocket.OPEN) {
                socket.send(JSON.stringify({
                    type: 'CHAT_MESSAGE',
                    payload: newMsg
                }));
            }
        } catch (error) {
            console.error("Error sending message", error);
        }
    };

    const uploadFile = async (file: File, explicitType?: 'IMAGE' | 'VIDEO' | 'AUDIO' | 'FILE') => {
        if (!user || !otherId) return;
        setIsUploading(true);
        try {
            let type: 'IMAGE' | 'VIDEO' | 'AUDIO' | 'FILE' = explicitType || 'FILE';
            if (!explicitType) {
                if (file.type.startsWith('image/')) type = 'IMAGE';
                else if (file.type.startsWith('video/')) type = 'VIDEO';
                else if (file.type.startsWith('audio/')) type = 'AUDIO';
            }

            const formData = new FormData();
            formData.append('video', file);
            formData.append('userId', user.id);
            formData.append('title', `Chat ${type} ${Date.now()}`);
            formData.append('description', 'Chat attachment');
            formData.append('category', type === 'IMAGE' ? 'IMAGES' : 'GENERAL');
            formData.append('is_private', '1');

            const res: any = await db.request('action=upload_video', {
                method: 'POST',
                body: formData
            });

            if (res.url) {
                let finalUrl = res.url;
                if (!finalUrl.startsWith('http') && !finalUrl.startsWith('api/')) {
                    finalUrl = 'api/' + finalUrl;
                }
                await handleSendMessage(undefined, { url: finalUrl, type });
            }
        } catch (error) {
            console.error("Error uploading chat file", error);
        } finally {
            setIsUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) await uploadFile(file);
    };

    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const recorder = new MediaRecorder(stream);
            const chunks: Blob[] = [];

            recorder.ondataavailable = (e) => chunks.push(e.data);
            recorder.onstop = () => {
                const blob = new Blob(chunks, { type: 'audio/webm' });
                setAudioBlob(blob);
                stream.getTracks().forEach(track => track.stop());
            };

            recorder.start();
            setMediaRecorder(recorder);
            setAudioStream(stream);
            setIsRecording(true);
            setRecordingTime(0);
            timerRef.current = setInterval(() => {
                setRecordingTime(prev => prev + 1);
            }, 1000);
        } catch (err) {
            console.error("Error accessing microphone", err);
            alert("No se pudo acceder al micrófono.");
        }
    };

    const stopRecording = () => {
        if (mediaRecorder && isRecording) {
            mediaRecorder.stop();
            setIsRecording(false);
            clearInterval(timerRef.current);
        }
    };

    const cancelRecording = () => {
        if (mediaRecorder && isRecording) {
            mediaRecorder.stop();
            setIsRecording(false);
            clearInterval(timerRef.current);
            setAudioBlob(null);
        }
    };

    const formatDuration = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const formatTime = (timestamp: number) => {
        return new Date(timestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    const renderMessageContent = (msg: ChatMessage) => {
        switch (msg.mediaType) {
            case 'IMAGE':
                const imgUrl = fixMediaUrl(msg.imageUrl);
                return (
                    <div className="flex flex-col gap-2">
                        <img 
                            src={imgUrl} 
                            className="max-w-full rounded-lg cursor-pointer hover:opacity-90 transition-opacity" 
                            alt="Attached"
                            referrerPolicy="no-referrer"
                            onClick={() => window.open(imgUrl, '_blank')}
                        />
                        {msg.text && <span>{msg.text}</span>}
                    </div>
                );
            case 'VIDEO':
                const vidUrl = fixMediaUrl(msg.videoUrl);
                return (
                    <div className="flex flex-col gap-2 min-w-[200px]">
                        <SharedMediaItem type="VIDEO" url={vidUrl} videoId={msg.videoId} user={user} onNavigate={navigate} />
                        {msg.text && <span className="text-xs px-1">{msg.text}</span>}
                    </div>
                );
            case 'AUDIO':
                const audUrl = fixMediaUrl(msg.audioUrl);
                return (
                    <div className="flex flex-col gap-2 min-w-[200px]">
                        <SharedMediaItem type="AUDIO" url={audUrl} videoId={msg.videoId} user={user} onNavigate={navigate} />
                        {msg.text && <span className="text-xs px-1">{msg.text}</span>}
                    </div>
                );
            case 'FILE':
                const flUrl = fixMediaUrl(msg.fileUrl);
                return (
                    <div 
                        onClick={() => window.open(flUrl, '_blank')}
                        className="flex items-center gap-3 p-2 bg-white/10 rounded-lg cursor-pointer hover:bg-white/20 transition-colors"
                    >
                        <div className="w-10 h-10 rounded bg-[var(--accent)] flex items-center justify-center text-white">
                            <FileIcon size={20} />
                        </div>
                        <div className="flex-1 overflow-hidden">
                            <p className="text-xs font-bold truncate">Archivo adjunto</p>
                            <p className="text-[10px] opacity-70 uppercase">Descargar</p>
                        </div>
                    </div>
                );
            default:
                const legacyImgUrl = fixMediaUrl(msg.imageUrl);
                return (
                    <>
                        {msg.imageUrl && (
                             <img 
                                src={legacyImgUrl} 
                                className="max-w-full rounded-lg mb-2" 
                                alt="Legacy attachment" 
                                referrerPolicy="no-referrer"
                            />
                        )}
                        <span>{msg.text}</span>
                    </>
                );
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center">
                <Loader2 className="animate-spin text-[var(--accent)]" size={40} />
            </div>
        );
    }

    return (
        <div className="flex flex-col h-screen bg-[var(--bg-primary)] text-[var(--text-primary)]">
            {/* Header */}
            <header className="fixed top-0 left-0 right-0 z-50 bg-[var(--bg-secondary)] border-b border-[var(--divider)] shadow-sm h-14 flex items-center px-2">
                <button
                    onClick={() => navigate('/chat')}
                    className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-[var(--bg-tertiary)] transition-colors"
                >
                    <ChevronLeft size={24} />
                </button>
                <div 
                    className="flex-1 flex items-center gap-2 ml-1 cursor-pointer"
                    onClick={() => navigate(`/profile/${otherId}`)}
                >
                    <div className="relative">
                        <img
                            src={otherUser?.avatarUrl || 'https://picsum.photos/seed/avatar/100/100'}
                            className="w-9 h-9 rounded-full object-cover border border-[var(--divider)]"
                            alt={otherUser?.username}
                            referrerPolicy="no-referrer"
                        />
                        {otherUser?.lastActive && (Date.now() / 1000 - otherUser.lastActive < 300) && (
                            <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 border-2 border-[var(--bg-secondary)] rounded-full" />
                        )}
                    </div>
                    <div className="flex flex-col overflow-hidden">
                        <h1 className="text-sm font-bold truncate tracking-tight leading-none">{otherUser?.username}</h1>
                        <p className={`text-[10px] font-bold uppercase mt-0.5 ${
                            (otherUser as any)?.isOnline || (otherUser?.lastActive && (Date.now() / 1000 - otherUser.lastActive < 300))
                            ? 'text-green-500'
                            : 'text-gray-500'
                        }`}>
                            {(otherUser as any)?.isOnline || (otherUser?.lastActive && (Date.now() / 1000 - otherUser.lastActive < 300)) ? 'En línea' : 'Desconectado'}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-1">
                    <button className="w-9 h-9 rounded-full flex items-center justify-center text-[var(--accent)] hover:bg-[var(--bg-tertiary)] transition-colors"><Phone size={18} /></button>
                    <button className="w-9 h-9 rounded-full flex items-center justify-center text-[var(--accent)] hover:bg-[var(--bg-tertiary)] transition-colors"><Video size={18} /></button>
                    <button className="w-9 h-9 rounded-full flex items-center justify-center text-[var(--accent)] hover:bg-[var(--bg-tertiary)] transition-colors"><Info size={18} /></button>
                </div>
            </header>

            {/* Messages Area */}
            <div 
                onScroll={handleScroll}
                className="flex-1 overflow-y-auto pt-20 pb-4 px-2 space-y-2 scrollbar-hide"
            >
                {hasMore && (
                    <div className="py-4 text-center">
                        {isLoadingMore ? (
                            <Loader2 className="animate-spin text-[var(--accent)] mx-auto" size={20} />
                        ) : (
                            <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Desliza hacia arriba para ver más</p>
                        )}
                    </div>
                )}
                
                <div className="flex flex-col items-center py-4 opacity-70">
                    <img src={otherUser?.avatarUrl} className="w-20 h-20 rounded-full mb-2 border-2 border-[var(--divider)] shadow-sm" referrerPolicy="no-referrer" />
                    <h2 className="text-lg font-bold tracking-tight">{otherUser?.username}</h2>
                    <p className="text-[10px] uppercase font-black tracking-widest text-[var(--accent)] bg-[var(--accent)]/10 px-2 py-0.5 rounded-full">Amigo en StreamPay</p>
                </div>

                <AnimatePresence initial={false}>
                    {messages.map((msg, index) => {
                        const isMe = msg.senderId === user?.id;
                        const showAvatar = !isMe && (index === messages.length - 1 || messages[index + 1].senderId !== msg.senderId);
                        
                        return (
                            <motion.div
                                key={msg.id}
                                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                className={`flex items-end ${isMe ? 'justify-end' : 'justify-start gap-1'}`}
                            >
                                {!isMe && (
                                    <div className="w-7 h-7 shrink-0 mb-5">
                                        {showAvatar && (
                                            <img src={otherUser?.avatarUrl} className="w-full h-full rounded-full object-cover border border-[var(--divider)]" referrerPolicy="no-referrer" />
                                        )}
                                    </div>
                                )}
                                <div className={`max-w-[85%] flex flex-col ${isMe ? 'items-end ml-1' : 'items-start mr-1'}`}>
                                    <div className={`px-3 py-2 rounded-[24px] text-[14px] shadow-sm relative ${
                                        isMe 
                                        ? 'bg-[var(--accent)] text-white rounded-br-none ml-2' 
                                        : 'bg-[var(--bg-tertiary)] text-[var(--text-primary)] rounded-bl-none border border-[var(--divider)] mr-2'
                                    }`}>
                                        {renderMessageContent(msg)}
                                    </div>
                                    <span className="text-[9px] font-bold opacity-50 mt-1 px-1">{formatTime(msg.timestamp)}</span>
                                </div>
                            </motion.div>
                        );
                    })}
                </AnimatePresence>
                <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="p-2 bg-[var(--bg-secondary)] border-t border-[var(--divider)] pb-safe">
                {audioBlob && !isRecording && (
                    <div className="mb-2 p-2 bg-[var(--bg-tertiary)] rounded-xl flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2 border border-[var(--divider)]">
                        <div className="w-8 h-8 rounded-full bg-red-500 flex items-center justify-center text-white shrink-0">
                            <Music size={16} />
                        </div>
                        <div className="flex-1">
                            <p className="text-[10px] font-bold uppercase tracking-tight">Voz grabada</p>
                            <audio src={URL.createObjectURL(audioBlob)} controls className="h-6 mt-1 w-full" />
                        </div>
                        <button onClick={() => setAudioBlob(null)} className="text-red-400 p-2 hover:bg-red-400/10 rounded-full transition-colors"><Trash2 size={18} /></button>
                    </div>
                )}

                <div className="flex items-center gap-1.5 max-w-4xl mx-auto">
                    {isRecording ? (
                        <div className="flex-1 flex items-center h-10 bg-red-500/10 rounded-full px-4 text-red-500 gap-3 border border-red-500/20">
                            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                            <span className="flex-1 text-sm font-bold font-mono">{formatDuration(recordingTime)}</span>
                            <button onClick={cancelRecording} className="text-red-500 px-2 font-bold text-xs uppercase hover:bg-red-500/10 rounded-full py-1">Cancelar</button>
                            <button onClick={stopRecording} className="bg-red-500 text-white rounded-full p-2.5 shadow-lg active:scale-90 transition-transform"><Mic size={18} /></button>
                        </div>
                    ) : (
                        <>
                            <div className="flex items-center">
                                <button 
                                    onClick={() => fileInputRef.current?.click()}
                                    className="w-9 h-9 flex items-center justify-center rounded-full text-[var(--accent)] hover:bg-[var(--bg-tertiary)] transition-colors"
                                    title="Adjuntar"
                                >
                                    <Plus size={24} />
                                </button>
                                <input 
                                    type="file" 
                                    ref={fileInputRef} 
                                    onChange={handleFileChange} 
                                    className="hidden" 
                                    accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
                                />
                            </div>
                            
                            <div className="flex-1 bg-[var(--bg-tertiary)] rounded-full flex items-center px-4 border border-[var(--divider)] group focus-within:border-[var(--accent)] transition-all min-h-[40px]">
                                <input 
                                    type="text" 
                                    value={inputText}
                                    onChange={(e) => setInputText(e.target.value)}
                                    placeholder="Mensaje..."
                                    className="flex-1 bg-transparent text-sm focus:outline-none py-2"
                                    onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                                />
                            </div>

                            {inputText.trim() || audioBlob ? (
                                <button 
                                    onClick={() => handleSendMessage()}
                                    className="w-10 h-10 bg-[var(--accent)] text-white rounded-full flex items-center justify-center shadow-md transform active:scale-95 transition-all shrink-0"
                                >
                                    <Send size={18} className="translate-x-0.5 -translate-y-0.5" />
                                </button>
                            ) : (
                                <button 
                                    onClick={startRecording}
                                    className="w-10 h-10 text-[var(--accent)] flex items-center justify-center rounded-full hover:bg-[var(--bg-tertiary)] transition-colors shrink-0"
                                    title="Grabar voz"
                                >
                                    <Mic size={22} />
                                </button>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
