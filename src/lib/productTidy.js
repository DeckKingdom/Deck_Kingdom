// One-off product tidy-up agreed on 3 Nov 2026 (duplicates, fencing lengths, screens, kits, names).
// tidyPlan() lists what would change against the current data — empty once applied, so it's safe to
// leave in: the Products page only offers it while something is still to do.
// applyTidy() returns the new planner products, the extra SKU-list entries and the stock rows to drop;
// the normal catalogue sync then re-codes SKUs and moves stock history / invoices with them.
import { masterKey, codeSource, cleanCode, suggestCode } from "./crmCore.js";

const REMOVE = {
  "prd-dk-2-4-post-alu": "7kbhdqvy", // Fence Post Aluminium 2.4m (with cap) → Aluminium Fence Post 2.4m
  "prd-dk-300mm-screen": "4w425blc", // Fence Screen Decorative 300mm → Fence Screen Style 1
  "prd-tg-1-8-screen": "prd-tg-300mm-screen", // Tuda Grass screen entered twice
};
const NEW_LIST = [
  ["02-02", "14", "Aluminium post cap"],
  ["02-07", "05", "Tuda Grass screen"],
  ["02-07", "06", "Finch screen"],
  ["02-07", "07", "Easy Composite screen"],
];
// field changes by product id
const SET = {
  "7kbhdqvy": { name: "Aluminium Fence Post 2.4m", salePrice: 45 },
  "7d3djo6u": { segProd: "14", name: "Aluminium Post Cap" },
  "4w425blc": { segLen: "01", segSub: "07", segProd: "01", salePrice: 35, name: "Fence Screen Style 1 300mm 1.83m", code: "DK/1.83/SCREEN-STYLE-1" },
  "prd-tg-300mm-screen": { segLen: "01", segSub: "07", segProd: "05", name: "Fence Screen Tuda Grass 300mm 1.83m", code: "TG/1.83/SCREEN-TG" },
  "prd-fn-300mm-screen": { segLen: "01", segSub: "07", segProd: "06", name: "Fence Screen Finch 300mm 1.83m", code: "FN/1.83/SCREEN-FN" },
  "prd-cl-1-8-screen": { segLen: "01", segSub: "07", segProd: "07", name: "Fence Screen Easy Composite 300mm 1.83m", code: "CL/1.83/SCREEN-CL" },
  "prd-dk-3ft-retro-kit": { isKit: true },
  "prd-dk-4ft-retro-kit": { isKit: true },
  "prd-dk-6ft-retro-kit": { isKit: true },
  "prd-tg-6ft-retro-kit": { isKit: true },
  "prd-tg-6ft-retro-kit-2-2": { isKit: true, salePrice: 182.5 },
  "prd-tg-post-insert": { segLen: "41" },
  "prd-tg-screws-blk": { segProd: "16" },
  "prd-tg-joist-comp": { segLen: "06" },
};
const ONE_EIGHT = "11", ONE_EIGHT_THREE = "01"; // 6ft fencing: everything on 1.83m

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// the products as they'd be after the tidy-up, plus a log of every change
const plan = (planner, crm) => {
  const before = (planner && planner.products) || [];
  const byId = Object.fromEntries(before.map((p) => [p.id, p]));
  const log = [];
  let products = JSON.parse(JSON.stringify(before));

  Object.entries(REMOVE).forEach(([gone, keep]) => {
    if (byId[gone] && byId[keep]) log.push("Merge “" + byId[gone].name + "” (" + byId[gone].code + ") into “" + byId[keep].name + "”");
  });
  products = products.filter((p) => !(REMOVE[p.id] && byId[REMOVE[p.id]]));

  products.forEach((p) => {
    const want = SET[p.id];
    if (want) {
      Object.entries(want).forEach(([k, v]) => {
        if (!same(p[k], v)) {
          log.push("“" + p.name + "”: " + k + " " + JSON.stringify(p[k] === undefined ? "" : p[k]) + " → " + JSON.stringify(v));
          p[k] = v;
          if (k === "isKit" && v && !Array.isArray(p.kit)) p.kit = [];
        }
      });
    }
    // 6ft fencing on one length code
    if (p.segCat === "02" && p.segLen === ONE_EIGHT) {
      log.push("“" + p.name + "”: length 1.8m → 1.83m");
      p.segLen = ONE_EIGHT_THREE;
      p.name = String(p.name || "").replace(/\b1\.8m\b/, "1.83m");
      p.code = cleanCode(String(p.code || "").replace(/\/1\.8\//, "/1.83/"));
    }
  });

  // one name (and code tail) per master product, taken from our DK version
  const groups = {};
  const harmonised = new Set();
  products.forEach((p) => { const k = masterKey(p); if (k) (groups[k] = groups[k] || []).push(p); });
  Object.values(groups).forEach((g) => {
    const dk = g.find((p) => p.segSup === "01" && !p.isKit) || g.find((p) => p.segSup === "01");
    if (!dk || g.length < 2) return;
    const tail = cleanCode(dk.code).split("/").slice(1).join("/");
    g.forEach((p) => {
      harmonised.add(p.id);
      if (p === dk) return;
      const key = codeSource(p.code) || "";
      const code = tail && key ? cleanCode(key + "/" + tail) : p.code;
      if (p.name !== dk.name) { log.push("Rename “" + p.name + "” (" + key + ") → “" + dk.name + "”"); p.name = dk.name; }
      if (code && cleanCode(p.code) !== code) { log.push("Code " + p.code + " → " + code); p.code = code; }
    });
  });

  // anything renamed above without a DK partner still gets a code that matches its name
  products.forEach((p) => {
    const was = byId[p.id];
    if (was && was.name !== p.name && !harmonised.has(p.id) && !SET[p.id]?.code && cleanCode(p.code) === cleanCode(was.code)) {
      const c = suggestCode(p.name, codeSource(p.code) || "DK");
      if (c && c !== cleanCode(p.code)) { log.push("Code " + p.code + " → " + c); p.code = c; }
    }
  });

  const lists = (crm && crm.skuLists) || {};
  const addList = NEW_LIST.filter(([k, code]) => !((lists.product || {})[k] || []).some((x) => x.code === code));
  addList.forEach(([k, code, label]) => log.push("SKU list " + k + ": add " + code + " · " + label));

  const removed = Object.keys(REMOVE).filter((id) => byId[id] && byId[REMOVE[id]]);
  return { products, log, addList, removed };
};

export const tidyPlan = (planner, crm) => plan(planner, crm).log;

// apply: returns { products, skuLists, removedIds } — the caller saves them
export const applyTidy = (planner, crm) => {
  const { products, addList, removed } = plan(planner, crm);
  const skuLists = JSON.parse(JSON.stringify((crm && crm.skuLists) || {}));
  if (addList.length) {
    skuLists.product = skuLists.product || {};
    addList.forEach(([k, code, label]) => {
      skuLists.product[k] = [...(skuLists.product[k] || []), { code, label }].sort((a, b) => a.code.localeCompare(b.code));
    });
  }
  return { products, skuLists, removedIds: removed, mergeInto: REMOVE };
};
