-- Cursor pagination: newest messages first per room
CREATE INDEX idx_messages_room_id_id ON messages(room_id, id DESC);

-- Partial unique index for idempotent client_message_id (only for non-null values)
CREATE UNIQUE INDEX idx_messages_client_msg_id
  ON messages(sender_id, client_message_id)
  WHERE client_message_id IS NOT NULL;

-- Remove the deferrable constraint from migration 3 (replaced by the partial index above)
ALTER TABLE messages DROP CONSTRAINT IF EXISTS uq_client_message_id;
