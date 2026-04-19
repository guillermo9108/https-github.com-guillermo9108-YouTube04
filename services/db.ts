import { 
    User, Video, Transaction, VipPlan, Comment, UserInteraction, 
    Notification as AppNotification, VideoResult, ContentRequest, 
    MarketplaceItem, MarketplaceReview, BalanceRequest, VipRequest, 
    SmartCleanerResult, FtpFile, SystemSettings, Category, ChatMessage 
} from '../types';

interface VideoPagedResponse {
    videos: Video[];
    folders: { name: string; count: number; sortOrder?: string; thumbnailUrl?: string; relativePath?: string }[];
    activeCategories: string[];
    appliedSortOrder?: string;
    total: number;
    hasMore: boolean;
}

class DBService {
    private homeDirty = false;
    public isHomeDirty() { return this.homeDirty; }
    public resetHomeDirty() { this.homeDirty = false; }
    private isOffline = false;
    private lastErrorTime = 0;

    public async logRemote(message: string, level: 'ERROR' | 'INFO' | 'WARNING' = 'ERROR') {
        if (this.isOffline) return; // Don't try to log if offline
        try {
            await fetch(`/api/index.php?action=client_log`, {
                method: 'POST',
                body: JSON.stringify({ message, level })
            });
        } catch(e) {}
    }

