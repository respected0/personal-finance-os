import { type NextRequest, NextResponse } from "next/server";
import { createRequestContext } from "./server/observability/request-context";

export function middleware(request: NextRequest) {
  const context = createRequestContext(request.headers);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-request-id", context.request_id);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  response.headers.set("x-request-id", context.request_id);
  return response;
}

export const config = {
  matcher: ["/api/:path*", "/auth/:path*"],
};
