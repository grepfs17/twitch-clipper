export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  const host = new URL(request.url).host;
  if (origin) return new URL(origin).host === host;
  if (referer) return new URL(referer).host === host;
  return false;
}
