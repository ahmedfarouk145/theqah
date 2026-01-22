// src/lib/image-optimizer.ts
/**
 * M6: Review Image Optimization
 * Utilities for optimizing user-uploaded review images
 */

export interface ImageOptimizeOptions {
    width?: number;
    height?: number;
    quality?: number;
    format?: 'auto' | 'webp' | 'jpeg' | 'png';
}

/**
 * Optimize Uploadcare image URL
 * Adds transformation parameters to ucarecdn.com URLs
 * 
 * @example
 * optimizeUploadcareImage('https://ucarecdn.com/abc123/', { width: 400, quality: 80 })
 * // Returns: 'https://ucarecdn.com/abc123/-/resize/400x/-/quality/smart/-/format/auto/'
 */
export function optimizeUploadcareImage(url: string, options: ImageOptimizeOptions = {}): string {
    if (!url || !url.includes('ucarecdn.com')) {
        return url;
    }

    const {
        width = 800,
        height,
        quality = 80,
        format = 'auto',
    } = options;

    // Remove trailing slash for consistent transformation
    const baseUrl = url.endsWith('/') ? url : url + '/';

    // Build transformation chain
    const transforms: string[] = [];

    // Resize
    if (width && height) {
        transforms.push(`-/resize/${width}x${height}/`);
    } else if (width) {
        transforms.push(`-/resize/${width}x/`);
    } else if (height) {
        transforms.push(`-/resize/x${height}/`);
    }

    // Quality
    if (quality < 100) {
        transforms.push(`-/quality/smart/`);
    }

    // Format
    if (format === 'webp') {
        transforms.push(`-/format/webp/`);
    } else if (format === 'auto') {
        transforms.push(`-/format/auto/`);
    }

    // Progressive loading for JPEG
    if (format === 'jpeg' || format === 'auto') {
        transforms.push(`-/progressive/yes/`);
    }

    return baseUrl + transforms.join('');
}

/**
 * Generate responsive image srcSet for Uploadcare images
 */
export function generateUploadcareSrcSet(url: string, sizes: number[] = [320, 640, 960, 1280]): string {
    if (!url || !url.includes('ucarecdn.com')) {
        return url;
    }

    return sizes
        .map(size => `${optimizeUploadcareImage(url, { width: size, format: 'auto' })} ${size}w`)
        .join(', ');
}

/**
 * Get optimized thumbnail URL
 */
export function getThumbnail(url: string, size: number = 150): string {
    return optimizeUploadcareImage(url, {
        width: size,
        height: size,
        format: 'webp',
        quality: 75
    });
}

/**
 * Optimize review images array
 */
export function optimizeReviewImages(
    images: string[],
    options: ImageOptimizeOptions = {}
): string[] {
    const defaultOptions: ImageOptimizeOptions = {
        width: 800,
        quality: 80,
        format: 'auto',
        ...options,
    };

    return images.map(url => {
        if (url.includes('ucarecdn.com')) {
            return optimizeUploadcareImage(url, defaultOptions);
        }
        // For Firebase Storage URLs, return as-is (can add optimization later)
        return url;
    });
}

/**
 * Get image dimensions for lazy loading
 */
export function getImageDimensions(aspectRatio: '1:1' | '4:3' | '16:9' | '3:4' = '4:3'): { width: number; height: number } {
    const ratios: Record<string, { width: number; height: number }> = {
        '1:1': { width: 400, height: 400 },
        '4:3': { width: 400, height: 300 },
        '16:9': { width: 400, height: 225 },
        '3:4': { width: 300, height: 400 },
    };
    return ratios[aspectRatio] || ratios['4:3'];
}

/**
 * Check if URL is an optimizable image
 */
export function isOptimizableImage(url: string): boolean {
    if (!url) return false;
    return url.includes('ucarecdn.com') || url.includes('firebasestorage.googleapis.com');
}

/**
 * Presets for common use cases
 */
export const ImagePresets = {
    thumbnail: { width: 150, height: 150, quality: 75, format: 'webp' as const },
    reviewCard: { width: 400, quality: 80, format: 'auto' as const },
    fullSize: { width: 1200, quality: 85, format: 'auto' as const },
    avatar: { width: 80, height: 80, quality: 70, format: 'webp' as const },
};

const ImageOptimizer = {
    optimizeUploadcareImage,
    generateUploadcareSrcSet,
    getThumbnail,
    optimizeReviewImages,
    getImageDimensions,
    isOptimizableImage,
    ImagePresets,
};

export default ImageOptimizer;
