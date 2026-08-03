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
  notifications_enabled: boolean;
  channel_ids: string[];
  role?: Role;
}

export interface Channel {
  id: string;
  name: string;
  emoji: string | null;
  participant_count: number;
  last_message_preview: string | null;
  last_message_at: string | null;
}

export interface AdminChannel {
  id: string;
  name: string;
  emoji: string | null;
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

export interface MessageReaction {
  id: string;
  message_id: string;
  reactor_tg_id: number;
  emoji: string;
  created_at: string;
}

export interface MessageRead {
  id: string;
  message_id: string;
  reader_tg_id: number;
  reader_name: string;
  read_at: string;
}

export interface MessageReplyPreview {
  id: string;
  sender_name: string;
  text: string;
}

export interface PinnedMessage {
  id: string;
  channel_id: string;
  sender_name: string;
  text: string;
  file_name: string | null;
  is_pinned: boolean;
  pinned_at: string | null;
  pinned_by_tg_id: number | null;
  created_at: string;
}

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
  reply_to_message_id: string | null;
  reply_to: MessageReplyPreview | null;
  is_pinned: boolean;
  pinned_at: string | null;
  pinned_by_tg_id: number | null;
  reactions: MessageReaction[];
  reads: MessageRead[];
  poll_id: string | null;
  poll: Poll | null;
  created_at: string;
  updated_at: string;
}

export interface PollVoter {
  tg_id: number;
  full_name: string;
}

export interface PollOption {
  id: string;
  option_text: string;
  position: number;
  vote_count: number;
  percentage: number;
  selected_by_current_user: boolean;
  voters: PollVoter[] | null;
}

export interface Poll {
  id: string;
  channel_id: string;
  creator_tg_id: number;
  question: string;
  is_anonymous: boolean;
  allows_multiple_answers: boolean;
  total_votes: number;
  options: PollOption[];
  created_at: string;
}

export interface PollDraft {
  question: string;
  options: string[];
  is_anonymous: boolean;
  allows_multiple_answers: boolean;
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
  notifications_enabled: boolean;
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
  notifications_enabled: boolean;
}
