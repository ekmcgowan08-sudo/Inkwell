import { describe, expect, it, beforeEach } from "vitest";
import { db } from "./db";
import { createProject } from "./repos/projects";
import { createChapter, createScene, autosaveScene, listChapters, listScenes } from "./repos/manuscript";
import { buildEpubZip } from "./exportProject";

const USER_ID = "11111111-1111-1111-1111-111111111111";

async function paragraph(sceneId: string, text: string) {
  await autosaveScene(sceneId, { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });
}

describe("buildEpubZip", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it("produces a valid EPUB container: mimetype first and uncompressed, container.xml, opf manifest/spine matching chapters", async () => {
    const project = await createProject(USER_ID, { title: 'Court of "Nine" Ravens & Crows' });
    const [chapter1] = await listChapters(project.id);
    const [scene1] = await listScenes(chapter1!.id);
    await paragraph(scene1!.id, "It was a dark night.");

    const chapter2 = await createChapter(project.id, "Chapter Two");
    const scene2 = await createScene(project.id, chapter2.id, "Scene 1");
    await paragraph(scene2.id, "The ravens circled twice.");

    const zip = await buildEpubZip(project, { authorName: "A. Writer" });

    // mimetype must be the very first entry and stored uncompressed — the one hard
    // requirement of the EPUB/OCF container format.
    const entries = Object.keys(zip.files);
    expect(entries[0]).toBe("mimetype");
    expect(zip.files["mimetype"]!.options.compression).toBe("STORE");
    expect(await zip.file("mimetype")!.async("string")).toBe("application/epub+zip");

    const container = await zip.file("META-INF/container.xml")!.async("string");
    expect(container).toContain("OEBPS/content.opf");

    const opf = await zip.file("OEBPS/content.opf")!.async("string");
    // Title/author are XML-escaped so a straight quote or ampersand in the book title
    // doesn't produce malformed XML.
    expect(opf).toContain("Court of &quot;Nine&quot; Ravens &amp; Crows");
    expect(opf).toContain("A. Writer");
    expect(opf).toContain(`urn:uuid:${project.id}`);
    expect(opf).toContain('<itemref idref="chapter-1"/>');
    expect(opf).toContain('<itemref idref="chapter-2"/>');
    // spine order must match chapter order
    expect(opf.indexOf('idref="chapter-1"')).toBeLessThan(opf.indexOf('idref="chapter-2"'));

    const chapter1Xhtml = await zip.file("OEBPS/chapter-1.xhtml")!.async("string");
    expect(chapter1Xhtml).toContain("<h1>Chapter 1</h1>");
    expect(chapter1Xhtml).toContain("It was a dark night.");

    const chapter2Xhtml = await zip.file("OEBPS/chapter-2.xhtml")!.async("string");
    expect(chapter2Xhtml).toContain("<h1>Chapter Two</h1>");
    expect(chapter2Xhtml).toContain("The ravens circled twice.");

    const nav = await zip.file("OEBPS/nav.xhtml")!.async("string");
    expect(nav).toContain('href="chapter-1.xhtml"');
    expect(nav).toContain('href="chapter-2.xhtml"');
  });

  it("omits dc:creator entirely when no author name is given, rather than emitting an empty tag", async () => {
    const project = await createProject(USER_ID, { title: "No Author Yet" });
    const zip = await buildEpubZip(project);
    const opf = await zip.file("OEBPS/content.opf")!.async("string");
    expect(opf).not.toContain("dc:creator");
  });
});
