import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

const ALLOW = [
  "http://localhost:3000",
  "https://theqah.com.sa",
  "https://www.theqah.com.sa",
];

export function middleware(req: NextRequest) {
  const origin = req.headers.get('origin') || '';
  const res = NextResponse.next();

  if (ALLOW.includes(origin)) {
    res.headers.set('Access-Control-Allow-Origin', origin);
    res.headers.set('Vary', 'Origin');
    res.headers.set('Access-Control-Allow-Credentials', 'true');
    res.headers.set('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  }

  if (req.method === 'OPTIONS') {
    return new NextResponse(null, { status: 204, headers: res.headers });
  }

  return res;
}

export const config = {
  matcher: ['/api/admin/:path*'],
};
