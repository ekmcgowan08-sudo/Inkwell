/**
 * Automated Row-Level-Security proof suite.
 *
 * Applies the real migrations from supabase/migrations/ (plus a minimal
 * auth-schema shim, see shim.sql) to a throwaway Postgres database, then
 * runs every write/read as the `authenticated` role while impersonating two
 * different users via `request.jwt.claims` — exactly how Supabase's
 * PostgREST layer does it in production. This is the "database and RLS
 * tests pass" and "cross-project isolation" evidence for docs/SECURITY.md.
 *
 * Backend selection: uses a local Postgres server (`postgresql.service` /
 * `pg_ctlcluster`, connecting as the `postgres` superuser) when
 * `RLS_TEST_BACKEND=local`, or a disposable Docker container otherwise
 * (default). CI and most dev machines have Docker; this sandboxed
 * environment does not have a usable Docker daemon, so local mode exists as
 * a fallback that proves the same migrations and policies.
 *
 * Usage: pnpm test:rls   (see docs/TESTING.md)
 */
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..");
const CONTAINER_NAME = "inkwell_rls_test";
const PORT = 55432;
const BACKEND = process.env.RLS_TEST_BACKEND === "local" ? "local" : "docker";
const LOCAL_DB_NAME = "inkwell_rls_test";
const DB_URL =
  BACKEND === "local"
    ? `postgres://postgres:postgres@127.0.0.1:5432/${LOCAL_DB_NAME}`
    : `postgres://postgres:postgres@127.0.0.1:${PORT}/postgres`;

let passed = 0;
let failed = 0;
const failures: string[] = [];

async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`  ok  - ${name}`);
  } catch (err) {
    failed++;
    failures.push(name);
    console.log(`FAIL  - ${name}`);
    console.log(`        ${(err as Error).message}`);
  }
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

async function asUser(client: Client, userId: string) {
  await client.query("reset role");
  await client.query("set role authenticated");
  // `is_local = false` (session-level) because, unlike PostgREST — which
  // wraps each HTTP request in one transaction and sets this with SET
  // LOCAL — this test harness issues each statement as its own
  // auto-committed implicit transaction. A transaction-local setting would
  // vanish before the very next query ran.
  await client.query(`select set_config('request.jwt.claims', '${JSON.stringify({ sub: userId })}', false)`);
}

async function asSuperuser(client: Client) {
  await client.query("reset role");
}

async function expectRejected(fn: () => Promise<unknown>, message: string) {
  try {
    await fn();
  } catch {
    return;
  }
  throw new Error(message);
}

function startContainer() {
  if (BACKEND === "local") {
    console.log(`Using local Postgres server, database "${LOCAL_DB_NAME}"…`);
    spawnSync("psql", ["-U", "postgres", "-h", "127.0.0.1", "-c", `drop database if exists ${LOCAL_DB_NAME}`], {
      env: { ...process.env, PGPASSWORD: "postgres" },
    });
    const result = spawnSync("psql", ["-U", "postgres", "-h", "127.0.0.1", "-c", `create database ${LOCAL_DB_NAME}`], {
      env: { ...process.env, PGPASSWORD: "postgres" },
    });
    if (result.status !== 0) {
      throw new Error(`createdb failed: ${result.stderr?.toString()}`);
    }
    return;
  }
  console.log("Starting throwaway Postgres container…");
  spawnSync("docker", ["rm", "-f", CONTAINER_NAME], { stdio: "ignore" });
  const result = spawnSync("docker", [
    "run", "--rm", "-d",
    "--name", CONTAINER_NAME,
    "-e", "POSTGRES_PASSWORD=postgres",
    "-p", `${PORT}:5432`,
    "postgres:16-alpine",
  ]);
  if (result.status !== 0) {
    throw new Error(`docker run failed: ${result.stderr?.toString()}`);
  }
}

