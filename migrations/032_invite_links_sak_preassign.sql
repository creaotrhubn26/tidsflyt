-- Migration 032: Pre-assign sak IDs on invite links
-- Vendor admin chooses 0..N saker when creating an invite link. New users
-- get auto-added to those saker on accept.

ALTER TABLE vendor_invite_links
  ADD COLUMN IF NOT EXISTS sak_ids JSONB DEFAULT '[]'::jsonb;
