
/**
 * Global Type Definitions for StreamPay
 */

export enum UserRole {
  ADMIN = 'ADMIN',
  USER = 'USER'
}

export enum VideoCategory {
  PERSONAL = 'PERSONAL',
  GENERAL = 'GENERAL',
  MOVIES = 'MOVIES',
  SERIES = 'SERIES',
  SPORTS = 'SPORTS',
  MUSIC = 'MUSIC',
  OTHER = 'OTHER'
}

export interface Category {
  id: string;
  name: string;
  price: number;
  autoSub: boolean;
  parent?: string | null;
  sortOrder?: 'LATEST' | 'ALPHA' | 'RANDOM';
}

export interface User {
  id: string;
  username: string;
  role: UserRole | string;
  balance: number;
  sessionToken?: string;
  avatarUrl?: string;
  lastActive?: number;
  lastDeviceId?: string;
  watchLater: string[];
  autoPurchaseLimit: number;
  defaultPrices?: Record<string, number>;
  shippingDetails?: any;
  vipExpiry?: number;
  is_verified_seller?: boolean | number;
}

export interface Video {
  id: string;
  title: string;
  description: string;
  price: number;
  category: string;
  parent_category?: string;
  collection?: string;
  duration: number;
  thumbnailUrl: string;
  videoUrl: string;
  creatorId: string;
  creatorName: string;
  creatorRole?: string; // Nuevo campo para validar acceso VIP
  creatorAvatarUrl?: string;
  createdAt: number;
  views: number;
  likes: number;
  dislikes: number;
  isLocal?: boolean | number | string;
  is_audio?: boolean | number;
  transcode_status?: 'NONE' | 'WAITING' | 'PROCESSING' | 'FAILED' | 'DONE';
  reason?: string;
  transcode_progress?: number;
  size_fmt?: string;
}

export interface Comment {
  id: string;
  userId: string;
  username: string;
  userAvatarUrl?: string;
  text: string;
  timestamp: number;
}

export interface UserInteraction {
  liked: boolean;
  disliked: boolean;
  watched: boolean;
  newLikeCount?: number;
  newDislikeCount?: number;
}

export interface PaymentMethodConfig {
  enabled: boolean;
  instructions: string;
  exchangeRate?: number;
  currencySymbol?: string;
}

export interface FtpSettings {
  host: string;
  port: number;
  user: string;
  pass: string;
  rootPath: string;
}

export interface SystemSettings {
  downloadStartTime: string; 
  downloadEndTime: string;   
  isQueuePaused: boolean;
  batchSize: number;         
  maxDuration: number;       
  geminiKey: string;
  ytDlpPath: string;
  ffmpegPath: string;
  categories: Category[];
  localLibraryPath: string; 
  libraryPaths?: string[];
  videoCommission: number;
  marketCommission: number;
  transferFee?: number;
  vipPlans?: VipPlan[];
  paymentInstructions?: string;
  currencyConversion?: number;
  enableDebugLog?: boolean;
  autoTranscode?: boolean | number;
  tropipayClientId?: string;
  tropipayClientSecret?: string;
  paymentMethods?: {
    tropipay?: PaymentMethodConfig;
    card?: PaymentMethodConfig;
    mobile?: PaymentMethodConfig;
    manual?: PaymentMethodConfig;
    cash?: PaymentMethodConfig;
  };
  is_transcoder_active?: boolean;
  maxResolution?: number;
  ftpSettings?: FtpSettings;
}

export interface Transaction {
  id: string;
  type: 'PURCHASE' | 'DEPOSIT' | 'MARKETPLACE' | 'VIP' | 'TRANSFER_SENT' | 'TRANSFER_RECV';
  amount: number | string;
  buyerId?: string;
  buyerName?: string;
  videoTitle?: string;
  timestamp: number;
  recipientName?: string;
  senderName?: string;
  creatorId?: string;
  adminFee?: number | string;
  isExternal?: boolean | number;
}

export interface Notification {
    id: string;
    userId: string;
    text: string;
    type: 'SALE' | 'UPLOAD' | 'SYSTEM';
    link: string;
    isRead: boolean;
    timestamp: number;
    metadata?: any;
    avatarUrl?: string;
}

export interface ContentRequest {
  id: string;
  userId: string;
  username?: string;
  query: string;
  status: 'PENDING' | 'COMPLETED' | 'FAILED' | string;
  createdAt: number;
  isVip: boolean;
}

export interface MarketplaceItem {
    id: string;
    title: string;
    description: string;
    price: number;
    originalPrice?: number;
    stock?: number;
    category?: string;
    condition?: string;
    sellerId: string;
    sellerName: string;
    images?: string[];
    status?: 'ACTIVO' | 'AGOTADO' | 'ELIMINADO';
    createdAt: number;
    discountPercent?: number;
    rating?: number;
    reviewCount?: number;
    sellerAvatarUrl?: string;
    isVerifiedSeller?: boolean | number;
}

export interface MarketplaceReview {
  id: string;
  userId: string;
  username: string;
  userAvatarUrl?: string;
  rating: number;
  comment: string;
  timestamp: number;
}

export interface VideoResult {
  id: string;
  title: string;
}

export interface SmartCleanerResult {
  preview: {
    id: string;
    title: string;
    views: number;
    size_fmt: string;
    reason: string;
  }[];
  stats: {
    spaceReclaimed: string;
  };
}

export interface FtpFile {
  name: string;
  type: 'dir' | 'file';
  path: string;
  size?: string;
}

export interface CartItem extends MarketplaceItem {
    quantity: number;
}

export interface BalanceRequest {
    id: string;
    userId: string;
    username: string;
    amount: number;
    createdAt: number;
}

export interface VipRequest {
    id: string;
    userId: string;
    username: string;
    planSnapshot: any;
    paymentRef?: string;
    proofText?: string;
    proofImageUrl?: string;
    createdAt: number;
    status: 'PENDING' | 'APPROVED' | 'REJECTED';
}

export interface VipPlan {
  id: string;
  name: string;
  price: number;
  type: 'ACCESS' | 'BALANCE';
  durationDays?: number;
  bonusPercent?: number;
  highlight?: boolean;
}

export interface SellerVerificationRequest {
    id: string;
    userId: string;
    username: string;
    fullName: string;
    idNumber: string;
    address: string;
    mobile: string;
    status: 'PENDING' | 'APPROVED' | 'REJECTED';
    createdAt: number;
}
