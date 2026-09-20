import { describe, expect, it, beforeEach } from "vitest";
import { db } from "../db";
import { getActiveDailyGoal, getStreak, setDailyGoal, setRestDays } from "./storyboardTimeline";

const USER_ID = "11111111-1111-1111-1111-111111111111";
const PROJECT_ID = "22222222-2222-2222-2222-222222222222";

async function seedProgress(date: string, goalMet: boolean) {
  await db.dailyProgress.put({
    id: `${PROJECT_ID}:${date}`,
    projectId: PROJECT_ID,
    userId: USER_ID,
    date,
    wordsWritten: goalMet ? 1000 : 0,
    goalMet,
  });
}

describe("storyboardTimeline goals/streak repo", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it("setRestDays creates a goal if none exists, and persists weekday numbers", async () => {
    const goal = await setRestDays(PROJECT_ID, [0, 6]);
    expect(goal.restDays).toEqual([0, 6]);
    expect((await getActiveDailyGoal(PROJECT_ID))!.restDays).toEqual([0, 6]);
  });

  it("setRestDays preserves an existing goal's targetWords", async () => {
    await setDailyGoal(PROJECT_ID, 500);
    await setRestDays(PROJECT_ID, [0]);
    const goal = await getActiveDailyGoal(PROJECT_ID);
    expect(goal!.targetWords).toBe(500);
    expect(goal!.restDays).toEqual([0]);
  });

  it("a gap over a rest day does not break the streak", async () => {
    // 2026-09-14 is a Monday, 2026-09-13 is a Sunday (rest day), 2026-09-12 is a Saturday (goal met).
    await setRestDays(PROJECT_ID, [0]);
    await seedProgress("2026-09-12", true);
    await seedProgress("2026-09-14", true);
    expect(await getStreak(PROJECT_ID)).toBe(2);
  });

  it("a gap over a non-rest day still breaks the streak", async () => {
    await setRestDays(PROJECT_ID, [0]);
    await seedProgress("2026-09-11", true); // Friday
    await seedProgress("2026-09-14", true); // Monday — Sat+Sun skipped, but Saturday isn't a rest day
    expect(await getStreak(PROJECT_ID)).toBe(1);
  });

  it("consecutive goal-met days still count normally without any rest days configured", async () => {
    await seedProgress("2026-09-14", true);
    await seedProgress("2026-09-15", true);
    await seedProgress("2026-09-16", true);
    expect(await getStreak(PROJECT_ID)).toBe(3);
  });
});
