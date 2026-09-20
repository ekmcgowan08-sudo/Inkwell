/**
 * Seeds a real local Supabase Postgres database with one fully-populated sample project ("The
 * Lighthouse Keeps" — the same content apps/web/src/lib/sampleProject.ts seeds into IndexedDB for
 * local-only mode) under an *existing* signed-up user, identified by email.
 *
 * `pnpm seed` was a dangling package.json script before this file existed — it pointed at
 * scripts/seed.ts, which had never been written, so the command failed with
 * ERR_MODULE_NOT_FOUND for anyone who ran it.
 *
 * Usage (after `pnpm supabase:start` and signing up a dev account through the app once):
 *   SEED_USER_EMAIL=you@example.com pnpm seed
 *
 * Connects directly via `pg` (already a root devDependency, same approach tests/rls/run.ts uses)
 * rather than through the Supabase client/PostgREST — this is a trusted, local-dev-only script
 * that writes to auth.users lookups and every table directly, which only makes sense against a
 * local Supabase instance, never production. DATABASE_URL defaults to the Supabase CLI's
 * documented local Postgres connection string.
 *
 * Verified: Auto (typechecks; run successfully against a plain local Postgres carrying just the
 * RLS suite's migrations + auth shim, tests/rls/shim.sql). NOT run against a real `supabase start`
 * stack in this environment — no Supabase CLI is installed here. The real stack's `auth.users`
 * table has more columns than the shim's, but this script only reads `id` from it, so that gap
 * shouldn't matter; still, treat this as code-reviewed, not integration-tested end to end.
 */
import { Client } from "pg";

const DATABASE_URL = process.env.DATABASE_URL ?? "postgres://postgres:postgres@127.0.0.1:54322/postgres";
const SEED_USER_EMAIL = process.env.SEED_USER_EMAIL;

const CH1_TEXT = `Wren Halloway had not set foot on the island in nine years, and the gulls seemed to remember it.

She pulled the oilskin coat tighter and climbed the last of the switchback path, her father's compass swinging cold against her collarbone. The lighthouse stood the way it always had — scorched at the base, unbowed above it, a black tooth against the grey sky.

Captain Thorne was waiting at the door. His silver braid had gone whiter since she'd last seen him, and he still stood like a man reading orders that hadn't been given yet.

"You came back," he said. Not a question.

"I never said I wouldn't."

His pale eyes moved over her — the coat, the compass, the old burn along her forearm she'd stopped bothering to hide. "Nine years," he said, "and you still wear his coat."

"It's warm," Wren said. "That's all it is."

She didn't believe that any more than he did.`;

const CH2_TEXT = `The inside of the lighthouse smelled like old smoke, the way it probably always would.

Wren ran her fingers along the curved wall, counting the soot marks like a rosary. Her brother had died three steps from where she stood. Thorne hadn't followed her in — he never did, not since the inquiry — and she was glad of it. Some rooms only held one ghost at a time.

She found the logbook where it always sat, water-stained but intact. The last entry wasn't in her brother's hand.`;

function docFromParagraphs(text: string): { type: string; content: unknown[] } {
  return {
    type: "doc",
    content: text.split("\n\n").map((p) => ({ type: "paragraph", content: p ? [{ type: "text", text: p }] : [] })),
  };
}

function plainTextOf(text: string): string {
  return text.replace(/\n\n/g, " ").trim();
}

function wordCountOf(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

async function main() {
  if (!SEED_USER_EMAIL) {
    console.error("SEED_USER_EMAIL is required — sign up a dev account through the app first, then:");
    console.error("  SEED_USER_EMAIL=you@example.com pnpm seed");
    process.exit(1);
  }

  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    const userResult = await client.query("select id from auth.users where email = $1", [SEED_USER_EMAIL]);
    if (userResult.rowCount === 0) {
      console.error(`No auth.users row found for "${SEED_USER_EMAIL}". Sign up through the app first, then re-run this script.`);
      process.exit(1);
    }
    const userId = userResult.rows[0].id as string;

    const project = await client.query(
      `insert into public.projects (user_id, title, genre, goal_words, daily_goal_words)
       values ($1, 'The Lighthouse Keeps', 'Literary Mystery', 80000, 750)
       returning id`,
      [userId],
    );
    const projectId = project.rows[0].id as string;
    console.log(`Created project "The Lighthouse Keeps" (${projectId}) for ${SEED_USER_EMAIL}.`);

    for (const [index, text] of [CH1_TEXT, CH2_TEXT].entries()) {
      const title = index === 0 ? "Chapter 1 — The Lighthouse" : "Chapter 2 — What the Fire Left";
      const chapter = await client.query(
        `insert into public.chapters (project_id, title, sort_order) values ($1, $2, $3) returning id`,
        [projectId, title, index],
      );
      const chapterId = chapter.rows[0].id as string;
      await client.query(
        `insert into public.scenes (project_id, chapter_id, title, content, plain_text, word_count)
         values ($1, $2, 'Scene 1', $3, $4, $5)`,
        [projectId, chapterId, JSON.stringify(docFromParagraphs(text)), plainTextOf(text), wordCountOf(text)],
      );
    }
    console.log("Seeded 2 chapters with real prose scenes.");

    await client.query(
      `insert into public.story_bible_entries (project_id, entry_type, name, summary, canon_status, fields, notes)
       values ($1, 'character', 'Wren Halloway', 'Protagonist', 'canon', $2, $3)`,
      [
        projectId,
        JSON.stringify({
          role: "Protagonist",
          eyes: "Storm grey, flecked amber near the pupil",
          hair: "Black, cropped short, always windblown",
          clothing: "Oilskin coat over a patched wool sweater; father's compass on a leather cord",
          distinguishingMarks: "Burn scar along the left forearm from the lighthouse fire",
          voice: "Clipped sentences. Never swears in front of children.",
        }),
        "Doesn't trust anyone who's never lost something.",
      ],
    );
    await client.query(
      `insert into public.story_bible_entries (project_id, entry_type, name, summary, canon_status, fields, notes)
       values ($1, 'character', 'Captain Aldric Thorne', 'Antagonist', 'canon', $2, $3)`,
      [
        projectId,
        JSON.stringify({
          role: "Antagonist",
          eyes: "Pale blue, one clouded from cataract",
          hair: "Silver, kept in a long braid",
          clothing: "Navy dress coat, brass buttons, always polished boots",
          distinguishingMarks: "Missing the smallest finger on his right hand",
          voice: "Formal, addresses everyone by rank or title.",
        }),
        "Believes the lighthouse fire was sabotage, not accident.",
      ],
    );
    console.log("Seeded 2 story-bible characters.");

    const events: [string, string, string][] = [
      ["The lighthouse fire", "9 years ago", "Wren's brother dies. Thorne's inquiry clears the crew."],
      ["Wren returns to the island", "Day 1", "First contact with Thorne since the inquiry."],
      ["The logbook", "Day 1, evening", "Wren finds a last entry not in her brother's hand."],
    ];
    for (const [i, [label, whenLabel, detail]] of events.entries()) {
      await client.query(
        `insert into public.timeline_events (project_id, label, when_label, detail, sort_order) values ($1, $2, $3, $4, $5)`,
        [projectId, label, whenLabel, detail, i],
      );
    }
    console.log("Seeded 3 timeline events.");

    console.log(`\nDone. Open the app and sign in as ${SEED_USER_EMAIL} to see "The Lighthouse Keeps".`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
