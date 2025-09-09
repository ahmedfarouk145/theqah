// src/components/NavbarLanding.tsx
'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { useState } from 'react';

export default function NavbarLanding() {
  const [open, setOpen] = useState(false);

  const NavLinks = (
    <>
      <Link href="/support" className="hover:text-green-900 transition">الدعم</Link>
      <Link href="/terms" className="hover:text-green-900 transition">الشروط</Link>
      <Link href="/privacy-policy" className="hover:text-green-900 transition">الخصوصية</Link>
      <Link href="/report" className="hover:text-green-900 transition">الإبلاغ</Link>
      <Link href="/faq" className="hover:text-green-900 transition">الأسئلة الشائعة</Link>
    </>
  );

  return (
    <nav className="w-full flex items-center justify-between px-6 py-4 shadow-md bg-white fixed top-0 z-50" dir="rtl">
      {/* Logo + Name */}
      <Link href="/" className="flex items-center gap-4 group">
        <div className="w-14 h-14 rounded-full overflow-hidden border border-green-300 shadow-sm group-hover:scale-105 transition-transform">
          <Image
            src="/logo.png"
            alt="شعار ثقة"
            width={56}
            height={56}
            className="object-cover w-full h-full"
            priority
          />
        </div>
        <span className="text-2xl font-extrabold text-green-800 tracking-tight group-hover:text-green-900 transition-colors">
          ثقة
        </span>
      </Link>

      {/* Desktop Navigation */}
      <div className="hidden md:flex items-center gap-6 text-sm text-green-700 font-medium">
        {NavLinks}
        <Link
          href="/login"
          className="bg-green-700 text-white px-5 py-2 rounded-full hover:bg-green-800 transition"
        >
          تسجيل الدخول
        </Link>
      </div>

      {/* Mobile */}
      <div className="md:hidden flex items-center gap-4">
        <Link
          href="/login"
          className="text-green-700 hover:text-green-900 font-semibold transition"
        >
          دخول
        </Link>

        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger aria-label="فتح القائمة" className="p-2 rounded-md border border-green-200">
            {/* أيقونة همبرجر بسيطة بـ SVG عشان ما نعتمد مكتبة خارجية */}
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M4 6h16M4 12h16M4 18h16" stroke="#166534" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </SheetTrigger>
          <SheetContent side="right" className="w-[80vw] sm:w-[360px]">
            <div className="mt-8 space-y-4 text-green-800 font-medium text-base">
              <Link href="/" onClick={() => setOpen(false)} className="block hover:text-green-900 transition">الرئيسية</Link>
              <Link href="/support" onClick={() => setOpen(false)} className="block hover:text-green-900 transition">الدعم</Link>
              <Link href="/terms" onClick={() => setOpen(false)} className="block hover:text-green-900 transition">الشروط</Link>
              <Link href="/privacy-policy" onClick={() => setOpen(false)} className="block hover:text-green-900 transition">الخصوصية</Link>
              <Link href="/report" onClick={() => setOpen(false)} className="block hover:text-green-900 transition">الإبلاغ</Link>
              <Link href="/faq" onClick={() => setOpen(false)} className="block hover:text-green-900 transition">الأسئلة الشائعة</Link>

              <div className="pt-4">
                <Link
                  href="/signup"
                  onClick={() => setOpen(false)}
                  className="block text-center bg-green-700 text-white px-5 py-2 rounded-full hover:bg-green-800 transition"
                >
                  ابدأ الآن مجانًا
                </Link>
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </nav>
  );
}
