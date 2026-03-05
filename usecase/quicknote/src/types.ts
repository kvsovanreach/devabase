export interface Notebook {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  color: string;
  icon: string;
  is_default: boolean;
  note_count: number;
  created_at: string;
  updated_at: string;
}

export interface Note {
  id: string;
  user_id: string;
  notebook_id: string;
  title: string;
  content: string;
  excerpt: string | null;
  is_pinned: boolean;
  is_archived: boolean;
  word_count: number;
  created_at: string;
  updated_at: string;
}

export interface Tag {
  id: string;
  user_id: string;
  name: string;
  color: string;
  created_at: string;
}

export interface NoteTag {
  id: string;
  note_id: string;
  tag_id: string;
  created_at: string;
}

export interface Collaborator {
  id: string;
  note_id: string;
  user_id: string;
  invited_by: string;
  permission: 'viewer' | 'editor';
  created_at: string;
}
