/**
 * Schedio web Worker -- serves the Expo static export with proper MIME types.
 *
 * It is the Worker entrypoint (`main` in wrangler.toml), never `public/_worker.js`:
 * that is Pages Advanced Mode, which nothing but Pages loads, and under
 * `public/` it would also be uploaded as a public asset.
 *
 * The asset pipeline (`env.ASSETS.fetch`) answers ANY miss with index.html,
 * because wrangler.toml sets `not_found_handling = "single-page-application"`
 * (that is what makes a dynamic route such as /post/<id> load). A browser that
 * asked for a stale hashed `.js` and was handed `text/html` rejects it, so this
 * returns a real 404 for asset extensions instead.
 *
 * Response headers are owned by public/_headers in the asset pipeline.
 */

const STATIC_EXTENSIONS = new Set([
  '.css',
  '.js',
  '.mjs',
  '.json',
  '.map',
  '.wasm',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.svg',
  '.ico',
  '.webp',
  '.avif',
  '.woff',
  '.woff2',
  '.ttf',
  '.otf',
  '.eot',
  '.mp3',
  '.mp4',
  '.webm',
  '.ogg',
  '.wav',
  '.pdf',
  '.xml',
  '.txt',
]);

function getExtension(pathname) {
  const lastDot = pathname.lastIndexOf('.');
  return lastDot === -1 ? '' : pathname.slice(lastDot).toLowerCase();
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const pathname = url.pathname;
    const extension = getExtension(pathname);

    // Try the asset pipeline first.
    const assetResponse = await env.ASSETS.fetch(request);
    const contentType = assetResponse.headers.get('content-type') || '';

    // Detect when the platform returns an HTML fallback for a static-asset URL.
    // If the URL has a known static extension but the response is HTML, the
    // actual file doesn't exist (e.g., stale hashed bundle from a previous
    // deploy). Return a clean 404 instead of HTML with the wrong MIME type.
    if (STATIC_EXTENSIONS.has(extension) && contentType.includes('text/html')) {
      return new Response('Not Found', { status: 404 });
    }

    // For non-asset paths (SPA navigation routes), the platform's index.html
    // fallback is correct behavior. Return the response as-is.
    return assetResponse;
  },
};
