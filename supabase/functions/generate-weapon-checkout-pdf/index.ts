// supabase/functions/generate-weapon-checkout-pdf/index.ts
// Generates a Hebrew A4 PDF for a weapons checkout and uploads it to Google Drive.
//
// Required Supabase secrets:
//   GOOGLE_SERVICE_ACCOUNT_JSON        full SA JSON key (same one used by export-to-sheets)
//   WEAPONS_CHECKOUT_DRIVE_FOLDER_ID   target Drive folder ID
//     ↳ Must be a Shared Drive folder (or a regular folder shared with the SA email).
//       Personal "My Drive" upload fails for service accounts (0-byte quota).
//       Share the folder → Add member → SA email → Editor role.
//
// POST body:
// {
//   soldier:           { full_name, personal_number, phone?, unit_name, team_name? },
//   items:             Array<{ name, serial?, quantity }>,
//   signature_png_b64: string,   // base64 PNG without "data:..." prefix
//   performed_by:      string,
//   timestamp:         string,   // ISO-8601
// }

// deno-lint-ignore-file no-explicit-any
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'https://esm.sh/pdf-lib@1.17.1';
import fontkit from 'https://esm.sh/@pdf-lib/fontkit@1.1.1';
import { getGoogleAccessToken } from '../_shared/google-auth.ts';

const HEEBO_URL = 'https://raw.githubusercontent.com/google/fonts/main/ofl/heebo/Heebo%5Bwght%5D.ttf';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const jsonRes = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

// ── font cache (warm instance) ────────────────────────────────────────────────
let cachedFont: Uint8Array | null = null;
async function loadHeebo(): Promise<Uint8Array> {
  if (cachedFont) return cachedFont;
  const res = await fetch(HEEBO_URL);
  if (!res.ok) throw new Error(`Heebo font fetch failed: ${res.status}`);
  cachedFont = new Uint8Array(await res.arrayBuffer());
  return cachedFont;
}

// ── RTL helper ────────────────────────────────────────────────────────────────
// Pass Hebrew in logical Unicode order; PDF viewers handle bidi reordering.
function drawRight(
  page: PDFPage,
  text: string,
  rightX: number,
  y: number,
  font: PDFFont,
  size: number,
  color = rgb(0, 0, 0),
) {
  const w = font.widthOfTextAtSize(text, size);
  page.drawText(text, { x: rightX - w, y, size, font, color });
}

// ── PDF builder ───────────────────────────────────────────────────────────────
interface ItemLine { name: string; serial?: string | null; quantity: number }

async function buildPdf(
  soldier: { full_name: string; personal_number: string; phone?: string; unit_name: string; team_name?: string },
  items: ItemLine[],
  signaturePngB64: string,
  performedBy: string,
  timestamp: string,
): Promise<Uint8Array> {
  const fontBytes = await loadHeebo();
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const heebo = await pdf.embedFont(fontBytes, { subset: true });

  // Embed signature PNG
  const sigBytes = Uint8Array.from(atob(signaturePngB64), (c) => c.charCodeAt(0));
  const sigImg = await pdf.embedPng(sigBytes);
  const SIG_W = 180;
  const SIG_H = Math.round((sigImg.height / sigImg.width) * SIG_W);

  const page = pdf.addPage([595.28, 841.89]); // A4
  const R = 545; // right margin X
  const L = 50;  // left margin X
  let y = 800;

  const dateStr = new Date(timestamp).toLocaleString('he-IL', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'Asia/Jerusalem',
  });

  // ── Title ──────────────────────────────────────────────────────────────────
  drawRight(page, 'טופס החתמת נשק', R, y, heebo, 20);
  y -= 32;
  page.drawLine({ start: { x: L, y }, end: { x: R, y }, thickness: 0.8, color: rgb(0.7, 0.7, 0.7) });
  y -= 18;

  // ── Meta ───────────────────────────────────────────────────────────────────
  const meta: [string, string][] = [
    ['תאריך', dateStr],
    ['בוצע ע״י', performedBy],
  ];
  for (const [k, v] of meta) {
    drawRight(page, `${k}: ${v}`, R, y, heebo, 11);
    y -= 16;
  }
  y -= 12;

  // ── Soldier block ──────────────────────────────────────────────────────────
  drawRight(page, 'פרטי החייל', R, y, heebo, 14, rgb(0.15, 0.15, 0.15));
  y -= 22;

  const soldierLines: [string, string][] = [
    ['שם מלא', soldier.full_name],
    ['מספר אישי', soldier.personal_number],
    ...(soldier.phone ? [['טלפון', soldier.phone] as [string, string]] : []),
    ['מסגרת', soldier.unit_name],
    ...(soldier.team_name ? [['צוות', soldier.team_name] as [string, string]] : []),
  ];
  for (const [k, v] of soldierLines) {
    drawRight(page, `${k}: ${v}`, R, y, heebo, 11);
    y -= 16;
  }
  y -= 10;
  page.drawLine({ start: { x: L, y }, end: { x: R, y }, thickness: 0.5, color: rgb(0.85, 0.85, 0.85) });
  y -= 16;

  // ── Items table ────────────────────────────────────────────────────────────
  drawRight(page, `פריטים שנמסרו (${items.length})`, R, y, heebo, 14, rgb(0.15, 0.15, 0.15));
  y -= 22;

  const COL_NAME   = R;
  const COL_SERIAL = L + 200;
  const COL_QTY    = L + 55;

  // header row
  page.drawLine({ start: { x: L, y: y + 4 }, end: { x: R, y: y + 4 }, thickness: 0.5, color: rgb(0.85, 0.85, 0.85) });
  drawRight(page, 'שם פריט',  COL_NAME,   y - 12, heebo, 10, rgb(0.4, 0.4, 0.4));
  drawRight(page, "מ.ס / צ'", COL_SERIAL, y - 12, heebo, 10, rgb(0.4, 0.4, 0.4));
  drawRight(page, 'כמות',     COL_QTY,    y - 12, heebo, 10, rgb(0.4, 0.4, 0.4));
  y -= 22;
  page.drawLine({ start: { x: L, y: y + 4 }, end: { x: R, y: y + 4 }, thickness: 0.5, color: rgb(0.85, 0.85, 0.85) });

  for (const item of items) {
    drawRight(page, item.name,               COL_NAME,   y - 12, heebo, 11);
    drawRight(page, item.serial || '—',      COL_SERIAL, y - 12, heebo, 11);
    drawRight(page, String(item.quantity),   COL_QTY,    y - 12, heebo, 11);
    y -= 18;
  }
  page.drawLine({ start: { x: L, y: y + 4 }, end: { x: R, y: y + 4 }, thickness: 0.3, color: rgb(0.9, 0.9, 0.9) });

  // ── Signature ──────────────────────────────────────────────────────────────
  y -= 24;
  drawRight(page, 'חתימת החייל:', R, y, heebo, 11, rgb(0.3, 0.3, 0.3));
  y -= 10;

  // Right-align signature image
  const sigX = R - SIG_W;
  const sigY = y - SIG_H;
  page.drawImage(sigImg, { x: sigX, y: sigY, width: SIG_W, height: SIG_H });

  // Underline below signature
  page.drawLine({
    start: { x: sigX, y: sigY - 4 },
    end:   { x: R,    y: sigY - 4 },
    thickness: 0.5,
    color: rgb(0.6, 0.6, 0.6),
  });

  // ── Footer ─────────────────────────────────────────────────────────────────
  drawRight(page, `הופק אוטומטית · ${dateStr}`, R, 30, heebo, 8, rgb(0.6, 0.6, 0.6));

  return pdf.save();
}

