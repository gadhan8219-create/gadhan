// Hand-written subset of the Supabase schema. Regenerate with:
//   supabase gen types typescript --linked > src/lib/database.types.ts

export type Role = 'admin' | 'raspar';
export type SigningType = 'signing' | 'return' | 'inspection';
export type ItemAction = 'issued' | 'returned' | 'inspected';
export type UnitSigningType = 'signing' | 'return';
export type UnitItemAction = 'issued' | 'returned';

export interface Profile {
  id: string;
  username: string | null;
  full_name: string;
  role: Role;
  unit_id: string | null;
  phone: string | null;
  personal_number: string | null;
  active: boolean;
  password_changed_at: string | null;
  created_at: string;
}

export interface Unit {
  id: string;
  name: string;
  created_at: string;
}

export interface Team {
  id: string;
  unit_id: string;
  name: string;
  created_at: string;
}

export interface Soldier {
  id: string;
  full_name: string;
  personal_number: string;
  phone: string | null;
  unit_id: string;
  team_id: string | null;
  pdf_url: string | null;
  created_at: string;
}

export interface Item {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  active: boolean;
  created_at: string;
}

// ── נשק ──
export interface WeaponsItem {
  id: string;
  name: string;
  description: string | null;
  has_serials: boolean;
  quantity: number | null; // used when has_serials = false
  active: boolean;
  no_check_required: boolean; // exempt from weapon/green checks
  created_at: string;
}

export interface WeaponsItemSerial {
  id: string;
  item_id: string;
  serial_number: string;
  assigned_to_pn:   string | null;  // NULL = available
  assigned_to_name: string | null;
  assigned_at:      string | null;
  is_zeroed:        boolean;        // true = passed איפסון (stays assigned)
  zeroed_at:        string | null;
  zeroed_note:      string | null;  // optional note captured at איפסון (e.g. בטחונית צוות)
  weapon_check_at:  string | null;  // last "בדיקת נשק/אופטיקה"
  green_check_at:   string | null;  // last "ירוק בעיניים"
  created_at: string;
}


export interface Signing {
  id: string;
  soldier_id: string;
  performed_by: string;
  unit_id: string;
  team_id: string | null;
  type: SigningType;
  notes: string | null;
  pdf_url: string | null;
  created_at: string;
}

export interface SigningItem {
  id: string;
  signing_id: string;
  item_id: string;
  quantity: number;
  action: ItemAction;
  serial_number: string | null;
}

export interface UnitSigning {
  id: string;
  unit_id: string;
  performed_by: string;
  type: UnitSigningType;
  notes: string | null;
  created_at: string;
}

export interface UnitSigningItem {
  id: string;
  unit_signing_id: string;
  item_id: string;
  quantity: number;
  action: UnitItemAction;
  serial_number: string | null;
}

export interface ItemSerial {
  id: string;
  item_id: string;
  serial_number: string;
  last_inspected_at: string | null;
  last_inspected_by: string | null;
  green_check_at: string | null;  // "ירוק בעיניים" — bumped on every signing/return
  created_at: string;
}

export interface ItemSerialStatus {
  serial_id: string;
  item_id: string;
  serial_number: string;
  last_inspected_at: string | null;
  green_check_at: string | null;
  current_unit_id: string | null;
  current_soldier_id: string | null;
}

export interface UnitItemStock {
  unit_id: string;
  item_id: string;
  serial_number: string | null;
  allocated: number;
  returned_up: number;
  stock: number;
  distributed: number;
  available: number;
}

export interface AuditLog {
  id: string;
  action: string;
  performed_by: string | null;
  target_type: string | null;
  target_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

export interface Database {
  public: {
    Tables: {
      profiles: { Row: Profile; Insert: Partial<Profile> & { id: string; full_name: string; role: Role }; Update: Partial<Profile> };
      units: { Row: Unit; Insert: Partial<Unit> & { name: string }; Update: Partial<Unit> };
      soldiers: { Row: Soldier; Insert: Partial<Soldier> & { full_name: string; personal_number: string; unit_id: string }; Update: Partial<Soldier> };
      items: { Row: Item; Insert: Partial<Item> & { name: string }; Update: Partial<Item> };
      signings: { Row: Signing; Insert: Partial<Signing> & { soldier_id: string; performed_by: string; unit_id: string; type: SigningType }; Update: Partial<Signing> };
      signing_items: { Row: SigningItem; Insert: Partial<SigningItem> & { signing_id: string; item_id: string; quantity: number; action: ItemAction }; Update: Partial<SigningItem> };
      item_serials: { Row: ItemSerial; Insert: Partial<ItemSerial> & { item_id: string; serial_number: string }; Update: Partial<ItemSerial> };
      unit_signings: { Row: UnitSigning; Insert: Partial<UnitSigning> & { unit_id: string; performed_by: string; type: UnitSigningType }; Update: Partial<UnitSigning> };
      unit_signing_items: { Row: UnitSigningItem; Insert: Partial<UnitSigningItem> & { unit_signing_id: string; item_id: string; quantity: number; action: UnitItemAction }; Update: Partial<UnitSigningItem> };
      audit_logs: { Row: AuditLog; Insert: Partial<AuditLog> & { action: string }; Update: Partial<AuditLog> };
      weapons_items: { Row: WeaponsItem; Insert: Partial<WeaponsItem> & { name: string }; Update: Partial<WeaponsItem> };
      weapons_item_serials: { Row: WeaponsItemSerial; Insert: Partial<WeaponsItemSerial> & { item_id: string; serial_number: string }; Update: Partial<WeaponsItemSerial> };
    };
  };
}
