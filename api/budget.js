// GET /api/budget: the budget document, for the signed-in owner.
import { owner, rest, json } from "./_lib/supabase.js";

export const GET = owner(async () => {
  const rows = await rest("docs?id=eq.current&select=body");
  if (!rows.length) return json({ error: "No budget yet" }, 404);
  return json(rows[0].body);
});
