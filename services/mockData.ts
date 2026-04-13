import { Video, User, SystemSettings, Story } from '../types';

// Usuario demo
export const demoUser: User = {
    id: 'user1',
    username: 'Usuario Demo',
    email: 'demo@streampay.com',
    role: 'USER',
    balance: 100,
    createdAt: Date.now() / 1000,
    avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=demo',
    vipExpiry: null,
    bannerUrl: null,
    bio: 'Usuario de demostración',
    location: '',
    website: '',
    watchLater: []
};

// Videos de demostración
export const demoVideos: Video[] = [
    {
        id: 'video1',
        title: 'Introducción a React',
        description: 'Aprende los fundamentos de React',
        videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
        thumbnailUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/BigBuckBunny.jpg',
        creatorId: 'user1',
        creatorName: 'Usuario Demo',
        creatorAvatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=demo',
        category: 'Educación',
        price: 0,
        duration: 596,
        views: 1520,
        likes: 45,
        shares: 12,
        createdAt: Date.now() / 1000 - 86400 * 2,
        is_audio: false
    },
    {
        id: 'video2',
        title: 'Tutorial de TypeScript',
        description: 'Domina TypeScript desde cero',
        videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
        thumbnailUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/ElephantsDream.jpg',
        creatorId: 'user1',
        creatorName: 'Usuario Demo',
        creatorAvatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=demo',
        category: 'Programación',
        price: 5,
        duration: 653,
        views: 890,
        likes: 32,
        shares: 8,
        createdAt: Date.now() / 1000 - 86400 * 5,
        is_audio: false
    },
    {
        id: 'video3',
        title: 'Música Relajante',
        description: 'Música instrumental para estudiar',
        videoUrl: '',
        thumbnailUrl: 'https://picsum.photos/seed/music1/400/300',
        creatorId: 'user1',
        creatorName: 'Usuario Demo',
        creatorAvatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=demo',
        category: 'Music',
        price: 0,
        duration: 3600,
        views: 2340,
        likes: 89,
        shares: 23,
        createdAt: Date.now() / 1000 - 86400 * 1,
        is_audio: true
    },
    {
        id: 'video4',
        title: 'Desarrollo Web Moderno',
        description: 'Las mejores prácticas de desarrollo web',
        videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
        thumbnailUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/ForBiggerBlazes.jpg',
        creatorId: 'user1',
        creatorName: 'Usuario Demo',
        creatorAvatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=demo',
        category: 'Tecnología',
        price: 0,
        duration: 15,
        views: 567,
        likes: 21,
        shares: 5,
        createdAt: Date.now() / 1000 - 86400 * 3,
        is_audio: false
    },
    {
        id: 'video5',
        title: 'Diseño UI/UX',
        description: 'Principios fundamentales de diseño',
        videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
        thumbnailUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/ForBiggerEscapes.jpg',
        creatorId: 'user1',
        creatorName: 'Usuario Demo',
        creatorAvatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=demo',
        category: 'Diseño',
        price: 0,
        duration: 15,
        views: 1123,
        likes: 56,
        shares: 14,
        createdAt: Date.now() / 1000 - 86400 * 4,
        is_audio: false
    },
    {
        id: 'video6',
        title: 'Marketing Digital',
        description: 'Estrategias de marketing para el 2024',
        videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4',
        thumbnailUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/ForBiggerFun.jpg',
        creatorId: 'user1',
        creatorName: 'Usuario Demo',
        creatorAvatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=demo',
        category: 'Marketing',
        price: 10,
        duration: 60,
        views: 678,
        likes: 34,
        shares: 9,
        createdAt: Date.now() / 1000 - 86400 * 6,
        is_audio: false
    }
];

// Historias de demostración
export const demoStories: Story[] = [
    {
        id: 'story1',
        userId: 'user1',
        username: 'Usuario Demo',
        avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=demo',
        type: 'IMAGE',
        contentUrl: 'https://picsum.photos/seed/story1/400/600',
        createdAt: Date.now() / 1000 - 3600,
        expiresAt: Date.now() / 1000 + 82800,
        overlayText: '¡Nueva función disponible!',
        overlayColor: '#ffffff',
        overlayBg: 'rgba(0,0,0,0.5)'
    }
];

// Configuración del sistema
export const demoSystemSettings: SystemSettings = {
    categories: [
        { id: '1', name: 'Educación', price: 0, sortOrder: 'LATEST' },
        { id: '2', name: 'Programación', price: 5, sortOrder: 'LATEST' },
        { id: '3', name: 'Music', price: 0, sortOrder: 'LATEST' },
        { id: '4', name: 'Tecnología', price: 0, sortOrder: 'LATEST' },
        { id: '5', name: 'Diseño', price: 0, sortOrder: 'LATEST' },
        { id: '6', name: 'Marketing', price: 10, sortOrder: 'LATEST' }
    ],
    defaultVideoThumb: 'https://picsum.photos/seed/video/400/300',
    defaultAudioThumb: 'https://picsum.photos/seed/audio/400/300',
    defaultAvatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=default',
    shortsPath: ''
};

// Sugerencias de búsqueda
export const demoSuggestions = [
    { id: 'sugg1', label: 'React', type: 'HISTORY' },
    { id: 'sugg2', label: 'TypeScript', type: 'HISTORY' },
    { id: 'sugg3', label: 'Programación', type: 'CATEGORY' },
    { id: 'sugg4', label: 'Educación', type: 'CATEGORY' }
];