    public request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000); // Reducido a 15s para detectar offline más rápido

        const url = endpoint.startsWith('http') ? endpoint : `/api/index.php?${endpoint}`;
        const token = localStorage.getItem('sp_session_token') || sessionStorage.getItem('sp_session_token');
        
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
        options.signal = controller.signal;

        return fetch(url, options).then(async (response) => {
            clearTimeout(timeoutId);
            
            if (this.isOffline) {
                this.isOffline = false;
                window.dispatchEvent(new CustomEvent('sp_online'));
            }

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
        }).catch(err => {
            clearTimeout(timeoutId);
            
            // Detectar error de conexión o timeout
            const isNetworkError = err.name === 'TypeError' || err.name === 'AbortError' || err.message.includes('Failed to fetch');
            
            if (isNetworkError && !this.isOffline) {
                this.isOffline = true;
                window.dispatchEvent(new CustomEvent('sp_offline'));
            }

            if (err.name === 'AbortError') throw new Error("La petición ha tardado demasiado tiempo.");
            throw err;
        });
    }

    public getIsOffline() { return this.isOffline; }

    /**
     * Genera la URL para el reproductor usando el microservicio Node.js (Puerto 3001)
     * Utiliza la IP actual del navegador para evitar problemas de configuración
     */
    public getStreamerUrl(videoId: string, customToken?: string): string {
        const token = customToken || localStorage.getItem('sp_session_token') || sessionStorage.getItem('sp_session_token') || '';
        return `/api/index.php?action=stream&id=${videoId}&token=${token}`;
    }

    public async getVideos(page: number = 0, limit: number = 40, folder: string = '', search: string = '', category: string = '', mediaType: string = 'ALL', sortOrder: string = '', userId: string = ''): Promise<VideoPagedResponse> {
        const offset = page * limit;
        const query = `action=get_videos&limit=${limit}&offset=${offset}&folder=${encodeURIComponent(folder)}&search=${encodeURIComponent(search)}&category=${encodeURIComponent(category)}&media_type=${encodeURIComponent(mediaType)}&sort_order=${encodeURIComponent(sortOrder)}&userId=${encodeURIComponent(userId)}`;
        
        const cacheKey = `sp_cache_videos_${folder}_${search}_${category}_${mediaType}_${sortOrder}_${page}`;
        
        try {
            const res = await this.request<VideoPagedResponse>(query);
            if (page === 0) localStorage.setItem(cacheKey, JSON.stringify(res));
            return res;
        } catch (e) {
            const cached = localStorage.getItem(cacheKey);
            if (cached) return JSON.parse(cached);
            throw e;
        }
    }

    public async getShorts(page: number = 0, limit: number = 20, mediaType: string = 'ALL', sortOrder: string = '', userId: string = '', seed: string = '', onlyUnseen: boolean = false, folder: string = ''): Promise<VideoPagedResponse> {
        const offset = page * limit;
        const query = `action=get_videos&limit=${limit}&offset=${offset}&shorts=1&media_type=${encodeURIComponent(mediaType)}&sort_order=${encodeURIComponent(sortOrder)}&userId=${encodeURIComponent(userId)}&seed=${encodeURIComponent(seed)}${onlyUnseen ? '&only_unseen=1' : ''}&folder=${encodeURIComponent(folder)}`;
        
        const cacheKey = `sp_cache_shorts_${mediaType}_${sortOrder}_${page}`;
        
        try {
            const res = await this.request<VideoPagedResponse>(query);
            if (page === 0) localStorage.setItem(cacheKey, JSON.stringify(res));
            return res;
        } catch (e) {
            const cached = localStorage.getItem(cacheKey);
            if (cached) return JSON.parse(cached);
            throw e;
        }
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

    public async togglePriceAlert(userId: string, itemId: string): Promise<{active: boolean}> {
        return this.request<{active: boolean}>(`action=toggle_price_alert`, { method: 'POST', body: JSON.stringify({ userId, itemId }) });
    }
    public async checkPriceAlert(userId: string, itemId: string): Promise<{active: boolean}> {
        return this.request<{active: boolean}>(`action=check_price_alert&userId=${userId}&itemId=${itemId}`);
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

    public async getCategories(): Promise<Category[]> {
        return this.request<Category[]>('action=get_categories');
    }

    public async getFolders(path: string = ''): Promise<any[]> {
        return this.request<any[]>(`action=get_folders&path=${encodeURIComponent(path)}`);
    }

    public async saveSearch(term: string): Promise<void> {
        return this.request<void>(`action=save_search`, { method: 'POST', body: JSON.stringify({ term }) });
    }

    public async getSearchSuggestions(q: string, limit: number = 20): Promise<any[]> {
        return this.request<any[]>(`action=get_search_suggestions&q=${encodeURIComponent(q)}&limit=${limit}`);
    }

    public async checkInstallation(): Promise<{status: string}> {
        return fetch('api/install.php?action=check').then(r => r.json()).then(res => ({ status: res.data?.installed ? 'installed' : 'not_installed' })).catch(() => ({ status: 'installed' })); 
    }

    public async getLatestVersion(userId?: string, clientVersion?: string): Promise<{version: string, filename: string, url: string | null, isAPK: boolean, deviceIdentity: string, foundVersions?: any[]}> {
        const params = new URLSearchParams();
        params.append('action', 'get_latest_version');
        if (userId) params.append('userId', userId);
        if (clientVersion) params.append('clientVersion', clientVersion);
        return this.request<{version: string, filename: string, url: string | null, isAPK: boolean, deviceIdentity: string, foundVersions?: any[]}>(params.toString());
    }

    public async verifyDbConnection(config: any): Promise<boolean> {
        return fetch('api/install.php?action=verify_db', { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(config) 
        }).then(r => r.json()).then(res => res.success);
    }

    public async initializeSystem(dbConfig: any, adminConfig: any): Promise<void> {
        return fetch('api/install.php?action=install', { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dbConfig, adminUser: adminConfig }) 
        }).then(async r => {
            const res = await r.json();
            if(!res.success) throw new Error(res.error);
        });
    }

    public enableDemoMode(): void { localStorage.setItem('sp_demo_mode', 'true'); }

    public async login(username: string, password: string): Promise<User> {
        return this.request<User>(`action=login`, { method: 'POST', body: JSON.stringify({ username, password, deviceId: navigator.userAgent.substring(0, 255) }) });
    }

    public async register(username: string, password: string, avatar?: File | null): Promise<User> {
        const fd = new FormData();
        fd.append('username', username); fd.append('password', password); fd.append('deviceId', navigator.userAgent.substring(0, 255));
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

    public async getFolderVideos(videoId: string, sortOrder: string = '', userId: string = '', folder: string = ''): Promise<{videos: Video[], sortOrder: string}> { 
        return this.request<{videos: Video[], sortOrder: string}>(`action=get_folder_videos&videoId=${videoId}&sort_order=${encodeURIComponent(sortOrder)}&userId=${userId}&folder=${encodeURIComponent(folder)}`); 
    }

    public async getUnprocessedVideos(limit: number = 50, mode: string = 'normal'): Promise<Video[]> { return this.request<Video[]>(`action=get_unprocessed_videos&limit=${limit}&mode=${mode}`); }
    public async unlockVideo(id: string): Promise<void> { return this.request<void>(`action=unlock_video`, { method: 'POST', body: JSON.stringify({ id }) }); }
    public async lockVideoForProcessing(videoId: string, lockId: string): Promise<{success: boolean}> {
        return this.request<{success: boolean}>(`action=lock_video_for_processing`, {
            method: 'POST',
            body: JSON.stringify({ videoId, lockId })
        });
    }
    public async getUserActivity(userId: string): Promise<{watched: string[], liked: string[]}> { return this.request<{watched: string[], liked: string[]}>(`action=get_user_activity&userId=${userId}`); }

    public async toggleWatchLater(userId: string, videoId: string): Promise<string[]> {
        return this.request<string[]>(`action=update_user_profile`, { 
            method: 'POST', 
            body: JSON.stringify({ userId, toggleWatchLater: videoId }) 
        });
    }

    public async getSubscriptions(userId: string): Promise<string[]> { return this.request<string[]>(`action=get_subscriptions&userId=${userId}`); }

    public async getMutualFriends(userId: string, targetId: string): Promise<User[]> {
        return this.request<User[]>(`action=get_mutual_friends&userId=${userId}&targetId=${targetId}`);
    }

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

    public async incrementShare(videoId: string): Promise<void> {
        return this.request<void>(`action=increment_share&id=${videoId}`);
    }

    public async getVideoLikers(videoId: string, userId?: string): Promise<{username: string, avatarUrl: string}[]> {
        return this.request<{username: string, avatarUrl: string}[]>(`action=get_video_likers&videoId=${videoId}${userId ? `&userId=${userId}` : ''}`);
    }

    public async getUserFollowers(userId: string): Promise<User[]> {
        return this.request<User[]>(`action=get_user_followers&userId=${userId}`);
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

    public async markSkipped(userId: string, videoId: string): Promise<void> {
        return this.request<void>(`action=mark_skipped`, { method: 'POST', body: JSON.stringify({ userId, videoId }) });
    }

    public async getComments(videoId: string): Promise<Comment[]> { return this.request<Comment[]>(`action=get_comments&id=${videoId}`); }

    public async addComment(userId: string, videoId: string, text: string): Promise<Comment> {
        return this.request<Comment>(`action=add_comment`, { method: 'POST', body: JSON.stringify({ userId, videoId, text }) });
    }

    public async deleteVideo(videoId: string, userId: string): Promise<void> {
        return this.request<void>(`action=delete_video`, { method: 'POST', body: JSON.stringify({ id: videoId, userId }) });
    }
    public async updateVideo(videoId: string, userId: string, data: any): Promise<void> {
        return this.request<void>(`action=update_video`, { method: 'POST', body: JSON.stringify({ id: videoId, userId, ...data }) });
    }

    public async uploadVideo(title: string, desc: string, price: number, cat: string, dur: number, user: User, file: File, thumb: File | null, onProgress: (p: number, l: number, t: number) => void, collection?: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest(); const fd = new FormData();
            fd.append('action', 'upload_video'); fd.append('title', title); fd.append('description', desc); fd.append('price', String(price));
            fd.append('category', cat); fd.append('duration', String(dur)); fd.append('userId', user.id); fd.append('video', file);
            if (thumb) fd.append('thumbnail', thumb);
            if (collection) fd.append('collection', collection);
            xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100), e.loaded, e.total); };
            xhr.onload = () => { 
                if (xhr.status >= 200 && xhr.status < 300) {
                    this.invalidateCache('sp_cache_videos');
                    this.setHomeDirty();
                    resolve(); 
                } else reject(); 
            };
            xhr.onerror = () => reject(); xhr.open('POST', '/api/index.php?action=upload_video'); xhr.send(fd);
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
    public async checkoutCart(userId: string, cart: any[], shippingDetails: any, paymentMethod: 'PLATFORM' | 'DIRECT' = 'PLATFORM'): Promise<void> { 
        return this.request<void>(`action=checkout_cart`, { method: 'POST', body: JSON.stringify({ userId, cart, shippingDetails, paymentMethod }) }); 
    }
    public async getSellerOrders(sellerId: string): Promise<any[]> { return this.request<any[]>(`action=market_get_seller_orders&sellerId=${sellerId}`); }
    public async getBuyerOrders(buyerId: string): Promise<any[]> { return this.request<any[]>(`action=market_get_buyer_orders&buyerId=${buyerId}`); }
    public async markItemPaid(orderItemId: string, sellerId: string, paidAmount?: number, changeAmount?: number): Promise<void> { 
        return this.request<void>(`action=market_mark_item_paid`, { 
            method: 'POST', 
            body: JSON.stringify({ orderItemId, sellerId, paidAmount, changeAmount }) 
        }); 
    }
    public async rejectOrder(orderId: string, sellerId: string, reason: string): Promise<void> {
        return this.request<void>(`action=market_reject_order`, { method: 'POST', body: JSON.stringify({ orderId, sellerId, reason }) });
    }
    public async getSellerStats(sellerId: string): Promise<any> { return this.request<any>(`action=market_get_seller_stats&sellerId=${sellerId}`); }
    public async getReviews(itemId: string): Promise<MarketplaceReview[]> { return this.request<MarketplaceReview[]>(`action=get_reviews&itemId=${itemId}`); }
    public async addReview(itemId: string, userId: string, rating: number, comment: string): Promise<void> { return this.request<void>(`action=add_review`, { method: 'POST', body: JSON.stringify({ itemId, userId, rating, comment }) }); }

    public async getBalanceRequests(): Promise<{balance: BalanceRequest[], vip: VipRequest[], activeVip?: Partial<User>[]}> { return this.request<{balance: BalanceRequest[], vip: VipRequest[], activeVip?: Partial<User>[]}>('action=get_balance_requests'); }
    public async handleBalanceRequest(adminId: string, reqId: string, status: string, reason: string = ''): Promise<void> { return this.request<void>(`action=handle_balance_request`, { method: 'POST', body: JSON.stringify({ adminId, reqId, status, reason }) }); }
    public async handleVipRequest(adminId: string, reqId: string, status: string, reason: string = ''): Promise<void> { return this.request<void>(`action=handle_vip_request`, { method: 'POST', body: JSON.stringify({ adminId, reqId, status, reason }) }); }
    
    public async purchaseVipInstant(userId: string, plan: VipPlan): Promise<void> { return this.request<void>(`action=purchase_vip_instant`, { method: 'POST', body: JSON.stringify({ userId, plan }) }); }
    
    public async submitManualVipRequest(userId: string, plan: VipPlan, proofText: string, proofImage: File | null): Promise<void> {
        const fd = new FormData();
        fd.append('userId', userId);
        fd.append('planSnapshot', JSON.stringify(plan));
        fd.append('proofText', proofText);
        if (proofImage) fd.append('proofImage', proofImage);
        
        return this.request<void>(`action=submit_manual_vip_request`, { method: 'POST', body: fd });
    }

    public async submitBalanceRequest(userId: string, amount: number): Promise<void> {
        return this.request<void>(`action=submit_balance_request`, { 
            method: 'POST', 
            body: JSON.stringify({ userId, amount }) 
        });
    }

    public async getTransactions(userId: string): Promise<Transaction[]> {
        return this.request<Transaction[]>(`action=get_transactions&userId=${userId}`);
    }

    public async createPayLink(userId: string, plan: VipPlan): Promise<{paymentUrl: string}> {
        return this.request<{paymentUrl: string}>(`action=create_pay_link`, { method: 'POST', body: JSON.stringify({ userId, plan }) });
    }
    public async verifyPayment(userId: string, reference: string): Promise<{message: string}> {
        return this.request<{message: string}>(`action=verify_payment`, { method: 'POST', body: JSON.stringify({ userId, reference }) });
    }

    public async transferBalance(userId: string, targetUsername: string, amount: number): Promise<void> { return this.request<void>(`action=transfer_balance`, { method: 'POST', body: JSON.stringify({ userId, targetUsername, amount }) }); }
    public async adminAddBalance(adminId: string, targetId: string, amount: number, reason: string = ''): Promise<void> { return this.request<void>(`action=admin_add_balance`, { method: 'POST', body: JSON.stringify({ adminId, userId: targetId, amount, reason }) }); }
    public async getGlobalTransactions(): Promise<any> { return this.request<any>('action=get_global_transactions'); }
    public async adminGetServerStats(): Promise<any> { return this.request<any>('action=admin_get_server_stats'); }
    public async adminServerControl(action: 'shutdown' | 'reboot'): Promise<any> { return this.request<any>('action=admin_server_control', { method: 'POST', body: JSON.stringify({ serverAction: action }) }); }

    public async getAllUsers(): Promise<User[]> { return this.request<User[]>('action=get_all_users'); }
    public async searchUsers(query: string): Promise<User[]> {
        return this.request<User[]>('action=search_users', {
            method: 'POST',
            body: JSON.stringify({ query })
        });
    }
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
    public async updateVideoMetadata(id: string, duration: number, thumb: File | null, success: boolean = true, clientIncompatible: boolean = false): Promise<void> {
        const fd = new FormData(); fd.append('id', id); fd.append('duration', String(duration)); fd.append('success', success ? '1' : '0');
        if (clientIncompatible) fd.append('clientIncompatible', '1');
        if (thumb) fd.append('thumbnail', thumb);
        return this.request<void>(`action=update_video_metadata`, { method: 'POST', body: fd });
    }
    public async smartOrganizeLibrary(): Promise<any> { return this.request<any>(`action=smart_organize_library`, { method: 'POST' }); }
    public async reorganizeAllVideos(): Promise<any> { return this.request<any>(`action=reorganize_all_videos`, { method: 'POST' }); }
    public async fixLibraryMetadata(): Promise<any> { return this.request<any>(`action=fix_library_metadata`, { method: 'POST' }); }
    public async adminCleanupSystemFiles(): Promise<any> { return this.request<any>(`action=admin_cleanup_files`, { method: 'POST' }); }
    public async adminRepairDb(): Promise<any> { return this.request<any>(`action=admin_repair_db`, { method: 'POST' }); }
    public async adminBanUser(userId: string): Promise<void> { return this.request<void>(`action=admin_ban_user`, { method: 'POST', body: JSON.stringify({ userId }) }); }
    public async adminUnbanUser(userId: string): Promise<void> { return this.request<void>(`action=admin_unban_user`, { method: 'POST', body: JSON.stringify({ userId }) }); }
    public async adminChangeUserRole(userId: string, role: string): Promise<void> { return this.request<void>(`action=admin_change_user_role`, { method: 'POST', body: JSON.stringify({ userId, role }) }); }
    public async adminDeleteUser(userId: string): Promise<void> { return this.request<void>(`action=admin_delete_user`, { method: 'POST', body: JSON.stringify({ userId }) }); }
    public async adminSuspendSeller(userId: string): Promise<void> { return this.request<void>(`action=admin_suspend_seller`, { method: 'POST', body: JSON.stringify({ userId }) }); }
    public async adminFeatureListing(itemId: string, isFeatured: boolean): Promise<void> { return this.request<void>(`action=admin_feature_listing`, { method: 'POST', body: JSON.stringify({ itemId, isFeatured }) }); }
    public async adminDeepCleanup(): Promise<any> { return this.request<any>(`action=admin_deep_cleanup`, { method: 'POST' }); }
    public invalidateCache(prefix?: string) {
        if (!prefix) {
            Object.keys(localStorage).forEach(key => {
                if (key.startsWith('sp_cache_')) localStorage.removeItem(key);
            });
            return;
        }
        Object.keys(localStorage).forEach(key => {
            if (key.startsWith(prefix)) localStorage.removeItem(key);
        });
    }
    public setHomeDirty() { this.homeDirty = true; }
    public async getNotifications(userId: string, limit: number = 30): Promise<AppNotification[]> { 
        return this.request<AppNotification[]>(`action=get_notifications&userId=${userId}&limit=${limit}`); 
    }
    public async getUnreadNotifications(userId: string): Promise<AppNotification[]> { return this.request<AppNotification[]>(`action=get_unread_notifications&userId=${userId}`); }
    public async getUnreadCount(userId: string): Promise<{count: number}> { return this.request<{count: number}>(`action=get_unread_count&userId=${userId}`); }
    public async markNotificationRead(id: string): Promise<void> { return this.request<void>(`action=mark_notification_read`, { method: 'POST', body: JSON.stringify({ id }) }); }
    public async markAllNotificationsRead(userId: string): Promise<void> { return this.request<void>(`action=mark_all_notifications_read`, { method: 'POST', body: JSON.stringify({ userId }) }); }
    public async listFtpFiles(path: string): Promise<FtpFile[]> { return this.request<FtpFile[]>(`action=list_ftp_files&path=${encodeURIComponent(path)}`); }
    public async importFtpFile(path: string): Promise<void> { return this.request<void>(`action=import_ftp_file&path=${encodeURIComponent(path)}`, { method: 'POST' }); }
    public async scanFtpRecursive(path: string): Promise<{scanned: number, added: number}> { return this.request<{scanned: number, added: number}>(`action=scan_ftp_recursive&path=${encodeURIComponent(path)}`, { method: 'POST' }); }

    public async uploadDefaultThumbnail(type: 'video' | 'audio' | 'avatar', file: File): Promise<string> {
        const formData = new FormData();
        formData.append('type', type);
        formData.append('image', file);
        const res = await this.request<{url: string}>(`action=admin_upload_default_thumb`, {
            method: 'POST',
            body: formData
        });
        return res.url;
    }

    public async getChannelContent(userId: string, filter: string = 'ALL'): Promise<any[]> {
        return this.request<any[]>(`action=get_channel_content&userId=${userId}&filter=${filter}`);
    }

    public async uploadChannelImages(formData: FormData): Promise<any> {
        const res = await this.request<any>('action=upload_channel_images', {
            method: 'POST',
            body: formData
        });
        this.invalidateCache('sp_cache_videos');
        this.setHomeDirty();
        return res;
    }

    public async uploadStory(formData: FormData): Promise<any> {
        return this.request<any>('action=upload_story', {
            method: 'POST',
            body: formData
        });
    }

    public async getStories(): Promise<any[]> {
        return this.request<any[]>('action=get_stories');
    }

    public async deleteStory(id: string, userId: string): Promise<void> {
        return this.request<void>('action=delete_story', {
            method: 'POST',
            body: JSON.stringify({ id, userId })
        });
    }

    public async subscribePush(data: { userId: string, subscription: any }): Promise<void> {
        return this.request<void>(`action=subscribe_push`, { method: 'POST', body: JSON.stringify(data) });
    }

    public async unsubscribePush(data: { endpoint: string }): Promise<void> {
        return this.request<void>(`action=unsubscribe_push`, { method: 'POST', body: JSON.stringify(data) });
    }

    public async testPush(data: { userId: string }): Promise<any> {
        return this.request<any>(`action=test_push`, { method: 'POST', body: JSON.stringify(data) });
    }

    public async generateVapidKeys(): Promise<any> {
        return this.request<any>(`action=generate_vapid_keys`, { method: 'POST' });
    }

    public async getTrendingVideos(): Promise<Video[]> {
        return this.request<Video[]>('action=get_trending_videos');
    }

    public async getUserHistory(userId: string): Promise<Video[]> {
        return this.request<Video[]>(`action=get_user_history&userId=${userId}`);
    }

    public async getChats(userId: string): Promise<any[]> {
        return this.request<any[]>(`action=get_chats&userId=${userId}`);
    }

    public async getMessages(userId: string, otherId: string, limit: number = 20, offset: number = 0): Promise<ChatMessage[]> {
        return this.request<ChatMessage[]>(`action=get_messages&userId=${userId}&otherId=${otherId}&limit=${limit}&offset=${offset}`);
    }

    public async sendMessage(data: { userId: string, receiverId: string, text?: string, imageUrl?: string, videoUrl?: string, audioUrl?: string, fileUrl?: string, mediaType?: string }): Promise<any> {
        return this.request<any>('action=send_message', {
            method: 'POST',
            body: JSON.stringify(data)
        });
    }
}

export const db = new DBService();