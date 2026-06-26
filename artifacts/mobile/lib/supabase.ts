import { createClient } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage as any,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          username: string;
          display_name: string;
          bio: string | null;
          avatar_url: string | null;
          cover_url: string | null;
          followers_count: number;
          following_count: number;
          posts_count: number;
          is_admin: boolean;
          is_banned: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["profiles"]["Row"]> & { id: string; username: string; display_name: string };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Row"]>;
      };
      posts: {
        Row: {
          id: string;
          author_id: string;
          content: string;
          media_urls: string[];
          media_type: "image" | "video" | null;
          media_width: number | null;
          media_height: number | null;
          likes_count: number;
          comments_count: number;
          shares_count: number;
          views_count: number;
          is_reel: boolean;
          visibility: "public" | "followers" | "private";
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["posts"]["Row"]> & { author_id: string; content: string };
        Update: Partial<Database["public"]["Tables"]["posts"]["Row"]>;
      };
      likes: {
        Row: { user_id: string; post_id: string; created_at: string };
        Insert: { user_id: string; post_id: string };
        Update: never;
      };
      saves: {
        Row: { user_id: string; post_id: string; created_at: string };
        Insert: { user_id: string; post_id: string };
        Update: never;
      };
      comments: {
        Row: {
          id: string;
          post_id: string;
          author_id: string;
          content: string;
          likes_count: number;
          parent_id: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["comments"]["Row"]> & { post_id: string; author_id: string; content: string };
        Update: Partial<Database["public"]["Tables"]["comments"]["Row"]>;
      };
      follows: {
        Row: { follower_id: string; following_id: string; created_at: string };
        Insert: { follower_id: string; following_id: string };
        Update: never;
      };
      stories: {
        Row: {
          id: string;
          author_id: string;
          media_url: string;
          media_type: "image" | "video";
          expires_at: string;
          views_count: number;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["stories"]["Row"]> & { author_id: string; media_url: string; media_type: "image" | "video" };
        Update: Partial<Database["public"]["Tables"]["stories"]["Row"]>;
      };
      conversations: {
        Row: {
          id: string;
          type: "dm" | "group";
          name: string | null;
          avatar_url: string | null;
          created_by: string;
          last_message_at: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["conversations"]["Row"]> & { type: "dm" | "group"; created_by: string };
        Update: Partial<Database["public"]["Tables"]["conversations"]["Row"]>;
      };
      conversation_members: {
        Row: {
          conversation_id: string;
          user_id: string;
          is_admin: boolean;
          is_muted: boolean;
          unread_count: number;
          joined_at: string;
        };
        Insert: { conversation_id: string; user_id: string; is_admin?: boolean };
        Update: Partial<Database["public"]["Tables"]["conversation_members"]["Row"]>;
      };
      messages: {
        Row: {
          id: string;
          conversation_id: string;
          sender_id: string;
          content: string;
          media_url: string | null;
          media_type: "image" | "video" | "audio" | "file" | null;
          reply_to_id: string | null;
          post_id: string | null;
          is_deleted: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["messages"]["Row"]> & { conversation_id: string; sender_id: string; content: string };
        Update: Partial<Database["public"]["Tables"]["messages"]["Row"]>;
      };
      blocks: {
        Row: { blocker_id: string; blocked_id: string; created_at: string };
        Insert: { blocker_id: string; blocked_id: string };
        Update: never;
      };
      live_sessions: {
        Row: {
          id: string;
          host_id: string;
          title: string;
          viewers_count: number;
          is_active: boolean;
          started_at: string;
          ended_at: string | null;
        };
        Insert: Partial<Database["public"]["Tables"]["live_sessions"]["Row"]> & { host_id: string; title: string };
        Update: Partial<Database["public"]["Tables"]["live_sessions"]["Row"]>;
      };
      notifications: {
        Row: {
          id: string;
          user_id: string;
          actor_id: string | null;
          type: "follow" | "like" | "comment" | "reply" | "message" | "mention" | "live";
          post_id: string | null;
          comment_id: string | null;
          is_read: boolean;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["notifications"]["Row"]> & { user_id: string; type: string };
        Update: Partial<Database["public"]["Tables"]["notifications"]["Row"]>;
      };
    };
  };
};
