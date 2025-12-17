// public/widgets/loading-skeleton.js

/**
 * Loading Skeleton for TheQah Widget
 * 
 * Provides a beautiful loading animation while reviews are being fetched.
 * Prevents blank space and improves perceived performance.
 */

(() => {
  window.TheQahLoadingSkeleton = {
    /**
     * Create loading skeleton HTML
     */
    create: (count = 3) => {
      const styles = `
        <style>
          .theqah-skeleton {
            background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
            background-size: 200% 100%;
            animation: theqah-loading 1.5s ease-in-out infinite;
            border-radius: 4px;
          }
          
          @keyframes theqah-loading {
            0% { background-position: 200% 0; }
            100% { background-position: -200% 0; }
          }
          
          .theqah-skeleton-review {
            padding: 16px;
            border: 1px solid #eee;
            border-radius: 8px;
            margin-bottom: 12px;
            background: #fff;
          }
          
          .theqah-skeleton-header {
            display: flex;
            align-items: center;
            margin-bottom: 12px;
          }
          
          .theqah-skeleton-avatar {
            width: 40px;
            height: 40px;
            border-radius: 50%;
            margin-right: 12px;
          }
          
          .theqah-skeleton-name {
            height: 16px;
            width: 120px;
            margin-bottom: 4px;
          }
          
          .theqah-skeleton-date {
            height: 12px;
            width: 80px;
          }
          
          .theqah-skeleton-stars {
            height: 16px;
            width: 100px;
            margin-bottom: 12px;
          }
          
          .theqah-skeleton-text {
            height: 12px;
            margin-bottom: 8px;
          }
          
          .theqah-skeleton-text:last-child {
            width: 70%;
            margin-bottom: 0;
          }
          
          @media (prefers-color-scheme: dark) {
            .theqah-skeleton {
              background: linear-gradient(90deg, #2a2a2a 25%, #3a3a3a 50%, #2a2a2a 75%);
              background-size: 200% 100%;
            }
            
            .theqah-skeleton-review {
              background: #1a1a1a;
              border-color: #333;
            }
          }
        </style>
      `;
      
      let html = styles;
      
      for (let i = 0; i < count; i++) {
        html += `
          <div class="theqah-skeleton-review">
            <div class="theqah-skeleton-header">
              <div class="theqah-skeleton theqah-skeleton-avatar"></div>
              <div style="flex: 1;">
                <div class="theqah-skeleton theqah-skeleton-name"></div>
                <div class="theqah-skeleton theqah-skeleton-date"></div>
              </div>
            </div>
            <div class="theqah-skeleton theqah-skeleton-stars"></div>
            <div class="theqah-skeleton theqah-skeleton-text"></div>
            <div class="theqah-skeleton theqah-skeleton-text"></div>
            <div class="theqah-skeleton theqah-skeleton-text"></div>
          </div>
        `;
      }
      
      return html;
    },
    
    /**
     * Show loading skeleton in container
     */
    show: (container, count = 3) => {
      if (!container) return;
      container.innerHTML = window.TheQahLoadingSkeleton.create(count);
      container.setAttribute('data-loading', 'true');
    },
    
    /**
     * Hide loading skeleton
     */
    hide: (container) => {
      if (!container) return;
      container.removeAttribute('data-loading');
    }
  };
})();
