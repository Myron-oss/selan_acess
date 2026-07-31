export interface Role {
  id: string;
  name: string;
  is_admin: boolean;
}

export interface Employee {
  id: string;
  tg_id: number;
  full_name: string;
  role_id: string;
  created_at: string;
  avatar_url: string | null;
  theme_preference: ThemePreference;
  accent_color: AccentColor;
  role?: Role;
}

export interface Channel {
  id: string;
  name: string;
  emoji: string | null;
  allowed_role_ids: string[];
  participant_count: number;
}

export interface AdminChannel {
  id: string;
  name: string;
  emoji: string | null;
  allowed_role_ids: string[];
}

export type AccessRequestStatus = "pending" | "approved" | "rejected";

export interface AccessRequest {
  id: string;
  tg_id: number;
  tg_username: string | null;
  full_name: string;
  status: AccessRequestStatus;
  created_at: string;
}

export type MessageFileType = "image" | "video" | "document";

export interface Message {
  id: string;
  channel_id: string;
  sender_tg_id: number;
  sender_name: string;
  sender_avatar_url: string | null;
  text: string;
  file_url: string | null;
  file_type: MessageFileType | null;
  file_name: string | null;
  file_size: number | null;
  created_at: string;
}

export interface MessageAttachment {
  file_url: string;
  file_type: MessageFileType;
  file_name: string;
  file_size: number;
}

export interface AuthenticatedEmployee {
  id: string;
  tg_id: number;
  full_name: string;
  role_id: string;
  avatar_url: string | null;
  theme_preference: ThemePreference;
  accent_color: AccentColor;
  role: Role;
}

export type ThemePreference = "light" | "dark" | "system";

export type AccentColor =
  | "blue"
  | "green"
  | "violet"
  | "orange"
  | "rose"
  | "cyan"
  | "indigo";

export interface UserSettings {
  theme_preference: ThemePreference;
  accent_color: AccentColor;
  avatar_url: string | null;
}
