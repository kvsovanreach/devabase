'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Header } from '@/components/layout/header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { EmptyState } from '@/components/ui/empty-state';
import { PageSpinner } from '@/components/ui/spinner';
import { ConfirmModal } from '@/components/ui/confirm-modal';
import { useConversations, useDeleteConversation } from '@/hooks/use-conversations';
import { useCollections } from '@/hooks/use-collections';
import {
  MessageSquare,
  Clock,
  Trash2,
  ArrowRight,
  Zap,
  FolderOpen,
  ChevronLeft,
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function ChatHistoryPage() {
  const router = useRouter();
  const { data: collections, isLoading: collectionsLoading } = useCollections();
  const [selectedCollection, setSelectedCollection] = useState<string>('');
  const [conversationToDelete, setConversationToDelete] = useState<string | null>(null);

  const { data: conversations, isLoading: conversationsLoading } = useConversations(
    selectedCollection ? { collection_id: selectedCollection } : undefined
  );
  const deleteMutation = useDeleteConversation();

  const collectionOptions = [
    { value: '', label: 'All Collections' },
    ...(collections || []).map((c) => ({
      value: c.id,
      label: c.name,
    })),
  ];

  const handleDelete = async () => {
    if (!conversationToDelete) return;

    try {
      await deleteMutation.mutateAsync(conversationToDelete);
      toast.success('Conversation deleted');
      setConversationToDelete(null);
    } catch {
      toast.error('Failed to delete conversation');
    }
  };

  const handleContinue = (conversationId: string, collectionName: string) => {
    // Navigate to RAG page with the conversation context
    router.push(`/rag?conversation=${conversationId}&collection=${collectionName}`);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) {
      return 'Today ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (days === 1) {
      return 'Yesterday ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (days < 7) {
      return date.toLocaleDateString([], { weekday: 'long' });
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
    }
  };

  const isLoading = collectionsLoading || conversationsLoading;

  return (
    <div>
      <Header />

      <div className="p-4 md:p-8">
        {/* Page Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push('/rag')}
              className="hidden md:flex"
            >
              <ChevronLeft className="w-4 h-4 mr-1" />
              Back to Chat
            </Button>
            <div>
              <h2 className="text-[22px] md:text-[26px] font-semibold text-foreground tracking-tight">
                Chat History
              </h2>
              <p className="text-[14px] md:text-[15px] text-text-secondary mt-1">
                Browse and continue previous RAG conversations.
              </p>
            </div>
          </div>
          <div className="w-[200px]">
            <Select
              options={collectionOptions}
              value={selectedCollection}
              onChange={(e) => setSelectedCollection(e.target.value)}
            />
          </div>
        </div>

        {isLoading ? (
          <PageSpinner />
        ) : !conversations || conversations.length === 0 ? (
          <EmptyState
            icon={<MessageSquare className="w-8 h-8" />}
            title="No Conversations Yet"
            description="Start a new RAG chat to see your conversation history here."
            action={
              <Button onClick={() => router.push('/rag')}>
                <MessageSquare className="w-4 h-4 mr-2" />
                Start Chatting
              </Button>
            }
          />
        ) : (
          <div className="space-y-3">
            {conversations.map((conv) => (
              <Card
                key={conv.id}
                className="p-4 hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => handleContinue(conv.id, conv.collection_name)}
              >
                <div className="flex items-start gap-4">
                  {/* Icon */}
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <MessageSquare className="w-5 h-5 text-primary" />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <h3 className="text-[15px] font-medium text-foreground truncate">
                          {conv.title || 'Untitled Conversation'}
                        </h3>
                        <div className="flex items-center gap-3 mt-1.5">
                          <div className="flex items-center gap-1.5 text-[12px] text-text-tertiary">
                            <FolderOpen className="w-3.5 h-3.5" />
                            {conv.collection_name}
                          </div>
                          <div className="flex items-center gap-1.5 text-[12px] text-text-tertiary">
                            <Clock className="w-3.5 h-3.5" />
                            {formatDate(conv.updated_at)}
                          </div>
                        </div>
                      </div>

                      {/* Stats & Actions */}
                      <div className="flex items-center gap-3">
                        <div className="hidden sm:flex items-center gap-4">
                          <div className="text-center">
                            <div className="text-[13px] font-medium text-foreground">
                              {conv.message_count}
                            </div>
                            <div className="text-[10px] text-text-tertiary">messages</div>
                          </div>
                          <div className="text-center">
                            <div className="text-[13px] font-medium text-foreground flex items-center gap-1">
                              <Zap className="w-3 h-3 text-info" />
                              {conv.total_tokens.toLocaleString()}
                            </div>
                            <div className="text-[10px] text-text-tertiary">tokens</div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              setConversationToDelete(conv.id);
                            }}
                            className="text-text-tertiary hover:text-error"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                          <Button variant="secondary" size="sm">
                            Continue
                            <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                          </Button>
                        </div>
                      </div>
                    </div>

                    {conv.summary && (
                      <p className="text-[13px] text-text-secondary mt-2 line-clamp-2">
                        {conv.summary}
                      </p>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Delete Confirmation */}
      <ConfirmModal
        isOpen={!!conversationToDelete}
        onClose={() => setConversationToDelete(null)}
        onConfirm={handleDelete}
        title="Delete Conversation"
        description="Are you sure you want to delete this conversation? This action cannot be undone."
        confirmText="Delete"
        variant="danger"
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
}
