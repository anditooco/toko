// API toko: menyimpan data produk dan pengaturan di Netlify Blobs.
// GET  /api/store      -> data toko (publik, tanpa data login)
// POST /api/store      -> login atau simpan (butuh username dan password admin)
// GET  /api/img/<id>   -> foto produk
import { getStore } from "@netlify/blobs";
import { createHash, timingSafeEqual } from "node:crypto";

// Login awal: admin / 12345. Ganti lewat Pengaturan toko di panel admin setelah masuk.
const DEFAULT_AUTH = { u: "admin", s: "53a81ff163a80b32", h: "6561ecc748c3a8149f7d6bdfe7b2cbed9c6c22df923a147454fde608341cb59e" };

const CATS = new Set(["sambal", "camilan", "kue", "beku", "minuman"]);
const PAYIDS = ["qris", "transfer", "ewallet", "cod"];
const MAX_BODY = 5500000;

const json = (o, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
const hashOf = (s, u, p) => createHash("sha256").update(s + "|" + u + "|" + p).digest("hex");
const same = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && timingSafeEqual(x, y); };
const str = (v, max) => (typeof v === "string" ? v.slice(0, max) : "");
const num = (v, max) => { const n = Math.round(Number(v)); return Number.isFinite(n) && n >= 0 && n <= max ? n : 0; };

async function getAuth(store) {
  return (await store.get("auth", { type: "json" })) || DEFAULT_AUTH;
}

// Foto dari data URI disimpan sebagai berkas terpisah, data toko hanya memuat alamatnya.
async function keepImage(store, v) {
  if (typeof v !== "string") return "";
  const m = /^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=]+)$/.exec(v);
  if (m) {
    const bytes = Buffer.from(m[2], "base64");
    if (!bytes.length || bytes.length > 2500000) return "";
    const id = createHash("sha256").update(bytes).digest("hex").slice(0, 24);
    await store.set("img-" + id, bytes, { metadata: { type: m[1] } });
    return "/api/img/" + id;
  }
  if (/^\/api\/img\/[a-f0-9]{24}$/.test(v) || /^img\/p\d+\.jpg$/.test(v)) return v;
  return "";
}

async function clean(store, input) {
  if (!input || typeof input !== "object" || !Array.isArray(input.products)) throw new Error("bad_store");
  if (input.products.length < 1 || input.products.length > 300) throw new Error("bad_store");
  const seen = new Set();
  const products = [];
  for (const p of input.products) {
    if (!p || typeof p !== "object") continue;
    const id = str(p.id, 40);
    const name = str(p.name, 120).trim();
    if (!/^[A-Za-z0-9_-]+$/.test(id) || seen.has(id) || !name || !CATS.has(p.cat)) continue;
    const price = num(p.price, 1e9);
    if (price < 1) continue;
    seen.add(id);
    const o = { id, cat: p.cat, name, desc: str(p.desc, 400), size: str(p.size, 60), price, spice: Math.min(5, num(p.spice, 5)), life: str(p.life, 160), use: str(p.use, 200) };
    const was = num(p.was, 1e9);
    if (was > price) o.was = was;
    if (p.pick === true) o.pick = true;
    if (p.soldout === true) o.soldout = true;
    const im = await keepImage(store, p.img);
    if (im) o.img = im;
    products.push(o);
  }
  if (!products.length) throw new Error("bad_store");
  const pay = [];
  for (const id of PAYIDS) {
    const m = (Array.isArray(input.pay) ? input.pay : []).find((x) => x && x.id === id) || { id, on: true };
    const o = { id, on: m.on !== false };
    if (id === "transfer" || id === "ewallet") {
      o.accounts = (Array.isArray(m.accounts) ? m.accounts : []).slice(0, 12).map((a) => ({
        name: str(a && a.name, 40), number: str(a && a.number, 60), holder: str(a && a.holder, 80), on: !a || a.on !== false
      })).filter((a) => a.name);
    }
    pay.push(o);
  }
  return {
    rev: 0,
    name: str(input.name, 80).trim() || "Toko Saya",
    announce: str(input.announce, 200),
    wa: str(input.wa, 20).replace(/\D/g, ""),
    freeShip: num(input.freeShip, 1e9),
    qris: await keepImage(store, input.qris),
    pay,
    products
  };
}

export default async (req) => {
  const store = getStore("dapur-nusantara");
  const url = new URL(req.url);

  if (req.method === "GET" && url.pathname.startsWith("/api/img/")) {
    const id = url.pathname.slice("/api/img/".length);
    if (!/^[a-f0-9]{24}$/.test(id)) return new Response("not found", { status: 404 });
    const r = await store.getWithMetadata("img-" + id, { type: "arrayBuffer" });
    if (!r) return new Response("not found", { status: 404 });
    return new Response(r.data, { headers: { "content-type": (r.metadata && r.metadata.type) || "image/jpeg", "cache-control": "public, max-age=31536000, immutable" } });
  }

  if (req.method === "GET") {
    const data = await store.get("store", { type: "json" });
    return json({ ok: true, store: data || null });
  }
  if (req.method !== "POST") return json({ ok: false, error: "method" }, 405);

  const raw = await req.text();
  if (raw.length > MAX_BODY) return json({ ok: false, error: "too_large" }, 413);
  let body;
  try { body = JSON.parse(raw); } catch { return json({ ok: false, error: "bad_json" }, 400); }

  const auth = await getAuth(store);
  await new Promise((r) => setTimeout(r, 400));
  const ok = typeof body.u === "string" && typeof body.p === "string" && body.u === auth.u && same(hashOf(auth.s, body.u, body.p), auth.h);
  if (!ok) return json({ ok: false, error: "auth" }, 401);

  if (body.action === "login") return json({ ok: true });

  if (body.action === "save") {
    let data;
    try { data = await clean(store, body.store); } catch { return json({ ok: false, error: "bad_store" }, 400); }
    const prev = await store.get("store", { type: "json" });
    data.rev = ((prev && prev.rev) || 0) + 1;
    await store.setJSON("store", data);
    if (typeof body.newPass === "string" && body.newPass) {
      const nu = str(body.newUser, 40).trim() || auth.u;
      if (body.newPass.length < 4 || body.newPass.length > 100) return json({ ok: false, error: "bad_password" }, 400);
      const s = createHash("sha256").update(String(Math.random()) + Date.now()).digest("hex").slice(0, 16);
      await store.setJSON("auth", { u: nu, s, h: hashOf(s, nu, body.newPass) });
    }
    return json({ ok: true, rev: data.rev, store: data });
  }
  return json({ ok: false, error: "action" }, 400);
};

export const config = { path: ["/api/store", "/api/img/*"] };
