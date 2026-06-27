import { GoogleGenAI, GenerateContentResponse, Type } from "@google/genai";
import { Video } from "../types";

/**
 * Servicio de Inteligencia Artificial utilizando Google Gemini 3.
 * Proporciona metadatos automáticos y un conserje interactivo.
 */

const getAIClient = () => {
    if (!process.env.API_KEY) return null;
    return new GoogleGenAI({ apiKey: process.env.API_KEY });
};

export const aiService = {
    /**
     * Sugiere metadatos (título, descripción, categoría) analizando el nombre del archivo.
     */
    async suggestMetadata(filename: string) {
        const ai = getAIClient();
        if (!ai) return null;

        try {
            const response: GenerateContentResponse = await ai.models.generateContent({
                model: 'gemini-3-flash-preview',
                contents: `Analiza el nombre de archivo: "${filename}" y genera metadatos optimizados.`,
                config: {
                    systemInstruction: "Eres un experto en curación de contenido y SEO de video. Extrae información de nombres de archivo y devuelve un JSON estructurado.",
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: Type.OBJECT,
                        properties: {
                            title: {
                                type: Type.STRING,
                                description: "Título atractivo del video, máx 60 caracteres.",
                            },
                            description: {
                                type: Type.STRING,
                                description: "Breve descripción de dos párrafos capturando el interés.",
                            },
                            category: {
                                type: Type.STRING,
                                description: "Categoría: GENERAL, MOVIES, SERIES, SPORTS, MUSIC u OTHER.",
                            },
                            tags: {
                                type: Type.ARRAY,
                                items: { type: Type.STRING },
                                description: "Lista de 5 etiquetas clave.",
                            }
                        },
                        required: ["title", "description", "category", "tags"],
                    }
                }
            });

            const text = response.text;
            if (!text) return null;
            return JSON.parse(text);
        } catch (e) {
            console.error("Gemini AI Metadata Error:", e);
            return null;
        }
    },

    /**
     * Chat interactivo para recomendar contenido basado en el catálogo disponible.
     * Implementa una búsqueda previa para filtrar el catálogo y ofrecer contexto relevante.
     */
    async chatWithConcierge(userMessage: string, availableVideos: Video[]) {
        const ai = getAIClient();
        if (!ai) return "La inteligencia del conserje no está disponible en este momento.";

        // --- BÚSQUEDA PREVIA DE RELEVANCIA ---
        const queryTerms = userMessage.toLowerCase().split(/\s+/).filter(t => t.length > 3);
        
        let filteredVideos = availableVideos;
        if (queryTerms.length > 0) {
            filteredVideos = availableVideos.filter(v => 
                queryTerms.some(term => 
                    v.title.toLowerCase().includes(term) || 
                    v.category.toLowerCase().includes(term) ||
                    (v.description && v.description.toLowerCase().includes(term))
                )
            );
        }

        // Si la búsqueda no arroja nada, volvemos a los más recientes/populares
        if (filteredVideos.length === 0) {
            filteredVideos = availableVideos;
        }

        const context = filteredVideos
            .slice(0, 40) // Limitamos para un prompt limpio y rápido
            .map(v => `- ${v.title} (Cat: ${v.category}, Precio: ${v.price} Saldo, ID: ${v.id})`)
            .join('\n');

        try {
            const chat = ai.chats.create({
                model: 'gemini-3-flash-preview',
                config: {
                    systemInstruction: `Eres el Conserje Premium de StreamPay. Tu misión es ayudar al usuario a encontrar qué ver basándote exclusivamente en los videos que te proporciono en el contexto.
                    
                    CATÁLOGO RELEVANTE DETECTADO:
                    ${context}
                    
                    REGLAS DE ORO:
                    1. SOLO recomienda videos que estén en la lista anterior.
                    2. Si el catálogo relevante está vacío o no encuentras lo que piden, menciónalo amablemente y sugiere explorar el inicio.
                    3. Responde con un tono elegante, servicial y entusiasta.
                    4. Si preguntan por precios, menciona que se paga con Saldo interno.
                    5. Mantén las respuestas directas.
                    6. Responde SIEMPRE en español.`,
                    thinkingConfig: { thinkingBudget: 0 }
                }
            });

            const result = await chat.sendMessage({ message: userMessage });
            return result.text || "Lo siento, mi mente se ha quedado en blanco. ¿Podrías repetir eso?";
        } catch (e) {
            console.error("Concierge Error:", e);
            return "He tenido un pequeño contratiempo técnico. Por favor, inténtalo de nuevo.";
        }
    }
};