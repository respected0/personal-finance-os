import { createRequestContext } from "../../../../server/observability/request-context";

export function GET(request: Request) {
  const context = createRequestContext(request.headers);
  return Response.json(
    {
      status: "ok",
      version: "1.2.0",
      request_id: context.request_id,
      timestamp: new Date().toISOString(),
    },
    {
      headers: {
        "cache-control": "no-store",
        "x-request-id": context.request_id,
      },
    },
  );
}
