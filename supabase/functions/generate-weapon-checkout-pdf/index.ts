// supabase/functions/generate-weapon-checkout-pdf/index.ts
//
// Hebrew A4 PDF generator.
// Builds an RTL HTML document and delegates BOTH rendering (HTML→PDF) and Drive
// storage to a GAS web-app endpoint. Google's HTML renderer has full BiDi
// support, so Hebrew + numbers (phones, dates, serials) always come out in the
// correct visual order — unlike pdf-lib, which reverses LTR runs in RTL text.
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
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.108.1';
import { resolveServiceKey } from '../_shared/serviceKey.ts';

// ── Types ───────────────────────────────────────────────────────────────────────
interface PdfItem    { name: string; quantity: number; serial?: string | null }
interface PdfSoldier { full_name: string; personal_number: string; phone?: string; unit_name: string; team_name?: string }

// ── HTML escaping ────────────────────────────────────────────────────────────────
function esc(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── Date formatting (neutral, no BiDi marks) ──────────────────────────────────────
function formatDate(timestamp: string): string {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jerusalem',
    day: 'numeric', month: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
  const p = fmt.formatToParts(new Date(timestamp || new Date().toISOString()));
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? '0';
  return `${get('day')}.${get('month')}.${get('year')}  ${get('hour')}:${get('minute')}`;
}

// ── HTML builder (Google renders this → flawless Hebrew RTL) ───────────────────────
function buildHtml(
  title: string,
  note: string | undefined,
  soldier: PdfSoldier,
  items: PdfItem[],
  performedBy: string,
  timestamp: string,
  signatureB64?: string,
): string {
  const dateStr = formatDate(timestamp);

  const rows = items.map((it) =>
    `<tr><td>${esc(it.name)}</td><td>${esc(it.serial ?? '—')}</td><td class="qty">${esc(it.quantity)}</td></tr>`
  ).join('');

  return `<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="UTF-8"><style>
    * { font-family: Arial, "Noto Sans Hebrew", sans-serif; margin: 0; padding: 0; box-sizing: border-box; }
    body { padding: 32px 36px; color: #1e293b; }
    h1 { font-size: 24px; margin-bottom: 4px; }
    .note { color: #64748b; font-size: 12px; margin-bottom: 10px; }
    .rule { border-top: 1px solid #cbd5e1; margin: 12px 0 16px; }
    .meta { font-size: 12px; color: #334155; margin: 2px 0; }
    .section { font-size: 15px; font-weight: bold; color: #0f172a; margin: 18px 0 6px; }
    .field { font-size: 13px; margin: 3px 0; }
    .field b { color: #0f172a; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 13px; }
    th, td { text-align: right; padding: 7px 10px; border-bottom: 1px solid #e2e8f0; }
    th { color: #475569; font-weight: bold; border-bottom: 1.5px solid #cbd5e1; }
    td.qty, th.qty { text-align: center; width: 70px; }
    .sig { margin-top: 22px; }
    .sig b { font-size: 13px; color: #334155; }
    .sig img { max-width: 220px; border: 1px solid #cbd5e1; padding: 4px; display: block; margin-top: 6px; }
    .footer { margin-top: 28px; font-size: 10px; color: #94a3b8; }
  </style></head><body>
    <h1>${esc(title)}</h1>
    ${note ? `<div class="note">${esc(note)}</div>` : ''}
    <div class="rule"></div>
    <div class="meta">תאריך: ${esc(dateStr)}</div>
    <div class="meta">בוצע ע״י: ${esc(performedBy)}</div>

    <div class="section">פרטי החייל</div>
    <div class="field"><b>שם מלא:</b> ${esc(soldier.full_name)}</div>
    <div class="field"><b>מספר אישי:</b> ${esc(soldier.personal_number)}</div>
    ${soldier.phone ? `<div class="field"><b>טלפון:</b> ${esc(soldier.phone)}</div>` : ''}
    <div class="field"><b>מסגרת:</b> ${esc(soldier.unit_name)}</div>
    ${soldier.team_name ? `<div class="field"><b>צוות:</b> ${esc(soldier.team_name)}</div>` : ''}

    <div class="section">פריטים (${items.length})</div>
    <table>
      <thead><tr><th>שם פריט</th><th>מ.ס / צ'</th><th class="qty">כמות</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>

    ${signatureB64 ? `<div class="sig"><b>חתימת החייל:</b><img src="data:image/png;base64,${esc(signatureB64)}" alt="חתימה"/></div>` : ''}

    <div class="footer">הופק אוטומטית · ${esc(dateStr)}</div>
  </body></html>`;
}

// ── GAS upload (HTML→PDF + Drive save) ─────────────────────────────────────────────
async function uploadHtmlViaGas(
  gasUrl: string,
  gasSecret: string,
  rootFolderId: string,
  drivePath: string[],
  filename: string,
  html: string,
): Promise<string> {
  const resp = await fetch(gasUrl, {
    method: 'POST',
    redirect: 'follow',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      secret:       gasSecret,
      action:       'savePdfFromHtml',
      rootFolderId,
      drivePath,
      filename,
      html,
    }),
  });
  if (!resp.ok) throw new Error(`GAS call failed (${resp.status}): ${await resp.text()}`);
  const result = await resp.json() as { ok: boolean; url?: string; error?: string };
  if (!result.ok) throw new Error(`GAS error: ${result.error}`);
  return result.url!;
}

