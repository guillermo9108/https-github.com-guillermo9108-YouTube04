import { 
    User, Video, Transaction, VipPlan, Comment, UserInteraction, 
    Notification as AppNotification, VideoResult, ContentRequest, 
    MarketplaceItem, MarketplaceReview, BalanceRequest, VipRequest, 
    SmartCleanerResult, FtpFile, SystemSettings 
} from '../types';

interface VideoPagedResponse {
    videos: Video[];
    folders: { name: string; count: number }[];
    activeCategories: string[];
    total: number;
    hasMore: boolean;
}

class DBService {
    private homeDirty = false;

    public async logRemote(message: string, level: 'ERROR' | 'INFO' | 'WARNING' = 'ERROR') {
        try {
            await fetch(`api/index.php?action=client_log`, {
                method: 'POST',
                body: JSON.stringify({ message, level })
            });
        } catch(e) {}
    }

    public request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
        const url = endpoint.startsWith('http') ? endpoint : `api/index.php?${endpoint}`;
        const token = localStorage.getItem('sp_session_token');
        
        const headers: Record<string, string> = { ...(options.headers as Record<string, string>) };
        
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        if (options.method === 'POST') {
            if (!(options.body instanceof FormData)) {
                headers['Content-Type'] = 'application/json';
                if (!options.body) options.body = JSON.stringify({});
            }
        }

        options.headers = headers;

