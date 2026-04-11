import React, { useState } from 'react';
import { useNavigate } from '../Router';
import { ArrowLeft, Search, ChevronRight, HelpCircle, MessageCircle, FileText, Shield, ExternalLink, Mail, Phone } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

const HelpPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const faqs = [
    {
      id: '1',
      category: 'Cuenta',
      question: '¿Cómo cambio mi contraseña?',
      answer: 'Puedes cambiar tu contraseña desde la sección de Configuración en tu perfil.'
    },
    {
      id: '2',
      category: 'Pagos',
      question: '¿Cuánto tiempo tarda en acreditarse mi recarga?',
      answer: 'Las recargas manuales suelen tardar entre 15 minutos y 2 horas en ser verificadas por un administrador.'
    },
    {
      id: '3',
      category: 'Contenido',
      question: '¿Cómo puedo subir mis propios videos?',
      answer: 'Debes solicitar ser un creador verificado desde el panel de configuración para poder subir contenido.'
    },
    {
      id: '4',
      category: 'Seguridad',
      question: '¿Es seguro comprar en el Marketplace?',
      answer: 'Sí, utilizamos un sistema de protección al comprador. El dinero se libera al vendedor una vez que confirmas la recepción.'
    }
  ];

  const categories = [
    { id: 'cuenta', name: 'Mi Cuenta', icon: HelpCircle },
    { id: 'pagos', name: 'Pagos y Saldo', icon: MessageCircle },
    { id: 'videos', name: 'Videos y Shorts', icon: FileText },
    { id: 'seguridad', name: 'Privacidad y Seguridad', icon: Shield },
  ];

  const filteredFaqs = faqs.filter(faq => 
    faq.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
    faq.answer.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)] pb-20">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-[var(--bg-secondary)] border-b border-[var(--divider)] px-4 py-3 flex items-center gap-4">
        <button onClick={() => navigate(-1)} className="p-1 hover:bg-[var(--hover-overlay)] rounded-full transition-colors">
          <ArrowLeft className="w-6 h-6" />
        </button>
        <h1 className="text-xl font-bold">Ayuda y Soporte</h1>
      </header>

      <main className="p-4 max-w-md mx-auto space-y-8">
        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--text-secondary)]" />
          <input
            type="text"
            placeholder="¿En qué podemos ayudarte?"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[var(--bg-secondary)] border border-[var(--divider)] rounded-2xl py-4 pl-12 pr-4 focus:outline-none focus:border-blue-500 transition-colors shadow-sm"
          />
        </div>

        {/* Categories Grid */}
        <div className="grid grid-cols-2 gap-4">
          {categories.map((cat) => (
            <button
              key={cat.id}
              className="bg-[var(--bg-secondary)] p-4 rounded-2xl border border-[var(--divider)] flex flex-col items-center gap-3 hover:bg-[var(--hover-overlay)] transition-all"
            >
              <div className="w-12 h-12 bg-blue-500/10 rounded-full flex items-center justify-center">
                <cat.icon className="w-6 h-6 text-blue-500" />
              </div>
              <span className="font-bold text-sm">{cat.name}</span>
            </button>
          ))}
        </div>

        {/* FAQs */}
        <div className="space-y-4">
          <h3 className="font-bold text-lg px-1">Preguntas Frecuentes</h3>
          <div className="space-y-2">
            {filteredFaqs.map((faq) => (
              <details
                key={faq.id}
                className="group bg-[var(--bg-secondary)] rounded-2xl border border-[var(--divider)] overflow-hidden"
              >
                <summary className="flex items-center justify-between p-4 cursor-pointer list-none">
                  <span className="font-medium pr-4">{faq.question}</span>
                  <ChevronRight className="w-5 h-5 text-[var(--text-secondary)] group-open:rotate-90 transition-transform" />
                </summary>
                <div className="px-4 pb-4 text-[var(--text-secondary)] text-sm leading-relaxed border-t border-[var(--divider)] pt-4">
                  {faq.answer}
                </div>
              </details>
            ))}
          </div>
        </div>

        {/* Contact Support */}
        <div className="bg-gradient-to-br from-blue-600 to-blue-800 rounded-2xl p-6 text-white shadow-xl shadow-blue-600/20">
          <h3 className="text-xl font-bold mb-2">¿Aún necesitas ayuda?</h3>
          <p className="text-blue-100 text-sm mb-6">Nuestro equipo de soporte está disponible 24/7 para asistirte.</p>
          
          <div className="space-y-3">
            <button className="w-full bg-white text-blue-700 font-bold py-3 rounded-xl flex items-center justify-center gap-2 hover:bg-blue-50 transition-colors">
              <MessageCircle className="w-5 h-5" />
              Chat en Vivo
            </button>
            <div className="flex gap-2">
              <button className="flex-1 bg-blue-500/20 border border-blue-400/30 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 hover:bg-blue-500/30 transition-colors">
                <Mail className="w-5 h-5" />
                Email
              </button>
              <button className="flex-1 bg-blue-500/20 border border-blue-400/30 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 hover:bg-blue-500/30 transition-colors">
                <Phone className="w-5 h-5" />
                Llamar
              </button>
            </div>
          </div>
        </div>

        {/* Legal Links */}
        <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 py-4">
          <button className="text-xs text-[var(--text-secondary)] hover:text-blue-500 flex items-center gap-1">
            Términos de Servicio <ExternalLink className="w-3 h-3" />
          </button>
          <button className="text-xs text-[var(--text-secondary)] hover:text-blue-500 flex items-center gap-1">
            Política de Privacidad <ExternalLink className="w-3 h-3" />
          </button>
          <button className="text-xs text-[var(--text-secondary)] hover:text-blue-500 flex items-center gap-1">
            Cookies <ExternalLink className="w-3 h-3" />
          </button>
        </div>
      </main>
    </div>
  );
};

export default HelpPage;
