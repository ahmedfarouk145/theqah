// src/__tests__/utils/pagination.test.ts
import { describe, it, expect } from 'vitest';

/**
 * Pagination Tests (H5)
 * 
 * Tests for:
 * - Cursor-based pagination
 * - Offset-based pagination
 * - Page size validation
 * - Total count calculation
 */

interface PaginationOptions {
  page?: number;
  pageSize?: number;
  cursor?: string;
  offset?: number;
}

interface PaginatedResult<T> {
  data: T[];
  pagination: {
    total?: number;
    page?: number;
    pageSize: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
    nextCursor?: string;
    prevCursor?: string;
  };
}

// Cursor-based pagination
const paginateWithCursor = <T extends { id: string }>(
  data: T[],
  options: PaginationOptions = {}
): PaginatedResult<T> => {
  const pageSize = Math.min(options.pageSize || 20, 100); // Max 100 items
  const cursor = options.cursor;
  
  let startIndex = 0;
  if (cursor) {
    // Find index of cursor item
    const cursorIndex = data.findIndex(item => item.id === cursor);
    startIndex = cursorIndex >= 0 ? cursorIndex + 1 : 0;
  }
  
  const paginatedData = data.slice(startIndex, startIndex + pageSize);
  const hasNextPage = startIndex + pageSize < data.length;
  const hasPreviousPage = startIndex > 0;
  
  return {
    data: paginatedData,
    pagination: {
      pageSize,
      hasNextPage,
      hasPreviousPage,
      nextCursor: hasNextPage && paginatedData.length > 0 
        ? paginatedData[paginatedData.length - 1].id 
        : undefined,
      prevCursor: hasPreviousPage && data[startIndex - 1]
        ? data[startIndex - 1].id
        : undefined
    }
  };
};

// Offset-based pagination
const paginateWithOffset = <T>(
  data: T[],
  options: PaginationOptions = {}
): PaginatedResult<T> => {
  const page = Math.max(options.page || 1, 1);
  const pageSize = Math.min(options.pageSize || 20, 100);
  const offset = (page - 1) * pageSize;
  
  const paginatedData = data.slice(offset, offset + pageSize);
  const total = data.length;
  const totalPages = Math.ceil(total / pageSize);
  
  return {
    data: paginatedData,
    pagination: {
      total,
      page,
      pageSize,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1
    }
  };
};

// Validate page size
const validatePageSize = (pageSize: number): number => {
  if (pageSize < 1) return 20; // Default
  if (pageSize > 100) return 100; // Max
  return pageSize;
};

// Calculate total pages
const calculateTotalPages = (total: number, pageSize: number): number => {
  return Math.ceil(total / pageSize);
};

