import { Document, Packer, Paragraph, HeadingLevel, PageBreak, AlignmentType } from "docx";
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
