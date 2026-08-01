import type {
  AccessRequest,
  AdminChannel,
  Employee,
  Message,
  MessageReaction,
  MessageRead,
  MessageReplyPreview,
  PinnedMessage,
  Role
} from "@/lib/types";

type DataRow = Record<string, unknown>;

export function mapRole(row: DataRow): Role {
  return {
    id: String(row.id),
    name: String(row.name),
    is_admin: Boolean(row.is_admin)
  };
}

export function mapEmployee(row: DataRow, role?: Role): Employee {
  return {
    id: String(row.id),
    tg_id: Number(row.tg_id),
    full_name: String(row.full_name),
    role_id: String(row.role_id),
    created_at: String(row.created_at),
    avatar_url: typeof row.avatar_url === "string" ? row.avatar_url : null,
    theme_preference:
      row.theme_preference === "light" ||
      row.theme_preference === "dark" ||
      row.theme_preference === "system"
        ? row.theme_preference
        : "system",
    accent_color:
      row.accent_color === "green" ||
      row.accent_color === "violet" ||
      row.accent_color === "orange" ||
      row.accent_color === "rose" ||
      row.accent_color === "cyan" ||
      row.accent_color === "indigo"
        ? row.accent_color
        : "blue",
    notifications_enabled: row.notifications_enabled !== false,
    role
  };
}

export function mapAdminChannel(row: DataRow): AdminChannel {
  return {
    id: String(row.id),
    name: String(row.name),
    emoji: typeof row.emoji === "string" ? row.emoji : null,
    allowed_role_ids: Array.isArray(row.allowed_role_ids)
      ? row.allowed_role_ids.map(String)
      : []
  };
}

export function mapAccessRequest(row: DataRow): AccessRequest {
  return {
    id: String(row.id),
    tg_id: Number(row.tg_id),
    tg_username:
      typeof row.tg_username === "string" ? row.tg_username : null,
    full_name: String(row.full_name),
    status:
      row.status === "approved" || row.status === "rejected"
        ? row.status
        : "pending",
    created_at: String(row.created_at)
  };
}

export function mapMessage(
  row: DataRow,
  avatarUrl: string | null = null,
  reactions: MessageReaction[] = [],
  reads: MessageRead[] = [],
  replyTo: MessageReplyPreview | null = null
): Message {
  return {
    id: String(row.id),
    channel_id: String(row.channel_id),
    sender_tg_id: Number(row.sender_tg_id),
    sender_name: String(row.sender_name),
    sender_avatar_url: avatarUrl,
    text: String(row.text),
    file_url: typeof row.file_url === "string" ? row.file_url : null,
    file_type:
      row.file_type === "image" ||
      row.file_type === "video" ||
      row.file_type === "document"
        ? row.file_type
        : null,
    file_name: typeof row.file_name === "string" ? row.file_name : null,
    file_size:
      typeof row.file_size === "number"
        ? row.file_size
        : typeof row.file_size === "string"
          ? Number(row.file_size)
          : null,
    reply_to_message_id:
      typeof row.reply_to_message_id === "string"
        ? row.reply_to_message_id
        : null,
    reply_to: replyTo,
    is_pinned: Boolean(row.is_pinned),
    pinned_at: typeof row.pinned_at === "string" ? row.pinned_at : null,
    pinned_by_tg_id:
      typeof row.pinned_by_tg_id === "number"
        ? row.pinned_by_tg_id
        : typeof row.pinned_by_tg_id === "string"
          ? Number(row.pinned_by_tg_id)
          : null,
    reactions,
    reads,
    created_at: String(row.created_at)
  };
}

export function mapPinnedMessage(row: DataRow): PinnedMessage {
  return {
    id: String(row.id),
    channel_id: String(row.channel_id),
    sender_name: String(row.sender_name),
    text: String(row.text),
    file_name: typeof row.file_name === "string" ? row.file_name : null,
    is_pinned: Boolean(row.is_pinned),
    pinned_at: typeof row.pinned_at === "string" ? row.pinned_at : null,
    pinned_by_tg_id:
      typeof row.pinned_by_tg_id === "number"
        ? row.pinned_by_tg_id
        : typeof row.pinned_by_tg_id === "string"
          ? Number(row.pinned_by_tg_id)
          : null,
    created_at: String(row.created_at)
  };
}

export function mapMessageReaction(row: DataRow): MessageReaction {
  return {
    id: String(row.id),
    message_id: String(row.message_id),
    reactor_tg_id: Number(row.reactor_tg_id),
    emoji: String(row.emoji),
    created_at: String(row.created_at)
  };
}

export function mapMessageRead(row: DataRow): MessageRead {
  return {
    id: String(row.id),
    message_id: String(row.message_id),
    reader_tg_id: Number(row.reader_tg_id),
    reader_name: String(row.reader_name),
    read_at: String(row.read_at)
  };
}

export function mapMessageReplyPreview(
  row: DataRow
): MessageReplyPreview {
  return {
    id: String(row.id),
    sender_name: String(row.sender_name),
    text: String(row.text)
  };
}
