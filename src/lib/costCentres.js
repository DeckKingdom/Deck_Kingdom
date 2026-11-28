// Cost centres: where the money actually goes. Two levels — centre and sub —
// on every purchase-ledger entry. assignCostCentre() mirrors the backfill in
// supabase/migrations/075_cost_centres_wages.sql: supplier rules first (most
// specific wins), FileMaker category as the fallback, so new entries group
// themselves and odd ones can be recoded by hand on the Purchases screen.
export const COST_CENTRES = {
  "Stock": ["Product purchases", "Veejoy repayments"],
  "Premises": ["Rent", "Rates", "Utilities", "Other"],
  "Plant": ["Forklift", "Forklift finance", "Warehouse equipment"],
  "Fleet": ["Fuel", "Repairs & maintenance", "Insurance & breakdown", "Road, tolls & fines", "Hire"],
  "Carriage": ["Couriers", "Postage"],
  "Staff & Subcontract": ["Subcontract drivers", "Wages", "Pension", "Other"],
  "Finance & Professional": ["Trade finance interest", "Accountancy & software", "Bank charges", "Legal", "HMRC"],
  "Marketing & Web": ["SEO consulting", "Tools & hosting", "Design & print", "Sponsorship"],
  "Office & Misc": ["Stationery & supplies", "Tools", "Food & meetings", "General"],
};
export const COST_CENTRE_LIST = Object.keys(COST_CENTRES);

// Overheads = everything that isn't stock; the snapshot's fixed-cost line
export const isOverhead = (centre) => !!centre && centre !== "Stock";

// [match on supplier name, match on invoice detail (null = any), centre, sub]
const SUPPLIER_RULES = [
  [/seneca|revolve/i, /facilit|ratchet|interest|bank fee|vat part|\binv/i, "Finance & Professional", "Trade finance interest"], // interest carries an invoice no.
  [/seneca|revolve/i, null, "Stock", "Veejoy repayments"],
  [/close brothers/i, /insurance/i, "Fleet", "Insurance & breakdown"], // they finance the insurance premiums too
  [/close brothers/i, null, "Plant", "Forklift finance"],
  [/joanne kirk|j ?e ?kirk/i, null, "Premises", "Rent"],
  [/tameside met/i, null, "Premises", "Rates"],
  [/waterplus|british gas|yu energy|premier waste/i, null, "Premises", "Utilities"],
  [/amdec|tag forklift|cheshire gas/i, null, "Plant", "Forklift"],
  [/racking/i, null, "Plant", "Warehouse equipment"],
  [/martin brooks|ricky ward|mark murray|ian blackwood|sean c craven/i, null, "Staff & Subcontract", "Subcontract drivers"],
  [/molly draper/i, null, "Staff & Subcontract", "Other"],
  [/skool|3rdway|third way/i, null, "Marketing & Web", "SEO consulting"],
  [/ahrefs|krystal|swift hosting|checkatrade/i, null, "Marketing & Web", "Tools & hosting"],
  [/urban haze|rainworks/i, null, "Marketing & Web", "Design & print"],
  [/business matters|fairfield gold/i, null, "Marketing & Web", "Sponsorship"],
  [/gatefield/i, null, "Fleet", "Repairs & maintenance"],
  [/dvla|dart charge|mersey flow|tyne tunnel|clean air|m6 toll|car park/i, null, "Fleet", "Road, tolls & fines"],
  [/rac breakdown|tempcover/i, null, "Fleet", "Insurance & breakdown"],
  [/^fuel$|allstar/i, null, "Fleet", "Fuel"],
  [/evri|hermes|post office|parcel2go|far logistics|s\.?j courier|red funnel/i, null, "Carriage", "Couriers"],
  [/quickbooks/i, null, "Finance & Professional", "Accountancy & software"],
  [/courthill|accountant/i, null, "Finance & Professional", "Accountancy & software"],
  [/bromleys|solicitor/i, null, "Finance & Professional", "Legal"],
  [/^hmrc$/i, null, "Finance & Professional", "HMRC"],
  [/tuda|tradescape|south yorkshire composites|ssh trading|tuffx|veejoy|dino decking|cladco/i, null, "Stock", "Product purchases"],
];

const CATEGORY_MAP = {
  "Products": ["Stock", "Product purchases"], "Materials": ["Stock", "Product purchases"],
  "Fuel": ["Fleet", "Fuel"], "Vehicle Repairs & Maintenance": ["Fleet", "Repairs & maintenance"], "Vehicle": ["Fleet", "Repairs & maintenance"],
  "Insurances": ["Fleet", "Insurance & breakdown"], "Insurance": ["Fleet", "Insurance & breakdown"],
  "Trailer Hire": ["Fleet", "Hire"], "Parking": ["Fleet", "Road, tolls & fines"], "Penalty Charge / Fines": ["Fleet", "Road, tolls & fines"],
  "Forklift truck": ["Plant", "Forklift"],
  "Couriers": ["Carriage", "Couriers"], "Couriers & freight": ["Carriage", "Couriers"], "Postage": ["Carriage", "Postage"],
  "Subcontractors & drivers": ["Staff & Subcontract", "Subcontract drivers"],
  "Accountancy": ["Finance & Professional", "Accountancy & software"], "Professional fees": ["Finance & Professional", "Accountancy & software"],
  "Bank, finance & fees": ["Finance & Professional", "Trade finance interest"], "HMRC": ["Finance & Professional", "HMRC"], "Tax & government": ["Finance & Professional", "HMRC"],
  "Premises & utilities": ["Premises", "Utilities"],
  "Marketing": ["Marketing & Web", "Tools & hosting"], "Website & software": ["Marketing & Web", "Tools & hosting"], "Sponsorship": ["Marketing & Web", "Sponsorship"],
  "Stationary & Office Supplies": ["Office & Misc", "Stationery & supplies"], "Office & telecoms": ["Office & Misc", "General"],
  "Tools/Misc": ["Office & Misc", "Tools"], "Tools & equipment": ["Office & Misc", "Tools"],
  "Food & Beverage": ["Office & Misc", "Food & meetings"], "Meeting": ["Office & Misc", "Food & meetings"], "Travel & subsistence": ["Office & Misc", "Food & meetings"],
  "Office Overheads": ["Office & Misc", "General"],
};

export const assignCostCentre = (supplierName, detail, category) => {
  const s = String(supplierName || ""), d = String(detail || "");
  for (const [supRe, detRe, cc, sub] of SUPPLIER_RULES) {
    if (supRe.test(s) && (!detRe || detRe.test(d))) return { costCentre: cc, costSub: sub };
  }
  const m = CATEGORY_MAP[String(category || "").trim()];
  return m ? { costCentre: m[0], costSub: m[1] } : { costCentre: "Office & Misc", costSub: "General" };
};