// ── Google Drive upload ───────────────────────────────────────────────────────
async function uploadToDrive(
  token: string,
  folderId: string,
  filename: string,
  pdfBytes: Uint8Array,
): Promise<string> {
  const boundary = 'weapons_checkout_' + Date.now();
  const metadata = JSON.stringify({
    name: filename,
    mimeType: 'application/pdf',
    parents: [folderId],
  });

  const enc = new TextEncoder();
  const parts: Uint8Array[] = [
    enc.encode(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`),
    enc.encode(`--${boundary}\r\nContent-Type: application/pdf\r\n\r\n`),
    pdfBytes,
    enc.encode(`\r\n--${boundary}--`),
  ];

  const totalLen = parts.reduce((s, p) => s + p.length, 0);
  const body = new Uint8Array(totalLen);
  let offset = 0;
  for (const p of parts) { body.set(p, offset); offset += p.length; }

  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    },
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Drive upload failed (${res.status}): ${text}`);
  }

  const file = await res.json() as { id: string };
  return `https://drive.google.com/file/d/${file.id}/view`;
}

// ── Main handler ──────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey     = Deno.env.get('SUPABASE_ANON_KEY')!;
    const saJson      = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON');
    const folderId    = Deno.env.get('WEAPONS_CHECKOUT_DRIVE_FOLDER_ID');

    if (!saJson || !folderId) {
      return jsonRes({ ok: false, error: 'Missing GOOGLE_SERVICE_ACCOUNT_JSON or WEAPONS_CHECKOUT_DRIVE_FOLDER_ID secret' }, 500);
    }

    // Auth
    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader) return jsonRes({ ok: false, error: 'Missing Authorization header' }, 401);

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: who } = await userClient.auth.getUser();
    if (!who?.user) return jsonRes({ ok: false, error: 'Invalid token' }, 401);

    // Parse body
    const body = await req.json().catch(() => null);
    if (!body) return jsonRes({ ok: false, error: 'Invalid JSON body' }, 400);

    const { soldier, items, signature_png_b64, performed_by, timestamp } = body;
    if (!soldier?.full_name || !soldier?.personal_number || !items || !signature_png_b64 || !performed_by) {
      return jsonRes({ ok: false, error: 'Missing required fields: soldier, items, signature_png_b64, performed_by' }, 400);
    }

    // Build PDF
    const pdfBytes = await buildPdf(
      soldier,
      items,
      signature_png_b64,
      performed_by,
      timestamp ?? new Date().toISOString(),
    );

    // Upload to Drive
    const token = await getGoogleAccessToken(saJson, DRIVE_SCOPE);
    const dateTag = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const filename = `checkout_${soldier.personal_number}_${dateTag}.pdf`;
    const driveUrl = await uploadToDrive(token, folderId, filename, pdfBytes);

    // Audit log
    const sb = createClient(supabaseUrl, serviceKey);
    await sb.from('audit_logs').insert({
      action: 'weapons.checkout_pdf_uploaded',
      performed_by: who.user.id,
      target_type: 'soldier',
      details: {
        soldier_pn: soldier.personal_number,
        soldier_name: soldier.full_name,
        items_count: items.length,
        drive_url: driveUrl,
        bytes: pdfBytes.length,
      },
    });

    return jsonRes({ ok: true, url: driveUrl });
  } catch (e) {
    console.error('[generate-weapon-checkout-pdf]', e);
    return jsonRes({ ok: false, error: (e as Error).message }, 500);
  }
});
