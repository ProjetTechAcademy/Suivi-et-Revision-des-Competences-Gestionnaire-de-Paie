import { createHash, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

export function isCampusSyncAuthorized(request: NextRequest, expected: string) {
  const supplied = request.headers.get("x-campus-controller-token")
    || request.headers.get("x-campus-sync-secret")
    || request.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
    || "";
  const suppliedHash = createHash("sha256").update(supplied).digest();
  const expectedHash = createHash("sha256").update(expected).digest();
  return Boolean(supplied) && timingSafeEqual(suppliedHash, expectedHash);
}

export function isCampusSearchAuthorized(request: NextRequest, expected: string) {
  const supplied = request.headers.get("x-campus-access-token")
    || request.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
    || "";
  const suppliedHash = createHash("sha256").update(supplied).digest();
  const expectedHash = createHash("sha256").update(expected).digest();
  return Boolean(supplied) && timingSafeEqual(suppliedHash, expectedHash);
}
