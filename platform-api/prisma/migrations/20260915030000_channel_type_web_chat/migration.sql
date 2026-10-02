-- Ensure ChannelType enum includes web_chat (missed in earlier web_chat table migration).
ALTER TYPE "ChannelType" ADD VALUE IF NOT EXISTS 'web_chat';
