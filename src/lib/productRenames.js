// Rename passes agreed with Jon — exact old-name → new-name swaps. The
// trigger is the OLD name, so a pass is spent the moment it's applied (or
// the name has been changed by hand since): nothing can re-trigger it or
// fight a later edit, the flaw the retired 23 Nov banners had.
// 24 Nov 2026: the four Decking products that led with the part instead of
// the family, per the family → range/finish → part → length convention.
export const RENAMES = [
  ["Bullnose Board Premium 4.8m", "Decking Board Bullnose Premium 4.8m"],
  ["Fascia Board Premium 4.8m", "Decking Fascia Premium 4.8m"],
  ["Step Edge Board 3.6m", "Decking Step Edge Board 3.6m"],
  ["Step Edge Board 4.8m", "Decking Step Edge Board 4.8m"],
];

export function renamePlan(planner) {
  const names = new Set(((planner && planner.products) || []).map((p) => p.name));
  return RENAMES.filter(([from]) => names.has(from)).map(([from, to]) => "“" + from + "” → “" + to + "”");
}

export function applyRenames(planner, crm) {
  const map = new Map(RENAMES);
  const products = ((planner && planner.products) || []).map((p) => (map.has(p.name) ? { ...p, name: map.get(p.name) } : p));
  const masterProducts = ((crm && crm.masterProducts) || []).map((m) => (map.has(m.name) ? { ...m, name: map.get(m.name) } : m));
  return { products, masterProducts };
}
