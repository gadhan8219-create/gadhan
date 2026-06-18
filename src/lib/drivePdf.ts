import { supabase } from './supabase';

// Fire-and-forget Hebrew RTL PDF → Google Drive, via the GAS proxy edge function
// (`generate-weapon-checkout-pdf`). The function is generic — it renders any
// title/items/signature into an A4 RTL PDF and stores it at
// `<root>/<drive_path…>/<filename>`. The weapons module uses it for נשקיה/…;
// the radio module reuses it for קשר/… (same logic, no redeploy needed).

export interface DrivePdfItem { name: string; quantity: number; serial?: string | null }

export interface DrivePdfArgs {
  title: string;                 // e.g. "החתמת ציוד קשר" | "זיכוי ציוד קשר — מסגרת"
  note?: string;                 // optional subtitle line
  entity: {                      // the soldier (or framework) the sheet is for
    full_name: string;
    personal_number: string;
    phone?: string;
    unit_name: string;
    team_name?: string;
  };
  items: DrivePdfItem[];
  performed_by: string;
  signature_png_b64?: string;    // base64 PNG, no data: prefix (SignaturePad.toDataUrl)
  drive_path: string[];          // folder parts under the root, e.g. ["קשר","מסגרת א","החתמות"]
  filename: string;              // "<שם>.pdf"
}

/** Fire-and-forget — failures are reported by the backend (error email); never throws. */
export function fireDrivePdf(args: DrivePdfArgs): void {
  supabase.auth.getSession().then(({ data: { session } }) => {
    fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-weapon-checkout-pdf`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session?.access_token ?? ''}`,
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({
        title: args.title,
        note: args.note,
        soldier: args.entity,            // the edge function calls this field `soldier`
        items: args.items,
        performed_by: args.performed_by,
        timestamp: new Date().toISOString(),
        signature_png_b64: args.signature_png_b64,
        drive_path: args.drive_path,
        filename: args.filename,
      }),
    }).catch(() => { /* backend sends an error email on failure */ });
  });
}
