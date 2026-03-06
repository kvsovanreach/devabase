-- Add 'uploaded' status to document_status enum
-- Documents uploaded with process=false get this status (raw storage, no chunking/embedding)
ALTER TYPE document_status ADD VALUE IF NOT EXISTS 'uploaded' BEFORE 'pending';
