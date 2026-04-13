// Inicializar datos de demostración en localStorage
import { demoUser } from './mockData';

export function initDemoMode() {
    // Si no hay sesión activa, crear una de demo automáticamente
    const hasSession = localStorage.getItem('sp_current_user_id') || sessionStorage.getItem('sp_current_user_id');

    if (!hasSession) {
        const demoToken = 'demo_token_' + Math.random().toString(36).substring(7);
        localStorage.setItem('sp_current_user_id', demoUser.id);
        localStorage.setItem('sp_session_token', demoToken);
        localStorage.setItem('sp_offline_user', JSON.stringify(demoUser));
        localStorage.setItem('sp_demo_mode', 'true');
    }
}
