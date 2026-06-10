// supabase/functions/generate-weapon-checkout-pdf/index.ts
//
// Handles two PDF types:
//   type="checkout" → ROOT/נשקיה/{unit}/החתמות/{name}.pdf  (with signature)
//   type="credit"   → ROOT/נשקיה/{unit}/זיכויים/{name}.pdf  (credited items)
//                   → also overwrites החתמות PDF if soldier still holds items
//
// Required secrets:
//   GOOGLE_SERVICE_ACCOUNT_JSON        SA JSON key
//   WEAPONS_CHECKOUT_DRIVE_FOLDER_ID   root Drive folder ID (shared with SA as Editor)

// deno-lint-ignore-file no-explicit-any
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'https://esm.sh/pdf-lib@1.17.1';
import fontkit from 'https://esm.sh/@pdf-lib/fontkit@1.1.1';
import { create, getNumericDate } from 'https://deno.land/x/djwt@v3.0.2/mod.ts';

// ── Google auth (inlined) ─────────────────────────────────────────────────────
async function getGoogleAccessToken(saJson: string, scope: string): Promise<string> {
  const sa = JSON.parse(saJson) as { client_email: string; private_key: string };
  const pem = sa.private_key.replace(/\\n/g, '\n');
  const pemBody = pem.replace(/-----BEGIN PRIVATE KEY-----/g, '').replace(/-----END PRIVATE KEY-----/g, '').replace(/\s+/g, '');
  const der = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der.buffer, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const now = getNumericDate(0);
  const jwt = await create(
    { alg: 'RS256', typ: 'JWT' },
    { iss: sa.client_email, scope, aud: 'https://oauth2.googleapis.com/token', iat: now, exp: getNumericDate(60 * 30) },
    key,
  );
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  });
  if (!res.ok) throw new Error(`Google token exchange failed: ${await res.text()}`);
  return ((await res.json()) as { access_token: string }).access_token;
}

// ── Drive helpers ─────────────────────────────────────────────────────────────
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive';

async function driveGet(token: string, url: string) {
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(`Drive GET failed (${r.status}): ${await r.text()}`);
  return r.json();
}

async function findOrCreateFolder(token: string, parentId: string, name: string): Promise<string> {
  const escaped = name.replace(/'/g, "\\'");
  const q = encodeURIComponent(`name='${escaped}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const data = await driveGet(token, `https://www.googleapis.com/drive/v3/files?q=${q}&supportsAllDrives=true&includeItemsFromAllDrives=true&fields=files(id)`);
  if (data.files?.length > 0) return data.files[0].id as string;

  const r = await fetch('https://www.googleapis.com/drive/v3/files?supportsAllDrives=true', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] }),
  });
  if (!r.ok) throw new Error(`Create folder "${name}" failed (${r.status}): ${await r.text()}`);
  return ((await r.json()) as { id: string }).id;
}

async function resolvePath(token: string, rootId: string, parts: string[]): Promise<string> {
  let id = rootId;
  for (const part of parts) id = await findOrCreateFolder(token, id, part);
  return id;
}

async function deleteExistingFiles(token: string, folderId: string, filename: string) {
  const escaped = filename.replace(/'/g, "\\'");
  const q = encodeURIComponent(`name='${escaped}' and '${folderId}' in parents and trashed=false`);
  const data = await driveGet(token, `https://www.googleapis.com/drive/v3/files?q=${q}&supportsAllDrives=true&includeItemsFromAllDrives=true&fields=files(id)`);
  for (const f of (data.files ?? [])) {
    await fetch(`https://www.googleapis.com/drive/v3/files/${f.id}?supportsAllDrives=true`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
    });
  }
}

