import { NextResponse } from 'next/server';

export function middleware(request) {
  const path = request.nextUrl.pathname;

  // Skip auth for login page, auth endpoint, and static assets
  if (
    path === '/login' ||
    path === '/api/auth' ||
    path.startsWith('/_next') ||
    path === '/favicon.ico' ||
    path === '/sync.js'
  ) {
    return NextResponse.next();
  }

  // Check auth cookie
  const authCookie = request.cookies.get('zhk-auth');
  const password = process.env.APP_PASSWORD || 'aksu2024';

  if (!authCookie || authCookie.value !== password) {
    // Redirect to login
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
