export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  Tables: {
      users: {
        Row: {
          id: number;
          name: string;
          email: string;
          status: string;
          last_login: string | null;
          created_at: string;
        };
        Insert: {
          name: string;
          email: string;
          status?: string;
          last_login?: string | null;
        };
        Update: {
          name?: string;
          email?: string;
          status?: string;
          last_login?: string | null;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          id: number;
          user_id: number;
          bio: string | null;
          avatar_url: string | null;
          interests: string[] | null;
          updated_at: string | null;
        };
        Insert: {
          user_id: number;
          bio?: string | null;
          avatar_url?: string | null;
          interests?: string[] | null;
          updated_at?: string | null;
        };
        Update: {
          user_id?: number;
          bio?: string | null;
          avatar_url?: string | null;
          interests?: string[] | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      posts: {
        Row: {
          id: number;
          user_id: number;
          title: string;
          content: string | null;
          tags: string[] | null;
          views: number;
          created_at: string;
          updated_at: string | null;
        };
        Insert: {
          user_id: number;
          title: string;
          content?: string | null;
          tags?: string[] | null;
          updated_at?: string | null;
        };
        Update: {
          user_id?: number;
          title?: string;
          content?: string | null;
          tags?: string[] | null;
          updated_at?: string | null;
          views?: number;
        };
        Relationships: [];
      };
      comments: {
        Row: {
          id: number;
          post_id: number;
          user_id: number;
          content: string;
          created_at: string;
        };
        Insert: {
          post_id: number;
          user_id: number;
          content: string;
        };
        Update: {
          post_id?: number;
          user_id?: number;
          content?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}
