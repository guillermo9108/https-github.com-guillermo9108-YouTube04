import React, { useState, useEffect, useRef } from 'react';
import { ChevronLeft, Send, Image as ImageIcon, MoreVertical, Phone, Video, Info, Loader2, Mic, Paperclip, X, Play, Pause, File as FileIcon, Music, Film, Trash2, Plus } from 'lucide-react';
import { useNavigate, useParams } from '../Router';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../services/db';
import { ChatMessage, User } from '../../types';
import { motion, AnimatePresence } from 'motion/react';

export default function ChatDetailPage() {
    const { id: otherId } = useParams();
    const navigate = useNavigate();
    const { user, socket } = useAuth();
    const [otherUser, setOtherUser] = useState<User | null>(null);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [inputText, setInputText] = useState('');
    const [loading, setLoading] = useState(true);
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
            loadChatData();
        }
    }, [user, otherId]);

    useEffect(() => {
        if (socket) {
            const handleMessage = (event: MessageEvent) => {
                try {
                    const data = JSON.parse(event.data);
                    if (data.type === 'CHAT_MESSAGE' && data.payload.senderId === otherId) {
                        setMessages(prev => [...prev, data.payload]);
                    }
                } catch (e) {}
            };
            socket.addEventListener('message', handleMessage);
            return () => socket.removeEventListener('message', handleMessage);
        }
    }, [socket, otherId]);

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const loadChatData = async () => {
        try {
            const [userData, msgData] = await Promise.all([
                db.getUser(otherId!),
                db.getMessages(user!.id, otherId!)
            ]);
            setOtherUser(userData);
            setMessages(msgData);
        } catch (error) {
            console.error("Error loading chat data", error);
        } finally {
            setLoading(false);
        }
    };

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

    const fixMediaUrl = (url?: string) => {
        if (!url) return '';
        if (url.startsWith('http') || url.startsWith('blob:') || url.startsWith('data:') || url.startsWith('api/')) return url;
        return 'api/' + url;
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
                    <div className="flex flex-col gap-2">
                        <div className="relative group rounded-lg overflow-hidden bg-black aspect-video flex items-center justify-center">
                            <video 
                                src={vidUrl} 
                                className="w-full h-full max-h-[300px] object-contain" 
                                controls 
                            />
                        </div>
                        {msg.text && <span>{msg.text}</span>}
                    </div>
                );
            case 'AUDIO':
                const audUrl = fixMediaUrl(msg.audioUrl);
                return (
                    <div className="flex flex-col gap-2 min-w-[200px]">
                        <audio controls className="w-full h-8" src={audUrl} />
                        {msg.text && <span>{msg.text}</span>}
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
                        <p className="text-[10px] font-bold text-green-500 uppercase mt-0.5">
                                {otherUser?.lastActive && (Date.now() / 1000 - otherUser.lastActive < 300) ? 'En línea' : 'Desconectado'}
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
            <div className="flex-1 overflow-y-auto pt-20 pb-4 px-4 space-y-4 scrollbar-hide">
                <div className="flex flex-col items-center py-4 opacity-70">
                    <img src={otherUser?.avatarUrl} className="w-20 h-20 rounded-full mb-2" referrerPolicy="no-referrer" />
                    <h2 className="text-lg font-bold">{otherUser?.username}</h2>
                    <p className="text-xs uppercase font-black tracking-widest text-[var(--accent)]">Amigo en StreamPay</p>
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
                                className={`flex ${isMe ? 'justify-end' : 'justify-start items-end gap-2'}`}
                            >
                                {!isMe && (
                                    <div className="w-7 h-7 shrink-0">
                                        {showAvatar && (
                                            <img src={otherUser?.avatarUrl} className="w-full h-full rounded-full object-cover" referrerPolicy="no-referrer" />
                                        )}
                                    </div>
                                )}
                                <div className={`max-w-[80%] flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                                    <div className={`px-3 py-2 rounded-2xl text-[14px] shadow-sm ${
                                        isMe ? 'bg-[var(--accent)] text-white rounded-br-sm' : 'bg-[var(--bg-tertiary)] rounded-bl-sm border border-[var(--divider)]'
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
            <div className="p-3 bg-[var(--bg-secondary)] border-t border-[var(--divider)] pb-safe">
                {audioBlob && !isRecording && (
                    <div className="mb-3 p-2 bg-[var(--bg-tertiary)] rounded-xl flex items-center gap-3 animate-in fade-in slide-in-from-bottom-2">
                        <div className="w-8 h-8 rounded-full bg-red-500 flex items-center justify-center text-white">
                            <Music size={16} />
                        </div>
                        <div className="flex-1">
                            <p className="text-xs font-bold">Audio grabado</p>
                            <audio src={URL.createObjectURL(audioBlob)} controls className="h-6 mt-1 w-full" />
                        </div>
                        <button onClick={() => setAudioBlob(null)} className="text-red-400 p-2"><Trash2 size={18} /></button>
                    </div>
                )}

                <div className="flex items-center gap-2 max-w-4xl mx-auto">
                    {isRecording ? (
                        <div className="flex-1 flex items-center h-10 bg-red-500/10 rounded-full px-4 text-red-500 gap-3 border border-red-500/20">
                            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                            <span className="flex-1 text-sm font-bold font-mono">{formatDuration(recordingTime)}</span>
                            <button onClick={cancelRecording} className="text-red-500 px-2 font-bold text-xs uppercase">Cancelar</button>
                            <button onClick={stopRecording} className="bg-red-500 text-white rounded-full p-1.5"><Mic size={16} /></button>
                        </div>
                    ) : (
                        <>
                            <div className="flex items-center">
                                <button 
                                    onClick={() => fileInputRef.current?.click()}
                                    className="w-10 h-10 flex items-center justify-center rounded-full text-[var(--accent)] hover:bg-[var(--bg-tertiary)] transition-colors"
                                >
                                    <Plus size={22} className="rotate-45" />
                                </button>
                                <input 
                                    type="file" 
                                    ref={fileInputRef} 
                                    onChange={handleFileChange} 
                                    className="hidden" 
                                    accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
                                />
                                <button className="w-10 h-10 flex items-center justify-center rounded-full text-[var(--accent)] hover:bg-[var(--bg-tertiary)] transition-colors"><Video size={20} /></button>
                                <button 
                                    onClick={() => fileInputRef.current?.click()}
                                    className="w-10 h-10 flex items-center justify-center rounded-full text-[var(--accent)] hover:bg-[var(--bg-tertiary)] transition-colors"
                                >
                                    <ImageIcon size={20} />
                                </button>
                            </div>
                            
                            <div className="flex-1 bg-[var(--bg-tertiary)] rounded-full flex items-center px-4 border border-[var(--divider)] group focus-within:border-[var(--accent)] transition-colors">
                                <input 
                                    type="text" 
                                    value={inputText}
                                    onChange={(e) => setInputText(e.target.value)}
                                    placeholder="Aa"
                                    className="flex-1 h-10 bg-transparent text-sm focus:outline-none"
                                    onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                                />
                                <button className="text-[var(--accent)]"><Plus size={18} /></button>
                            </div>

                            {inputText.trim() || audioBlob ? (
                                <button 
                                    onClick={() => handleSendMessage()}
                                    className="w-10 h-10 bg-[var(--accent)] text-white rounded-full flex items-center justify-center shadow-lg transform active:scale-95 transition-all"
                                >
                                    <Send size={18} className="-mr-0.5 mt-0.5" />
                                </button>
                            ) : (
                                <button 
                                    onClick={startRecording}
                                    className="w-10 h-10 text-[var(--accent)] flex items-center justify-center rounded-full hover:bg-[var(--bg-tertiary)] transition-colors"
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
