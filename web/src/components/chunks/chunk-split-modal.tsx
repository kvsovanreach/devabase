'use client';

import { useState, useEffect, useMemo } from 'react';
import { Modal, ModalFooter } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Chunk } from '@/types';
import { useSplitChunk } from '@/hooks/use-chunks';
import { Scissors, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { cn } from '@/lib/utils';

interface ChunkSplitModalProps {
  isOpen: boolean;
  onClose: () => void;
  chunk: Chunk | null;
  documentId: string;
}

export function ChunkSplitModal({
  isOpen,
  onClose,
  chunk,
  documentId,
}: ChunkSplitModalProps) {
  const [splitPosition, setSplitPosition] = useState(50); // Percentage
  const splitChunk = useSplitChunk(documentId);

  useEffect(() => {
    // Reset to middle when chunk changes
    setSplitPosition(50);
  }, [chunk?.id]);

  const charCount = chunk?.content.length || 0;
  const splitAt = Math.floor((charCount * splitPosition) / 100);

  const preview = useMemo(() => {
    if (!chunk) return { first: '', second: '' };
    const chars = [...chunk.content];
    return {
      first: chars.slice(0, splitAt).join(''),
      second: chars.slice(splitAt).join(''),
    };
  }, [chunk, splitAt]);

  const handleSplit = async () => {
    if (!chunk || splitAt <= 0 || splitAt >= charCount) return;

    try {
      const result = await splitChunk.mutateAsync({
        chunkId: chunk.id,
        splitAt: splitAt,
      });
      toast.success(`Chunk split into ${result.chunks.length} chunks`);
      onClose();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to split chunk';
      toast.error(message);
    }
  };

  const isValidSplit = splitAt > 0 && splitAt < charCount;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Split Chunk #${(chunk?.chunk_index || 0) + 1}`}
      description="Split this chunk into two separate chunks."
      size="xl"
    >
      <div className="space-y-4">
        {/* Split Position Slider */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-[13px] font-medium text-foreground">
              Split Position
            </label>
            <span className="text-[12px] text-text-secondary">
              Character {splitAt.toLocaleString()} of {charCount.toLocaleString()}
            </span>
          </div>
          <input
            type="range"
            min={5}
            max={95}
            value={splitPosition}
            onChange={(e) => setSplitPosition(Number(e.target.value))}
            className="w-full h-2 bg-surface-secondary rounded-lg appearance-none cursor-pointer
              [&::-webkit-slider-thumb]:appearance-none
              [&::-webkit-slider-thumb]:w-4
              [&::-webkit-slider-thumb]:h-4
              [&::-webkit-slider-thumb]:rounded-full
              [&::-webkit-slider-thumb]:bg-primary
              [&::-webkit-slider-thumb]:cursor-pointer
              [&::-webkit-slider-thumb]:shadow-md"
          />
          <div className="flex items-center justify-between text-[11px] text-text-tertiary">
            <span>Chunk 1: {preview.first.length} chars</span>
            <Scissors className="w-4 h-4" />
            <span>Chunk 2: {preview.second.length} chars</span>
          </div>
        </div>

        {/* Preview */}
        <div className="space-y-3">
          <label className="text-[13px] font-medium text-foreground">Preview</label>
          <div className="grid grid-cols-2 gap-3">
            {/* First Chunk Preview */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-primary">Chunk 1</span>
                <span className="text-[10px] text-text-tertiary">
                  ~{Math.ceil(preview.first.length / 4)} tokens
                </span>
              </div>
              <div className="p-3 bg-surface-secondary rounded-lg h-[150px] overflow-y-auto">
                <p className="text-[12px] text-foreground whitespace-pre-wrap break-words leading-relaxed">
                  {preview.first}
                  <span className="bg-primary/30 text-primary">|</span>
                </p>
              </div>
            </div>

            {/* Second Chunk Preview */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-info">Chunk 2</span>
                <span className="text-[10px] text-text-tertiary">
                  ~{Math.ceil(preview.second.length / 4)} tokens
                </span>
              </div>
              <div className="p-3 bg-surface-secondary rounded-lg h-[150px] overflow-y-auto">
                <p className="text-[12px] text-foreground whitespace-pre-wrap break-words leading-relaxed">
                  <span className="bg-info/30 text-info">|</span>
                  {preview.second}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Warning */}
        <div className="p-3 bg-warning/10 border border-warning/20 rounded-lg text-[12px] text-warning flex items-start gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>
            Both new chunks will have embeddings generated. The original chunk will be modified.
          </span>
        </div>

        <ModalFooter>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSplit}
            disabled={!isValidSplit}
            isLoading={splitChunk.isPending}
          >
            <Scissors className="w-4 h-4 mr-2" />
            Split Chunk
          </Button>
        </ModalFooter>
      </div>
    </Modal>
  );
}
