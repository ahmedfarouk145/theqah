// public/widgets/offline-fallback.js

/**
 * Offline Support for TheQah Widget
 * 
 * Provides graceful degradation when network is unavailable.
 * Caches reviews locally and shows cached data when offline.
 */

(() => {
  const CACHE_KEY_PREFIX = 'theqah:reviews:';
  const CACHE_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours
  
  window.TheQahOffline = {
    /**
     * Check if online
     */
    isOnline: () => {
      return navigator.onLine;
    },
    
    /**
     * Save reviews to local cache
     */
    cacheReviews: (storeUid, reviews) => {
      if (!storeUid || !reviews) return;
      
      try {
        const cacheData = {
          reviews,
          timestamp: Date.now(),
          version: '1.0'
        };
        
        localStorage.setItem(
          `${CACHE_KEY_PREFIX}${storeUid}`,
          JSON.stringify(cacheData)
        );
      } catch (error) {
        console.warn('Failed to cache reviews:', error);
      }
    },
    
    /**
     * Get cached reviews
     */
    getCachedReviews: (storeUid) => {
      if (!storeUid) return null;
      
      try {
        const cached = localStorage.getItem(`${CACHE_KEY_PREFIX}${storeUid}`);
        if (!cached) return null;
        
        const cacheData = JSON.parse(cached);
        const age = Date.now() - (cacheData.timestamp || 0);
        
        // Return cached data if not expired
        if (age < CACHE_EXPIRY) {
          return cacheData.reviews;
        }
        
        // Clear expired cache
        localStorage.removeItem(`${CACHE_KEY_PREFIX}${storeUid}`);
        return null;
      } catch (error) {
        console.warn('Failed to get cached reviews:', error);
        return null;
      }
    },
    
    /**
     * Create offline message HTML
     */
    createOfflineMessage: () => {
      return `
        <div style="
          padding: 20px;
          text-align: center;
          background: #f8f9fa;
          border: 1px solid #dee2e6;
          border-radius: 8px;
          margin: 16px 0;
          direction: rtl;
        ">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#6c757d" stroke-width="2" style="margin-bottom: 12px;">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
            <circle cx="12" cy="12" r="3"></circle>
            <line x1="1" y1="1" x2="23" y2="23" stroke="#dc3545"></line>
          </svg>
          <h4 style="margin: 0 0 8px 0; color: #495057;">غير متصل بالإنترنت</h4>
          <p style="margin: 0; color: #6c757d; font-size: 14px;">
            يرجى التحقق من اتصالك بالإنترنت لعرض التقييمات
          </p>
        </div>
      `;
    },
    
    /**
     * Create cached data indicator
     */
    createCachedIndicator: () => {
      return `
        <div style="
          padding: 8px 12px;
          background: #fff3cd;
          border: 1px solid #ffeaa7;
          border-radius: 4px;
          margin-bottom: 12px;
          font-size: 12px;
          color: #856404;
          direction: rtl;
          text-align: center;
        ">
          📦 تظهر التقييمات المحفوظة (غير متصل بالإنترنت)
        </div>
      `;
    },
    
    /**
     * Fetch reviews with offline fallback
     */
    fetchWithFallback: async (url, storeUid) => {
      // If offline, return cached data immediately
      if (!window.TheQahOffline.isOnline()) {
        const cached = window.TheQahOffline.getCachedReviews(storeUid);
        if (cached) {
          return {
            success: true,
            data: cached,
            fromCache: true
          };
        }
        return {
          success: false,
          offline: true
        };
      }
      
      // Try to fetch from network
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        
        const response = await fetch(url, {
          cache: 'no-store',
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (response.ok) {
          const data = await response.json();
          
          // Cache the successful response
          if (data.reviews) {
            window.TheQahOffline.cacheReviews(storeUid, data.reviews);
          }
          
          return {
            success: true,
            data: data.reviews || [],
            fromCache: false
          };
        }
        
        // Network error, try cache
        const cached = window.TheQahOffline.getCachedReviews(storeUid);
        if (cached) {
          return {
            success: true,
            data: cached,
            fromCache: true
          };
        }
        
        return {
          success: false,
          error: 'Network error'
        };
        
      } catch (error) {
        // Fetch failed, try cache
        const cached = window.TheQahOffline.getCachedReviews(storeUid);
        if (cached) {
          return {
            success: true,
            data: cached,
            fromCache: true
          };
        }
        
        return {
          success: false,
          error: error.message
        };
      }
    },
    
    /**
     * Setup online/offline event listeners
     */
    setupListeners: (onStatusChange) => {
      window.addEventListener('online', () => {
        console.log('🟢 Connection restored');
        if (onStatusChange) onStatusChange(true);
      });
      
      window.addEventListener('offline', () => {
        console.log('🔴 Connection lost');
        if (onStatusChange) onStatusChange(false);
      });
    }
  };
  
  console.log('TheQah Offline Support loaded ✨');
})();
