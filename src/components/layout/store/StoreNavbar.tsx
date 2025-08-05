'use client';

import Image from 'next/image';

export default function StoreNavbar() {
  return (
    <header className="w-full bg-white px-4 py-3 shadow border-b">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          <Image src="/logo.png" alt="Thiqah Logo" width={120} height={40} className="h-8 w-auto" />
          <h1 className="text-xl font-bold text-gray-800">لوحة المتجر</h1>
        </div>
      </div>
    </header>
  );
}