        return fetch(url, options).then(async (response) => {
            const rawText = await response.text();
            
            if (response.status === 401) {
                window.dispatchEvent(new Event('sp_session_expired'));
                throw new Error("Sesión expirada");
            }

            let json: any;
            try { 
                json = JSON.parse(rawText); 
            } catch (e) {
                this.logRemote(`Malformed JSON from ${endpoint}: ${rawText.substring(0, 250)}`, 'ERROR');
                throw new Error(`Respuesta inválida del servidor.`);
            }
            if (json.success === false) throw new Error(json.error || 'Error desconocido');
            return json.data as T;
        });
    }

    /**
     * Genera la URL para el reproductor usando el microservicio Node.js (Puerto 3001)
     * Utiliza la IP actual del navegador para evitar problemas de configuración
     */
    public getStreamerUrl(videoId: string): string {
        const token = localStorage.getItem('sp_session_token') || '';
        return `api/index.php?action=stream&id=${videoId}&token=${token}`;
    }

    public async getVideos(page: number = 0, limit: number = 40, folder: string = '', search: string = '', category: string = '', mediaType: string = 'ALL', sortOrder: string = ''): Promise<VideoPagedResponse> {
        const offset = page * limit;
        const query = `action=get_videos&limit=${limit}&offset=${offset}&folder=${encodeURIComponent(folder)}&search=${encodeURIComponent(search)}&category=${encodeURIComponent(category)}&media_type=${encodeURIComponent(mediaType)}&sort_order=${encodeURIComponent(sortOrder)}`;
        return this.request<VideoPagedResponse>(query);
    }

    public async getShorts(page: number = 0, limit: number = 20, mediaType: string = 'ALL', sortOrder: string = ''): Promise<VideoPagedResponse> {
        const offset = page * limit;
        const query = `action=get_videos&limit=${limit}&offset=${offset}&shorts=1&media_type=${encodeURIComponent(mediaType)}&sort_order=${encodeURIComponent(sortOrder)}`;
        return this.request<VideoPagedResponse>(query);
    }

    public async getAllVideos(): Promise<Video[]> { 
        const res = await this.getVideos(0, 10000);
        return res.videos;
    }

    public async getAdminLibraryStats(): Promise<any> {
        return this.request<any>('action=get_admin_library_stats');
    }

    public async getMarketplaceItems(): Promise<MarketplaceItem[]> { 
        try {
            const items = await this.request<MarketplaceItem[]>('action=get_marketplace_items');
            localStorage.setItem('sp_cache_market', JSON.stringify(items || []));
            return items || [];
        } catch (e) {
            const cached = localStorage.getItem('sp_cache_market');
            return cached ? JSON.parse(cached) : [];
        }
    }

    public async getSystemSettings(): Promise<SystemSettings> { 
        try {
            const s = await this.request<SystemSettings>('action=get_system_settings');
            localStorage.setItem('sp_cache_settings', JSON.stringify(s));
            return s;
        } catch (e) {
            const cached = localStorage.getItem('sp_cache_settings');
            return cached ? JSON.parse(cached) : { categories: [] } as any;
        }
    }

    public async saveSearch(term: string): Promise<void> {
        return this.request<void>(`action=save_search`, { method: 'POST', body: JSON.stringify({ term }) });
    }

    public async getSearchSuggestions(q: string): Promise<any[]> {
        return this.request<any[]>(`action=get_search_suggestions&q=${encodeURIComponent(q)}`);
    }

    public async checkInstallation(): Promise<{status: string}> {
        return fetch('api/install.php?action=check').then(r => r.json()).then(res => ({ status: res.data?.installed ? 'installed' : 'not_installed' })).catch(() => ({ status: 'installed' })); 
    }

    public async verifyDbConnection(config: any): Promise<boolean> {
        const res = await fetch('api/install.php?action=verify_db', { 
            method: 'POST', 
            body: JSON.stringify(config) 
        }).then(r => r.json());
        
        if (!res.success) {
            throw new Error(res.error || 'Connection failed');
        }
        return true;
    }

    public async initializeSystem(dbConfig: any, adminConfig: any): Promise<void> {
        return fetch('api/install.php?action=install', { method: 'POST', body: JSON.stringify({ dbConfig, adminUser: adminConfig }) }).then(async r => {
            const res = await r.json();
            if(!res.success) throw new Error(res.error);
        });
    }

    public enableDemoMode(): void { localStorage.setItem('sp_demo_mode', 'true'); }

    public async login(username: string, password: string): Promise<User> {
        return this.request<User>(`action=login`, { method: 'POST', body: JSON.stringify({ username, password, deviceId: navigator.userAgent.substring(0, 50) }) });
    }

    public async register(username: string, password: string, avatar?: File | null): Promise<User> {
        const fd = new FormData();
        fd.append('username', username); fd.append('password', password); fd.append('deviceId', navigator.userAgent.substring(0, 50));
        if (avatar) fd.append('avatar', avatar);
        return this.request<User>(`action=register`, { method: 'POST', body: fd });
    }

    public async logout(userId: string): Promise<void> {
        return this.request<void>(`action=logout`, { method: 'POST', body: JSON.stringify({ userId }) });
    }

    public async getUser(userId: string): Promise<User | null> {
        return this.request<User | null>(`action=get_user&userId=${userId}`);
    }

    public async heartbeat(userId: string): Promise<User> {
        return this.request<User>(`action=heartbeat&userId=${userId}`);
    }

    public saveOfflineUser(user: User): void { localStorage.setItem('sp_offline_user', JSON.stringify(user)); }

    public getOfflineUser(): User | null {
        const data = localStorage.getItem('sp_offline_user');
        return data ? JSON.parse(data) : null;
    }

    public async getVideo(id: string): Promise<Video | null> { return this.request<Video | null>(`action=get_video&id=${id}`); }

    public async getVideosByCreator(userId: string): Promise<Video[]> { return this.request<Video[]>(`action=get_videos_by_creator&userId=${userId}`); }

    public async getRelatedVideos(videoId: string): Promise<Video[]> { return this.request<Video[]>(`action=get_related_videos&videoId=${videoId}`); }

    public async getUnprocessedVideos(limit: number = 50, mode: string = 'normal'): Promise<Video[]> { return this.request<Video[]>(`action=get_unprocessed_videos&limit=${limit}&mode=${mode}`); }

    public async getUserActivity(userId: string): Promise<{watched: string[], liked: string[]}> { return this.request<{watched: string[], liked: string[]}>(`action=get_user_activity&userId=${userId}`); }

    public async toggleWatchLater(userId: string, videoId: string): Promise<string[]> {
        return this.request<string[]>(`action=update_user_profile`, { 
            method: 'POST', 
            body: JSON.stringify({ userId, toggleWatchLater: videoId }) 
        });
    }

    public async getSubscriptions(userId: string): Promise<string[]> { return this.request<string[]>(`action=get_subscriptions&userId=${userId}`); }

    public async checkSubscription(userId: string, creatorId: string): Promise<boolean> {
        const res = await this.request<{isSubscribed: boolean}>(`action=check_subscription&userId=${userId}&creatorId=${creatorId}`);
        return res.isSubscribed;
    }

    public async toggleSubscribe(userId: string, creatorId: string): Promise<{isSubscribed: boolean}> {
        return this.request<{isSubscribed: boolean}>(`action=toggle_subscribe`, { method: 'POST', body: JSON.stringify({ userId, creatorId }) });
    }

    public async updateSystemSettings(settings: Partial<SystemSettings>): Promise<void> {
        return this.request<void>('action=update_system_settings', { method: 'POST', body: JSON.stringify(settings) });
    }

    public async updateCategoryPrice(categoryId: string, newPrice: number, syncVideos: boolean): Promise<void> {
        return this.request<void>('action=admin_update_category_price', { 
            method: 'POST', 
            body: JSON.stringify({ categoryId, newPrice, syncVideos }) 
        });
    }

    public async hasPurchased(userId: string, videoId: string): Promise<boolean> {
        const res = await this.request<{hasPurchased: boolean}>(`action=has_purchased&userId=${userId}&videoId=${videoId}`);
        return res.hasPurchased;
    }

    public async purchaseVideo(userId: string, videoId: string): Promise<void> {
        return this.request<void>(`action=purchase_video`, { method: 'POST', body: JSON.stringify({ userId, videoId }) });
    }

    public async incrementView(videoId: string): Promise<void> {
        return this.request<void>(`action=rate_video`, { method: 'POST', body: JSON.stringify({ videoId, type: 'view' }) });
    }

    public async rateVideo(userId: string, videoId: string, type: 'like' | 'dislike'): Promise<UserInteraction> {
        return this.request<UserInteraction>(`action=rate_video`, { method: 'POST', body: JSON.stringify({ userId, videoId, type }) });
    }

    public async getInteraction(userId: string, videoId: string): Promise<UserInteraction | null> {
        return this.request<UserInteraction | null>(`action=get_interaction&userId=${userId}&videoId=${videoId}`);
    }

    public async markWatched(userId: string, videoId: string): Promise<void> {
        return this.request<void>(`action=mark_watched`, { method: 'POST', body: JSON.stringify({ userId, videoId }) });
    }

    public async getComments(videoId: string): Promise<Comment[]> { return this.request<Comment[]>(`action=get_comments&id=${videoId}`); }

    public async addComment(userId: string, videoId: string, text: string): Promise<Comment> {
        return this.request<Comment>(`action=add_comment`, { method: 'POST', body: JSON.stringify({ userId, videoId, text }) });
    }

    public async deleteVideo(videoId: string, userId: string): Promise<void> {
        return this.request<void>(`action=delete_video`, { method: 'POST', body: JSON.stringify({ id: videoId, userId }) });
    }

    public async uploadVideo(title: string, desc: string, price: number, cat: string, dur: number, user: User, file: File, thumb: File | null, onProgress: (p: number, l: number, t: number) => void): Promise<void> {
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest(); const fd = new FormData();
            fd.append('action', 'upload_video'); fd.append('title', title); fd.append('description', desc); fd.append('price', String(price));
            fd.append('category', cat); fd.append('duration', String(dur)); fd.append('userId', user.id); fd.append('video', file);
            if (thumb) fd.append('thumbnail', thumb);
            xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100), e.loaded, e.total); };
            xhr.onload = () => { if (xhr.status >= 200 && xhr.status < 300) resolve(); else reject(); };
            xhr.onerror = () => reject(); xhr.open('POST', 'api/index.php?action=upload_video'); xhr.send(fd);
        });
    }

    public async getRequests(status: string = 'ALL'): Promise<ContentRequest[]> { return this.request<ContentRequest[]>(`action=get_requests&status=${status}`); }
    public async requestContent(userId: string, query: string, isVip: boolean): Promise<void> { return this.request<void>(`action=request_content`, { method: 'POST', body: JSON.stringify({ userId, query, isVip }) }); }
    public async updateRequestStatus(id: string, status: string): Promise<void> { return this.request<void>(`action=update_request_status`, { method: 'POST', body: JSON.stringify({ id, status }) }); }
    public async deleteRequest(id: string): Promise<void> { return this.request<void>(`action=delete_request`, { method: 'POST', body: JSON.stringify({ id }) }); }

    public async adminGetMarketplaceItems(): Promise<MarketplaceItem[]> { return this.request<MarketplaceItem[]>('action=admin_get_marketplace_items'); }
    public async getMarketplaceItem(id: string): Promise<MarketplaceItem | null> { return this.request<MarketplaceItem | null>(`action=get_marketplace_item&id=${id}`); }
    public async createListing(formData: FormData): Promise<void> { return this.request<void>(`action=create_listing`, { method: 'POST', body: formData }); }
    public async editListing(id: string, userId: string, data: any): Promise<void> { return this.request<void>(`action=edit_listing`, { method: 'POST', body: JSON.stringify({ id, userId, data }) }); }
    public async adminDeleteListing(itemId: string): Promise<void> { return this.request<void>(`action=admin_delete_listing`, { method: 'POST', body: JSON.stringify({ id: itemId }) }); }
    public async checkoutCart(userId: string, cart: any[], shippingDetails: any): Promise<void> { return this.request<void>(`action=checkout_cart`, { method: 'POST', body: JSON.stringify({ userId, cart, shippingDetails }) }); }
    public async getReviews(itemId: string): Promise<MarketplaceReview[]> { return this.request<MarketplaceReview[]>(`action=get_reviews&itemId=${itemId}`); }
    public async addReview(itemId: string, userId: string, rating: number, comment: string): Promise<void> { return this.request<void>(`action=add_review`, { method: 'POST', body: JSON.stringify({ itemId, userId, rating, comment }) }); }

    public async getBalanceRequests(): Promise<{balance: BalanceRequest[], vip: VipRequest[], activeVip?: Partial<User>[]}> { return this.request<{balance: BalanceRequest[], vip: VipRequest[], activeVip?: Partial<User>[]}>('action=get_balance_requests'); }
    public async handleBalanceRequest(adminId: string, reqId: string, status: string): Promise<void> { return this.request<void>(`action=handle_balance_request`, { method: 'POST', body: JSON.stringify({ adminId, reqId, status }) }); }
    public async handleVipRequest(adminId: string, reqId: string, status: string): Promise<void> { return this.request<void>(`action=handle_vip_request`, { method: 'POST', body: JSON.stringify({ adminId, reqId, status }) }); }
    
    public async purchaseVipInstant(userId: string, plan: VipPlan): Promise<void> { return this.request<void>(`action=purchase_vip_instant`, { method: 'POST', body: JSON.stringify({ userId, plan }) }); }
    
    public async submitManualVipRequest(userId: string, plan: VipPlan, proofText: string, proofImage: File | null): Promise<void> {
        const fd = new FormData();
        fd.append('userId', userId);
        fd.append('planSnapshot', JSON.stringify(plan));
        fd.append('proofText', proofText);
        if (proofImage) fd.append('proofImage', proofImage);
        
        return this.request<void>(`action=submit_manual_vip_request`, { method: 'POST', body: fd });
    }

    public async createPayLink(userId: string, plan: VipPlan): Promise<{paymentUrl: string}> {
        return this.request<{paymentUrl: string}>(`action=create_pay_link`, { method: 'POST', body: JSON.stringify({ userId, plan }) });
    }
    public async verifyPayment(userId: string, reference: string): Promise<{message: string}> {
        return this.request<{message: string}>(`action=verify_payment`, { method: 'POST', body: JSON.stringify({ userId, reference }) });
    }

    public async transferBalance(userId: string, targetUsername: string, amount: number): Promise<void> { return this.request<void>(`action=transfer_balance`, { method: 'POST', body: JSON.stringify({ userId, targetUsername, amount }) }); }
    public async adminAddBalance(adminId: string, targetId: string, amount: number): Promise<void> { return this.request<void>(`action=admin_add_balance`, { method: 'POST', body: JSON.stringify({ adminId, userId: targetId, amount }) }); }
    public async getGlobalTransactions(): Promise<any> { return this.request<any>('action=get_global_transactions'); }

    public async getAllUsers(): Promise<User[]> { return this.request<User[]>('action=get_all_users'); }
    public async searchUsers(userId: string, query: string): Promise<User[]> { return this.request<User[]>(`action=search_users`, { method: 'POST', body: JSON.stringify({ userId, q: query }) }); }
    public async updateUserProfile(userId: string, data: any): Promise<void> {
        if (data.avatar instanceof File || data.newPassword) {
            const fd = new FormData(); fd.append('userId', userId);
            Object.entries(data).forEach(([k, v]) => { if (v instanceof File) fd.append(k, v); else fd.append(k, typeof v === 'object' ? JSON.stringify(v) : String(v)); });
            return this.request<void>(`action=update_user_profile`, { method: 'POST', body: fd });
        }
        return this.request<void>(`action=update_user_profile`, { method: 'POST', body: JSON.stringify({ userId, ...data }) });
    }

    public async scanLocalLibrary(path: string): Promise<any> { return this.request<any>(`action=scan_local_library`, { method: 'POST', body: JSON.stringify({ path }) }); }
    public async processScanBatch(): Promise<any> { return this.request<any>(`action=process_scan_batch`, { method: 'POST' }); }
    public async updateVideoMetadata(id: string, duration: number, thumb: File | null, success: boolean = true): Promise<void> {
        const fd = new FormData(); fd.append('id', id); fd.append('duration', String(duration)); fd.append('success', success ? '1' : '0');
        if (thumb) fd.append('thumbnail', thumb);
        return this.request<void>(`action=update_video_metadata`, { method: 'POST', body: fd });
    }
    public async smartOrganizeLibrary(): Promise<any> { return this.request<any>(`action=smart_organize_library`, { method: 'POST' }); }
    public async reorganizeAllVideos(): Promise<any> { return this.request<any>(`action=reorganize_all_videos`, { method: 'POST' }); }
    public async fixLibraryMetadata(): Promise<any> { return this.request<any>(`action=fix_library_metadata`, { method: 'POST' }); }
    public async adminCleanupSystemFiles(): Promise<any> { return this.request<any>(`action=admin_cleanup_files`, { method: 'POST' }); }
    public async adminRepairDb(): Promise<any> { return this.request<any>(`action=admin_repair_db`, { method: 'POST' }); }
    public invalidateCache(key?: string) {
        if (!key || key.includes('get_videos')) {
        }
        if (!key || key.includes('marketplace')) localStorage.removeItem('sp_cache_market');
    }
    public setHomeDirty() { this.homeDirty = true; }
    public async getNotifications(userId: string): Promise<AppNotification[]> { return this.request<AppNotification[]>(`action=get_notifications&userId=${userId}`); }
    public async markNotificationRead(id: string): Promise<void> { return this.request<void>(`action=mark_notification_read`, { method: 'POST', body: JSON.stringify({ id }) }); }
    public async markAllNotificationsRead(userId: string): Promise<void> { return this.request<void>(`action=mark_all_notifications_read`, { method: 'POST', body: JSON.stringify({ userId }) }); }
    public async listFtpFiles(path: string): Promise<FtpFile[]> { return this.request<FtpFile[]>(`action=list_ftp_files&path=${encodeURIComponent(path)}`); }
    public async importFtpFile(path: string): Promise<void> { return this.request<void>(`action=import_ftp_file&path=${encodeURIComponent(path)}`, { method: 'POST' }); }
    public async scanFtpRecursive(path: string): Promise<{scanned: number, added: number}> { return this.request<{scanned: number, added: number}>(`action=scan_ftp_recursive&path=${encodeURIComponent(path)}`, { method: 'POST' }); }
}

export const db = new DBService();