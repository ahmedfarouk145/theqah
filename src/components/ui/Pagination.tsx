// src/components/ui/Pagination.tsx
import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
  hasMore: boolean;
  onNext: () => void;
  onPrevious: () => void;
  hasPrevious: boolean;
  loading?: boolean;
  currentCount?: number;
  itemName?: string;
}

export default function Pagination({
  hasMore,
  onNext,
  onPrevious,
  hasPrevious,
  loading = false,
  currentCount = 0,
  itemName = 'عنصر'
}: PaginationProps) {
  return (
    <div className="flex items-center justify-between border-t border-gray-200 bg-white px-4 py-3 sm:px-6 rounded-b-lg">
      {/* Info */}
      <div className="flex flex-1 justify-between sm:hidden">
        <button
          onClick={onPrevious}
          disabled={!hasPrevious || loading}
          className="relative inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          السابق
        </button>
        <button
          onClick={onNext}
          disabled={!hasMore || loading}
          className="relative ml-3 inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          التالي
        </button>
      </div>

      <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
        <div>
          <p className="text-sm text-gray-700">
            عرض{' '}
            <span className="font-medium">{currentCount}</span>{' '}
            {itemName}
            {hasMore && <span className="text-gray-500"> • يوجد المزيد</span>}
          </p>
        </div>
        <div>
          <nav className="isolate inline-flex -space-x-px rounded-md shadow-sm" aria-label="Pagination">
            <button
              onClick={onPrevious}
              disabled={!hasPrevious || loading}
              className="relative inline-flex items-center rounded-r-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span className="sr-only">السابق</span>
              <ChevronRight className="h-5 w-5" aria-hidden="true" />
            </button>
            <button
              onClick={onNext}
              disabled={!hasMore || loading}
              className="relative inline-flex items-center rounded-l-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span className="sr-only">التالي</span>
              <ChevronLeft className="h-5 w-5" aria-hidden="true" />
            </button>
          </nav>
        </div>
      </div>
    </div>
  );
}
