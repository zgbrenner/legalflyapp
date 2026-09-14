import { createHealthResponse } from "./readiness";

export const runtime = "nodejs";

export function GET() {
  return createHealthResponse();
}
