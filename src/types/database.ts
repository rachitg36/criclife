/**
 * PLACEHOLDER — generated types go here.
 *
 * After Phase 2 creates the migrations, regenerate this file with:
 *
 *   npx supabase gen types typescript --local > src/types/database.ts
 *
 * Do not hand-edit. The shape below is a minimal stand-in so the app
 * typechecks during Phase 0/1, before any tables exist.
 *
 * Schema reference: docs/02-DATA-MODEL.md
 */

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export type Database = {
  public: {
    Tables: Record<
      string,
      {
        Row: Record<string, unknown>;
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
        Relationships: [];
      }
    >;
    Views: Record<string, { Row: Record<string, unknown> }>;
    Functions: Record<string, { Args: Record<string, unknown>; Returns: unknown }>;
    Enums: Record<string, string>;
    CompositeTypes: Record<string, Record<string, unknown>>;
  };
};