function stopContainer() {
  if (BACKEND === "local") {
    spawnSync("psql", ["-U", "postgres", "-h", "127.0.0.1", "-c", `drop database if exists ${LOCAL_DB_NAME}`], {
      env: { ...process.env, PGPASSWORD: "postgres" },
    });
    return;
  }
  spawnSync("docker", ["rm", "-f", CONTAINER_NAME], { stdio: "ignore" });
}

async function waitForPostgres(): Promise<Client> {
  const deadline = Date.now() + 30_000;
  let lastErr: unknown;
  while (Date.now() < deadline) {
    const client = new Client({ connectionString: DB_URL });
    try {
      await client.connect();
      return client;
    } catch (err) {
      lastErr = err;
      await client.end().catch(() => {});
      await new Promise((r) => setTimeout(r, 750));
    }
  }
  throw new Error(`Postgres never became ready: ${lastErr}`);
}

async function applySchema(client: Client) {
  const shim = readFileSync(join(__dirname, "shim.sql"), "utf8");
  await client.query(shim);

  const migrationsDir = join(ROOT, "supabase", "migrations");
  const files = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    const sql = readFileSync(join(migrationsDir, file), "utf8");
    try {
      await client.query(sql);
    } catch (err) {
      throw new Error(`Migration ${file} failed: ${(err as Error).message}`);
    }
  }

  // Mirror what Supabase's provisioning grants the `authenticated` role.
  await client.query(`
    grant usage on schema public, inkwell to authenticated;
    grant select, insert, update, delete on all tables in schema public to authenticated;
  `);
}

