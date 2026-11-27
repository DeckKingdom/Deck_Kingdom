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
  if (!r.ok) {
    // P2G validation errors arrive as { Errors: [{ Type, Error }] } — show the readable parts
    const list = j && Array.isArray(j.Errors) ? [...new Set(j.Errors.map((e: any) => e && (e.Error || e.Message)).filter(Boolean))].join(" · ") : "";
    throw new Error("Parcel2Go " + path + " failed (" + r.status + "): " + (list || (j && (j.Message || j.message)) || text.slice(0, 300)));
  }
  return j;
};

// "WA4-4BX" / "wa44bx" -> "WA4 4BX" (P2G rejects anything but the spaced form)
const pcFix = (s: unknown) => {
  const t = String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return t.length > 3 ? t.slice(0, -3) + " " + t.slice(-3) : t;
};

// The labels endpoint: GET /api/labels/{orderId}?hash=…&referenceType=OrderId
// — bearer-authenticated, and the PDF is generated ASYNCHRONOUSLY after
// payment, so it's retried. Replies are either the raw PDF or a JSON wrapper
// with the PDF base64-encoded in Base64EncodedLabels[] (empty = not ready yet).
const isPdfBytes = (b: Uint8Array) => b.length > 4 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46; // %PDF
const b64of = (buf: Uint8Array) => {
  let s = "";
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
};
async function fetchLabelPdf(orderId: string, hash: string, attempts = 5): Promise<{ labelPdf: string; labelUrl: string } | null> {
  if (!orderId || !hash) return null;
  // labelMedia is REQUIRED (the route 404s without it): Label4X6 = one 4x6 label
  // per page, which the app's A4 sticker-sheet builder expects; A4 is the other value
  const url = BASE + "/api/labels/" + orderId + "?hash=" + encodeURIComponent(hash) + "&referenceType=OrderId&detailLevel=All&labelMedia=Label4X6&labelFormat=PDF";
  for (let a = 0; a < attempts; a++) {
    try {
      const r = await fetch(url, { headers: { authorization: "Bearer " + (await token()), accept: "application/pdf" } });
      const buf = new Uint8Array(await r.arrayBuffer());
      let pdf: Uint8Array | null = isPdfBytes(buf) ? buf : null;
      let note = "";
      if (!pdf && r.ok) {
        try {
          const j = JSON.parse(new TextDecoder().decode(buf));
          const arr = (j && (j.Base64EncodedLabels || j.base64EncodedLabels)) || [];
          note = "wrapper, labels: " + arr.length;
          for (const b64 of arr) {
            const dec = Uint8Array.from(atob(String(b64)), (c) => c.charCodeAt(0));
            if (isPdfBytes(dec)) { pdf = dec; break; }
          }
        } catch { note = "non-JSON body"; }
      }
      console.log("p2g label " + orderId + " try " + (a + 1) + " -> " + r.status + (pdf ? " PDF " + pdf.length + "b" : " " + (note || new TextDecoder().decode(buf.slice(0, 120)).replace(/\s+/g, " "))));
      if (pdf) return { labelPdf: b64of(pdf), labelUrl: url };
    } catch (e) { console.log("p2g label " + orderId + " try " + (a + 1) + " threw: " + String(e).slice(0, 120)); }
    if (a < attempts - 1) await new Promise((res) => setTimeout(res, 2000)); // label not generated yet
  }
  return null;
}

// "07922-551-388" / "+44 7922 551388" -> "07922551388" (drop-shop services want 11 bare digits)
const phoneFix = (s: unknown) => {
  let t = String(s || "").replace(/[^\d+]/g, "");
  if (t.startsWith("+44")) t = "0" + t.slice(3);
  else if (t.startsWith("44") && t.length >= 12) t = "0" + t.slice(2);
  return t.replace(/\D/g, "");
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
    if (!parcels.length && b.action !== "labels") return json({ error: "No parcel sizes given." }, 400);

    if (b.action === "quote") {
      const q = await api("/api/quotes", {
        CollectionAddress: { Country: "GBR" },
        DeliveryAddress: { Country: "GBR", Postcode: pcFix(b.delivery && b.delivery.postcode) },
        Parcels: parcels,
      });
      if ((q.Quotes || []).length) {
        const f = { ...q.Quotes[0] } as any;
        delete f.Service; delete f.AvailableExtras; delete f.Extras;
        console.log("p2g quote keys: " + JSON.stringify(Object.keys(q.Quotes[0])) + " | values: " + JSON.stringify(f).slice(0, 800));
      }
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
      // P2G insists on a property name/number of its own: peel the first part off
      // the address line when none was given ("Suite 6, Oaktree Barn, Hatton Lane"
      // -> property "Suite 6", street "Oaktree Barn, Hatton Lane")
      let prop = String(d.property || "").trim();
      let street = String(d.street || "").trim();
      if (!prop && street) {
        const parts = street.split(",").map((s: string) => s.trim()).filter(Boolean);
        if (parts.length > 1) { prop = parts[0]; street = parts.slice(1).join(", "); }
        else {
          const m = street.match(/^(\d+[A-Za-z]?)\s+(.+)$/); // "12 High St"
          if (m) { prop = m[1]; street = m[2]; } else prop = street; // last resort: repeat it
        }
      }
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
            ContactName: String(d.contact || "").slice(0, 60), Email: String(d.email || ""), Phone: phoneFix(d.phone),
            Property: prop, Street: street, Town: String(d.town || ""),
            County: String(d.county || ""), Postcode: pcFix(d.postcode), CountryIsoCode: "GBR",
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
        // the label generates asynchronously after payment — fetch it (retries inside)
        try {
          const got = await fetchLabelPdf(String(o.OrderId || ""), String(o.Hash || ""));
          if (got) { out.labelPdf = got.labelPdf; out.labelUrl = got.labelUrl; }
        } catch { /* the links in the reply still work */ }
      }
      return json(out);
    }

    // fetch the label for an order that's already paid (also the diagnostic for the above);
    // hash comes from the booking reply, or the order-complete page URL on parcel2go.com
    if (b.action === "labels") {
      const id = String(b.orderId || "").trim();
      const hash = String(b.hash || "").trim();
      if (!id) return json({ error: "No orderId given." }, 400);
      if (!hash) return json({ error: "No hash given — it's in the booking reply, or the order-complete page URL on parcel2go.com." }, 400);
      const got = await fetchLabelPdf(id, hash);
      if (got) return json({ orderId: id, labelPdf: got.labelPdf, labelUrl: got.labelUrl });
      return json({ error: "No label PDF yet for order " + id + " — the logs show each attempt's status." }, 404);
    }

    return json({ error: "Unknown action — send action: 'quote' or 'order'." }, 400);
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
