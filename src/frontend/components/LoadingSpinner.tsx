"use client";

import { useEffect, useState } from 'react';

interface LoadingSpinnerProps {
  onComplete?: () => void;
  duration?: number;
}

export default function LoadingSpinner({ onComplete, duration = 2000 }: LoadingSpinnerProps) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setProgress(prev => {
        const newProgress = prev + (100 / (duration / 50));
        if (newProgress >= 100) {
          clearInterval(interval);
          setTimeout(() => onComplete?.(), 300);
          return 100;
        }
        return newProgress;
      });
    }, 50);

    return () => clearInterval(interval);
  }, [duration, onComplete]);

  return (
    <div className="flex flex-col items-center justify-center space-y-8">
      {/* 3D Loading Cube */}
      <div className="relative">
        <div className="w-16 h-16 relative transform-gpu">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 rounded-lg animate-pulse transform rotate-45 scale-75"></div>
          <div className="absolute inset-0 bg-gradient-to-br from-cyan-400 via-blue-500 to-purple-600 rounded-lg animate-bounce transform -rotate-12 scale-90 opacity-80"></div>
          <div className="absolute inset-0 bg-gradient-to-br from-purple-500 via-pink-500 to-red-500 rounded-lg animate-ping transform rotate-12 scale-110 opacity-60"></div>
        </div>
        
        {/* Orbital rings */}
        <div className="absolute -inset-8">
          <div className="w-32 h-32 border-2 border-blue-300/30 rounded-full animate-spin"></div>
          <div className="absolute inset-4 w-24 h-24 border-2 border-purple-300/30 rounded-full animate-spin" style={{ animationDirection: 'reverse', animationDuration: '3s' }}></div>
        </div>
      </div>

      {/* Loading Text with Typewriter Effect */}
      <div className="text-center space-y-4">
        <div className="flex items-center justify-center space-x-1">
          <span className="text-2xl font-bold bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 bg-clip-text text-transparent">
            جاري التحويل
          </span>
          <div className="flex space-x-1">
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"></div>
            <div className="w-2 h-2 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
            <div className="w-2 h-2 bg-pink-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
          </div>
        </div>
        
        <p className="text-muted-foreground text-lg">يتم توجيهك إلى لوحة التحكم</p>
      </div>

      {/* Progress Bar */}
      <div className="w-80 max-w-md bg-gray-200 rounded-full h-2 overflow-hidden">
        <div 
          className="h-2 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 rounded-full transition-all duration-100 ease-out relative"
          style={{ width: `${progress}%` }}
        >
          <div className="absolute inset-0 bg-white/30 rounded-full animate-pulse"></div>
        </div>
      </div>
      
      {/* Progress Percentage */}
      <div className="text-sm font-medium text-muted-foreground">
        {Math.round(progress)}%
      </div>
    </div>
  );
}