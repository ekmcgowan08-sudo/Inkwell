/**
 * Placeholder Supabase database types.
 *
 * Regenerate this file for real once a Supabase project exists and the
 * migrations in supabase/migrations/ have been applied:
 *
 *   supabase gen types typescript --local > packages/api-client/src/database.types.ts
 *
 * Until then, table rows are typed loosely (`Record<string, unknown>`) so
 * the client compiles and app code can still call `.from("projects")...`
 * — runtime behavior against a real Supabase project is unaffected either
 * way, since PostgREST doesn't care about this file at all. Application
 * code should prefer the precise types in `@inkwell/shared-types` (mirrors
 * the same schema, hand-maintained) when shaping data before it reaches the
 * client.
 */
type TableShape = {
  Row: Record<string, unknown>;
  Insert: Record<string, unknown>;
  Update: Record<string, unknown>;
};

type AnyTables = Record<string, TableShape>;

export interface Database {
  public: {
    Tables: AnyTables;
    Views: Record<string, { Row: Record<string, unknown> }>;
    Functions: Record<string, { Args: Record<string, unknown>; Returns: unknown }>;
    Enums: Record<string, string>;
  };
}