async function uploadFile(token: string, folderId: string, filename: string, pdfBytes: Uint8Array): Promise<string> {
  const boundary = 'weapons_' + Date.now();
  const metadata = JSON.stringify({ name: filename, mimeType: 'application/pdf', parents: [folderId] });
  const enc = new TextEncoder();
  const parts = [
    enc.encode(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`),
    enc.encode(`--${boundary}\r\nContent-Type: application/pdf\r\n\r\n`),
    pdfBytes,
    enc.encode(`\r\n--${boundary}--`),
  ];
  const total = parts.reduce((s, p) => s + p.length, 0);
  const body = new Uint8Array(total);
  let off = 0;
  for (const p of parts) { body.set(p, off); off += p.length; }

  const r = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  });
  if (!r.ok) throw new Error(`Drive upload failed (${r.status}): ${await r.text()}`);
  const file = await r.json() as { id: string };
  return `https://drive.google.com/file/d/${file.id}/view`;
}

async function upsertPdf(token: string, folderId: string, filename: string, bytes: Uint8Array): Promise<string> {
  await deleteExistingFiles(token, folderId, filename);
  return uploadFile(token, folderId, filename, bytes);
}

function safeFilename(name: string): string {
  return name.replace(/[/\\:*?"<>|]/g, '_');
}

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
function drawRight(page: PDFPage, text: string, rx: number, y: number, font: PDFFont, size: number, color = rgb(0, 0, 0)) {
  const w = font.widthOfTextAtSize(text, size);
  page.drawText(text, { x: rx - w, y, size, font, color });
}

// ── PDF: Checkout (with optional signature) ───────────────────────────────────
interface ItemLine { name: string; serial?: string | null; quantity: number }
interface SoldierInfo { full_name: string; personal_number: string; phone?: string; unit_name: string; team_name?: string }

async function buildCheckoutPdf(
  soldier: SoldierInfo,
  items: ItemLine[],
  signatureB64: string | null,
  performedBy: string,
  timestamp: string,
  updateNote?: string,
): Promise<Uint8Array> {
  const fontBytes = await loadHeebo();
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const heebo = await pdf.embedFont(fontBytes, { subset: true });

  const page = pdf.addPage([595.28, 841.89]);
  const R = 545; const L = 50;
  let y = 800;

  const dateStr = new Date(timestamp).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Jerusalem' });
  const title = updateNote ? 'סיכום פריטי נשק בהחזקה' : 'טופס החתמת נשק';

  drawRight(page, title, R, y, heebo, 20);
  y -= 32;
  if (updateNote) { drawRight(page, updateNote, R, y, heebo, 10, rgb(0.5, 0.5, 0.5)); y -= 18; }
  page.drawLine({ start: { x: L, y }, end: { x: R, y }, thickness: 0.8, color: rgb(0.7, 0.7, 0.7) });
  y -= 18;

  for (const [k, v] of [['תאריך', dateStr], ['בוצע ע״י', performedBy]] as [string, string][]) {
    drawRight(page, `${k}: ${v}`, R, y, heebo, 11); y -= 16;
  }
  y -= 12;

  drawRight(page, 'פרטי החייל', R, y, heebo, 14, rgb(0.15, 0.15, 0.15));
  y -= 22;
  const soldierLines: [string, string][] = [
    ['שם מלא', soldier.full_name], ['מספר אישי', soldier.personal_number],
    ...(soldier.phone ? [['טלפון', soldier.phone] as [string, string]] : []),
    ['מסגרת', soldier.unit_name],
    ...(soldier.team_name ? [['צוות', soldier.team_name] as [string, string]] : []),
  ];
  for (const [k, v] of soldierLines) { drawRight(page, `${k}: ${v}`, R, y, heebo, 11); y -= 16; }
  y -= 10;
  page.drawLine({ start: { x: L, y }, end: { x: R, y }, thickness: 0.5, color: rgb(0.85, 0.85, 0.85) });
  y -= 16;

  const heading = updateNote ? `פריטים בהחזקה כרגע (${items.length})` : `פריטים שנמסרו (${items.length})`;
  drawRight(page, heading, R, y, heebo, 14, rgb(0.15, 0.15, 0.15));
  y -= 22;

  const CN = R; const CS = L + 200; const CQ = L + 55;
  page.drawLine({ start: { x: L, y: y + 4 }, end: { x: R, y: y + 4 }, thickness: 0.5, color: rgb(0.85, 0.85, 0.85) });
  drawRight(page, 'שם פריט', CN, y - 12, heebo, 10, rgb(0.4, 0.4, 0.4));
  drawRight(page, "מ.ס / צ'", CS, y - 12, heebo, 10, rgb(0.4, 0.4, 0.4));
  drawRight(page, 'כמות', CQ, y - 12, heebo, 10, rgb(0.4, 0.4, 0.4));
  y -= 22;
  page.drawLine({ start: { x: L, y: y + 4 }, end: { x: R, y: y + 4 }, thickness: 0.5, color: rgb(0.85, 0.85, 0.85) });

  for (const item of items) {
    drawRight(page, item.name, CN, y - 12, heebo, 11);
    drawRight(page, item.serial || '—', CS, y - 12, heebo, 11);
    drawRight(page, String(item.quantity), CQ, y - 12, heebo, 11);
    y -= 18;
  }
  page.drawLine({ start: { x: L, y: y + 4 }, end: { x: R, y: y + 4 }, thickness: 0.3, color: rgb(0.9, 0.9, 0.9) });

  // Signature
  if (signatureB64) {
    y -= 24;
    drawRight(page, 'חתימת החייל:', R, y, heebo, 11, rgb(0.3, 0.3, 0.3));
    y -= 10;
    const sigBytes = Uint8Array.from(atob(signatureB64), (c) => c.charCodeAt(0));
    const sigImg = await pdf.embedPng(sigBytes);
    const SIG_W = 180;
    const SIG_H = Math.round((sigImg.height / sigImg.width) * SIG_W);
    const sigX = R - SIG_W;
    page.drawImage(sigImg, { x: sigX, y: y - SIG_H, width: SIG_W, height: SIG_H });
    page.drawLine({ start: { x: sigX, y: y - SIG_H - 4 }, end: { x: R, y: y - SIG_H - 4 }, thickness: 0.5, color: rgb(0.6, 0.6, 0.6) });
  }

  drawRight(page, `הופק אוטומטית · ${dateStr}`, R, 30, heebo, 8, rgb(0.6, 0.6, 0.6));
  return pdf.save();
}

// ── PDF: Credit ───────────────────────────────────────────────────────────────
async function buildCreditPdf(
  soldier: SoldierInfo,
  creditedItems: ItemLine[],
  performedBy: string,
  timestamp: string,
): Promise<Uint8Array> {
  const fontBytes = await loadHeebo();
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const heebo = await pdf.embedFont(fontBytes, { subset: true });

  const page = pdf.addPage([595.28, 841.89]);
  const R = 545; const L = 50;
  let y = 800;

  const dateStr = new Date(timestamp).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Jerusalem' });

  drawRight(page, 'טופס זיכוי נשק', R, y, heebo, 20);
  y -= 32;
  page.drawLine({ start: { x: L, y }, end: { x: R, y }, thickness: 0.8, color: rgb(0.7, 0.7, 0.7) });
  y -= 18;

  for (const [k, v] of [['תאריך', dateStr], ['בוצע ע״י', performedBy]] as [string, string][]) {
    drawRight(page, `${k}: ${v}`, R, y, heebo, 11); y -= 16;
  }
  y -= 12;

  drawRight(page, 'פרטי החייל', R, y, heebo, 14, rgb(0.15, 0.15, 0.15));
  y -= 22;
  const soldierLines: [string, string][] = [
    ['שם מלא', soldier.full_name], ['מספר אישי', soldier.personal_number],
    ['מסגרת', soldier.unit_name],
  ];
  for (const [k, v] of soldierLines) { drawRight(page, `${k}: ${v}`, R, y, heebo, 11); y -= 16; }
  y -= 10;
  page.drawLine({ start: { x: L, y }, end: { x: R, y }, thickness: 0.5, color: rgb(0.85, 0.85, 0.85) });
  y -= 16;

  drawRight(page, `פריטים שזוכו (${creditedItems.length})`, R, y, heebo, 14, rgb(0.6, 0.1, 0.1));
  y -= 22;

  const CN = R; const CS = L + 200;
  page.drawLine({ start: { x: L, y: y + 4 }, end: { x: R, y: y + 4 }, thickness: 0.5, color: rgb(0.85, 0.85, 0.85) });
  drawRight(page, 'שם פריט', CN, y - 12, heebo, 10, rgb(0.4, 0.4, 0.4));
  drawRight(page, "מ.ס / צ'", CS, y - 12, heebo, 10, rgb(0.4, 0.4, 0.4));
  y -= 22;
  page.drawLine({ start: { x: L, y: y + 4 }, end: { x: R, y: y + 4 }, thickness: 0.5, color: rgb(0.85, 0.85, 0.85) });

  for (const item of creditedItems) {
    drawRight(page, item.name, CN, y - 12, heebo, 11);
    drawRight(page, item.serial || '—', CS, y - 12, heebo, 11);
    y -= 18;
  }
  page.drawLine({ start: { x: L, y: y + 4 }, end: { x: R, y: y + 4 }, thickness: 0.3, color: rgb(0.9, 0.9, 0.9) });

  drawRight(page, `הופק אוטומטית · ${dateStr}`, R, 30, heebo, 8, rgb(0.6, 0.6, 0.6));
  return pdf.save();
}

// ── CORS + JSON helper ────────────────────────────────────────────────────────
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const jsonRes = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

// ── Main ──────────────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey     = Deno.env.get('SUPABASE_ANON_KEY')!;
    const saJson      = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON');
    const rootFolder  = Deno.env.get('WEAPONS_CHECKOUT_DRIVE_FOLDER_ID');

    if (!saJson || !rootFolder) {
      return jsonRes({ ok: false, error: 'Missing GOOGLE_SERVICE_ACCOUNT_JSON or WEAPONS_CHECKOUT_DRIVE_FOLDER_ID' }, 500);
    }

    // Auth
    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader) return jsonRes({ ok: false, error: 'Missing Authorization header' }, 401);
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: who } = await userClient.auth.getUser();
    if (!who?.user) return jsonRes({ ok: false, error: 'Invalid token' }, 401);

    const body = await req.json().catch(() => null);
    if (!body) return jsonRes({ ok: false, error: 'Invalid JSON body' }, 400);

    const { type, soldier, performed_by, timestamp } = body;
    if (!soldier?.full_name || !soldier?.personal_number || !soldier?.unit_name || !performed_by) {
      return jsonRes({ ok: false, error: 'Missing soldier / performed_by' }, 400);
    }
    const now = timestamp ?? new Date().toISOString();
    const filename = `${safeFilename(soldier.full_name)}.pdf`;

    const token = await getGoogleAccessToken(saJson, DRIVE_SCOPE);
    const sb = createClient(supabaseUrl, serviceKey);

    // ── CHECKOUT ──────────────────────────────────────────────────────────────
    if (type === 'checkout' || !type) {
      const { items, signature_png_b64 } = body;
      if (!items || !signature_png_b64) return jsonRes({ ok: false, error: 'Missing items or signature_png_b64' }, 400);

      const pdfBytes = await buildCheckoutPdf(soldier, items, signature_png_b64, performed_by, now);
      const folderId = await resolvePath(token, rootFolder, ['נשקיה', soldier.unit_name, 'החתמות']);
      const url = await upsertPdf(token, folderId, filename, pdfBytes);

      await sb.from('audit_logs').insert({
        action: 'weapons.checkout_pdf_uploaded',
        performed_by: who.user.id,
        details: { soldier_pn: soldier.personal_number, items_count: items.length, drive_url: url, bytes: pdfBytes.length },
      });

      return jsonRes({ ok: true, url });
    }

    // ── CREDIT ────────────────────────────────────────────────────────────────
    if (type === 'credit') {
      const { credited_items } = body;
      if (!credited_items?.length) return jsonRes({ ok: false, error: 'Missing credited_items' }, 400);

      // 1. Build + upload credit PDF
      const creditBytes = await buildCreditPdf(soldier, credited_items, performed_by, now);
      const creditFolder = await resolvePath(token, rootFolder, ['נשקיה', soldier.unit_name, 'זיכויים']);
      const creditUrl = await upsertPdf(token, creditFolder, filename, creditBytes);

      // 2. Query remaining assignments
      const { data: remaining } = await sb
        .from('weapons_item_serials')
        .select('item_id, serial_number, weapons_items(name)')
        .eq('assigned_to_pn', soldier.personal_number)
        .not('assigned_to_pn', 'is', null);

      let checkoutUrl: string | null = null;
      const checkoutFolder = await resolvePath(token, rootFolder, ['נשקיה', soldier.unit_name, 'החתמות']);

      if (remaining && remaining.length > 0) {
        // Partial credit → update checkout PDF with remaining items
        const remainingItems: ItemLine[] = (remaining as any[]).map((r) => ({
          name: r.weapons_items?.name ?? r.item_id,
          serial: r.serial_number,
          quantity: 1,
        }));
        const dateStr = new Date(now).toLocaleString('he-IL', { dateStyle: 'short', timeZone: 'Asia/Jerusalem' });
        const checkoutBytes = await buildCheckoutPdf(
          soldier, remainingItems, null, performed_by, now,
          `עודכן לאחר זיכוי חלקי · ${dateStr}`,
        );
        checkoutUrl = await upsertPdf(token, checkoutFolder, filename, checkoutBytes);
      } else {
        // Full credit → remove checkout PDF
        await deleteExistingFiles(token, checkoutFolder, filename);
      }

      await sb.from('audit_logs').insert({
        action: 'weapons.credit_pdf_uploaded',
        performed_by: who.user.id,
        details: {
          soldier_pn: soldier.personal_number,
          credited_count: credited_items.length,
          remaining_count: remaining?.length ?? 0,
          credit_url: creditUrl,
          checkout_url: checkoutUrl,
        },
      });

      return jsonRes({ ok: true, credit_url: creditUrl, checkout_url: checkoutUrl });
    }

    return jsonRes({ ok: false, error: `Unknown type: ${type}` }, 400);

  } catch (e) {
    console.error('[generate-weapon-checkout-pdf]', e);
    return jsonRes({ ok: false, error: (e as Error).message }, 500);
  }
});
