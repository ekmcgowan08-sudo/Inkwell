import { z } from "zod";

export const uuidSchema = z.string().uuid();

/** Fields present on every table: ownership, ordering, soft-delete, optimistic concurrency. */
export const baseEntitySchema = z.object({
  id: uuidSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const ownedEntitySchema = baseEntitySchema.extend({
  userId: uuidSchema,
});

/** Row-level `revision` counter used for optimistic-concurrency sync (see docs/SYNC_AND_CONFLICTS.md). */
export const revisionedEntitySchema = z.object({
  revision: z.number().int().nonnegative(),
});

export const softDeleteSchema = z.object({
  deletedAt: z.string().datetime().nullable().default(null),
});

export const orderableSchema = z.object({
  sortOrder: z.number().int().nonnegative(),
});

export type UUID = z.infer<typeof uuidSchema>;
