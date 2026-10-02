-- Allow Gmail HTML bodies to be stored as rendered email content.
ALTER TYPE "ContentType" ADD VALUE IF NOT EXISTS 'html';
