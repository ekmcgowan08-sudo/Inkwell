import { Document, Packer, Paragraph, HeadingLevel, PageBreak, AlignmentType } from "docx";
import JSZip from "jszip";
import { db } from "./db";
import { listChapters, listScenes } from "./repos/manuscript";
import type { Project } from "@inkwell/shared-types";

export const BACKUP_FORMAT_VERSION = 1;

export interface ProjectBackup {
  formatVersion: number;
  exportedAt: string;
  project: Project;
  chapters: unknown[];
  scenes: unknown[];
  storyBibleEntries: unknown[];
  relationships: unknown[];
  storyboardCards: unknown[];
  storyThreads: unknown[];
  timelineEvents: unknown[];
  goals: unknown[];
}

export async function buildProjectBackup(projectId: string): Promise<ProjectBackup> {
  const project = await db.projects.get(projectId);
  if (!project) throw new Error("Project not found");
  const [chapters, scenes, storyBibleEntries, relationships, storyboardCards, storyThreads, timelineEvents, goals] = await Promise.all([
    db.chapters.where("projectId").equals(projectId).toArray(),
    db.scenes.where("projectId").equals(projectId).toArray(),
    db.storyBibleEntries.where("projectId").equals(projectId).toArray(),
    db.relationships.where("projectId").equals(projectId).toArray(),
    db.storyboardCards.where("projectId").equals(projectId).toArray(),
    db.storyThreads.where("projectId").equals(projectId).toArray(),
    db.timelineEvents.where("projectId").equals(projectId).toArray(),
    db.goals.where("projectId").equals(projectId).toArray(),
  ]);
  return {
    formatVersion: BACKUP_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    project,
    chapters,
    scenes,
    storyBibleEntries,
    relationships,
    storyboardCards,
    storyThreads,
    timelineEvents,
    goals,
  };
}

export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function downloadText(filename: string, text: string, mime = "text/plain"): void {
  downloadBlob(filename, new Blob([text], { type: `${mime};charset=utf-8` }));
}

export function downloadJson(filename: string, data: unknown): void {
  downloadText(filename, JSON.stringify(data, null, 2), "application/json");
}

async function manuscriptChapters(projectId: string) {
  const chapters = await listChapters(projectId);
  const result: { title: string; scenes: { title: string; plainText: string }[] }[] = [];
  for (const c of chapters) {
    const scenes = await listScenes(c.id);
    result.push({ title: c.title, scenes: scenes.map((s) => ({ title: s.title, plainText: s.plainText })) });
  }
  return result;
}

export async function exportPlainText(project: Project): Promise<string> {
  const chapters = await manuscriptChapters(project.id);
  const parts = [project.title.toUpperCase(), ""];
  for (const c of chapters) {
    parts.push(c.title, "");
    for (const s of c.scenes) {
      if (s.plainText.trim()) parts.push(s.plainText.trim(), "", "* * *", "");
    }
  }
  return parts.join("\n");
}

export async function exportMarkdown(project: Project): Promise<string> {
  const chapters = await manuscriptChapters(project.id);
  const parts = [`# ${project.title}`, ""];
  for (const c of chapters) {
    parts.push(`## ${c.title}`, "");
    for (const s of c.scenes) {
      if (s.plainText.trim()) parts.push(s.plainText.trim(), "", "---", "");
    }
  }
  return parts.join("\n");
}

export interface DocxOptions {
  authorName?: string;
  copyrightLine?: string;
  includeTitlePage?: boolean;
}

export async function exportDocx(project: Project, options: DocxOptions = {}): Promise<Blob> {
  const chapters = await manuscriptChapters(project.id);
  const children: Paragraph[] = [];

  if (options.includeTitlePage !== false) {
    children.push(
      new Paragraph({ text: project.title, heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER, spacing: { before: 2000 } }),
      new Paragraph({ text: options.authorName ?? "", alignment: AlignmentType.CENTER, spacing: { before: 400 } }),
      new Paragraph({ text: options.copyrightLine ?? `© ${new Date().getFullYear()}`, alignment: AlignmentType.CENTER, spacing: { before: 2000 } }),
      new Paragraph({ children: [new PageBreak()] }),
    );
  }

  for (const c of chapters) {
    children.push(new Paragraph({ text: c.title, heading: HeadingLevel.HEADING_1, spacing: { before: 400, after: 200 } }));
    for (const s of c.scenes) {
      const paragraphs = s.plainText.split(/\n{2,}/).filter((p) => p.trim());
      for (const p of paragraphs) {
        children.push(new Paragraph({ text: p.trim(), spacing: { after: 200 }, indent: { firstLine: 360 } }));
      }
      children.push(new Paragraph({ text: "* * *", alignment: AlignmentType.CENTER, spacing: { before: 200, after: 200 } }));
    }
    children.push(new Paragraph({ children: [new PageBreak()] }));
  }

  const doc = new Document({ sections: [{ children }] });
  return Packer.toBlob(doc);
}

