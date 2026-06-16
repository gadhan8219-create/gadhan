import { useEffect, useState } from 'react';
import { signedUrl } from '../lib/storage';

/**
 * Inline viewer for files in a private Storage bucket (images or PDFs).
 * Signs the object on demand (no `download` disposition, so the browser renders
 * it instead of downloading) and shows it in a modal:
 *   - images  → <img>
 *   - PDFs    → <iframe> (requires `frame-src https://*.supabase.co blob:` in the CSP)
 * A "הורד" link offers an explicit download for anyone who still wants the file.
 */
export default function DocViewerModal({
  bucket,
  pathOrUrl,
  title,
  downloadName,
  onClose,
}: {
  bucket: string;
  pathOrUrl: string;
  title?: string;
  downloadName?: string;
  onClose: () => void;
}) {
  const [viewUrl, setViewUrl] = useState<string | null>(null);
  const [dlUrl, setDlUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isPdf = /\.pdf(\?|$)/i.test(pathOrUrl);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        // Inline view URL (no download disposition).
        const url = await signedUrl(bucket, pathOrUrl);
        // Separate URL that forces a download, for the explicit "הורד" button.
        const name = downloadName || (pathOrUrl.split('?')[0].split('/').pop() || 'document');
        const dl = await signedUrl(bucket, pathOrUrl, { download: name });
        if (alive) { setViewUrl(url); setDlUrl(dl); }
      } catch (e) {
        if (alive) setError((e as Error).message);
      }
    })();
    return () => { alive = false; };
  }, [bucket, pathOrUrl, downloadName]);

  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b">
          <h3 className="font-semibold text-sm truncate">{title ?? 'מסמך'}</h3>
          <div className="flex items-center gap-3 shrink-0">
            {dlUrl && (
              <a href={dlUrl} className="text-sm text-blue-600 hover:text-blue-800">הורד</a>
            )}
            <button type="button" onClick={onClose} aria-label="סגור" className="text-2xl leading-none text-slate-400 hover:text-slate-700 px-1">×</button>
          </div>
        </div>

        <div className="flex-1 overflow-auto bg-slate-100 flex items-center justify-center min-h-[60vh]">
          {error && <p className="text-red-600 text-sm p-6">{error}</p>}
          {!error && !viewUrl && <p className="text-slate-500 text-sm p-6">טוען…</p>}
          {!error && viewUrl && (
            isPdf
              ? <iframe src={viewUrl} title={title ?? 'מסמך'} className="w-full h-[80vh] border-0" />
              : <img src={viewUrl} alt={title ?? 'מסמך'} className="max-w-full max-h-[80vh] object-contain" />
          )}
        </div>
      </div>
    </div>
  );
}