describe('Pagination', () => {
  
  const sampleData = Array.from({ length: 50 }, (_, i) => ({
    id: `item-${i + 1}`,
    name: `Item ${i + 1}`
  }));
  
  describe('Cursor-Based Pagination', () => {
    
    it('should return first page without cursor', () => {
      const result = paginateWithCursor(sampleData, { pageSize: 10 });
      
      expect(result.data.length).toBe(10);
      expect(result.data[0].id).toBe('item-1');
      expect(result.pagination.hasNextPage).toBe(true);
      expect(result.pagination.hasPreviousPage).toBe(false);
    });
    
    it('should return next page with cursor', () => {
      const firstPage = paginateWithCursor(sampleData, { pageSize: 10 });
      const secondPage = paginateWithCursor(sampleData, { 
        pageSize: 10, 
        cursor: firstPage.pagination.nextCursor 
      });
      
      expect(secondPage.data.length).toBe(10);
      expect(secondPage.data[0].id).toBe('item-11');
      expect(secondPage.pagination.hasPreviousPage).toBe(true);
    });
    
    it('should handle last page correctly', () => {
      const result = paginateWithCursor(sampleData, { 
        pageSize: 10,
        cursor: 'item-45' // Near end
      });
      
      expect(result.data.length).toBe(5); // Items 46-50
      expect(result.pagination.hasNextPage).toBe(false);
    });
    
    it('should use default page size when not provided', () => {
      const result = paginateWithCursor(sampleData);
      
      expect(result.data.length).toBe(20); // Default page size
      expect(result.pagination.pageSize).toBe(20);
    });
    
    it('should limit page size to maximum', () => {
      const result = paginateWithCursor(sampleData, { pageSize: 200 });
      
      expect(result.pagination.pageSize).toBe(100); // Max 100
    });
    
    it('should provide next cursor', () => {
      const result = paginateWithCursor(sampleData, { pageSize: 10 });
      
      expect(result.pagination.nextCursor).toBe('item-10');
    });
    
    it('should provide previous cursor', () => {
      const result = paginateWithCursor(sampleData, { 
        pageSize: 10,
        cursor: 'item-20' 
      });
      
      expect(result.pagination.prevCursor).toBe('item-20');
    });
    
    it('should handle invalid cursor gracefully', () => {
      const result = paginateWithCursor(sampleData, { 
        pageSize: 10,
        cursor: 'invalid-id' 
      });
      
      expect(result.data[0].id).toBe('item-1'); // Start from beginning
    });
  });
  
  describe('Offset-Based Pagination', () => {
    
    it('should return first page', () => {
      const result = paginateWithOffset(sampleData, { page: 1, pageSize: 10 });
      
      expect(result.data.length).toBe(10);
      expect(result.data[0].id).toBe('item-1');
      expect(result.pagination.page).toBe(1);
      expect(result.pagination.total).toBe(50);
    });
    
    it('should return specific page', () => {
      const result = paginateWithOffset(sampleData, { page: 3, pageSize: 10 });
      
      expect(result.data.length).toBe(10);
      expect(result.data[0].id).toBe('item-21'); // Page 3 starts at item 21
      expect(result.pagination.page).toBe(3);
    });
    
    it('should return last page with remaining items', () => {
      const result = paginateWithOffset(sampleData, { page: 5, pageSize: 10 });
      
      expect(result.data.length).toBe(10); // Items 41-50
      expect(result.pagination.hasNextPage).toBe(false);
    });
    
    it('should return empty array for out of range page', () => {
      const result = paginateWithOffset(sampleData, { page: 10, pageSize: 10 });
      
      expect(result.data.length).toBe(0);
      expect(result.pagination.hasNextPage).toBe(false);
    });
    
    it('should calculate hasNextPage correctly', () => {
      const result1 = paginateWithOffset(sampleData, { page: 1, pageSize: 10 });
      const result2 = paginateWithOffset(sampleData, { page: 5, pageSize: 10 });
      
      expect(result1.pagination.hasNextPage).toBe(true);
      expect(result2.pagination.hasNextPage).toBe(false);
    });
    
    it('should calculate hasPreviousPage correctly', () => {
      const result1 = paginateWithOffset(sampleData, { page: 1, pageSize: 10 });
      const result2 = paginateWithOffset(sampleData, { page: 3, pageSize: 10 });
      
      expect(result1.pagination.hasPreviousPage).toBe(false);
      expect(result2.pagination.hasPreviousPage).toBe(true);
    });
    
    it('should handle page 0 as page 1', () => {
      const result = paginateWithOffset(sampleData, { page: 0, pageSize: 10 });
      
      expect(result.pagination.page).toBe(1);
      expect(result.data[0].id).toBe('item-1');
    });
    
    it('should handle negative page as page 1', () => {
      const result = paginateWithOffset(sampleData, { page: -5, pageSize: 10 });
      
      expect(result.pagination.page).toBe(1);
    });
  });
  
  describe('Page Size Validation', () => {
    
    it('should accept valid page sizes', () => {
      expect(validatePageSize(10)).toBe(10);
      expect(validatePageSize(50)).toBe(50);
      expect(validatePageSize(100)).toBe(100);
    });
    
    it('should use default for invalid page sizes', () => {
      expect(validatePageSize(0)).toBe(20);
      expect(validatePageSize(-10)).toBe(20);
    });
    
    it('should cap at maximum', () => {
      expect(validatePageSize(200)).toBe(100);
      expect(validatePageSize(1000)).toBe(100);
    });
    
    it('should accept minimum valid size', () => {
      expect(validatePageSize(1)).toBe(1);
    });
  });
  
  describe('Total Count Calculation', () => {
    
    it('should calculate total pages correctly', () => {
      expect(calculateTotalPages(50, 10)).toBe(5);
      expect(calculateTotalPages(55, 10)).toBe(6);
      expect(calculateTotalPages(100, 20)).toBe(5);
    });
    
    it('should handle zero total', () => {
      expect(calculateTotalPages(0, 10)).toBe(0);
    });
    
    it('should handle single page', () => {
      expect(calculateTotalPages(5, 10)).toBe(1);
    });
    
    it('should round up partial pages', () => {
      expect(calculateTotalPages(25, 10)).toBe(3); // 10, 10, 5
      expect(calculateTotalPages(31, 10)).toBe(4);
    });
  });
  
  describe('Edge Cases', () => {
    
    it('should handle empty data array', () => {
      const result = paginateWithOffset([], { page: 1, pageSize: 10 });
      
      expect(result.data.length).toBe(0);
      expect(result.pagination.total).toBe(0);
      expect(result.pagination.hasNextPage).toBe(false);
    });
    
    it('should handle single item', () => {
      const singleItem = [{ id: 'item-1', name: 'Item 1' }];
      const result = paginateWithCursor(singleItem, { pageSize: 10 });
      
      expect(result.data.length).toBe(1);
      expect(result.pagination.hasNextPage).toBe(false);
    });
    
    it('should handle exact page size match', () => {
      const exactData = Array.from({ length: 20 }, (_, i) => ({
        id: `item-${i + 1}`,
        name: `Item ${i + 1}`
      }));
      
      const result = paginateWithOffset(exactData, { page: 1, pageSize: 20 });
      
      expect(result.data.length).toBe(20);
      expect(result.pagination.hasNextPage).toBe(false);
    });
    
    it('should handle data smaller than page size', () => {
      const smallData = Array.from({ length: 5 }, (_, i) => ({
        id: `item-${i + 1}`,
        name: `Item ${i + 1}`
      }));
      
      const result = paginateWithOffset(smallData, { page: 1, pageSize: 10 });
      
      expect(result.data.length).toBe(5);
      expect(result.pagination.hasNextPage).toBe(false);
    });
  });
  
  describe('Performance', () => {
    
    it('should handle large datasets efficiently', () => {
      const largeData = Array.from({ length: 10000 }, (_, i) => ({
        id: `item-${i + 1}`,
        name: `Item ${i + 1}`
      }));
      
      const start = Date.now();
      const result = paginateWithOffset(largeData, { page: 50, pageSize: 100 });
      const duration = Date.now() - start;
      
      expect(result.data.length).toBe(100);
      expect(duration).toBeLessThan(50); // Should be very fast
    });
    
    it('should efficiently find cursor in large dataset', () => {
      const largeData = Array.from({ length: 10000 }, (_, i) => ({
        id: `item-${i + 1}`,
        name: `Item ${i + 1}`
      }));
      
      const start = Date.now();
      const result = paginateWithCursor(largeData, { 
        pageSize: 100,
        cursor: 'item-5000' 
      });
      const duration = Date.now() - start;
      
      expect(result.data.length).toBe(100);
      expect(duration).toBeLessThan(50);
    });
  });
  
  describe('Consistency', () => {
    
    it('should return consistent results for same parameters', () => {
      const result1 = paginateWithOffset(sampleData, { page: 2, pageSize: 10 });
      const result2 = paginateWithOffset(sampleData, { page: 2, pageSize: 10 });
      
      expect(result1.data).toEqual(result2.data);
      expect(result1.pagination).toEqual(result2.pagination);
    });
    
    it('should maintain order across pages', () => {
      const page1 = paginateWithOffset(sampleData, { page: 1, pageSize: 10 });
      const page2 = paginateWithOffset(sampleData, { page: 2, pageSize: 10 });
      
      const lastOfPage1 = page1.data[page1.data.length - 1];
      const firstOfPage2 = page2.data[0];
      
      expect(parseInt(firstOfPage2.id.split('-')[1])).toBe(
        parseInt(lastOfPage1.id.split('-')[1]) + 1
      );
    });
  });
});
