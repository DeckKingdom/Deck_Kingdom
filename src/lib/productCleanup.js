// One-off products clean-up reviewed with Jon on 23 Nov 2026 (see the
// "Products Clean-up Review" page). His verdicts, item by item:
//   1. duplicate Grey Balustrade Finishing Kit row — delete the empty twin
//   2. slatted cladding trims are individual products (L trim / F trim /
//      external corner) — F trim and external corner each get their own
//      product code so they stop merging; 02 stays free for the plain trim
//   3. the old orphan SKU rows are relevant — LEFT ALONE by his call
//   4. the legacy Balustrade Post Cap rows are relevant — LEFT ALONE
//   5. the nameless "2.5m" test product — delete it and its stock row
//   6. DK and TG metal clips are the same product (both come with screws) —
//      names aligned so each pair reads as one clean row in the picker
// cleanupPlan() lists what still needs doing — empty once applied, so the
// banner on the Products screen disappears by itself and this stays safe to
// leave in the code.

const DROP_MASTER = ["7stsl95v", "9zcqeygf"]; // empty dup Grey finishing kit · the "2.5m" product's row
const DROP_PRODUCT = ["yg8mr80t"]; // the nameless "2.5m" planner product
const SEG = { wpze6cj5: "03", lmppod7h: "04" }; // F trim · external corner get their own identities
const NEW_LIST = [["03-02", "03", "Slatted cladding F trim"], ["03-02", "04", "Slatted cladding corner"]];
const NAME = {
  // naming order agreed 23 Nov: family, then material, then the part, then
  // length — "Fence Post Composite Cap", "Fence Post Aluminium Kit 1.9m" —
  // so A-Z keeps each family together, grouped by material within it
  "7kbhdqvy": "Fence Post Aluminium 2.4m",
  "prd-tg-2-4-post-alu": "Fence Post Aluminium 2.4m", // TG's version of the same post
  "7d3djo6u": "Fence Post Aluminium Cap",
  "k2xzlvp2": "Fence Post Composite Cap",
  "prd-tg-post-cap": "Fence Post Composite Cap",
  "xm39498g": "Fence Post Composite Skirt",
  "rxht96ov": "Fence Post Composite Skirt",
  "prd-tg-post-infill": "Fence Post Composite Infill",
  "prd-tg-1-9-post-alu-kit": "Fence Post Aluminium Kit 1.9m",
  "prd-dk-clips-metal": "Decking Clips Metal 3mm & Screws (100 pack)",
  "prd-tg-clips-metal": "Decking Clips Metal 3mm & Screws (100 pack)",
  "prd-dk-clips-plastic": "Decking Clips Plastic & Screws (100 pack)",
  "prd-tg-clips-plastic": "Decking Clips Plastic & Screws (100 pack)",
  "prd-dk-clips-starter": "Decking Starter Clips & Screws (20 pack)",
  "prd-tg-clips-starter": "Decking Starter Clips & Screws (20 pack)",
};

export function cleanupPlan(planner, crm) {
  const out = [];
  const mps = (crm && crm.masterProducts) || [];
  const prods = (planner && planner.products) || [];
  DROP_MASTER.forEach((id) => {
    const m = mps.find((x) => x.id === id);
    if (m) out.push("Delete stock row " + (m.sku || id) + " — " + (m.name || "unnamed") + (id === "7stsl95v" ? " (empty duplicate of the same SKU)" : " (test row)"));
  });
  DROP_PRODUCT.forEach((id) => {
    const p = prods.find((x) => x.id === id);
    if (p) out.push("Delete the nameless test product “" + (p.name || id) + "”");
  });
  Object.entries(SEG).forEach(([id, seg]) => {
    const p = prods.find((x) => x.id === id);
    if (p && p.segProd !== seg) out.push("Give “" + p.name + "” its own product identity (code " + seg + ") so the trim variants stop merging");
  });
  Object.entries(NAME).forEach(([id, name]) => {
    const p = prods.find((x) => x.id === id);
    if (p && p.name !== name) out.push("Rename “" + p.name + "” → “" + name + "”");
  });
  return out;
}

export function applyCleanup(planner, crm) {
  const dropM = new Set(DROP_MASTER);
  const dropP = new Set(DROP_PRODUCT);
  const masterProducts = ((crm && crm.masterProducts) || [])
    .filter((m) => !dropM.has(m.id))
    .map((m) => (NAME[m.importProductId] ? { ...m, name: NAME[m.importProductId] } : m));
  const products = ((planner && planner.products) || [])
    .filter((p) => !dropP.has(p.id))
    .map((p) => {
      let n = p;
      if (SEG[p.id] && n.segProd !== SEG[p.id]) n = { ...n, segProd: SEG[p.id] };
      if (NAME[p.id] && n.name !== NAME[p.id]) n = { ...n, name: NAME[p.id] };
      return n;
    });
  const skuLists = JSON.parse(JSON.stringify((crm && crm.skuLists) || {}));
  skuLists.product = skuLists.product || {};
  NEW_LIST.forEach(([key, code, label]) => {
    skuLists.product[key] = skuLists.product[key] || [];
    if (!skuLists.product[key].some((x) => x.code === code)) skuLists.product[key].push({ code, label });
  });
  return { masterProducts, products, skuLists };
}