// ── GAS delete (trash a PDF in Drive) ──────────────────────────────────────────────
async function deletePdfViaGas(
  gasUrl: string,
  gasSecret: string,
  rootFolderId: string,
  drivePath: string[],
  filename: string,
): Promise<boolean> {
  const resp = await fetch(gasUrl, {
    method: 'POST',
    redirect: 'follow',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      secret:       gasSecret,
      action:       'deletePdf',
      rootFolderId,
      drivePath,
      filename,
    }),
  });
  if (!resp.ok) throw new Error(`GAS call failed (${resp.status}): ${await resp.text()}`);
  const result = await resp.json() as { ok: boolean; deleted?: boolean; error?: string };
  if (!result.ok) throw new Error(`GAS error: ${result.error}`);
  return result.deleted ?? false;
}

// ── CORS + JSON response ──────────────────────────────────────────────────────────
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const jsonRes = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

// ── Error email (best-effort via GAS) ──────────────────────────────────────────────
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

// ── Main ────────────────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  // Read GAS credentials up-front so the catch block can also use them
  const gasUrl    = Deno.env.get('GAS_PDF_URL');
  const gasSecret = Deno.env.get('GAS_PDF_SECRET');

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey  = resolveServiceKey();
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

    // Delete mode: trash an existing PDF (used on full return to remove the
    // soldier's החתמות file). Requires only drive_path + filename.
    if (body.action === 'delete') {
      if (!body.drive_path || !body.filename) {
        return jsonRes({ ok: false, error: 'Missing drive_path / filename' }, 400);
      }
      const deleted = await deletePdfViaGas(gasUrl, gasSecret, rootFolder, body.drive_path, body.filename);
      const sbDel = createClient(supabaseUrl, serviceKey);
      await sbDel.from('audit_logs').insert({
        action: 'weapons.pdf_deleted',
        performed_by: who.user.id,
        details: { drive_path: body.drive_path, filename: body.filename, deleted },
      });
      return jsonRes({ ok: true, deleted });
    }

    const { title, note, soldier, items, performed_by, timestamp, signature_png_b64, drive_path, filename } = body;
    if (!title || !soldier?.full_name || !items || !performed_by || !drive_path || !filename) {
      return jsonRes({ ok: false, error: 'Missing required fields' }, 400);
    }

    // Build HTML
    const html = buildHtml(
      title, note, soldier, items, performed_by,
      timestamp ?? new Date().toISOString(),
      signature_png_b64,
    );

    // Render + upload via GAS
    const url = await uploadHtmlViaGas(gasUrl, gasSecret, rootFolder, drive_path, filename, html);

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
