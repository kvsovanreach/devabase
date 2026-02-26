'use client';

import { useState, useMemo } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { PageSpinner } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { useDocument, useDocumentChunks } from '@/hooks/use-documents';
import {
  ChevronLeft,
  FileText,
  Hash,
  Layers,
  Clock,
  Search,
  Copy,
  Check,
  Zap,
  AlignLeft,
} from 'lucide-react';
import { cn, formatFileSize, formatRelativeTime } from '@/lib/utils';
import toast from 'react-hot-toast';

export default function DocumentViewerPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const documentId = params.id as string;
  const collectionName = searchParams.get('collection') || '';

  const { data: document, isLoading: documentLoading } = useDocument(collectionName, documentId);
  const { data: chunks, isLoading: chunksLoading } = useDocumentChunks(documentId);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedChunkId, setSelectedChunkId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Filter chunks based on search query
  const filteredChunks = useMemo(() => {
    if (!chunks) return [];
    if (!searchQuery.trim()) return chunks;

    return chunks.filter((chunk) =>
      chunk.content.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [chunks, searchQuery]);

  // Highlight search terms in content
  const highlightContent = (content: string) => {
    if (!searchQuery.trim()) return content;

    const regex = new RegExp(`(${searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    const parts = content.split(regex);

    return parts.map((part, index) =>
      regex.test(part) ? (
        <mark key={index} className="bg-warning/30 text-foreground px-0.5 rounded">
          {part}
        </mark>
      ) : (
        part
      )
    );
  };

  const copyChunkContent = (chunkId: string, content: string) => {
    navigator.clipboard.writeText(content);
    setCopiedId(chunkId);
    toast.success('Chunk content copied');
    setTimeout(() => setCopiedId(null), 2000);
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, 'success' | 'warning' | 'error' | 'default'> = {
      processed: 'success',
      processing: 'warning',
      pending: 'default',
      failed: 'error',
    };
    return <Badge variant={variants[status] || 'default'}>{status}</Badge>;
  };

  const isLoading = documentLoading || chunksLoading;

  if (isLoading) {
    return (
      <div>
        <Header />
        <PageSpinner />
      </div>
    );
  }

  if (!document) {
    return (
      <div>
        <Header />
        <div className="p-4 md:p-8">
          <EmptyState
            icon={<FileText className="w-8 h-8" />}
            title="Document not found"
            description="The document you're looking for doesn't exist or has been deleted."
            action={
              <Button onClick={() => router.push('/documents')}>
                <ChevronLeft className="w-4 h-4 mr-2" />
                Back to Documents
              </Button>
            }
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <div className="p-4 md:p-8">
        {/* Back Button */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push('/documents')}
          className="mb-4"
        >
          <ChevronLeft className="w-4 h-4 mr-1" />
          Back to Documents
        </Button>

        {/* Document Header */}
        <Card className="p-5 mb-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
              <FileText className="w-6 h-6 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 flex-wrap mb-2">
                <h1 className="text-[20px] md:text-[24px] font-semibold text-foreground truncate">
                  {document.filename}
                </h1>
                {getStatusBadge(document.status)}
              </div>
              <div className="flex flex-wrap items-center gap-4 text-[13px] text-text-secondary">
                <div className="flex items-center gap-1.5">
                  <Hash className="w-4 h-4" />
                  <span className="font-mono">{document.id.slice(0, 8)}...</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <AlignLeft className="w-4 h-4" />
                  {formatFileSize(document.file_size)}
                </div>
                <div className="flex items-center gap-1.5">
                  <Layers className="w-4 h-4" />
                  {document.chunk_count} chunks
                </div>
                <div className="flex items-center gap-1.5">
                  <Clock className="w-4 h-4" />
                  {formatRelativeTime(document.created_at)}
                </div>
              </div>
              {document.error_message && (
                <p className="text-[13px] text-error mt-2">{document.error_message}</p>
              )}
            </div>
          </div>
        </Card>

        {/* Chunks Section */}
        <div className="space-y-4">
          {/* Section Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-[16px] font-semibold text-foreground">
                Document Chunks
              </h2>
              <p className="text-[13px] text-text-secondary mt-0.5">
                {chunks?.length || 0} chunks extracted from this document
              </p>
            </div>
            <div className="w-full sm:w-[280px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary" />
                <Input
                  placeholder="Search in chunks..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
          </div>

          {/* Stats */}
          {chunks && chunks.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Card className="p-3">
                <div className="flex items-center gap-2 mb-1">
                  <Layers className="w-4 h-4 text-primary" />
                  <span className="text-[12px] text-text-secondary">Total Chunks</span>
                </div>
                <p className="text-[18px] font-bold text-foreground">{chunks.length}</p>
              </Card>
              <Card className="p-3">
                <div className="flex items-center gap-2 mb-1">
                  <Zap className="w-4 h-4 text-info" />
                  <span className="text-[12px] text-text-secondary">Total Tokens</span>
                </div>
                <p className="text-[18px] font-bold text-foreground">
                  {chunks.reduce((sum, c) => sum + c.token_count, 0).toLocaleString()}
                </p>
              </Card>
              <Card className="p-3">
                <div className="flex items-center gap-2 mb-1">
                  <AlignLeft className="w-4 h-4 text-success" />
                  <span className="text-[12px] text-text-secondary">Avg. Length</span>
                </div>
                <p className="text-[18px] font-bold text-foreground">
                  {Math.round(chunks.reduce((sum, c) => sum + c.content.length, 0) / chunks.length)} chars
                </p>
              </Card>
              <Card className="p-3">
                <div className="flex items-center gap-2 mb-1">
                  <Search className="w-4 h-4 text-warning" />
                  <span className="text-[12px] text-text-secondary">Matches</span>
                </div>
                <p className="text-[18px] font-bold text-foreground">
                  {searchQuery ? filteredChunks.length : '-'}
                </p>
              </Card>
            </div>
          )}

          {/* Chunks List */}
          {!chunks || chunks.length === 0 ? (
            <EmptyState
              icon={<Layers className="w-8 h-8" />}
              title="No chunks yet"
              description="This document hasn't been processed into chunks yet."
            />
          ) : filteredChunks.length === 0 ? (
            <EmptyState
              icon={<Search className="w-8 h-8" />}
              title="No matches found"
              description="Try a different search term."
            />
          ) : (
            <div className="space-y-3">
              {filteredChunks.map((chunk) => (
                <Card
                  key={chunk.id}
                  className={cn(
                    'p-4 cursor-pointer transition-all',
                    selectedChunkId === chunk.id
                      ? 'ring-2 ring-primary shadow-lg'
                      : 'hover:shadow-md'
                  )}
                  onClick={() => setSelectedChunkId(selectedChunkId === chunk.id ? null : chunk.id)}
                >
                  <div className="flex items-start gap-3">
                    {/* Chunk Index */}
                    <div className="w-8 h-8 rounded-lg bg-surface-secondary flex items-center justify-center flex-shrink-0">
                      <span className="text-[12px] font-semibold text-text-secondary">
                        {chunk.chunk_index + 1}
                      </span>
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2 text-[11px] text-text-tertiary">
                          <span>Offset: {chunk.start_offset} - {chunk.end_offset}</span>
                          <span>·</span>
                          <span>{chunk.token_count} tokens</span>
                          <span>·</span>
                          <span>{chunk.content.length} chars</span>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            copyChunkContent(chunk.id, chunk.content);
                          }}
                          className="p-1.5 text-text-tertiary hover:text-foreground rounded transition-colors"
                          title="Copy chunk content"
                        >
                          {copiedId === chunk.id ? (
                            <Check className="w-4 h-4 text-success" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                      <p
                        className={cn(
                          'text-[14px] text-foreground leading-relaxed whitespace-pre-wrap',
                          selectedChunkId !== chunk.id && 'line-clamp-3'
                        )}
                      >
                        {highlightContent(chunk.content)}
                      </p>
                      {selectedChunkId !== chunk.id && chunk.content.length > 300 && (
                        <span className="text-[12px] text-primary mt-1 inline-block">
                          Click to expand...
                        </span>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
