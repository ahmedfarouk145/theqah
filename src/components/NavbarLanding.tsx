'use client';

import Link from 'next/link';
import Image from 'next/image';

export default function NavbarLanding() {
  return (
    <nav className="w-full flex items-center justify-between px-6 py-4 shadow-md bg-white fixed top-0 z-50">
      {/* Logo + Name */}
      <Link href="/" className="flex items-center gap-4 group">
        <div className="w-14 h-14 rounded-full overflow-hidden border border-green-300 shadow-sm group-hover:scale-105 transition-transform">
          <Image
            src="/logo.png"
            alt="شعار ثقة"
            width={56}
            height={56}
            className="object-cover w-full h-full"
          />
        </div>
        <span className="text-2xl font-extrabold text-green-800 tracking-tight group-hover:text-green-900 transition-colors">
          ثقة
        </span>
      </Link>

      {/* Navigation */}
      <div className="hidden md:flex items-center gap-6 text-sm text-green-700 font-medium">
        <Link href="/support" className="hover:text-green-900 transition">الدعم</Link>
        <Link href="/terms" className="hover:text-green-900 transition">الشروط</Link>
        <Link href="/privacy-policy" className="hover:text-green-900 transition">الخصوصية</Link>
        <Link href="/report" className="hover:text-green-900 transition">الإبلاغ</Link>
        <Link
          href="/login"
          className="bg-green-700 text-white px-5 py-2 rounded-full hover:bg-green-800 transition"
        >
          تسجيل الدخول
        </Link>
      </div>

      {/* Mobile Shortcut */}
      <div className="md:hidden">
        <Link
          href="/login"
          className="text-green-700 hover:text-green-900 font-semibold transition"
        >
          دخول
        </Link>
      </div>
    </nav>
  );
}
