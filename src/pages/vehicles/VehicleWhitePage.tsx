import { PageTitle } from '../bunker/shared';

/**
 * רכב → רכב לבן.
 * Placeholder — not implemented yet per product decision ("כרגע לא לגעת").
 */
export default function VehicleWhitePage() {
  return (
    <div className="space-y-5">
      <PageTitle title="רכב לבן" subtitle="ניהול רכבים לבנים" />
      <div className="card text-center text-slate-400 py-12">
        בקרוב…
      </div>
    </div>
  );
}
