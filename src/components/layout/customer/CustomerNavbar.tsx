'use client';

import Image from 'next/image';

export default function CustomerNavbar() {
  return (
    <nav className="w-full bg-white shadow fixed top-0 left-0 z-50 px-4 py-3 border-b">
      <div className="max-w-6xl mx-auto flex items-center justify-between">
        <Image src="/logo.png" alt="Thiqah Logo" width={120} height={40} className="h-8 w-auto" />
      </div>
    </nav>
  );
}
