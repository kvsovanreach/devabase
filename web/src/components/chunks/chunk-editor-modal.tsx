'use client';

import { useState, useEffect } from 'react';
import { Modal, ModalFooter } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Chunk } from '@/types';
import { useUpdateChunk, useDeleteChunk } from '@/hooks/use-chunks';
import { AlertCircle, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';

interface ChunkEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  chunk: Chunk | null;
  documentId: string;
}

export function ChunkEditorModal({
  isOpen,
  onClose,
  chunk,
  documentId,
}: ChunkEditorModalProps) {
  const [content, setContent] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const updateChunk = useUpdateChunk(documentId);
  const deleteChunk = useDeleteChunk(documentId);

  useEffect(() => {
    if (chunk) {
      setContent(chunk.content);
    }
  }, [chunk]);

  const handleSave = async () => {
    if (!chunk || !content.trim()) return;

    try {
      await updateChunk.mutateAsync({
        chunkId: chunk.id,
        data: { content: content.trim() },
      });
      toast.success('Chunk updated successfully');
      onClose();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update chunk';
      toast.error(message);
    }
  };

  const handleDelete = async () => {
    if (!chunk) return;

    try {
      await deleteChunk.mutateAsync(chunk.id);
      toast.success('Chunk deleted successfully');
      onClose();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete chunk';
      toast.error(message);
    }
  };

  const handleClose = () => {
    setShowDeleteConfirm(false);
    onClose();
  };

  // Calculate character and approximate token count
  const charCount = content.length;
  const approxTokens = Math.ceil(charCount / 4); // Rough approximation

  const hasChanges = chunk && content !== chunk.content;

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={`Edit Chunk #${(chunk?.chunk_index || 0) + 1}`}
      description="Modify chunk content. Changes will regenerate the embedding."
      size="xl"
    >
      {showDeleteConfirm ? (
        <div className="space-y-4">
          <div className="p-4 bg-error/10 border border-error/20 rounded-xl">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-error flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-[14px] font-medium text-error">Delete this chunk?</p>
                <p className="text-[13px] text-error/80 mt-1">
                  This will permanently delete the chunk and its vector embedding. This action cannot be undone.
                </p>
              </div>
            </div>
          </div>
          <ModalFooter>
            <Button
              variant="secondary"
              onClick={() => setShowDeleteConfirm(false)}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={handleDelete}
              isLoading={deleteChunk.isPending}
            >
              Delete Chunk
            </Button>
          </ModalFooter>
        </div>
      ) : (
        <div className="space-y-4">
          <Textarea
            label="Content"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={12}
            className="font-mono text-[13px]"
          />
          <div className="flex items-center justify-between text-[12px] text-text-tertiary">
            <span>{charCount.toLocaleString()} characters</span>
            <span>~{approxTokens.toLocaleString()} tokens (approx)</span>
          </div>

          {hasChanges && (
            <div className="p-3 bg-warning/10 border border-warning/20 rounded-lg text-[12px] text-warning flex items-start gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>
                Saving changes will regenerate the embedding for this chunk.
              </span>
            </div>
          )}

          <ModalFooter className="flex-col sm:flex-row">
            <div className="flex-1">
              <Button
                variant="ghost"
                onClick={() => setShowDeleteConfirm(true)}
                className="text-error hover:bg-error/5"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete Chunk
              </Button>
            </div>
            <div className="flex gap-3">
              <Button variant="secondary" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                disabled={!hasChanges || !content.trim()}
                isLoading={updateChunk.isPending}
              >
                Save Changes
              </Button>
            </div>
          </ModalFooter>
        </div>
      )}
    </Modal>
  );
}
