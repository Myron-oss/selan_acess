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
  role?: Role;
}

export interface Channel {
  id: string;
  name: string;
  emoji: string | null;
  allowed_role_ids: string[];
}

export interface Message {
  id: string;
  channel_id: string;
  sender_tg_id: number;
  sender_name: string;
  text: string;
  created_at: string;
}

export interface AuthenticatedEmployee {
  id: string;
  tg_id: number;
  full_name: string;
  role_id: string;
  role: Role;
}
