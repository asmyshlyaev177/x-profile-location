// Generated from src/ by `pnpm build` — do not edit.

// src/node-server.ts
import {
  createServer
} from "node:http";
import { mkdirSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";

// src/x-lookup-budget.ts
var LOOKUP_LIMIT_PER_WINDOW = 50;
var LOOKUP_WINDOW_MINUTES = 15;
var LOOKUP_WINDOW_MS = LOOKUP_WINDOW_MINUTES * 60 * 1e3;

// src/contrib-limit.ts
var CONTRIB_WINDOW_MS = LOOKUP_WINDOW_MS;
var CONTRIB_HANDLE_LIMIT = Math.round(LOOKUP_LIMIT_PER_WINDOW * 2.2);
var MAX_TRACKED_CLIENTS = 5e4;
var budgets = /* @__PURE__ */ new Map();
function isExpired(budget, now) {
  return now - budget.windowStart >= CONTRIB_WINDOW_MS;
}
function admitContributions(clientId, usernames, now = Date.now()) {
  let budget = budgets.get(clientId);
  if (budget === void 0 || isExpired(budget, now)) {
    budget = { windowStart: now, handles: /* @__PURE__ */ new Set() };
  } else {
    budgets.delete(clientId);
  }
  const accepted = [];
  for (const u of usernames) {
    if (budget.handles.has(u)) {
      accepted.push(u);
      continue;
    }
    if (budget.handles.size >= CONTRIB_HANDLE_LIMIT) continue;
    budget.handles.add(u);
    accepted.push(u);
  }
  budgets.set(clientId, budget);
  evictStaleClients(now);
  return accepted;
}
function evictStaleClients(now) {
  for (const [clientId, budget] of budgets) {
    if (!isExpired(budget, now) && budgets.size <= MAX_TRACKED_CLIENTS) return;
    budgets.delete(clientId);
  }
}

// src/consensus.ts
function tupleKey(v) {
  return JSON.stringify([v.location, v.source, v.locationAccurate]);
}
function pickConsensus(votes) {
  if (votes.length === 0) return null;
  const groups = /* @__PURE__ */ new Map();
  for (const v of votes) {
    const k = tupleKey(v);
    const g = groups.get(k);
    if (g) {
      g.count++;
      if (v.seenAt > g.latest) g.latest = v.seenAt;
    } else {
      groups.set(k, { vote: v, count: 1, latest: v.seenAt });
    }
  }
  let best = null;
  for (const g of groups.values()) {
    if (!best || g.count > best.count || g.count === best.count && g.latest > best.latest) {
      best = g;
    }
  }
  return {
    location: best.vote.location,
    source: best.vote.source,
    locationAccurate: best.vote.locationAccurate,
    confidence: best.count
  };
}

// src/index.ts
var MAX_BATCH = 100;
var VOTE_RETENTION_MS = 60 * 24 * 60 * 60 * 1e3;
var USERNAME_RE = /^[a-z0-9_]{1,50}$/;
var MAX_FIELD_LEN = 60;
var VOTE_CAP = 10;
var VOTE_CAP_SLACK = 5;
var STATS_TTL_MS = 6e4;
function cors(resp) {
  resp.headers.set("Access-Control-Allow-Origin", "*");
  resp.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  resp.headers.set("Access-Control-Allow-Headers", "Content-Type");
  resp.headers.set("Access-Control-Max-Age", "86400");
  return resp;
}
function json(data, status = 200) {
  return cors(
    new Response(JSON.stringify(data), {
      status,
      headers: { "Content-Type": "application/json" }
    })
  );
}
function normUser(u) {
  if (typeof u !== "string") return null;
  const s = u.trim().toLowerCase();
  return USERNAME_RE.test(s) ? s : null;
}
function sanitizeField(v) {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s ? s.slice(0, MAX_FIELD_LEN) : null;
}
function toLocationVote(r) {
  return {
    location: r.location,
    source: r.source,
    locationAccurate: r.location_accurate !== 0,
    seenAt: r.seen_at
  };
}
function rowsChanged(result) {
  if (typeof result !== "object" || result === null) return 0;
  const direct = result.changes;
  if (typeof direct === "number") return direct;
  const meta = result.meta;
  if (typeof meta?.changes === "number") return meta.changes;
  return 0;
}
function toServed(r) {
  return {
    u: r.username,
    loc: r.location,
    src: r.source,
    acc: r.location_accurate !== 0,
    conf: r.location_confidence
  };
}
async function handleBatch(req, env2) {
  const body = await req.json().catch(() => null);
  const raw = Array.isArray(body?.usernames) ? body.usernames : [];
  const names = [
    ...new Set(raw.map(normUser).filter((x) => x !== null))
  ].slice(0, MAX_BATCH);
  if (names.length === 0) return json({ profiles: [] });
  const placeholders = names.map(() => "?").join(",");
  const { results } = await env2.DB.prepare(
    `SELECT username, location, source, location_accurate, location_confidence
       FROM profiles
      WHERE username IN (${placeholders}) AND location_confidence > 0`
  ).bind(...names).all();
  return json({ profiles: (results ?? []).map(toServed) });
}
var counted = null;
async function handleStats(env2, now) {
  if (counted === null || now - counted.at >= STATS_TTL_MS) {
    const { results } = await env2.DB.prepare(
      "SELECT COUNT(*) AS n FROM profiles"
    ).all();
    counted = { at: now, profiles: results?.[0]?.n ?? 0 };
  }
  const resp = json({ profiles: counted.profiles });
  resp.headers.set("Cache-Control", `public, max-age=${STATS_TTL_MS / 1e3}`);
  return resp;
}
function parseContribution(body) {
  const rec = body ?? {};
  const rawEntries = Array.isArray(rec.entries) ? rec.entries : [];
  const parsed = [];
  for (const e of rawEntries.slice(0, MAX_BATCH)) {
    if (!e || typeof e !== "object") continue;
    const entry = e;
    const u = normUser(entry.u);
    if (!u) continue;
    parsed.push({
      u,
      loc: sanitizeField(entry.loc),
      src: sanitizeField(entry.src),
      acc: entry.acc === false ? 0 : 1
    });
  }
  return parsed;
}
function groupAndCapVotes(rows) {
  const byUser = /* @__PURE__ */ new Map();
  for (const r of rows) {
    const arr = byUser.get(r.username) ?? [];
    arr.push(r);
    byUser.set(r.username, arr);
  }
  const evictions = [];
  for (const list of byUser.values()) {
    if (list.length <= VOTE_CAP + VOTE_CAP_SLACK) continue;
    list.sort((a, b) => b.seen_at - a.seen_at);
    evictions.push(...list.splice(VOTE_CAP));
  }
  return { byUser, evictions };
}
function alreadyStored(cur, c) {
  return !!cur && cur.location === c.location && cur.source === c.source && cur.location_accurate !== 0 === c.locationAccurate && cur.location_confidence === c.confidence;
}
async function handleContribute(req, env2) {
  const body = await req.json().catch(() => null);
  const cid = typeof body?.clientId === "string" ? body.clientId.slice(0, 64) : null;
  if (!cid) return json({ ok: true });
  const now = Date.now();
  const parsed = parseContribution(body);
  if (parsed.length === 0) return json({ ok: true });
  const allowed = new Set(
    admitContributions(cid, [...new Set(parsed.map((v) => v.u))], now)
  );
  const votes = parsed.filter((v) => allowed.has(v.u));
  const affected = new Set(votes.map((v) => v.u));
  if (votes.length === 0) return json({ ok: true });
  await env2.DB.batch(
    votes.map(
      (v) => env2.DB.prepare(
        `INSERT INTO location_votes
           (username, client_id, location, source, location_accurate, seen_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(username, client_id) DO UPDATE SET
           location = excluded.location,
           source = excluded.source,
           location_accurate = excluded.location_accurate,
           seen_at = excluded.seen_at`
      ).bind(v.u, cid, v.loc, v.src, v.acc, now)
    )
  );
  const affectedList = [...affected];
  const ph = affectedList.map(() => "?").join(",");
  const { results } = await env2.DB.prepare(
    `SELECT username, client_id, location, source, location_accurate, seen_at
       FROM location_votes
      WHERE username IN (${ph})`
  ).bind(...affectedList).all();
  const { byUser, evictions } = groupAndCapVotes(results ?? []);
  const { results: curRows } = await env2.DB.prepare(
    `SELECT username, location, source, location_accurate, location_confidence
       FROM profiles
      WHERE username IN (${ph})`
  ).bind(...affectedList).all();
  const current = /* @__PURE__ */ new Map();
  for (const r of curRows ?? []) current.set(r.username, r);
  const writes = [
    ...evictions.map(
      (ev) => env2.DB.prepare(
        "DELETE FROM location_votes WHERE username = ? AND client_id = ?"
      ).bind(ev.username, ev.client_id)
    ),
    ...consensusWrites(env2, { now, affected: affectedList, byUser, current })
  ];
  if (writes.length > 0) await env2.DB.batch(writes);
  return json({ ok: true });
}
function consensusWrites(env2, ctx) {
  const writes = [];
  for (const u of ctx.affected) {
    const c = pickConsensus((ctx.byUser.get(u) ?? []).map(toLocationVote));
    if (!c || alreadyStored(ctx.current.get(u), c)) continue;
    writes.push(
      env2.DB.prepare(
        `INSERT INTO profiles
           (username, location, source, location_accurate, location_confidence, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(username) DO UPDATE SET
           location = excluded.location,
           source = excluded.source,
           location_accurate = excluded.location_accurate,
           location_confidence = excluded.location_confidence,
           updated_at = excluded.updated_at`
      ).bind(
        u,
        c.location,
        c.source,
        c.locationAccurate ? 1 : 0,
        c.confidence,
        ctx.now
      )
    );
  }
  return writes;
}
var index_default = {
  async fetch(req, env2) {
    if (req.method === "OPTIONS") {
      return cors(new Response(null, { status: 204 }));
    }
    const url = new URL(req.url);
    try {
      if (req.method === "POST" && url.pathname === "/v1/loc/batch") {
        return await handleBatch(req, env2);
      }
      if (req.method === "POST" && url.pathname === "/v1/loc") {
        return await handleContribute(req, env2);
      }
      if (req.method === "GET" && url.pathname === "/v1/stats") {
        return await handleStats(env2, Date.now());
      }
      return cors(new Response("Not found", { status: 404 }));
    } catch {
      return json({ error: "internal" }, 500);
    }
  },
  // Retention cleanup, the only thing that ages votes out — see CLAUDE.md.
  // `_controller` / `_ctx` stay loose so this file needs no workers-types.
  async scheduled(_controller, env2, _ctx) {
    const result = await env2.DB.prepare(
      "DELETE FROM location_votes WHERE seen_at < ?"
    ).bind(Date.now() - VOTE_RETENTION_MS).run();
    await env2.DB.prepare(
      `DELETE FROM profiles
        WHERE NOT EXISTS (
                SELECT 1 FROM location_votes v WHERE v.username = profiles.username
              )`
    ).run();
    return rowsChanged(result);
  }
};

// src/sqlite.ts
import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { join } from "node:path";
var DEFAULT_SQLITE_CONFIG = {
  // Past this it copies pages the OS already caches for mmap: 256 held ~200 MB
  // more at 600k profiles for no speed-up, while 2 doubled the retention pass.
  cacheMb: 16,
  mmapMb: 512,
  busyTimeoutMs: 5e3
};
var BoundStatement = class {
  #stmt;
  #args;
  constructor(stmt, args) {
    this.#stmt = stmt;
    this.#args = args;
  }
  /** Exposed for SqliteDb.batch, which needs to run these inside a transaction. */
  exec() {
    this.#stmt.run(...this.#args);
  }
  // `async` only so a driver error rejects rather than throwing synchronously,
  // which is D1's contract. The body never yields.
  async all() {
    return { results: this.#stmt.all(...this.#args) };
  }
  async run() {
    return this.#stmt.run(...this.#args);
  }
};
var PreparedStatement = class extends BoundStatement {
  #stmt;
  constructor(stmt) {
    super(stmt, []);
    this.#stmt = stmt;
  }
  bind(...values) {
    return new BoundStatement(this.#stmt, values);
  }
};
var SqliteDb = class {
  #db;
  // Statement cache: SQL text varies with batch size, so it is capped and
  // evicted oldest-first.
  #cache = /* @__PURE__ */ new Map();
  #cacheLimit = 512;
  constructor(db2) {
    this.#db = db2;
  }
  prepare(sql) {
    let stmt = this.#cache.get(sql);
    if (!stmt) {
      stmt = this.#db.prepare(sql);
      if (this.#cache.size >= this.#cacheLimit) {
        const oldest = this.#cache.keys().next();
        if (!oldest.done) this.#cache.delete(oldest.value);
      }
      this.#cache.set(sql, stmt);
    }
    return new PreparedStatement(stmt);
  }
  /** D1 batches in one implicit transaction; this is a real one. */
  async batch(statements) {
    const tx = this.#db.transaction((list) => {
      for (const s of list) s.exec();
    });
    tx(statements);
    return [];
  }
  /** Hand back the driver for lifecycle work (checkpointing, PRAGMA optimize). */
  get raw() {
    return this.#db;
  }
  close() {
    this.#db.pragma("optimize");
    this.#db.close();
  }
};
function openDatabase(config2) {
  const db2 = new Database(config2.path);
  db2.pragma("journal_mode = WAL");
  db2.pragma("synchronous = NORMAL");
  db2.pragma(`busy_timeout = ${DEFAULT_SQLITE_CONFIG.busyTimeoutMs}`);
  db2.pragma(`cache_size = -${Math.max(1, config2.cacheMb) * 1024}`);
  db2.pragma(`mmap_size = ${Math.max(0, config2.mmapMb) * 1024 * 1024}`);
  db2.pragma("temp_store = MEMORY");
  db2.exec(readFileSync(join(import.meta.dirname, "..", "schema.sql"), "utf8"));
  return new SqliteDb(db2);
}

// src/stats.ts
var MAX_TRACKED_CLIENTS2 = 5e4;
function parseBody(json2) {
  if (json2 === "") return null;
  try {
    const parsed = JSON.parse(json2);
    return typeof parsed === "object" && parsed !== null ? parsed : null;
  } catch {
    return null;
  }
}
function countArray(body, key) {
  const arr = body?.[key];
  return Array.isArray(arr) ? arr.length : 0;
}
function summarizeLatency(hist) {
  let count = 0;
  let total = 0;
  for (const [ms, n] of hist) {
    count += n;
    total += ms * n;
  }
  if (count === 0) {
    return { minMs: null, medianMs: null, avgMs: null, maxMs: null };
  }
  const keys = [...hist.keys()].sort((a, b) => a - b);
  const at = (rank) => {
    let seen = 0;
    for (const ms of keys) {
      seen += hist.get(ms);
      if (rank < seen) return ms;
    }
    return keys[keys.length - 1];
  };
  const medianMs = count % 2 === 1 ? at((count - 1) / 2) : (at(count / 2 - 1) + at(count / 2)) / 2;
  return {
    minMs: keys[0],
    medianMs,
    avgMs: Math.round(total / count * 100) / 100,
    maxMs: keys[keys.length - 1]
  };
}
var Stats = class {
  #since = Date.now();
  #lookups = 0;
  #lookupNames = 0;
  #lookupHits = 0;
  #contributions = 0;
  #contributedEntries = 0;
  #clients = /* @__PURE__ */ new Set();
  #clientsCapped = false;
  #statsReads = 0;
  #other = 0;
  #rateLimited = 0;
  #tooLarge = 0;
  #errors = 0;
  #latencyHist = /* @__PURE__ */ new Map();
  /** Bodies are re-parsed here rather than threaded out of the handlers, so
   *  index.ts stays free of instrumentation for the Worker build. */
  noteRequest(pathname, requestBody, responseBody, ms) {
    const bucket = Math.max(0, Math.round(ms));
    this.#latencyHist.set(bucket, (this.#latencyHist.get(bucket) ?? 0) + 1);
    if (pathname === "/v1/loc/batch") {
      this.#lookups += 1;
      this.#lookupNames += countArray(parseBody(requestBody), "usernames");
      this.#lookupHits += countArray(parseBody(responseBody), "profiles");
    } else if (pathname === "/v1/loc") {
      const body = parseBody(requestBody);
      this.#contributions += 1;
      this.#contributedEntries += countArray(body, "entries");
      const cid = body?.clientId;
      if (typeof cid === "string" && cid !== "") {
        if (this.#clients.size < MAX_TRACKED_CLIENTS2) this.#clients.add(cid);
        else this.#clientsCapped = true;
      }
    } else if (pathname === "/v1/stats") {
      this.#statsReads += 1;
    } else {
      this.#other += 1;
    }
  }
  noteRateLimited() {
    this.#rateLimited += 1;
  }
  noteTooLarge() {
    this.#tooLarge += 1;
  }
  noteError() {
    this.#errors += 1;
  }
  snapshot(now = Date.now()) {
    return {
      since: new Date(this.#since).toISOString(),
      windowS: Math.round((now - this.#since) / 1e3),
      lookups: this.#lookups,
      lookupNames: this.#lookupNames,
      lookupHits: this.#lookupHits,
      // Null rather than 0 when nothing was asked, so an idle window reads
      // as "no data" instead of "0% hit rate", which would look like an outage.
      hitRate: this.#lookupNames === 0 ? null : Math.round(this.#lookupHits / this.#lookupNames * 1e3) / 1e3,
      contributions: this.#contributions,
      contributedEntries: this.#contributedEntries,
      users: this.#clients.size,
      ...this.#clientsCapped ? { usersCapped: true } : {},
      statsReads: this.#statsReads,
      other: this.#other,
      rateLimited: this.#rateLimited,
      tooLarge: this.#tooLarge,
      errors: this.#errors,
      ...summarizeLatency(this.#latencyHist)
    };
  }
  /** Snapshot and start a fresh window, atomically. */
  drain(now = Date.now()) {
    const snap = this.snapshot(now);
    this.#since = now;
    this.#lookups = 0;
    this.#lookupNames = 0;
    this.#lookupHits = 0;
    this.#contributions = 0;
    this.#contributedEntries = 0;
    this.#clients.clear();
    this.#clientsCapped = false;
    this.#statsReads = 0;
    this.#other = 0;
    this.#rateLimited = 0;
    this.#tooLarge = 0;
    this.#errors = 0;
    this.#latencyHist.clear();
    return snap;
  }
};

// src/node-server.ts
function num(name, fallback) {
  const raw = process.env[name];
  if (raw === void 0 || raw.trim() === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(
      `${name} must be a non-negative number, got ${JSON.stringify(raw)}`
    );
  }
  return n;
}
function bool(name, fallback) {
  const raw = process.env[name];
  if (raw === void 0 || raw.trim() === "") return fallback;
  return raw === "1" || raw.toLowerCase() === "true";
}
var config = {
  host: process.env.XLOC_HOST ?? "127.0.0.1",
  port: num("XLOC_PORT", 8787),
  dbPath: resolve(process.env.XLOC_DB ?? "./data/x-loc-cache.db"),
  cacheMb: num("XLOC_CACHE_MB", DEFAULT_SQLITE_CONFIG.cacheMb),
  mmapMb: num("XLOC_MMAP_MB", DEFAULT_SQLITE_CONFIG.mmapMb),
  retentionHours: num("XLOC_RETENTION_INTERVAL_HOURS", 24),
  maxBodyBytes: num("XLOC_MAX_BODY_KB", 256) * 1024,
  rateLimit: num("XLOC_RATE_LIMIT", 600),
  // requests per window per IP; 0 = off
  rateWindowMs: num("XLOC_RATE_WINDOW_S", 60) * 1e3,
  statsIntervalHours: num("XLOC_STATS_INTERVAL_HOURS", 24),
  // 0 = never log stats
  // Only honour X-Forwarded-For when told to: a directly-exposed server must
  // not let clients forge their own identity.
  trustProxy: bool("XLOC_TRUST_PROXY", true)
};
var buckets = /* @__PURE__ */ new Map();
function rateLimited(ip, now) {
  if (config.rateLimit === 0) return 0;
  const b = buckets.get(ip);
  if (!b || now >= b.resetAt) {
    buckets.set(ip, { count: 1, resetAt: now + config.rateWindowMs });
    return 0;
  }
  b.count += 1;
  if (b.count <= config.rateLimit) return 0;
  return Math.max(1, Math.ceil((b.resetAt - now) / 1e3));
}
function sweepBuckets(now) {
  for (const [ip, b] of buckets) {
    if (now >= b.resetAt) buckets.delete(ip);
  }
}
function clientIp(req) {
  if (config.trustProxy) {
    const raw = req.headers["x-forwarded-for"];
    const xff = Array.isArray(raw) ? raw.join(",") : raw;
    const hops = xff?.split(",") ?? [];
    const last = hops[hops.length - 1]?.trim();
    if (last) return last;
  }
  return req.socket.remoteAddress ?? "unknown";
}
var BODYLESS = /* @__PURE__ */ new Set(["GET", "HEAD", "OPTIONS", "DELETE"]);
var UNSUPPORTED_METHODS = /* @__PURE__ */ new Set(["CONNECT", "TRACE", "TRACK"]);
function pathOf(req) {
  return (req.url ?? "/").split("?")[0];
}
function declaredTooLarge(req, limit) {
  const len = Number(req.headers["content-length"]);
  return Number.isFinite(len) && len > limit;
}
async function readBody(req, limit) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) {
      req.pause();
      return null;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}
function toHeaders(req) {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) for (const v of value) headers.append(key, v);
    else if (value !== void 0) headers.set(key, value);
  }
  return headers;
}
function toRequest(req, body) {
  try {
    const url = new URL(req.url ?? "/", "http://localhost");
    return new Request(url, {
      method: req.method,
      headers: toHeaders(req),
      body: body === null || body === "" ? void 0 : body
    });
  } catch {
    return null;
  }
}
async function send(res, response) {
  const headers = {};
  response.headers.forEach((value, key) => {
    headers[key] = value;
  });
  const body = Buffer.from(await response.arrayBuffer());
  res.writeHead(response.status, headers);
  res.end(body);
  return body.toString("utf8");
}
function plain(res, status, text, extra) {
  res.writeHead(status, {
    "content-type": "text/plain; charset=utf-8",
    "access-control-allow-origin": "*",
    ...extra
  });
  res.end(text);
}
function rejectTooLarge(req, res) {
  res.once("finish", () => req.destroy());
  plain(res, 413, "Payload Too Large", { connection: "close" });
}
mkdirSync(dirname(config.dbPath), { recursive: true });
var db = openDatabase({
  path: config.dbPath,
  cacheMb: config.cacheMb,
  mmapMb: config.mmapMb
});
var env = { DB: db };
var stats = new Stats();
async function activeUsers(hours) {
  const { results } = await db.prepare(
    "SELECT COUNT(DISTINCT client_id) AS n FROM location_votes WHERE seen_at >= ?"
  ).bind(Date.now() - hours * 60 * 60 * 1e3).all();
  return results?.[0]?.n ?? 0;
}
function dbBytes() {
  let total = 0;
  for (const suffix of ["", "-wal"]) {
    try {
      total += statSync(config.dbPath + suffix).size;
    } catch {
    }
  }
  return total;
}
async function logStats(reason) {
  try {
    const counters = stats.drain();
    const { results } = await db.prepare(
      "SELECT (SELECT COUNT(*) FROM profiles) AS profiles, (SELECT COUNT(*) FROM location_votes) AS votes"
    ).all();
    const totals = results?.[0];
    console.log(
      `[x-loc-cache] stats ${JSON.stringify({
        reason,
        ...counters,
        users24h: await activeUsers(24),
        users7d: await activeUsers(24 * 7),
        profiles: totals?.profiles ?? 0,
        votes: totals?.votes ?? 0,
        dbMb: Math.round(dbBytes() / (1024 * 1024) * 100) / 100,
        rssMb: Math.round(process.memoryUsage().rss / (1024 * 1024))
      })}`
    );
  } catch (err) {
    console.error("[x-loc-cache] stats failed:", err);
  }
}
var server = createServer((req, res) => {
  void (async () => {
    const startedAt = Date.now();
    try {
      if (req.method === "GET" && req.url === "/healthz") {
        return plain(res, 200, "ok");
      }
      const retryAfter = rateLimited(clientIp(req), Date.now());
      if (retryAfter > 0) {
        stats.noteRateLimited();
        return plain(res, 429, "Too Many Requests", {
          "retry-after": String(retryAfter)
        });
      }
      if (UNSUPPORTED_METHODS.has(req.method ?? "")) {
        stats.noteRequest(pathOf(req), "", "", Date.now() - startedAt);
        return plain(res, 405, "Method Not Allowed", {
          allow: "GET, POST, OPTIONS"
        });
      }
      if (declaredTooLarge(req, config.maxBodyBytes)) {
        stats.noteTooLarge();
        return rejectTooLarge(req, res);
      }
      const body = BODYLESS.has(req.method ?? "GET") ? "" : await readBody(req, config.maxBodyBytes);
      if (body === null) {
        stats.noteTooLarge();
        return rejectTooLarge(req, res);
      }
      const request = toRequest(req, body);
      if (request === null) {
        stats.noteRequest(pathOf(req), "", "", Date.now() - startedAt);
        return plain(res, 400, "Bad Request");
      }
      const responseBody = await send(res, await index_default.fetch(request, env));
      stats.noteRequest(pathOf(req), body, responseBody, Date.now() - startedAt);
    } catch (err) {
      stats.noteError();
      console.error("[x-loc-cache] request failed:", err);
      if (!res.headersSent) plain(res, 500, "Internal Server Error");
      else res.end();
    }
  })();
});
server.keepAliveTimeout = 61e3;
server.headersTimeout = 65e3;
var retentionMs = config.retentionHours * 60 * 60 * 1e3;
async function runRetention() {
  const startedAt = Date.now();
  try {
    const deleted = await index_default.scheduled(null, env);
    sweepBuckets(Date.now());
    db.raw.pragma("wal_checkpoint(TRUNCATE)");
    console.log(
      `[x-loc-cache] retention: deleted ${deleted} vote(s) in ${Date.now() - startedAt}ms`
    );
  } catch (err) {
    console.error("[x-loc-cache] retention failed:", err);
  }
}
setInterval(() => void runRetention(), retentionMs).unref();
setTimeout(() => void runRetention(), 6e4).unref();
setInterval(() => sweepBuckets(Date.now()), config.rateWindowMs * 10).unref();
if (config.statsIntervalHours > 0) {
  setInterval(
    () => void logStats("interval"),
    config.statsIntervalHours * 60 * 60 * 1e3
  ).unref();
}
server.listen(config.port, config.host, () => {
  console.log(
    `[x-loc-cache] listening on http://${config.host}:${config.port} \u2014 db ${config.dbPath} (cache ${config.cacheMb}MB, mmap ${config.mmapMb}MB)`
  );
});
var closing = false;
for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => {
    if (closing) return;
    closing = true;
    console.log(`[x-loc-cache] ${signal} \u2014 draining`);
    server.close(() => {
      void logStats("shutdown").finally(() => {
        db.close();
        process.exit(0);
      });
    });
    setTimeout(() => {
      db.close();
      process.exit(0);
    }, 5e3).unref();
  });
}
