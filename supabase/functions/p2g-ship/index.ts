// p2g-ship: quotes + booking through the Parcel2Go API (Evri et al without a
// corporate account). Needs the P2G_CLIENT_ID and P2G_SECRET secrets (from
// parcel2go.com -> Account -> API Clients). Optional: P2G_AUTOPAY=1 pays each
// order from the PrePay balance straight away and returns the label links;
// without it the order comes back unpaid with a payment link to click.
// Deployed like route-miles / read-order.
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });

const BASE = "https://www.parcel2go.com";
let tok: { t: string; exp: number } | null = null;

async function token(): Promise<string> {
  if (tok && Date.now() < tok.exp - 60_000) return tok.t;
  const id = (Deno.env.get("P2G_CLIENT_ID") || "").trim();
  const sec = (Deno.env.get("P2G_SECRET") || "").trim();
  if (!id || !sec) throw new Error("The P2G_CLIENT_ID / P2G_SECRET secrets aren't set in Supabase yet.");
  const r = await fetch(BASE + "/auth/connect/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", scope: "public-api payment", client_id: id, client_secret: sec }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error("Parcel2Go login failed: " + (j.error_description || j.error || r.status));
  tok = { t: j.access_token, exp: Date.now() + (Number(j.expires_in) || 3600) * 1000 };
  return tok.t;
}

const api = async (path: string, body?: unknown, method = "POST") => {
  const t = await token();
  const r = await fetch(BASE + path, {
    method,
    headers: { authorization: "Bearer " + t, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  let j: any = null;
  try { j = JSON.parse(text); } catch { /* keep text */ }
  if (!r.ok) throw new Error("Parcel2Go " + path + " failed (" + r.status + "): " + (j && (j.Message || j.message) || text.slice(0, 300)));
  return j;
};

// Deck Kingdom's collection address
const COLLECT = {
  ContactName: "Deck Kingdom", Organisation: "Deck Kingdom Ltd", Email: "info@deckkingdom.co.uk",
  Phone: "01613991837", Property: "Unit A", Street: "106 Whitelands Road", Town: "Ashton-under-Lyne",
  County: "Greater Manchester", Postcode: "OL6 6UG", CountryIsoCode: "GBR",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const b = await req.json();
    const parcels = (b.parcels || []).map((p: any) => ({
      Value: Number(p.value) || 25, Weight: Number(p.weight) || 1,
      Length: Number(p.length) || 30, Width: Number(p.width) || 20, Height: Number(p.height) || 10,
    }));
    if (!parcels.length) return json({ error: "No parcel sizes given." }, 400);

    if (b.action === "quote") {
      const q = await api("/api/quotes", {
        CollectionAddress: { Country: "GBR" },
        DeliveryAddress: { Country: "GBR", Postcode: String(b.delivery && b.delivery.postcode || "").trim() },
        Parcels: parcels,
      });
      if ((q.Quotes || []).length) console.log("p2g first quote: " + JSON.stringify(q.Quotes[0]).slice(0, 900));
      const money = (x: any) => { const n = Number(x); return isFinite(n) && n > 0 ? n : null; };
      const quotes = (q.Quotes || []).map((x: any) => {
        const sv = x.Service || {};
        return {
          service: sv.Slug || sv.Id || x.Slug || x.Id,
          name: sv.Name || x.Name || "",
          courier: sv.CourierName || sv.Courier || sv.Classification || x.CourierName || "",
          price: money(x.TotalPrice) ?? money(x.TotalPriceIncVat) ?? money(x.Total) ?? money(x.Price)
            ?? (money(x.TotalPriceExVat) !== null ? Math.round(money(x.TotalPriceExVat)! * 1.2 * 100) / 100 : null),
          exVat: money(x.TotalPriceExVat),
          eta: x.EstimatedDeliveryDate || (sv.EstimatedDeliveryDays ? sv.EstimatedDeliveryDays + " days" : ""),
          dates: (x.AvailableCollectionDates || []).slice(0, 3).map((d: any) => (d && (d.Date || d.date)) || d),
        };
      }).sort((a: any, z: any) => (a.price ?? 999) - (z.price ?? 999)).slice(0, 8);
      return json({ quotes });
    }

    if (b.action === "order") {
      const d = b.delivery || {};
      const item = {
        Id: crypto.randomUUID(),
        CollectionDate: b.collectionDate || new Date(Date.now() + 86_400_000).toISOString().slice(0, 10),
        Service: b.service,
        Reference: String(b.reference || "").slice(0, 50),
        CollectionAddress: COLLECT,
        Parcels: parcels.map((p: any) => ({
          Id: crypto.randomUUID(), Height: p.Height, Length: p.Length, Width: p.Width, Weight: p.Weight,
          EstimatedValue: p.Value, ContentsSummary: String(b.contents || "Composite decking parts").slice(0, 80),
          DeliveryAddress: {
            ContactName: String(d.contact || "").slice(0, 60), Email: String(d.email || ""), Phone: String(d.phone || ""),
            Property: String(d.property || ""), Street: String(d.street || ""), Town: String(d.town || ""),
            County: String(d.county || ""), Postcode: String(d.postcode || ""), CountryIsoCode: "GBR",
          },
        })),
      };
      const o = await api("/api/orders", {
        CustomerDetails: { Email: "info@deckkingdom.co.uk", Forename: "Deck", Surname: "Kingdom" },
        Items: [item],
      });
      const links = o.Links || {};
      const out: any = { orderId: o.OrderId, total: o.TotalPrice, hash: o.Hash, links, paid: false };
      if (Deno.env.get("P2G_AUTOPAY") === "1" && links.PayWithPrePay) {
        const payUrl = String(links.PayWithPrePay);
        const pay = await api(payUrl.startsWith("http") ? payUrl.replace(BASE, "") : payUrl, {});
        out.paid = true;
        out.payment = pay;
        out.labels = (pay && (pay.Links || pay.links)) || null;
      }
      return json(out);
    }

    return json({ error: "Unknown action — send action: 'quote' or 'order'." }, 400);
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
