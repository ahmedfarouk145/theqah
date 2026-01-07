/**
 * Shared types between UI and BE
 * @module shared/types
 */

// Re-export core types that are used by both UI and BE
export type {
    EntityBase,
    PaginationOptions,
    PaginatedResult,
    Review,
    ReviewToken,
    Store,
    Order,
    Owner,
    Domain,
    ReviewStatus,
    ServiceResult,
} from '@/server/core/types';

// UI-specific types
export interface DashboardStats {
    totalReviews: number;
    averageRating: number;
    pendingReviews: number;
    verifiedReviews: number;
}

export interface ApiResponse<T = unknown> {
    success: boolean;
    data?: T;
    error?: string;
    message?: string;
}

export interface AuthUser {
    uid: string;
    email: string;
    displayName?: string;
    role: 'admin' | 'user';
    storeUid?: string;
}

// Navigation types
export interface NavItem {
    label: string;
    href: string;
    icon?: string;
    badge?: number;
}

// Form types
export interface ReviewFormData {
    stars: number;
    text: string;
    images?: File[];
}

export interface SettingsFormData {
    storeName: string;
    email: string;
    autoApprove: boolean;
    minStarsForAutoApprove: number;
}
