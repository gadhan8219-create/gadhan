// supabase/functions/generate-weapon-checkout-pdf/index.ts
//
// Generic Hebrew A4 PDF generator.
// Generates the PDF and delegates Drive storage to a GAS web-app endpoint.
//
// Required secrets:
//   GAS_PDF_URL      — deployed GAS web-app URL
//   GAS_PDF_SECRET   — shared secret set as GAS Script Property WEBHOOK_SECRET
//   WEAPONS_CHECKOUT_DRIVE_FOLDER_ID — root Drive folder ID
//
// POST body:
// {
//   title:             string,          // e.g. "החתמת נשק" | "זיכוי נשק"
//   note?:             string,          // optional subtitle line
//   soldier: {
//     full_name:       string,
//     personal_number: string,
//     phone?:          string,
//     unit_name:       string,
//     team_name?:      string,
//   },
//   items: [{
//     name:            string,
//     quantity:        number,
//     serial?:         string | null,
//   }],
//   performed_by:      string,
//   timestamp:         string,          // ISO-8601
//   signature_png_b64?: string,         // base64 PNG without data: prefix
//   drive_path:        string[],        // folder parts under root, e.g. ["נשקיה","מסגרת א","החתמות"]
//   filename:          string,          // "שם החייל.pdf"
// }

// deno-lint-ignore-file no-explicit-any
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'https://esm.sh/pdf-lib@1.17.1';
import fontkit from 'https://esm.sh/@pdf-lib/fontkit@1.1.1';

// ── Font ──────────────────────────────────────────────────────────────────────
const HEEBO_URL = 'https://raw.githubusercontent.com/google/fonts/main/ofl/heebo/Heebo%5Bwght%5D.ttf';
let cachedFont: Uint8Array | null = null;
async function loadHeebo(): Promise<Uint8Array> {
  if (cachedFont) return cachedFont;
  const r = await fetch(HEEBO_URL);
  if (!r.ok) throw new Error(`Heebo fetch failed: ${r.status}`);
  cachedFont = new Uint8Array(await r.arrayBuffer());
  return cachedFont;
}

// ── RTL draw helper ───────────────────────────────────────────────────────────
function drawRight(
  page: PDFPage, text: string, rx: number, y: number,
  font: PDFFont, size: number, color = rgb(0, 0, 0),
) {
  page.drawText(text, { x: rx - font.widthOfTextAtSize(text, size), y, size, font, color });
}

// ── PDF builder ───────────────────────────────────────────────────────────────
interface PdfItem    { name: string; quantity: number; serial?: string | null }
interface PdfSoldier { full_name: string; personal_number: string; phone?: string; unit_name: string; team_name?: string }

async function buildPdf(
  title: string,
  note: string | undefined,
  soldier: PdfSoldier,
  items: PdfItem[],
  performedBy: string,
  timestamp: string,
  signatureB64?: string,
): Promise<Uint8Array> {
  const fontBytes = await loadHeebo();
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const H = await pdf.embedFont(fontBytes, { subset: true });

  const page = pdf.addPage([595.28, 841.89]); // A4
  const R = 545; const L = 50;
  let y = 800;

  const dateStr = new Date(timestamp).toLocaleString('he-IL', {
    dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Jerusalem',
  });

  // ── Title ──
  drawRight(page, title, R, y, H, 20);
  y -= 30;
  if (note) { drawRight(page, note, R, y, H, 10, rgb(0.5, 0.5, 0.5)); y -= 18; }
  page.drawLine({ start: { x: L, y }, end: { x: R, y }, thickness: 0.8, color: rgb(0.7, 0.7, 0.7) });
  y -= 18;

  // ── Meta ──
  drawRight(page, `תאריך: ${dateStr}`, R, y, H, 11); y -= 16;
  drawRight(page, `בוצע ע״י: ${performedBy}`, R, y, H, 11); y -= 20;

  // ── Soldier ──
  drawRight(page, 'פרטי החייל', R, y, H, 13, rgb(0.15, 0.15, 0.15)); y -= 20;
  const soldierLines: [string, string][] = [
    ['שם מלא', soldier.full_name],
    ['מספר אישי', soldier.personal_number],
    ...(soldier.phone     ? [['טלפון',  soldier.phone]     as [string,string]] : []),
    ['מסגרת', soldier.unit_name],
    ...(soldier.team_name ? [['צוות',   soldier.team_name] as [string,string]] : []),
  ];
  for (const [k, v] of soldierLines) {
    drawRight(page, `${k}: ${v}`, R, y, H, 11); y -= 15;
  }
  y -= 8;
  page.drawLine({ start: { x: L, y }, end: { x: R, y }, thickness: 0.4, color: rgb(0.85, 0.85, 0.85) });
  y -= 16;

  // ── Items table ──
  drawRight(page, `פריטים (${items.length})`, R, y, H, 13, rgb(0.15, 0.15, 0.15)); y -= 20;

  const COL_NAME = R;
  const COL_SER  = L + 200;
  const COL_QTY  = L + 50;

  page.drawLine({ start: { x: L, y: y + 4 }, end: { x: R, y: y + 4 }, thickness: 0.4, color: rgb(0.85, 0.85, 0.85) });
  drawRight(page, 'שם פריט', COL_NAME, y - 12, H, 10, rgb(0.4, 0.4, 0.4));
  drawRight(page, "מ.ס / צ'",COL_SER,  y - 12, H, 10, rgb(0.4, 0.4, 0.4));
  drawRight(page, 'כמות',    COL_QTY,  y - 12, H, 10, rgb(0.4, 0.4, 0.4));
  y -= 20;
  page.drawLine({ start: { x: L, y: y + 4 }, end: { x: R, y: y + 4 }, thickness: 0.4, color: rgb(0.85, 0.85, 0.85) });

  for (const item of items) {
    drawRight(page, item.name,              COL_NAME, y - 12, H, 11);
    drawRight(page, item.serial ?? '—',     COL_SER,  y - 12, H, 11);
    drawRight(page, String(item.quantity),  COL_QTY,  y - 12, H, 11);
    y -= 17;
  }
  page.drawLine({ start: { x: L, y: y + 4 }, end: { x: R, y: y + 4 }, thickness: 0.3, color: rgb(0.9, 0.9, 0.9) });

  // ── Signature (optional) ──
  if (signatureB64) {
    y -= 22;
    drawRight(page, 'חתימת החייל:', R, y, H, 11, rgb(0.3, 0.3, 0.3));
    y -= 8;
    const sigBytes = Uint8Array.from(atob(signatureB64), (c) => c.charCodeAt(0));
    const sigImg   = await pdf.embedPng(sigBytes);
    const SIG_W = 180;
    const SIG_H = Math.round((sigImg.height / sigImg.width) * SIG_W);
    const sigX  = R - SIG_W;
    page.drawImage(sigImg, { x: sigX, y: y - SIG_H, width: SIG_W, height: SIG_H });
    page.drawLine({ start: { x: sigX, y: y - SIG_H - 4 }, end: { x: R, y: y - SIG_H - 4 }, thickness: 0.5, color: rgb(0.6, 0.6, 0.6) });
  }

  // ── Footer ──
  drawRight(page, `הופק אוטומטית · ${dateStr}`, R, 30, H, 8, rgb(0.6, 0.6, 0.6));

  return pdf.save();
}

