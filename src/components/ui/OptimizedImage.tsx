// src/components/ui/OptimizedImage.tsx
/**
 * M6: Optimized Image Component
 * Automatically optimizes images with lazy loading and responsive sizing
 */

import React, { useState } from 'react';
import Image from 'next/image';
import {
    optimizeUploadcareImage,
    generateUploadcareSrcSet,
    isOptimizableImage,
    ImagePresets
} from '@/lib/image-optimizer';

interface OptimizedImageProps {
    src: string;
    alt: string;
    width?: number;
    height?: number;
    className?: string;
    preset?: keyof typeof ImagePresets;
    priority?: boolean;
    onClick?: () => void;
    objectFit?: 'cover' | 'contain' | 'fill' | 'none';
    fallback?: string;
}

export function OptimizedImage({
    src,
    alt,
    width = 400,
    height = 300,
    className = '',
    preset,
    priority = false,
    onClick,
    objectFit = 'cover',
    fallback = '/placeholder-image.png',
}: OptimizedImageProps) {
    const [error, setError] = useState(false);
    const [loaded, setLoaded] = useState(false);

    // Apply preset if specified
    const presetOptions = preset ? ImagePresets[preset] : { width, quality: 80, format: 'auto' as const };

    // Optimize URL if it's an Uploadcare image
    const optimizedSrc = !error && isOptimizableImage(src)
        ? optimizeUploadcareImage(src, presetOptions)
        : src;

    // Generate srcSet for responsive images
    const srcSet = isOptimizableImage(src)
        ? generateUploadcareSrcSet(src, [320, 640, 960])
        : undefined;

    const handleError = () => {
        setError(true);
    };

    const handleLoad = () => {
        setLoaded(true);
    };

    // For Uploadcare images, we can use regular img with srcSet
    if (isOptimizableImage(src) && !error) {
        return (
            <div
                className={`relative overflow-hidden ${className}`}
                style={{ width, height }}
                onClick={onClick}
            >
                {/* Skeleton placeholder */}
                {!loaded && (
                    <div className="absolute inset-0 bg-gray-200 dark:bg-gray-700 animate-pulse" />
                )}

                {/* Optimized image */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                    src={error ? fallback : optimizedSrc}
                    srcSet={srcSet}
                    sizes={`(max-width: 640px) 320px, (max-width: 960px) 640px, ${width}px`}
                    alt={alt}
                    loading={priority ? 'eager' : 'lazy'}
                    decoding="async"
                    onError={handleError}
                    onLoad={handleLoad}
                    className={`w-full h-full transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`}
                    style={{
                        objectFit,
                        width: '100%',
                        height: '100%',
                    }}
                />
            </div>
        );
    }

    // Fallback to Next.js Image for other sources
    return (
        <div
            className={`relative overflow-hidden ${className}`}
            style={{ width, height }}
            onClick={onClick}
        >
            <Image
                src={error ? fallback : src}
                alt={alt}
                fill
                sizes={`(max-width: 640px) 100vw, ${width}px`}
                priority={priority}
                onError={handleError}
                onLoad={handleLoad}
                style={{ objectFit }}
                className={`transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`}
            />
        </div>
    );
}

// Gallery component for review images
interface ImageGalleryProps {
    images: string[];
    className?: string;
    onImageClick?: (index: number) => void;
}

export function ImageGallery({ images, className = '', onImageClick }: ImageGalleryProps) {
    if (!images || images.length === 0) return null;

    const displayImages = images.slice(0, 4);
    const remainingCount = images.length - 4;

    return (
        <div className={`grid gap-2 ${displayImages.length === 1 ? 'grid-cols-1' : 'grid-cols-2'} ${className}`}>
            {displayImages.map((src, index) => (
                <div key={index} className="relative">
                    <OptimizedImage
                        src={src}
                        alt={`صورة ${index + 1}`}
                        width={200}
                        height={150}
                        preset="reviewCard"
                        className="rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
                        onClick={() => onImageClick?.(index)}
                    />
                    {index === 3 && remainingCount > 0 && (
                        <div className="absolute inset-0 bg-black/50 rounded-lg flex items-center justify-center">
                            <span className="text-white font-bold text-lg">+{remainingCount}</span>
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
}

export default OptimizedImage;
