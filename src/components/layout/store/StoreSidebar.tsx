// src/components/layout/store/StoreSidebar.tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';

const links = [
  { href: '/dashboard', label: 'الرئيسية' },
  { href: '/orders', label: 'الطلبات' },
  { href: '/settings', label: 'الإعدادات' },
  { href: '/reviews', label: 'التقييمات' },
];

export default function StoreSidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 h-screen bg-gray-50 border-e p-4 fixed top-0 right-0 z-40 pt-16">
      <nav className="flex flex-col gap-2">
        {links.map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            className={clsx(
              'px-4 py-2 rounded text-right',
              pathname === href ? 'bg-primary text-white' : 'text-gray-700 hover:bg-gray-100'
            )}
          >
            {label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
