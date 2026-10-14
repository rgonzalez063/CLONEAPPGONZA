import { NextResponse, type NextRequest } from 'next/server'

/** Pages need a login cookie. This only checks that one exists; the API checks that it is valid. */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  if (pathname === '/login' || pathname.startsWith('/api/')) return NextResponse.next()
  if (!req.cookies.get('asup_session')) {
    const url = req.nextUrl.clone()
    url.pathname = '/login'
    url.search = `?next=${encodeURIComponent(pathname)}`
    return NextResponse.redirect(url)
  }
  return NextResponse.next()
}

export const config = { matcher: ['/((?!_next/static|_next/image|icon.svg|favicon.ico).*)'] }
