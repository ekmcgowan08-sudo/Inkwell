import { createProject } from "./repos/projects";
import { createChapter, listChapters, listScenes, autosaveScene } from "./repos/manuscript";
import { createEntry, updateEntry } from "./repos/storyBible";
import { createTimelineEvent, updateTimelineEvent } from "./repos/storyboardTimeline";
import { db } from "./db";
import type { Project } from "@inkwell/shared-types";

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

function docFromParagraphs(text: string) {
  return {
    type: "doc",
    content: text.split("\n\n").map((p) => ({ type: "paragraph", content: p ? [{ type: "text", text: p }] : [] })),
  };
}

/** Seeds a fully-populated sample project ("The Lighthouse Keeps") so a new author has something real to explore. */
export async function createSampleProject(userId: string): Promise<Project> {
  const project = await createProject(userId, {
    title: "The Lighthouse Keeps",
    genre: "Literary Mystery",
    goalWords: 80000,
    dailyGoalWords: 750,
  });

  // `createProject` seeds one default empty chapter/scene so the manuscript
  // view is never a dead end; the sample project replaces it with real
  // seed content, so remove the placeholder before adding chapters below.
  for (const defaultChapter of await listChapters(project.id)) {
    const scenes = await listScenes(defaultChapter.id);
    for (const scene of scenes) await db.scenes.delete(scene.id);
    await db.chapters.delete(defaultChapter.id);
  }

  const ch1 = await createChapter(project.id, "Chapter 1 — The Lighthouse");
  const scenesCh1 = await listScenes(ch1.id);
  await autosaveScene(scenesCh1[0]!.id, docFromParagraphs(CH1_TEXT));

  const ch2 = await createChapter(project.id, "Chapter 2 — What the Fire Left");
  const scenesCh2 = await listScenes(ch2.id);
  await autosaveScene(scenesCh2[0]!.id, docFromParagraphs(CH2_TEXT));

  const wren = await createEntry(project.id, "character", "Wren Halloway");
  await updateEntry(wren.id, {
    summary: "Protagonist",
    canonStatus: "canon",
    fields: {
      role: "Protagonist",
      eyes: "Storm grey, flecked amber near the pupil",
      hair: "Black, cropped short, always windblown",
      clothing: "Oilskin coat over a patched wool sweater; father's compass on a leather cord",
      distinguishingMarks: "Burn scar along the left forearm from the lighthouse fire",
      voice: "Clipped sentences. Never swears in front of children.",
    },
    notes: "Doesn't trust anyone who's never lost something.",
  });

  const thorne = await createEntry(project.id, "character", "Captain Aldric Thorne");
  await updateEntry(thorne.id, {
    summary: "Antagonist",
    canonStatus: "canon",
    fields: {
      role: "Antagonist",
      eyes: "Pale blue, one clouded from cataract",
      hair: "Silver, kept in a long braid",
      clothing: "Navy dress coat, brass buttons, always polished boots",
      distinguishingMarks: "Missing the smallest finger on his right hand",
      voice: "Formal, addresses everyone by rank or title.",
    },
    notes: "Believes the lighthouse fire was sabotage, not accident.",
  });

  const t1 = await createTimelineEvent(project.id, "The lighthouse fire");
  await updateTimelineEvent(t1.id, { whenLabel: "9 years ago", detail: "Wren's brother dies. Thorne's inquiry clears the crew." });
  const t2 = await createTimelineEvent(project.id, "Wren returns to the island");
  await updateTimelineEvent(t2.id, { whenLabel: "Day 1", detail: "First contact with Thorne since the inquiry." });
  const t3 = await createTimelineEvent(project.id, "The logbook");
  await updateTimelineEvent(t3.id, { whenLabel: "Day 1, evening", detail: "Wren finds a last entry not in her brother's hand." });

  return project;
}