async function main() {
  startContainer();
  let client: Client | undefined;
  try {
    client = await waitForPostgres();
    await applySchema(client);
    console.log("Schema applied. Running isolation tests…\n");

    const userA = randomUUID();
    const userB = randomUUID();
    await client.query(`insert into auth.users (id) values ('${userA}'), ('${userB}')`);

    let projectAId = "";
    let seriesAId = "";
    let chapterAId = "";
    let sceneAId = "";
    let entryAId = "";
    let appearanceAId = "";

    await test("user A can create a series, project, chapter, scene, and story-bible entry", async () => {
      await asUser(client!, userA);
      const series = await client!.query(
        `insert into public.series (user_id, title) values ('${userA}', 'Ravens Series') returning id`,
      );
      seriesAId = series.rows[0].id;
      const project = await client!.query(
        `insert into public.projects (user_id, series_id, title) values ('${userA}', '${seriesAId}', 'Court of Nine Ravens') returning id`,
      );
      projectAId = project.rows[0].id;
      const chapter = await client!.query(
        `insert into public.chapters (project_id, title) values ('${projectAId}', 'Chapter 1') returning id`,
      );
      chapterAId = chapter.rows[0].id;
      const scene = await client!.query(
        `insert into public.scenes (project_id, chapter_id, title, plain_text) values ('${projectAId}', '${chapterAId}', 'Opening scene', 'Nine ravens circled the tower.') returning id`,
      );
      sceneAId = scene.rows[0].id;
      const entry = await client!.query(
        `insert into public.story_bible_entries (project_id, entry_type, name, fields) values ('${projectAId}', 'character', 'Isolde Vane', '{"eyes":"black"}') returning id`,
      );
      entryAId = entry.rows[0].id;
      assert(!!projectAId && !!chapterAId && !!sceneAId && !!entryAId, "expected all inserts to return ids");
    });

    await test("user A can read everything they just created", async () => {
      await asUser(client!, userA);
      const r = await client!.query(`select id from public.projects where id = '${projectAId}'`);
      assert(r.rowCount === 1, "user A should see their own project");
    });

    await test("user B cannot see user A's project via SELECT", async () => {
      await asUser(client!, userB);
      const r = await client!.query(`select id from public.projects where id = '${projectAId}'`);
      assert(r.rowCount === 0, `expected 0 rows, got ${r.rowCount}`);
    });

    await test("user B cannot see user A's chapters, scenes, or story-bible entries", async () => {
      await asUser(client!, userB);
      const chapters = await client!.query(`select id from public.chapters where project_id = '${projectAId}'`);
      const scenes = await client!.query(`select id from public.scenes where id = '${sceneAId}'`);
      const entries = await client!.query(`select id from public.story_bible_entries where project_id = '${projectAId}'`);
      assert(chapters.rowCount === 0, "chapters leaked across users");
      assert(scenes.rowCount === 0, "scenes leaked across users");
      assert(entries.rowCount === 0, "story bible entries leaked across users");
    });

    await test("user A can record an appearance linking a story-bible entry to a scene", async () => {
      await asUser(client!, userA);
      const appearance = await client!.query(
        `insert into public.appearances (project_id, entry_id, scene_id) values ('${projectAId}', '${entryAId}', '${sceneAId}') returning id`,
      );
      appearanceAId = appearance.rows[0].id;
      assert(!!appearanceAId, "expected appearance insert to return an id");
    });

    await test("user B cannot see, update, or delete user A's appearance record", async () => {
      await asUser(client!, userB);
      const r = await client!.query(`select id from public.appearances where id = '${appearanceAId}'`);
      assert(r.rowCount === 0, "appearance record leaked across users");
      const upd = await client!.query(`update public.appearances set confirmed = false where id = '${appearanceAId}'`);
      assert(upd.rowCount === 0, `expected 0 rows updated, got ${upd.rowCount}`);
      const del = await client!.query(`delete from public.appearances where id = '${appearanceAId}'`);
      assert(del.rowCount === 0, `expected 0 rows deleted, got ${del.rowCount}`);
      await asUser(client!, userA);
      const stillThere = await client!.query(`select confirmed from public.appearances where id = '${appearanceAId}'`);
      assert(stillThere.rowCount === 1 && stillThere.rows[0].confirmed === true, "appearance must be unchanged and still owned by user A");
    });

    await test("user B's UPDATE against user A's project affects 0 rows (not an error, a silent no-op — verify explicitly)", async () => {
      await asUser(client!, userB);
      const r = await client!.query(`update public.projects set title = 'Hijacked' where id = '${projectAId}'`);
      assert(r.rowCount === 0, `expected 0 rows updated, got ${r.rowCount}`);
      await asUser(client!, userA);
      const check = await client!.query(`select title from public.projects where id = '${projectAId}'`);
      assert(check.rows[0].title === "Court of Nine Ravens", "title must be unchanged");
    });

    await test("user B's DELETE against user A's chapter affects 0 rows", async () => {
      await asUser(client!, userB);
      const r = await client!.query(`delete from public.chapters where id = '${chapterAId}'`);
      assert(r.rowCount === 0, `expected 0 rows deleted, got ${r.rowCount}`);
    });

    await test("user B cannot attach their own project to user A's series (ownership check constraint)", async () => {
      await asUser(client!, userB);
      await expectRejected(
        () => client!.query(`insert into public.projects (user_id, series_id, title) values ('${userB}', '${seriesAId}', 'Hostile takeover')`),
        "expected insert to be rejected by projects_series_same_owner check",
      );
    });

    await test("AI retrieval isolation: document_chunks for project A are invisible to user B, visible to user A", async () => {
      await asSuperuser(client!); // document_chunks is written by the service role, not the client
      await client!.query(
        `insert into public.document_chunks (project_id, user_id, source_type, source_id, content) values ('${projectAId}', '${userA}', 'scene', '${sceneAId}', 'Nine ravens circled the tower.')`,
      );
      await asUser(client!, userA);
      const asOwner = await client!.query(`select id from public.document_chunks where project_id = '${projectAId}'`);
      assert(asOwner.rowCount === 1, "owning user should see the indexed chunk");

      await asUser(client!, userB);
      const asOther = await client!.query(`select id from public.document_chunks where project_id = '${projectAId}'`);
      assert(asOther.rowCount === 0, "document chunks leaked across projects/users");
    });

    await test("ranked full-text search functions (search_scenes_ranked, search_story_bible_entries_ranked) respect RLS", async () => {
      // SECURITY INVOKER (the default) — these SQL functions must not let user B pull user A's
      // content just by knowing project A's id. See supabase/migrations/0011_ranked_search.sql.
      await asUser(client!, userA);
      const scenesAsOwner = await client!.query(`select id from public.search_scenes_ranked('${projectAId}', 'ravens', 12)`);
      assert(scenesAsOwner.rowCount === 1, "owning user should get the matching scene back from ranked search");
      const entriesAsOwner = await client!.query(
        `select id from public.search_story_bible_entries_ranked('${projectAId}', 'Isolde', 40)`,
      );
      assert(entriesAsOwner.rowCount === 1, "owning user should get the matching story bible entry back from ranked search");

      await asUser(client!, userB);
      const scenesAsOther = await client!.query(`select id from public.search_scenes_ranked('${projectAId}', 'ravens', 12)`);
      assert(scenesAsOther.rowCount === 0, "ranked scene search leaked project A's content to user B");
      const entriesAsOther = await client!.query(
        `select id from public.search_story_bible_entries_ranked('${projectAId}', 'Isolde', 40)`,
      );
      assert(entriesAsOther.rowCount === 0, "ranked story bible search leaked project A's content to user B");
    });

    await test("AI conversations and messages for project A are invisible to user B", async () => {
      await asUser(client!, userA);
      const convo = await client!.query(
        `insert into public.ai_conversations (project_id, user_id, title) values ('${projectAId}', '${userA}', 'Consistency check') returning id`,
      );
      const conversationAId = convo.rows[0].id;
      await asSuperuser(client!); // messages are written by the service role only
      await client!.query(
        `insert into public.ai_messages (conversation_id, project_id, role, content) values ('${conversationAId}', '${projectAId}', 'assistant', 'Reviewed.')`,
      );

      await asUser(client!, userB);
      const convos = await client!.query(`select id from public.ai_conversations where project_id = '${projectAId}'`);
      const messages = await client!.query(`select id from public.ai_messages where project_id = '${projectAId}'`);
      assert(convos.rowCount === 0, "AI conversation leaked across users");
      assert(messages.rowCount === 0, "AI message leaked across users");
    });

    await test("a client cannot insert AI messages directly (server-only write path)", async () => {
      await asUser(client!, userA);
      await expectRejected(
        () => client!.query(`insert into public.ai_messages (conversation_id, project_id, role, content) values ('${randomUUID()}', '${projectAId}', 'user', 'hello')`),
        "expected direct client insert into ai_messages to be rejected",
      );
    });

    await test("a client cannot insert AI findings directly, but the owning user can update status/author_note on one the server created", async () => {
      await asUser(client!, userA);
      await expectRejected(
        () =>
          client!.query(
            `insert into public.ai_findings (project_id, finding_type, severity, confidence, title, explanation) values ('${projectAId}', 'contradiction', 'medium', 0.8, 'Fabricated finding', 'A client should not be able to create this row directly.')`,
          ),
        "expected direct client insert into ai_findings to be rejected — findings are server-created only",
      );

      await asSuperuser(client!); // the Edge Function's service-role client is the only real writer
      const created = await client!.query(
        `insert into public.ai_findings (project_id, finding_type, severity, confidence, title, explanation) values ('${projectAId}', 'contradiction', 'medium', 0.8, 'Real finding', 'Created as the service role would.') returning id`,
      );
      const findingAId = created.rows[0].id;

      await asUser(client!, userA);
      const updated = await client!.query(`update public.ai_findings set status = 'dismissed', author_note = 'not a real issue' where id = '${findingAId}'`);
      assert(updated.rowCount === 1, "the owning user should be able to update status/author_note on a finding in their own project");

      await asUser(client!, userB);
      const otherUsersUpdate = await client!.query(`update public.ai_findings set status = 'dismissed' where id = '${findingAId}'`);
      assert(otherUsersUpdate.rowCount === 0, "a finding in another user's project must not be updatable");
    });

    await test("ai_rate_limit_events is entirely server-only — no client can read or write it, even their own rows", async () => {
      await asSuperuser(client!); // written only by the Edge Function's service-role client
      await client!.query(`insert into public.ai_rate_limit_events (user_id) values ('${userA}')`);

      await asUser(client!, userA);
      const ownRows = await client!.query(`select id from public.ai_rate_limit_events where user_id = '${userA}'`);
      assert(ownRows.rowCount === 0, "a client should not be able to see even its own rate-limit events");

      await expectRejected(
        () => client!.query(`insert into public.ai_rate_limit_events (user_id) values ('${userA}')`),
        "expected a direct client insert into ai_rate_limit_events to be rejected — it has no policies at all",
      );
    });

    await test("a client cannot grant itself a paid entitlement", async () => {
      await asUser(client!, userB);
      // No UPDATE policy exists on entitlements for `authenticated`, so RLS
      // makes every row invisible to this command — the update succeeds as
      // a statement but silently matches zero rows (the same "default
      // deny" semantics as the earlier UPDATE/DELETE isolation tests).
      const updateResult = await client!.query(
        `update public.entitlements set plan_id = 'author_plus_ai', status = 'active' where user_id = '${userB}'`,
      );
      assert(updateResult.rowCount === 0, `expected 0 rows updated, got ${updateResult.rowCount}`);

      await asSuperuser(client!);
      const stillFree = await client!.query(`select plan_id from public.entitlements where user_id = '${userB}'`);
      assert(stillFree.rows[0].plan_id === "free", "entitlement must remain on the free plan");

      // INSERT does have a real WITH-CHECK gate: since there is no INSERT
      // policy at all, Postgres treats the implicit check as `false` and
      // raises an error rather than silently matching zero rows.
      await asUser(client!, userB);
      await expectRejected(
        () => client!.query(`insert into public.entitlements (user_id, plan_id) values ('${randomUUID()}', 'author_plus_ai')`),
        "expected forged entitlement insert to be rejected",
      );
    });

    await test("user B cannot read user A's profile, preferences, or audit events", async () => {
      await asSuperuser(client!);
      await client!.query(`insert into public.audit_events (user_id, action) values ('${userA}', 'project.delete')`);
      await asUser(client!, userB);
      const profile = await client!.query(`select id from public.profiles where id = '${userA}'`);
      const prefs = await client!.query(`select user_id from public.preferences where user_id = '${userA}'`);
      const audit = await client!.query(`select id from public.audit_events where user_id = '${userA}'`);
      assert(profile.rowCount === 0, "profile leaked across users");
      assert(prefs.rowCount === 0, "preferences leaked across users");
      assert(audit.rowCount === 0, "audit events leaked across users");
    });

    await test("soft-deleted item recovery bin is private per user", async () => {
      await asUser(client!, userA);
      await client!.query(
        `insert into public.deleted_items (project_id, user_id, entity_type, entity_id, snapshot) values ('${projectAId}', '${userA}', 'chapter', '${chapterAId}', '{}'::jsonb)`,
      );
      await asUser(client!, userB);
      const r = await client!.query(`select id from public.deleted_items where project_id = '${projectAId}'`);
      assert(r.rowCount === 0, "deleted-item recovery entry leaked across users");
    });

    console.log(`\n${passed} passed, ${failed} failed.`);
    if (failed > 0) {
      console.log("Failed: " + failures.join(", "));
      process.exitCode = 1;
    }
  } finally {
    await client?.end().catch(() => {});
    stopContainer();
  }
}

main().catch((err) => {
  console.error("RLS test run crashed:", err);
  stopContainer();
  process.exit(1);
});
