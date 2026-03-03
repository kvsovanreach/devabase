'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, User, Bot, FileText, ChevronDown, ChevronRight, Sparkles } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Markdown } from '@/components/ui/markdown';
import { ChatMessage, ChatSource } from '@/types';
import { streamRag } from '@/hooks/use-rag';
import { cn } from '@/lib/utils';

interface RagChatPreviewProps {
  collectionName: string;
  isOpen: boolean;
  onClose: () => void;
}

interface MessageWithThinking extends ChatMessage {
  thinking?: string;
  isThinkingExpanded?: boolean;
}

export function RagChatPreview({ collectionName, isOpen, onClose }: RagChatPreviewProps) {
  const [messages, setMessages] = useState<MessageWithThinking[]>([]);
  const [input, setInput] = useState('');
  const [sources, setSources] = useState<ChatSource[]>([]);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [streamingThinking, setStreamingThinking] = useState('');
  const [isThinkingPhase, setIsThinkingPhase] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Use refs to track accumulated content for the onDone callback
  const contentRef = useRef('');
  const thinkingRef = useRef('');

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent, streamingThinking]);

  const handleSend = async () => {
    if (!input.trim() || isStreaming) return;

    const userMessage = input.trim();
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: userMessage }]);
    setSources([]);
    setIsStreaming(true);
    setStreamingContent('');
    setStreamingThinking('');
    setIsThinkingPhase(false);

    // Reset refs
    contentRef.current = '';
    thinkingRef.current = '';

    try {
      await streamRag(
        {
          collection: collectionName,
          message: userMessage,
          conversation_id: conversationId,
          include_sources: true,
        },
        {
          onSources: (newSources) => {
            // Map streaming source format to ChatSource format
            const mappedSources: ChatSource[] = newSources.map((s) => ({
              document_id: s.document_id,
              document_name: s.document_name,
              chunk_content: s.content,
              relevance_score: s.score,
            }));
            setSources(mappedSources);
          },
          onThinking: (thinking) => {
            setIsThinkingPhase(true);
            thinkingRef.current = thinking;
            setStreamingThinking(thinking);
          },
          onContent: (content) => {
            setIsThinkingPhase(false);
            contentRef.current += content;
            setStreamingContent(contentRef.current);
          },
          onDone: (newConversationId) => {
            setConversationId(newConversationId || undefined);
            // Add the complete message using refs for accurate values
            const finalContent = contentRef.current;
            const finalThinking = thinkingRef.current;
            setMessages((prev) => [
              ...prev,
              {
                role: 'assistant',
                content: finalContent || '',
                thinking: finalThinking || undefined,
                isThinkingExpanded: false,
              },
            ]);
            setStreamingContent('');
            setStreamingThinking('');
            setIsStreaming(false);
          },
          onError: (error) => {
            setMessages((prev) => [
              ...prev,
              { role: 'assistant', content: `Error: ${error}` },
            ]);
            setIsStreaming(false);
          },
        }
      );
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Sorry, I encountered an error. Please try again.' },
      ]);
      setIsStreaming(false);
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
    setIsStreaming(false);
    setStreamingContent('');
    setStreamingThinking('');
    onClose();
  };

  const toggleThinking = (index: number) => {
    setMessages((prev) =>
      prev.map((msg, i) =>
        i === index ? { ...msg, isThinkingExpanded: !msg.isThinkingExpanded } : msg
      )
    );
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Test RAG Chat">
      <div className="flex flex-col h-[500px]">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto space-y-4 mb-4 pr-2">
          {messages.length === 0 && !isStreaming ? (
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
            <>
              {messages.map((message, index) => (
                <div key={index}>
                  <div
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
                    <div className="max-w-[80%] flex flex-col gap-2">
                      {/* Thinking block (collapsible) */}
                      {message.role === 'assistant' && message.thinking && (
                        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg overflow-hidden">
                          <button
                            onClick={() => toggleThinking(index)}
                            className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors"
                          >
                            {message.isThinkingExpanded ? (
                              <ChevronDown className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                            ) : (
                              <ChevronRight className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                            )}
                            <Sparkles className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                            <span className="text-[13px] font-medium text-amber-700 dark:text-amber-300">
                              Thinking
                            </span>
                          </button>
                          {message.isThinkingExpanded && (
                            <div className="px-3 pb-3 pt-1 text-[13px] text-amber-800 dark:text-amber-200 whitespace-pre-wrap border-t border-amber-200 dark:border-amber-800">
                              {message.thinking}
                            </div>
                          )}
                        </div>
                      )}
                      {/* Main content */}
                      <div
                        className={cn(
                          'px-4 py-3 rounded-2xl text-[14px]',
                          message.role === 'user'
                            ? 'bg-primary text-white rounded-br-md'
                            : 'bg-surface-secondary text-foreground rounded-bl-md'
                        )}
                      >
                        {message.role === 'assistant' ? (
                          <Markdown content={message.content} />
                        ) : (
                          <p className="whitespace-pre-wrap">{message.content}</p>
                        )}
                      </div>
                    </div>
                    {message.role === 'user' && (
                      <div className="w-8 h-8 rounded-full bg-surface-secondary flex items-center justify-center flex-shrink-0">
                        <User className="w-4 h-4 text-text-secondary" />
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {/* Streaming message */}
              {isStreaming && (
                <div className="flex gap-3 justify-start">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Bot className="w-4 h-4 text-primary" />
                  </div>
                  <div className="max-w-[80%] flex flex-col gap-2">
                    {/* Streaming thinking block */}
                    {isThinkingPhase && streamingThinking && (
                      <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
                        <div className="flex items-center gap-2 mb-2">
                          <Spinner size="sm" className="text-amber-600 dark:text-amber-400" />
                          <Sparkles className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                          <span className="text-[13px] font-medium text-amber-700 dark:text-amber-300">
                            Thinking...
                          </span>
                        </div>
                        <p className="text-[13px] text-amber-800 dark:text-amber-200 whitespace-pre-wrap">
                          {streamingThinking}
                        </p>
                      </div>
                    )}
                    {/* Streaming content */}
                    {(streamingContent || !isThinkingPhase) && (
                      <div className="px-4 py-3 bg-surface-secondary rounded-2xl rounded-bl-md text-[14px]">
                        {streamingContent ? (
                          <Markdown content={streamingContent} />
                        ) : (
                          <div className="flex items-center gap-2 text-text-secondary">
                            <Spinner size="sm" />
                            Generating response...
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
          <div ref={messagesEndRef} />
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
            disabled={!input.trim() || isStreaming}
            className="h-auto"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </Modal>
  );
}
