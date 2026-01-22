// src/components/ui/Skeleton.tsx
/**
 * M4: Loading Skeleton Component
 * Provides skeleton loading states for dashboard components
 */

import React from 'react';

interface SkeletonProps {
    className?: string;
    width?: string | number;
    height?: string | number;
    rounded?: 'none' | 'sm' | 'md' | 'lg' | 'full';
    animate?: boolean;
}

export function Skeleton({
    className = '',
    width,
    height,
    rounded = 'md',
    animate = true,
}: SkeletonProps) {
    const roundedClasses = {
        none: 'rounded-none',
        sm: 'rounded-sm',
        md: 'rounded-md',
        lg: 'rounded-lg',
        full: 'rounded-full',
    };

    const style: React.CSSProperties = {
        width: width || '100%',
        height: height || '1rem',
    };

    return (
        <div
            className={`bg-gray-200 dark:bg-gray-700 ${roundedClasses[rounded]} ${animate ? 'animate-pulse' : ''} ${className}`}
            style={style}
        />
    );
}

// Skeleton for text lines
export function SkeletonText({ lines = 3, className = '' }: { lines?: number; className?: string }) {
    return (
        <div className={`space-y-2 ${className}`}>
            {Array.from({ length: lines }).map((_, i) => (
                <Skeleton
                    key={i}
                    height="0.875rem"
                    width={i === lines - 1 ? '60%' : '100%'}
                />
            ))}
        </div>
    );
}

// Skeleton for cards
export function SkeletonCard({ className = '' }: { className?: string }) {
    return (
        <div className={`bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 ${className}`}>
            <div className="flex items-center gap-3 mb-4">
                <Skeleton width={40} height={40} rounded="full" />
                <div className="flex-1">
                    <Skeleton height="1rem" width="60%" className="mb-2" />
                    <Skeleton height="0.75rem" width="40%" />
                </div>
            </div>
            <SkeletonText lines={2} />
        </div>
    );
}

// Skeleton for stat cards
export function SkeletonStatCard({ className = '' }: { className?: string }) {
    return (
        <div className={`bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 ${className}`}>
            <Skeleton height="0.75rem" width="50%" className="mb-2" />
            <Skeleton height="2rem" width="70%" className="mb-1" />
            <Skeleton height="0.625rem" width="30%" />
        </div>
    );
}

// Skeleton for review items
export function SkeletonReview({ className = '' }: { className?: string }) {
    return (
        <div className={`bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 ${className}`}>
            <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                    <Skeleton width={36} height={36} rounded="full" />
                    <div>
                        <Skeleton height="0.875rem" width={100} className="mb-1" />
                        <Skeleton height="0.75rem" width={80} />
                    </div>
                </div>
                <Skeleton height="1.25rem" width={80} rounded="lg" />
            </div>
            {/* Stars skeleton */}
            <div className="flex gap-1 mb-3">
                {[1, 2, 3, 4, 5].map((i) => (
                    <Skeleton key={i} width={16} height={16} rounded="sm" />
                ))}
            </div>
            <SkeletonText lines={2} />
        </div>
    );
}

// Skeleton for table rows
export function SkeletonTableRow({ columns = 5, className = '' }: { columns?: number; className?: string }) {
    return (
        <tr className={className}>
            {Array.from({ length: columns }).map((_, i) => (
                <td key={i} className="px-4 py-3">
                    <Skeleton height="0.875rem" width={i === 0 ? '80%' : '60%'} />
                </td>
            ))}
        </tr>
    );
}

// Skeleton for dashboard stats grid
export function SkeletonDashboardStats({ count = 4, className = '' }: { count?: number; className?: string }) {
    return (
        <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 ${className}`}>
            {Array.from({ length: count }).map((_, i) => (
                <SkeletonStatCard key={i} />
            ))}
        </div>
    );
}

// Skeleton for reviews list
export function SkeletonReviewsList({ count = 5, className = '' }: { count?: number; className?: string }) {
    return (
        <div className={`space-y-4 ${className}`}>
            {Array.from({ length: count }).map((_, i) => (
                <SkeletonReview key={i} />
            ))}
        </div>
    );
}

// Skeleton for analytics chart
export function SkeletonChart({ className = '' }: { className?: string }) {
    return (
        <div className={`bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 ${className}`}>
            <div className="flex justify-between items-center mb-4">
                <Skeleton height="1.25rem" width={150} />
                <div className="flex gap-2">
                    <Skeleton height="2rem" width={80} rounded="lg" />
                    <Skeleton height="2rem" width={80} rounded="lg" />
                </div>
            </div>
            <div className="h-64 flex items-end justify-between gap-2 pt-4">
                {Array.from({ length: 12 }).map((_, i) => (
                    <Skeleton
                        key={i}
                        width="100%"
                        height={`${20 + Math.random() * 80}%`}
                        rounded="sm"
                    />
                ))}
            </div>
        </div>
    );
}

export default Skeleton;
