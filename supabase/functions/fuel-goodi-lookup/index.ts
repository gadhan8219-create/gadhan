// supabase/functions/fuel-goodi-lookup/index.ts
//
// Live fuel-card lookup, ported from the standalone gadhan-delek GAS app
// (FuelGoodi.lookup). Scrapes the Goodi fuel-admin site, which is an ASP.NET
// WebForms page — so every request needs the __VIEWSTATE / __EVENTVALIDATION /
// __VIEWSTATEGENERATOR triplet from a prior GET before it accepts a search POST.
//
// POST body: { cardNumber: string }
// Response:  { ok: true, found: bool, card?: {...} } | { ok:false, error }
//
// Requires a valid Supabase JWT (Authorization header) — same as the weapon fns.

// deno-lint-ignore-file no-explicit-any
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.108.1';

const GOODI_URL = 'https://fueladmin.goodi.co.il/_fuel/';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const jsonRes = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

// ── HTML helpers ──────────────────────────────────────────────────────────────
function extractInput(name: string, html: string): string {
  const m = html.match(new RegExp('name="' + name + '"[^>]+value="([^"]*)"'));
  return m ? m[1] : '';
}
function matchOne(html: string, regex: RegExp): string | null {
  const m = html.match(regex);
  return m ? m[1].trim() : null;
}

interface GoodiTxn { vehicle: string; date: string; time: string; station: string; company: string; liters: number }

// Report table columns: vehicle | company | type | date | time | station | id | cardNum | liters
function parseTransactions(html: string): GoodiTxn[] {
  const rows: GoodiTxn[] = [];
  const rowRe = /<tr class="rg(?:Row|AltRow)"[^>]*>([\s\S]*?)<\/tr>/g;
  const tdRe  = /<td>([\s\S]*?)<\/td>/g;
  let row: RegExpExecArray | null;
  while ((row = rowRe.exec(html)) !== null) {
    const cells: string[] = [];
    let td: RegExpExecArray | null;
    const inner = row[1];
    while ((td = tdRe.exec(inner)) !== null) cells.push(td[1].trim());
    tdRe.lastIndex = 0;
    if (cells.length >= 9) {
      rows.push({
        vehicle: cells[0],
        company: cells[1],
        date:    cells[3].replace(' 00:00:00', '').trim(),
        time:    cells[4],
        station: cells[5],
        liters:  parseFloat(cells[8]) || 0,
      });
    }
  }
  return rows;
}

function parseCard(cardNumber: string, html: string) {
  // "ליטרים שנותרו" must appear, otherwise the card wasn't found.
  if (!html.includes('ליטרים שנותרו')) return null;

  const cardName   = matchOne(html, /title="[^"]*שם כרטיס[^"]*">\s*([^<]+)/);
  const litersUsed = parseFloat(matchOne(html, /ליטרים שהשתמשו:<\/td>\s*<td>([\d.]+)/) || '0');
  const litersLeft = parseFloat(matchOne(html, /ליטרים שנותרו:<\/td>\s*<td>([\d.]+)/) || '0');
  const amountUsed = parseFloat(matchOne(html, /סכום שהשתמשו:<\/td>\s*<td>([\d.]+)/) || '0');
  const lastUsage  = matchOne(html, /תאריך שימוש אחרון:\s*([^<]+)/);

  const name     = (cardName || '').trim();
  const fuelType = name.includes('סולר') ? 'סולר' : 'בנזין';

  return {
    cardNumber: cardNumber.trim(),
    cardName:   name,
    fuelType,
    litersUsed,
    litersLeft,
    amountUsed,
    lastUsage: (lastUsage || '').trim(),
    recentUsages: [] as GoodiTxn[],
  };
}

function fmtDate(d: Date): string {
  const p = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jerusalem', day: '2-digit', month: '2-digit', year: 'numeric',
  }).formatToParts(d);
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? '';
  return `${get('day')}/${get('month')}/${get('year')}`;
}

async function fetchText(url: string, init?: RequestInit): Promise<string> {
  const resp = await fetch(url, init);
  return await resp.text();
}

async function goodiLookup(cardNumber: string) {
  const cn = cardNumber.trim();

  // Step 1: GET → ViewState triplet
  const html1 = await fetchText(GOODI_URL, {
    redirect: 'follow',
    headers: { 'User-Agent': 'Mozilla/5.0' },
  });
  const vs1  = extractInput('__VIEWSTATE', html1);
  const ev1  = extractInput('__EVENTVALIDATION', html1);
  const vsg1 = extractInput('__VIEWSTATEGENERATOR', html1);
  if (!vs1) throw new Error('לא ניתן לטעון את דף גודי');

  // Step 2: POST search by card number
  const body2 = new URLSearchParams({
    RadStyleSheetManager1_TSSM: '', RadScriptManager1_TSM: '',
    __EVENTTARGET: '', __EVENTARGUMENT: '',
    __VIEWSTATE: vs1, __VIEWSTATEGENERATOR: vsg1, __EVENTVALIDATION: ev1,
    ddSearchSelect: '3', tbSearch: cn, btnSearch: 'חפש',
  });
  const html2 = await fetchText(GOODI_URL, {
    method: 'POST', redirect: 'follow',
    headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': GOODI_URL, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body2,
  });

  const card = parseCard(cn, html2);
  if (!card) return null;

  // Step 3: POST date range → recent usages (best-effort)
  try {
    const vs2  = extractInput('__VIEWSTATE', html2);
    const ev2  = extractInput('__EVENTVALIDATION', html2);
    const vsg2 = extractInput('__VIEWSTATEGENERATOR', html2);
    const today = fmtDate(new Date());
    const year  = new Date().getFullYear();
    const marchFirst = `01/03/${year}`;

    const body3 = new URLSearchParams({
      RadStyleSheetManager1_TSSM: '', RadScriptManager1_TSM: '',
      __EVENTTARGET: '', __EVENTARGUMENT: '',
      __VIEWSTATE: vs2, __VIEWSTATEGENERATOR: vsg2, __EVENTVALIDATION: ev2,
      ddSearchSelect: '3', tbSearch: cn,
      'dpStart$dateInput': marchFirst, 'dpEnd$dateInput': today,
      btnApplyRange: 'הצג',
    });
    const html3 = await fetchText(GOODI_URL, {
      method: 'POST', redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': GOODI_URL, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body3,
    });
    card.recentUsages = parseTransactions(html3);
  } catch {
    card.recentUsages = [];
  }

  return card;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey     = Deno.env.get('SUPABASE_ANON_KEY')!;

    // Auth — must be a logged-in user
    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader) return jsonRes({ ok: false, error: 'Missing Authorization header' }, 401);
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: who } = await userClient.auth.getUser();
    if (!who?.user) return jsonRes({ ok: false, error: 'Invalid token' }, 401);

    const body = await req.json().catch(() => null);
    const cardNumber = body?.cardNumber;
    if (!cardNumber) return jsonRes({ ok: false, error: 'חסר מספר כרטיס' }, 400);

    const card = await goodiLookup(String(cardNumber));
    if (!card) return jsonRes({ ok: true, found: false });
    return jsonRes({ ok: true, found: true, card });

  } catch (e) {
    console.error('[fuel-goodi-lookup]', e);
    return jsonRes({ ok: false, error: (e as Error).message }, 500);
  }
});