// ── Uint8Array → base64 (loop is safe for large arrays) ──────────────────────
function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.byteLength; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

// ── GAS upload ────────────────────────────────────────────────────────────────
async function uploadViaGas(
  gasUrl: string,
  gasSecret: string,
  rootFolderId: string,
  drivePath: string[],
  filename: string,
  pdfBytes: Uint8Array,
): Promise<string> {
  const resp = await fetch(gasUrl, {
    method: 'POST',
    redirect: 'follow',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      secret:       gasSecret,
      action:       'savePdf',
      rootFolderId,
      drivePath,
      filename,
      pdfBase64:    toBase64(pdfBytes),
    }),
  });
  if (!resp.ok) throw new Error(`GAS call failed (${resp.status}): ${await resp.text()}`);
  const result = await resp.json() as { ok: boolean; url?: string; error?: string };
  if (!result.ok) throw new Error(`GAS error: ${result.error}`);
  return result.url!;
}

// ── CORS + JSON response ──────────────────────────────────────────────────────
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const jsonRes = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

// ── Error email (best-effort via GAS) ────────────────────────────────────────
async function notifyError(gasUrl: string, gasSecret: string, errMsg: string): Promise<void> {
  await fetch(gasUrl, {
    method: 'POST',
    redirect: 'follow',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      secret:  gasSecret,
      action:  'sendErrorEmail',
      error:   errMsg,
      context: 'generate-weapon-checkout-pdf',
    }),
  }).catch(() => {}); // never throw from error reporter
}

// ── Main ──────────────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  // Read GAS credentials up-front so the catch block can also use them
  const gasUrl    = Deno.env.get('GAS_PDF_URL');
  const gasSecret = Deno.env.get('GAS_PDF_SECRET');

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey     = Deno.env.get('SUPABASE_ANON_KEY')!;
    const rootFolder  = Deno.env.get('WEAPONS_CHECKOUT_DRIVE_FOLDER_ID');

    if (!gasUrl || !gasSecret || !rootFolder) {
      return jsonRes({ ok: false, error: 'Missing GAS_PDF_URL / GAS_PDF_SECRET / WEAPONS_CHECKOUT_DRIVE_FOLDER_ID' }, 500);
    }

    // Auth
    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader) return jsonRes({ ok: false, error: 'Missing Authorization header' }, 401);
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: who } = await userClient.auth.getUser();
    if (!who?.user) return jsonRes({ ok: false, error: 'Invalid token' }, 401);

    // Parse body
    const body = await req.json().catch(() => null);
    if (!body) return jsonRes({ ok: false, error: 'Invalid JSON body' }, 400);

    const { title, note, soldier, items, performed_by, timestamp, signature_png_b64, drive_path, filename } = body;
    if (!title || !soldier?.full_name || !items || !performed_by || !drive_path || !filename) {
      return jsonRes({ ok: false, error: 'Missing required fields' }, 400);
    }

    // Build PDF
    const pdfBytes = await buildPdf(
      title, note, soldier, items, performed_by,
      timestamp ?? new Date().toISOString(),
      signature_png_b64,
    );

    // Upload via GAS
    const url = await uploadViaGas(gasUrl, gasSecret, rootFolder, drive_path, filename, pdfBytes);

    // Audit log
    const sb = createClient(supabaseUrl, serviceKey);
    await sb.from('audit_logs').insert({
      action: 'weapons.pdf_uploaded',
      performed_by: who.user.id,
      details: { title, soldier_pn: soldier.personal_number, items_count: items.length, drive_url: url },
    });

    return jsonRes({ ok: true, url });

  } catch (e) {
    console.error('[generate-weapon-checkout-pdf]', e);
    // Best-effort: notify via email so failures don't go unnoticed
    if (gasUrl && gasSecret) await notifyError(gasUrl, gasSecret, (e as Error).message);
    return jsonRes({ ok: false, error: (e as Error).message }, 500);
  }
});