export interface EpubOptions {
  authorName?: string;
}

function escapeXml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function sceneToXhtmlParagraphs(plainText: string): string {
  return plainText
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${escapeXml(p)}</p>`)
    .join("\n");
}

/**
 * Builds the EPUB 3 archive contents as a JSZip instance (not yet serialized to a Blob), so
 * apps/web/src/lib/exportProject.test.ts can inspect individual entries directly via
 * `zip.file(path).async("string")` instead of round-tripping through a real Blob — jsdom's Blob
 * polyfill doesn't implement `.arrayBuffer()`, so that round trip isn't available in tests.
 * `exportEpub` below is the real entry point apps use; this is exported because the archive
 * layout (manifest/spine/nav) is exactly what's worth testing on its own.
 */
export async function buildEpubZip(project: Project, options: EpubOptions = {}): Promise<JSZip> {
  const chapters = await manuscriptChapters(project.id);
  const zip = new JSZip();

  // Must be the first entry in the archive and stored uncompressed — the one hard requirement
  // of the EPUB/OCF container format that a plain "it's a zip file" wouldn't tell you to do.
  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });

  zip.file(
    "META-INF/container.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`,
  );

  zip.file(
    "OEBPS/style.css",
    `body { font-family: serif; line-height: 1.5; margin: 1em; }
h1 { text-align: center; margin-bottom: 1.5em; }
p { text-indent: 1.5em; margin: 0 0 0.5em 0; }
p + p { margin-top: 0; }`,
  );

  const chapterFiles = chapters.map((c, i) => ({
    id: `chapter-${i + 1}`,
    filename: `chapter-${i + 1}.xhtml`,
    title: c.title,
    body: c.scenes
      .map((s) => sceneToXhtmlParagraphs(s.plainText))
      .filter(Boolean)
      .join('\n<p style="text-align: center;">* * *</p>\n'),
  }));

  for (const c of chapterFiles) {
    zip.file(
      `OEBPS/${c.filename}`,
      `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>${escapeXml(c.title)}</title><link rel="stylesheet" type="text/css" href="style.css"/></head>
<body>
<h1>${escapeXml(c.title)}</h1>
${c.body}
</body>
</html>`,
    );
  }

  const identifier = `urn:uuid:${project.id}`;
  const modified = new Date().toISOString().replace(/\.\d+Z$/, "Z");
  const manifestItems = [
    `<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>`,
    `<item id="css" href="style.css" media-type="text/css"/>`,
    ...chapterFiles.map((c) => `<item id="${c.id}" href="${c.filename}" media-type="application/xhtml+xml"/>`),
  ].join("\n    ");
  const spineItems = chapterFiles.map((c) => `<itemref idref="${c.id}"/>`).join("\n    ");

  zip.file(
    "OEBPS/content.opf",
    `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="pub-id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="pub-id">${identifier}</dc:identifier>
    <dc:title>${escapeXml(project.title)}</dc:title>
    <dc:language>en</dc:language>
    ${options.authorName ? `<dc:creator>${escapeXml(options.authorName)}</dc:creator>` : ""}
    <meta property="dcterms:modified">${modified}</meta>
  </metadata>
  <manifest>
    ${manifestItems}
  </manifest>
  <spine>
    ${spineItems}
  </spine>
</package>`,
  );

  const navItems = chapterFiles.map((c) => `<li><a href="${c.filename}">${escapeXml(c.title)}</a></li>`).join("\n      ");
  zip.file(
    "OEBPS/nav.xhtml",
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>Contents</title></head>
<body>
  <nav epub:type="toc" id="toc">
    <h1>Contents</h1>
    <ol>
      ${navItems}
    </ol>
  </nav>
</body>
</html>`,
  );

  return zip;
}

export async function exportEpub(project: Project, options: EpubOptions = {}): Promise<Blob> {
  const zip = await buildEpubZip(project, options);
  return zip.generateAsync({ type: "blob", mimeType: "application/epub+zip" });
}
