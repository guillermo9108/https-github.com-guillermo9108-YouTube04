
import React, { useState, useRef, useEffect } from 'react';
import { Sparkles, X, Send, Loader2, Bot, MessageSquare, ArrowDown } from 'lucide-react';
import { aiService } from '../services/ai';
import { Video } from '../types';

interface Message {
    role: 'user' | 'model';
    text: string;
    timestamp: number;
}

export default function AIConcierge({ videos, isVisible }: { videos: Video[], isVisible: boolean }) {
    if (!isVisible) return null;

    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<Message[]>([
        { 
            role: 'model', 
            text: '¡Bienvenido a StreamPay! Soy su conserje personal. ¿En qué puedo asistirle hoy? Puedo recomendarle los mejores estrenos del catálogo.',
            timestamp: Date.now()
        }
    ]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);

    // Auto-scroll al recibir mensajes
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTo({
                top: scrollRef.current.scrollHeight,
                behavior: 'smooth'
            });
        }
    }, [messages, isLoading]);

    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim() || isLoading) return;

        const userMsg = input.trim();
        setInput('');
        setMessages(prev => [...prev, { role: 'user', text: userMsg, timestamp: Date.now() }]);
        setIsLoading(true);

        try {
            const response = await aiService.chatWithConcierge(userMsg, videos);
            setMessages(prev => [...prev, { role: 'model', text: response, timestamp: Date.now() }]);
        } catch (e) {
            setMessages(prev => [...prev, { role: 'model', text: "Mis disculpas, he perdido la conexión con el servidor central.", timestamp: Date.now() }]);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="fixed bottom-24 md:bottom-8 left-4 z-[100] font-sans">
            {!isOpen ? (
                <button 
                    onClick={() => setIsOpen(true)}
                    className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-purple-600 text-white shadow-[0_10px_30px_rgba(79,70,229,0.4)] flex items-center justify-center hover:scale-110 active:scale-95 transition-all duration-300 group border border-white/20"
                >
                    <Sparkles className="group-hover:rotate-12 transition-transform" size={28} />
                    <span className="absolute -top-1 -right-1 flex h-4 w-4">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-4 w-4 bg-indigo-500 border-2 border-black"></span>
                    </span>
                </button>
            ) : (
                <div className="w-[340px] md:w-[400px] h-[550px] bg-slate-900 border border-white/10 rounded-[32px] shadow-[0_20px_60px_rgba(0,0,0,0.6)] flex flex-col overflow-hidden animate-in slide-in-from-bottom-8 fade-in duration-500 backdrop-blur-xl">
                    {/* Header Premium */}
                    <div className="p-5 bg-slate-950/80 border-b border-white/5 flex justify-between items-center backdrop-blur-md">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg border border-white/20">
                                <Bot size={22} className="text-white"/>
                            </div>
                            <div>
                                <h3 className="text-sm font-black text-white uppercase tracking-widest leading-none">Concierge IA</h3>
                                <div className="flex items-center gap-1.5 mt-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                    <p className="text-[9px] text-emerald-500 font-black uppercase tracking-tighter">Asistente en vivo</p>
                                </div>
                            </div>
                        </div>
                        <button 
                            onClick={() => setIsOpen(false)} 
                            className="p-2.5 hover:bg-white/10 rounded-full text-slate-500 hover:text-white transition-all"
                        >
                            <X size={20}/>
                        </button>
                    </div>

                    {/* Chat Body */}
                    <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar bg-gradient-to-b from-slate-900/50 to-slate-950/50">
                        {messages.map((m, i) => (
                            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2`}>
                                <div className={`max-w-[85%] px-4 py-3 rounded-2xl text-[13px] leading-relaxed shadow-sm ${
                                    m.role === 'user' 
                                    ? 'bg-indigo-600 text-white rounded-tr-none' 
                                    : 'bg-slate-800 text-slate-200 border border-white/5 rounded-tl-none'
                                }`}>
                                    {m.text}
                                    <div className={`text-[8px] mt-1.5 opacity-40 font-bold uppercase ${m.role === 'user' ? 'text-right' : 'text-left'}`}>
                                        {new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </div>
                                </div>
                            </div>
                        ))}
                        
                        {isLoading && (
                            <div className="flex justify-start animate-pulse">
                                <div className="bg-slate-800 px-4 py-3 rounded-2xl rounded-tl-none flex items-center gap-3 border border-white/5 shadow-sm">
                                    <div className="flex gap-1">
                                        <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                                        <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                                        <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce"></div>
                                    </div>
                                    <span className="text-[11px] text-slate-400 font-bold uppercase tracking-widest">Consultando catálogo...</span>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Input Area */}
                    <form onSubmit={handleSend} className="p-4 bg-slate-950/90 border-t border-white/5 flex gap-3 items-center">
                        <div className="relative flex-1">
                            <input 
                                type="text" 
                                value={input}
                                onChange={e => setInput(e.target.value)}
                                placeholder="¿Qué películas de acción hay?"
                                className="w-full bg-slate-900 border border-white/10 rounded-2xl px-5 py-3 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20 transition-all shadow-inner"
                                autoComplete="off"
                            />
                            {!input && (
                                <MessageSquare className="absolute right-4 top-3.5 text-slate-700 pointer-events-none" size={16} />
                            )}
                        </div>
                        <button 
                            type="submit"
                            disabled={!input.trim() || isLoading}
                            className="w-12 h-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center disabled:opacity-30 disabled:grayscale transition-all active:scale-90 shadow-[0_5px_15px_rgba(79,70,229,0.3)] hover:bg-indigo-500"
                        >
                            <Send size={20} />
                        </button>
                    </form>
                </div>
            )}
        </div>
    );
}
