'use client';

import { useState, useMemo } from 'react';
import { Modal, ModalFooter } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Chunk } from '@/types';
import { useMergeChunks } from '@/hooks/use-chunks';
import { Combine, AlertCircle, Check } from 'lucide-react';
import toast from 'react-hot-toast';
import { cn } from '@/lib/utils';

interface ChunkMergeModalProps {
  isOpen: boolean;
  onClose: () => void;
  chunks: Chunk[];
  selectedChunkIds: string[];
  documentId: string;
  onSelectionChange: (ids: string[]) => void;
}

export function ChunkMergeModal({
  isOpen,
  onClose,
  chunks,
  selectedChunkIds,
  documentId,
  onSelectionChange,
}: ChunkMergeModalProps) {
  const [separator, setSeparator] = useState('\n\n');
  const mergeChunks = useMergeChunks(documentId);

  // Get selected chunks in order
  const selectedChunks = useMemo(() => {
    return chunks
      .filter((c) => selectedChunkIds.includes(c.id))
      .sort((a, b) => a.chunk_index - b.chunk_index);
  }, [chunks, selectedChunkIds]);

  // Preview merged content
  const mergedContent = useMemo(() => {
    return selectedChunks.map((c) => c.content).join(separator);
  }, [selectedChunks, separator]);

  const handleMerge = async () => {
    if (selectedChunkIds.length < 2) return;

    try {
      const result = await mergeChunks.mutateAsync({
        chunk_ids: selectedChunkIds,
        separator,
      });
      toast.success(`Merged ${result.merged_count} chunks into one`);
      onSelectionChange([]);
      onClose();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to merge chunks';
      toast.error(message);
    }
  };

  const toggleChunk = (chunkId: string) => {
    if (selectedChunkIds.includes(chunkId)) {
      onSelectionChange(selectedChunkIds.filter((id) => id !== chunkId));
    } else {
      onSelectionChange([...selectedChunkIds, chunkId]);
    }
  };

  const canMerge = selectedChunkIds.length >= 2;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Merge Chunks"
      description="Combine multiple chunks into a single chunk."
      size="xl"
    >
      <div className="space-y-4">
        {/* Chunk Selection */}
        <div className="space-y-2">
          <label className="text-[13px] font-medium text-foreground">
            Select chunks to merge ({selectedChunkIds.length} selected)
          </label>
          <div className="max-h-[200px] overflow-y-auto border border-border-light rounded-lg divide-y divide-border-light">
            {chunks.map((chunk) => {
              const isSelected = selectedChunkIds.includes(chunk.id);
              return (
                <button
                  key={chunk.id}
                  onClick={() => toggleChunk(chunk.id)}
                  className={cn(
                    'w-full flex items-start gap-3 p-3 text-left transition-colors',
                    isSelected ? 'bg-primary/5' : 'hover:bg-surface-hover'
                  )}
                >
                  <div
                    className={cn(
                      'w-5 h-5 rounded border flex items-center justify-center flex-shrink-0 mt-0.5',
                      isSelected
                        ? 'bg-primary border-primary'
                        : 'border-border-light'
                    )}
                  >
                    {isSelected && <Check className="w-3 h-3 text-white" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[12px] font-semibold text-foreground">
                        Chunk #{chunk.chunk_index + 1}
                      </span>
                      <span className="text-[11px] text-text-tertiary">
                        {chunk.token_count} tokens
                      </span>
                    </div>
                    <p className="text-[12px] text-text-secondary line-clamp-2">
                      {chunk.content}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Separator */}
        <div>
          <Input
            label="Separator"
            value={separator}
            onChange={(e) => setSeparator(e.target.value)}
            placeholder="Enter separator between chunks"
            helperText="Use \\n for newline. Default is two newlines."
          />
        </div>

        {/* Preview */}
        {canMerge && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[13px] font-medium text-foreground">
                Preview
              </label>
              <span className="text-[11px] text-text-tertiary">
                {mergedContent.length.toLocaleString()} chars · ~{Math.ceil(mergedContent.length / 4).toLocaleString()} tokens
              </span>
            </div>
            <div className="p-3 bg-surface-secondary rounded-lg max-h-[150px] overflow-y-auto">
              <p className="text-[12px] text-foreground whitespace-pre-wrap break-words leading-relaxed">
                {mergedContent.slice(0, 500)}
                {mergedContent.length > 500 && (
                  <span className="text-text-tertiary">... ({mergedContent.length - 500} more chars)</span>
                )}
              </p>
            </div>
          </div>
        )}

        {/* Warning */}
        {canMerge && (
          <div className="p-3 bg-warning/10 border border-warning/20 rounded-lg text-[12px] text-warning flex items-start gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>
              The first selected chunk will be updated with merged content. Other selected chunks will be deleted.
            </span>
          </div>
        )}

        <ModalFooter>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleMerge}
            disabled={!canMerge}
            isLoading={mergeChunks.isPending}
          >
            <Combine className="w-4 h-4 mr-2" />
            Merge {selectedChunkIds.length} Chunks
          </Button>
        </ModalFooter>
      </div>
    </Modal>
  );
}
