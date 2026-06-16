import { supabase } from './supabase';

/**
 * Storage buckets (signing-pdfs, vehicle-docs, fuel-receipts) are PRIVATE since
 * migration 0028 — objects are no longer served to anonymous visitors. Reads must
 * be authenticated and go through a short-lived signed URL generated on demand.
 *
 * Accepts either a bare object path (new rows) or a legacy public URL (rows
 * created before the buckets were privatized) and returns a signed URL.
 */
export async function signedUrl(
  bucket: string,
  pathOrUrl: string,
  opts?: { download?: string; ttl?: number },
): Promise<string> {
  const path = objectPath(pathOrUrl, bucket);
  if (!path) throw new Error('קובץ לא נמצא');
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, opts?.ttl ?? 3600, opts?.download ? { download: opts.download } : undefined);
  if (error) throw error;
  return data.signedUrl;
}

/**
 * Normalise a stored value to the object path within `bucket`. Handles both bare
 * paths and legacy public URLs (…/object/public/<bucket>/<path>?…).
 */
export function objectPath(pathOrUrl: string, bucket: string): string {
  if (!pathOrUrl) return '';
  if (!/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const publicMarker = `/object/public/${bucket}/`;
  const pi = pathOrUrl.indexOf(publicMarker);
  if (pi !== -1) return decodeURIComponent(pathOrUrl.slice(pi + publicMarker.length).split('?')[0]);
  const bare = `/${bucket}/`;
  const bi = pathOrUrl.indexOf(bare);
  if (bi !== -1) return decodeURIComponent(pathOrUrl.slice(bi + bare.length).split('?')[0]);
  return pathOrUrl;
}
