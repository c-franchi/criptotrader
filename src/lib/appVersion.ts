declare const __APP_BUILD_ID__: string;
export const APP_BUILD_ID =
  typeof __APP_BUILD_ID__ === "undefined" ? "development" : __APP_BUILD_ID__;
export function versionResponse() {
  return Response.json(
    { version: APP_BUILD_ID },
    { headers: { "Cache-Control": "no-store, max-age=0", "CDN-Cache-Control": "no-store" } },
  );
}
