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

// src/network.ts
function networkOf(ip) {
  if (!ip) return null;
  const prefix = prefixOf(ip);
  return prefix === null ? null : fold16(fnv1a32(prefix));
}
function prefixOf(ip) {
  const v4 = parseIpv4(ip);
  if (v4) return ipv4Prefix(v4);
  const v6 = parseIpv6(ip.replace(/%.*$/, ""));
  if (!v6) return null;
  if (v6.slice(0, 5).every((g) => g === 0) && v6[5] === 65535) {
    return ipv4Prefix([v6[6] >> 8, v6[6] & 255, v6[7] >> 8]);
  }
  return `6:${v6.slice(0, 3).map((g) => g.toString(16)).join(":")}`;
}
function ipv4Prefix(octets) {
  return `4:${octets.slice(0, 3).join(".")}`;
}
function parseIpv4(text) {
  const parts = text.split(".");
  if (parts.length !== 4) return null;
  const octets = parts.map((p) => /^\d{1,3}$/.test(p) ? Number(p) : NaN);
  return octets.every((o) => o <= 255) ? octets : null;
}
function parseIpv6(text) {
  const halves = text.split("::");
  if (halves.length > 2) return null;
  const isCompressed = halves.length === 2;
  const head = groupsOf(halves[0], !isCompressed);
  const tail = isCompressed ? groupsOf(halves[1], true) : [];
  if (!head || !tail) return null;
  const missing = 8 - head.length - tail.length;
  if (isCompressed ? missing < 1 : missing !== 0) return null;
  return [...head, ...Array(missing).fill(0), ...tail];
}
function groupsOf(part, mayEndInIpv4) {
  if (part === "") return [];
  const fields = part.split(":");
  const v4 = mayEndInIpv4 ? parseIpv4(fields[fields.length - 1]) : null;
  const hexFields = v4 ? fields.slice(0, -1) : fields;
  if (!hexFields.every((f) => /^[0-9a-f]{1,4}$/i.test(f))) return null;
  const groups = hexFields.map((f) => parseInt(f, 16));
  return v4 ? [...groups, v4[0] << 8 | v4[1], v4[2] << 8 | v4[3]] : groups;
}
function fnv1a32(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
function fold16(hash) {
  return hash >>> 16 ^ hash & 65535;
}

// src/scan.ts
var WHOLE_TABLE = {
  chunkRows: Infinity,
  pause: async () => {
  }
};
async function forEachUsernameRange(db2, policy, visit) {
  const { results } = await db2.prepare("SELECT MAX(username) AS last FROM location_votes").all();
  const last = results?.[0]?.last ?? null;
  if (last === null) return;
  const endAfter = rangeEnds(db2, last, policy.chunkRows);
  for (let after = ""; after !== last; ) {
    const upTo = await endAfter(after);
    await visit(after, upTo);
    await policy.pause();
    after = upTo;
  }
}
function rangeEnds(db2, last, rows) {
  if (!Number.isFinite(rows)) return async () => last;
  const sql = `SELECT username FROM location_votes WHERE username > ? AND username <= ?
    ORDER BY username LIMIT 1 OFFSET ?`;
  return async (after) => {
    const { results } = await db2.prepare(sql).bind(after, last, rows - 1).all();
    return results?.[0]?.username ?? last;
  };
}
async function countRange(db2, after, upTo) {
  const { results } = await db2.prepare(
    `SELECT COUNT(*) AS votes, COUNT(DISTINCT username) AS profiles
         FROM location_votes WHERE username > ? AND username <= ?`
  ).bind(after, upTo).all();
  const row = results?.[0];
  return { votes: row?.votes ?? 0, profiles: row?.profiles ?? 0 };
}
function oneAtATime() {
  let tail = Promise.resolve();
  const pending = /* @__PURE__ */ new Set();
  return (name, job) => {
    if (pending.has(name)) return void 0;
    pending.add(name);
    tail = tail.then(job).catch(() => {
    }).finally(() => pending.delete(name));
    return tail;
  };
}

// src/index.ts
var MAX_BATCH = 100;
var VOTE_RETENTION_MS = 60 * 24 * 60 * 60 * 1e3;
var USERNAME_RE = /^[a-z0-9_]{1,50}$/;
var MAX_FIELD_LEN = 60;
var VOTE_CAP = 10;
var STATS_TTL_MS = 18e4;
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
function groupByUsername(rows) {
  const byUser = /* @__PURE__ */ new Map();
  for (const r of rows) {
    const list = byUser.get(r.username);
    if (list) list.push(r);
    else byUser.set(r.username, [r]);
  }
  return byUser;
}
function servedFrom(rows) {
  const served = [];
  for (const [u, votes] of groupByUsername(rows)) {
    const c = pickConsensus(votes.map(toLocationVote));
    if (!c) continue;
    served.push({
      u,
      loc: c.location,
      src: c.source,
      acc: c.locationAccurate,
      conf: c.confidence
    });
  }
  return served;
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
    `SELECT v.username, loc.text AS location, src.text AS source,
            v.location_accurate, v.seen_at
       FROM location_votes v
       LEFT JOIN labels loc ON loc.id = v.location
       LEFT JOIN labels src ON src.id = v.source
      WHERE v.username IN (${placeholders})`
  ).bind(...names).all();
  return json({ profiles: servedFrom(results ?? []) });
}
var counted = null;
function servableCount(env2) {
  if (counted === null) return null;
  const isStale = !env2.profilesCountedByWalks && Date.now() - counted.at >= STATS_TTL_MS;
  return isStale ? null : counted.profiles;
}
async function handleStats(env2) {
  let profiles = servableCount(env2);
  if (profiles === null) {
    const { results } = await env2.DB.prepare(
      "SELECT COUNT(DISTINCT username) AS n FROM location_votes"
    ).all();
    profiles = results?.[0]?.n ?? 0;
    counted = { profiles, at: Date.now() };
  }
  const resp = json({ profiles });
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
function newestFirst(a, b) {
  if (a.seen_at !== b.seen_at) return b.seen_at - a.seen_at;
  return a.client_id < b.client_id ? -1 : 1;
}
function repeatsOfNetwork(newest) {
  const seen = /* @__PURE__ */ new Set();
  const repeats = /* @__PURE__ */ new Set();
  for (const v of newest) {
    if (v.net === null) continue;
    if (seen.has(v.net)) repeats.add(v);
    seen.add(v.net);
  }
  return repeats;
}
function votesToEvict(rows) {
  const evictions = [];
  for (const list of groupByUsername(rows).values()) {
    list.sort(newestFirst);
    const repeats = repeatsOfNetwork(list);
    const kept = list.filter((v) => !repeats.has(v));
    evictions.push(...repeats, ...kept.slice(VOTE_CAP));
  }
  return evictions;
}
var UPSERT_LABEL = `INSERT INTO labels (text, used_at) VALUES (?, ?)
  ON CONFLICT(text) DO UPDATE SET used_at = MAX(used_at, excluded.used_at)`;
var UPSERT_VOTE = `INSERT INTO location_votes
    (username, client_id, location, source, location_accurate, seen_at, net)
  VALUES (?, ?, (SELECT id FROM labels WHERE text = ?),
          (SELECT id FROM labels WHERE text = ?), ?, ?, ?)
  ON CONFLICT(username, client_id) DO UPDATE SET
    location = excluded.location,
    source = excluded.source,
    location_accurate = excluded.location_accurate,
    seen_at = excluded.seen_at,
    net = excluded.net`;
function voteWrites(env2, from, votes, now) {
  const texts = new Set(
    votes.flatMap((v) => [v.loc, v.src]).filter((t) => t !== null)
  );
  return [
    ...[...texts].map((t) => env2.DB.prepare(UPSERT_LABEL).bind(t, now)),
    ...votes.map(
      (v) => env2.DB.prepare(UPSERT_VOTE).bind(
        v.u,
        from.clientId,
        v.loc,
        v.src,
        v.acc,
        now,
        from.net
      )
    )
  ];
}
async function evict(env2, usernames) {
  const ph = usernames.map(() => "?").join(",");
  const { results } = await env2.DB.prepare(
    `SELECT username, client_id, net, seen_at FROM location_votes
      WHERE username IN (${ph})`
  ).bind(...usernames).all();
  const evictions = votesToEvict(results ?? []);
  if (evictions.length === 0) return;
  await env2.DB.batch(
    evictions.map(
      (ev) => env2.DB.prepare(
        // seen_at too: on D1 the install may re-send between the read and here.
        "DELETE FROM location_votes WHERE username = ? AND client_id = ? AND seen_at = ?"
      ).bind(ev.username, ev.client_id, ev.seen_at)
    )
  );
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
  if (votes.length === 0) return json({ ok: true });
  const from = {
    clientId: cid,
    net: networkOf(req.headers.get("cf-connecting-ip"))
  };
  await env2.DB.batch(voteWrites(env2, from, votes, now));
  await evict(env2, [...new Set(votes.map((v) => v.u))]);
  return json({ ok: true });
}
var ROUTES = [
  { route: "lookup", method: "POST", path: "/v1/loc/batch" },
  { route: "contribution", method: "POST", path: "/v1/loc" },
  { route: "stats", method: "GET", path: "/v1/stats" }
];
function routeOf(method, pathname) {
  const match = ROUTES.find((r) => r.method === method && r.path === pathname);
  return match?.route ?? null;
}
var index_default = {
  async fetch(req, env2) {
    if (req.method === "OPTIONS") {
      return cors(new Response(null, { status: 204 }));
    }
    const url = new URL(req.url);
    try {
      switch (routeOf(req.method, url.pathname)) {
        case "lookup":
          return await handleBatch(req, env2);
        case "contribution":
          return await handleContribute(req, env2);
        case "stats":
          return await handleStats(env2);
        case null:
          return cors(new Response("Not found", { status: 404 }));
      }
    } catch {
      return json({ error: "internal" }, 500);
    }
  },
  // Retention cleanup on the Worker's cron. `_controller` / `_ctx` stay loose
  // so this file needs no workers-types.
  async scheduled(_controller, env2, _ctx) {
    return pruneExpired(env2, Date.now(), WHOLE_TABLE);
  }
};
async function pruneExpired(env2, now, policy) {
  const cutoff = now - VOTE_RETENTION_MS;
  let deleted = 0;
  let profiles = 0;
  await forEachUsernameRange(env2.DB, policy, async (after, upTo) => {
    deleted += rowsChanged(await deleteExpiredVotes(env2, after, upTo, cutoff));
    profiles += (await countRange(env2.DB, after, upTo)).profiles;
  });
  await env2.DB.prepare("DELETE FROM labels WHERE used_at < ?").bind(cutoff).run();
  counted = { profiles, at: Date.now() };
  return { deleted, profiles };
}
async function recountProfiles(env2, policy) {
  let profiles = 0;
  await forEachUsernameRange(env2.DB, policy, async (after, upTo) => {
    profiles += (await countRange(env2.DB, after, upTo)).profiles;
  });
  counted = { profiles, at: Date.now() };
  return profiles;
}
function deleteExpiredVotes(env2, after, upTo, cutoff) {
  return env2.DB.prepare(
    "DELETE FROM location_votes WHERE username > ? AND username <= ? AND seen_at < ?"
  ).bind(after, upTo, cutoff).run();
}

// src/sqlite.ts
import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { setImmediate as nextTurn } from "node:timers/promises";
var DEFAULT_SQLITE_CONFIG = {
  // Past this it copies pages the OS already caches for mmap: 256 held ~200 MB
  // more at 600k profiles for no speed-up, while 2 doubled the retention pass.
  cacheMb: 16,
  mmapMb: 512,
  busyTimeoutMs: 5e3
};
var SCAN_CHUNK_ROWS = 250;
var SCAN_SLICE_MS = 10;
function yieldingScan({
  chunkRows = SCAN_CHUNK_ROWS,
  sliceMs = SCAN_SLICE_MS
} = {}) {
  let sliceStart = performance.now();
  return {
    chunkRows,
    async pause() {
      if (performance.now() - sliceStart < sliceMs) return;
      await nextTurn();
      sliceStart = performance.now();
    }
  };
}
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
  /** Checkpoints and empties the WAL, or gives up at once while another
   *  connection holds a snapshot — the backup's VACUUM INTO, for minutes —
   *  rather than wait out busy_timeout with the event loop held. */
  truncateWal() {
    this.#db.pragma("busy_timeout = 0");
    try {
      this.#db.pragma("wal_checkpoint(TRUNCATE)");
    } finally {
      this.#db.pragma(`busy_timeout = ${DEFAULT_SQLITE_CONFIG.busyTimeoutMs}`);
    }
  }
  close() {
    this.#db.pragma("optimize");
    this.#db.close();
  }
};
function refuseProfilesLayout(db2, path) {
  const isOldLayout = db2.prepare(
    "SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'profiles'"
  ).get() !== void 0;
  if (!isOldLayout) return;
  db2.close();
  throw new Error(
    `${path} is in the layout from before votes-only (it has a profiles table); convert it with deploy/vacuum.ts before starting this version`
  );
}
function openDatabase(config2) {
  const db2 = new Database(config2.path);
  refuseProfilesLayout(db2, config2.path);
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
function requestKind(method, pathname) {
  if (method === "OPTIONS") {
    return ROUTES.some((r) => r.path === pathname) ? "preflight" : "other";
  }
  return routeOf(method, pathname) ?? "other";
}
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
  #preflights = 0;
  #other = 0;
  #rateLimited = 0;
  #tooLarge = 0;
  #errors = 0;
  #latencyHist = /* @__PURE__ */ new Map();
  /** Bodies are re-parsed here rather than threaded out of the handlers, so
   *  index.ts stays free of instrumentation for the Worker build. */
  noteRequest(kind, requestBody, responseBody, ms) {
    const bucket = Math.max(0, Math.round(ms));
    this.#latencyHist.set(bucket, (this.#latencyHist.get(bucket) ?? 0) + 1);
    switch (kind) {
      case "lookup":
        this.#lookups += 1;
        this.#lookupNames += countArray(parseBody(requestBody), "usernames");
        this.#lookupHits += countArray(parseBody(responseBody), "profiles");
        return;
      case "contribution": {
        const body = parseBody(requestBody);
        this.#contributions += 1;
        this.#contributedEntries += countArray(body, "entries");
        const cid = body?.clientId;
        if (typeof cid !== "string" || cid === "") return;
        if (this.#clients.size < MAX_TRACKED_CLIENTS2) this.#clients.add(cid);
        else this.#clientsCapped = true;
        return;
      }
      case "stats":
        this.#statsReads += 1;
        return;
      case "preflight":
        this.#preflights += 1;
        return;
      case "other":
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
      preflights: this.#preflights,
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
    this.#preflights = 0;
    this.#other = 0;
    this.#rateLimited = 0;
    this.#tooLarge = 0;
    this.#errors = 0;
    this.#latencyHist.clear();
    return snap;
  }
};
var HOUR_MS = 60 * 60 * 1e3;
async function installsSeenInRange(db2, after, upTo, since) {
  const { results } = await db2.prepare(
    `SELECT client_id, MAX(seen_at) AS last FROM location_votes
        WHERE username > ? AND username <= ? AND seen_at >= ? GROUP BY client_id`
  ).bind(after, upTo, since).all();
  return results ?? [];
}
async function scanVotes(db2, since, policy) {
  let votes = 0;
  let profiles = 0;
  const lastSeen = /* @__PURE__ */ new Map();
  await forEachUsernameRange(db2, policy, async (after, upTo) => {
    const range = await countRange(db2, after, upTo);
    votes += range.votes;
    profiles += range.profiles;
    for (const r of await installsSeenInRange(db2, after, upTo, since)) {
      lastSeen.set(
        r.client_id,
        Math.max(lastSeen.get(r.client_id) ?? 0, r.last)
      );
    }
  });
  return { votes, profiles, lastSeen };
}
async function countTotals(db2, now, policy) {
  const { votes, profiles, lastSeen } = await scanVotes(
    db2,
    now - 168 * HOUR_MS,
    policy
  );
  const dayAgo = now - 24 * HOUR_MS;
  const users24h = [...lastSeen.values()].filter((at) => at >= dayAgo).length;
  return { profiles, votes, users24h, users7d: lastSeen.size };
}

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
  // /v1/stats recount; 0 = retention alone. ~0.4 s a pass at 2.1M votes, never
  // holding the loop past its 10 ms slice (2026-11-09, CLAUDE.md).
  profileCountMinutes: num("XLOC_PROFILE_COUNT_MINUTES", 10),
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
function toRequest(req, body, ip) {
  try {
    const url = new URL(req.url ?? "/", "http://localhost");
    const headers = toHeaders(req);
    headers.set("cf-connecting-ip", ip);
    return new Request(url, {
      method: req.method,
      headers,
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
var env = { DB: db, profilesCountedByWalks: true };
var stats = new Stats();
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
    const scan = reason === "shutdown" ? WHOLE_TABLE : yieldingScan();
    const totals = await countTotals(db, Date.now(), scan);
    const counters = stats.drain();
    console.log(
      `[x-loc-cache] stats ${JSON.stringify({
        reason,
        ...counters,
        users24h: totals.users24h,
        users7d: totals.users7d,
        profiles: totals.profiles,
        votes: totals.votes,
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
      const ip = clientIp(req);
      const retryAfter = rateLimited(ip, Date.now());
      if (retryAfter > 0) {
        stats.noteRateLimited();
        return plain(res, 429, "Too Many Requests", {
          "retry-after": String(retryAfter)
        });
      }
      if (UNSUPPORTED_METHODS.has(req.method ?? "")) {
        stats.noteRequest("other", "", "", Date.now() - startedAt);
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
      const request = toRequest(req, body, ip);
      if (request === null) {
        stats.noteRequest("other", "", "", Date.now() - startedAt);
        return plain(res, 400, "Bad Request");
      }
      const kind = requestKind(request.method, new URL(request.url).pathname);
      const responseBody = await send(res, await index_default.fetch(request, env));
      stats.noteRequest(kind, body, responseBody, Date.now() - startedAt);
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
var maintain = oneAtATime();
var retentionMs = config.retentionHours * 60 * 60 * 1e3;
async function runRetention() {
  const startedAt = Date.now();
  try {
    const { deleted, profiles } = await pruneExpired(
      env,
      Date.now(),
      yieldingScan()
    );
    sweepBuckets(Date.now());
    db.truncateWal();
    console.log(
      `[x-loc-cache] retention: deleted ${deleted} vote(s), ${profiles} profile(s) left, in ${Date.now() - startedAt}ms`
    );
  } catch (err) {
    console.error("[x-loc-cache] retention failed:", err);
  }
}
setInterval(() => void maintain("retention", runRetention), retentionMs).unref();
setTimeout(() => void maintain("retention", runRetention), 6e4).unref();
setInterval(() => sweepBuckets(Date.now()), config.rateWindowMs * 10).unref();
if (config.statsIntervalHours > 0) {
  setInterval(
    () => void maintain("stats", () => logStats("interval")),
    config.statsIntervalHours * 60 * 60 * 1e3
  ).unref();
}
async function runProfileCount() {
  try {
    await recountProfiles(env, yieldingScan());
  } catch (err) {
    console.error("[x-loc-cache] profile count failed:", err);
  }
}
if (config.profileCountMinutes > 0) {
  setInterval(
    () => void maintain("profiles", runProfileCount),
    config.profileCountMinutes * 60 * 1e3
  ).unref();
}
try {
  await recountProfiles(env, WHOLE_TABLE);
} catch (err) {
  console.error("[x-loc-cache] boot profile count failed:", err);
}
server.listen(config.port, config.host, () => {
  console.log(
    `[x-loc-cache] listening on http://${config.host}:${config.port} - db ${config.dbPath} (cache ${config.cacheMb}MB, mmap ${config.mmapMb}MB)`
  );
});
var closing = false;
for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => {
    if (closing) return;
    closing = true;
    console.log(`[x-loc-cache] ${signal} - draining`);
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
