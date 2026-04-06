CREATE TABLE messages (
  id UUID PRIMARY KEY,
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  body TEXT NOT NULL DEFAULT '',
  client_message_id TEXT,
  attachment_key TEXT,
  attachment_meta JSONB,
  edited_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_client_message_id UNIQUE (sender_id, client_message_id)
    DEFERRABLE INITIALLY DEFERRED
);

ALTER TABLE room_members
  ADD CONSTRAINT fk_last_read_message
  FOREIGN KEY (last_read_message_id) REFERENCES messages(id) ON DELETE SET NULL;
