CREATE TABLE rooms (
  id UUID PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('dm', 'group')),
  name TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  dm_key TEXT UNIQUE,
  last_message_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE room_members (
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_read_message_id UUID,
  muted_until TIMESTAMPTZ,
  PRIMARY KEY (room_id, user_id)
);

CREATE INDEX idx_room_members_user_id ON room_members(user_id);
