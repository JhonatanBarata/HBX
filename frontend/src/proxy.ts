import { NextResponse, type NextRequest } from "next/server";

const STATIC_FILE_PATTERN = /\.(?:avif|css|gif|ico|jpg|jpeg|js|json|map|mp4|png|svg|webmanifest|webp|woff|woff2)$/i;

export function proxy(request: NextRequest) {
  const response = NextResponse.next();
  const pathname = request.nextUrl.pathname;
  const acceptsHtml = request.headers.get("accept")?.includes("text/html") ?? false;

  if (request.method === "GET" && acceptsHtml && !pathname.startsWith("/_next/") && !STATIC_FILE_PATTERN.test(pathname)) {
    response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0");
    response.headers.set("Pragma", "no-cache");
    response.headers.set("Expires", "0");
    response.headers.set("Surrogate-Control", "no-store");
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
