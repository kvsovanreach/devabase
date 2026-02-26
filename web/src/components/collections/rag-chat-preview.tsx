'use client';

import { useState } from 'react';
import { Send, User, Bot, FileText, X } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { ChatMessage, ChatSource } from '@/types';
import { useRagChat } from '@/hooks/use-rag';
import { cn } from '@/lib/utils';

interface RagChatPreviewProps {
  collectionName: string;
  isOpen: boolean;
  onClose: () => void;
}

export function RagChatPreview({ collectionName, isOpen, onClose }: RagChatPreviewProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sources, setSources] = useState<ChatSource[]>([]);
  const [conversationId, setConversationId] = useState<string | undefined>();

  const chatMutation = useRagChat();

  const handleSend = async () => {
    if (!input.trim() || chatMutation.isPending) return;

    const userMessage = input.trim();
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: userMessage }]);
    setSources([]);

    try {
      const response = await chatMutation.mutateAsync({
        collectionName,
        request: {
          message: userMessage,
          conversation_id: conversationId,
          include_sources: true,
        },
      });

      setMessages((prev) => [...prev, { role: 'assistant', content: response.answer }]);
      setSources(response.sources);
      setConversationId(response.conversation_id);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Sorry, I encountered an error. Please try again.' },
      ]);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleClose = () => {
    setMessages([]);
    setInput('');
    setSources([]);
    setConversationId(undefined);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Test RAG Chat">
      <div className="flex flex-col h-[500px]">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto space-y-4 mb-4 pr-2">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <Bot className="w-12 h-12 text-text-tertiary mb-4" />
              <p className="text-[15px] text-text-secondary mb-1">
                Test your RAG API
              </p>
              <p className="text-[13px] text-text-tertiary">
                Ask a question about your documents in "{collectionName}"
              </p>
            </div>
          ) : (
            messages.map((message, index) => (
              <div
                key={index}
                className={cn(
                  'flex gap-3',
                  message.role === 'user' ? 'justify-end' : 'justify-start'
                )}
              >
                {message.role === 'assistant' && (
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Bot className="w-4 h-4 text-primary" />
                  </div>
                )}
                <div
                  className={cn(
                    'max-w-[80%] px-4 py-3 rounded-2xl text-[14px]',
                    message.role === 'user'
                      ? 'bg-primary text-white rounded-br-md'
                      : 'bg-surface-secondary text-foreground rounded-bl-md'
                  )}
                >
                  <p className="whitespace-pre-wrap">{message.content}</p>
                </div>
                {message.role === 'user' && (
                  <div className="w-8 h-8 rounded-full bg-surface-secondary flex items-center justify-center flex-shrink-0">
                    <User className="w-4 h-4 text-text-secondary" />
                  </div>
                )}
              </div>
            ))
          )}

          {chatMutation.isPending && (
            <div className="flex gap-3 justify-start">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Bot className="w-4 h-4 text-primary" />
              </div>
              <div className="px-4 py-3 bg-surface-secondary rounded-2xl rounded-bl-md">
                <div className="flex items-center gap-2 text-[14px] text-text-secondary">
                  <Spinner size="sm" />
                  Thinking...
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Sources */}
        {sources.length > 0 && (
          <div className="mb-4 p-3 bg-surface-secondary rounded-lg">
            <div className="text-[12px] font-medium text-text-secondary mb-2">
              Sources ({sources.length})
            </div>
            <div className="space-y-2">
              {sources.slice(0, 3).map((source, index) => (
                <div
                  key={index}
                  className="flex items-start gap-2 p-2 bg-surface rounded border border-border-light"
                >
                  <FileText className="w-4 h-4 text-text-tertiary flex-shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[12px] font-medium text-foreground truncate">
                      {source.document_name}
                    </div>
                    <p className="text-[11px] text-text-tertiary line-clamp-2 mt-0.5">
                      {source.chunk_content}
                    </p>
                    <div className="text-[10px] text-primary mt-1">
                      Relevance: {(source.relevance_score * 100).toFixed(0)}%
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Input */}
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask a question..."
              rows={1}
              className="w-full px-4 py-3 pr-12 bg-surface-secondary border border-border-light rounded-xl text-[14px] text-foreground placeholder:text-text-tertiary focus:outline-none focus:border-primary resize-none"
            />
          </div>
          <Button
            onClick={handleSend}
            disabled={!input.trim() || chatMutation.isPending}
            className="h-auto"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </Modal>
  );
}
