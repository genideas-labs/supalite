/*
 * Default/fallback schema shape. The column, argument, and return positions are
 * deliberately `any`: this type stands in for an ARBITRARY user schema (real
 * projects supply their own generated types via `SupaLitePG<MySchema>`), and
 * `any` is what preserves ergonomic row access (`row.col`) on that dynamic
 * surface. `unknown` here would force a cast on every field access downstream.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
export interface Database {
  public: {
    Tables: {
      [key: string]: {
        Row: Record<string, any>;
        Insert: Record<string, any>;
        Update: Record<string, any>;
      };
    };
    Views: {
      [key: string]: {
        Row: Record<string, any>;
      };
    };
    Functions: {
      [key: string]: {
        Args: Record<string, any>;
        Returns: any;
      };
    };
    Enums: {
      [key: string]: string[];
    };
  };
}
