// src/components/layout/admin/AdminSidebar.tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';

const links = [
  { href: '/admin/dashboard', label: 'الرئيسية' },
  { href: '/admin/stores', label: 'المتاجر' },
  { href: '/admin/reviews', label: 'كل التقييمات' },
  { href: '/admin/abuse-reports', label: 'بلاغات الإساءة' },
];

export default function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 h-screen bg-gray-900 text-white p-4 fixed top-0 right-0 z-40 pt-16">
      <nav className="flex flex-col gap-2">
        {links.map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            className={clsx(
              'px-4 py-2 rounded text-right',
              pathname === href ? 'bg-primary text-white' : 'hover:bg-gray-800'
            )}
          >
            {label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
