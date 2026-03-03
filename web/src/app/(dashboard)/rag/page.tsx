'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { PageSpinner } from '@/components/ui/spinner';
import { Spinner } from '@/components/ui/spinner';
import { Badge } from '@/components/ui/badge';
import { Markdown } from '@/components/ui/markdown';
import { RagConfigModal } from '@/components/collections/rag-config-modal';
import { useCollections } from '@/hooks/use-collections';
import { useDisableRag, streamRagChat, streamMultiRagChat } from '@/hooks/use-rag';
import { useConversation } from '@/hooks/use-conversations';
import { ChatMessage, ChatSource, ProjectSettings } from '@/types';
import { useProjectStore } from '@/stores/project-store';
import { API_CONFIG } from '@/lib/config';
import {
  MessageSquare,
  Send,
  User,
  Bot,
  FileText,
  Settings,
  Sparkles,
  Copy,
  Check,
  Trash2,
  History,
  FolderOpen,
  Layers,
  Power,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';

type ChatMode = 'single' | 'multi';

// Extended source type for multi-collection
interface ExtendedSource extends ChatSource {
  collection_name?: string;
}

// Extended message type with thinking support
interface MessageWithThinking extends ChatMessage {
  thinking?: string;
  isThinkingExpanded?: boolean;
}

export default function RagPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: collections, isLoading: collectionsLoading } = useCollections();
  const { currentProject } = useProjectStore();

  // Chat mode
  const [chatMode, setChatMode] = useState<ChatMode>('single');

  // Single collection state
  const [selectedCollection, setSelectedCollection] = useState('');

  // Multi-collection state
  const [selectedCollections, setSelectedCollections] = useState<string[]>([]);

  // Common state
  const [messages, setMessages] = useState<MessageWithThinking[]>([]);
  const [input, setInput] = useState('');
  const [sources, setSources] = useState<ExtendedSource[]>([]);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [collectionsUsed, setCollectionsUsed] = useState<string[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Streaming state
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [streamingThinking, setStreamingThinking] = useState('');
  const [isThinkingPhase, setIsThinkingPhase] = useState(false);
  const contentRef = useRef('');
  const thinkingRef = useRef('');

  // Check for conversation continuation from URL params
  const urlConversationId = searchParams.get('conversation');
  const urlCollectionName = searchParams.get('collection');

  // Fetch conversation if continuing
  const { data: existingConversation } = useConversation(urlConversationId ?? undefined);

  const disableRagMutation = useDisableRag();

  // Get LLM providers from project settings
  const projectSettings = currentProject?.settings as unknown as ProjectSettings | undefined;
  const llmProviders = projectSettings?.llm_providers || [];

  // Get RAG-enabled collections
  const ragEnabledCollections = (collections || []).filter((c) => c.rag_enabled);

  // Get collection options with RAG status
  const collectionOptions = (collections || []).map((c) => ({
    value: c.name,
    label: `${c.name}${c.rag_enabled ? ' (RAG enabled)' : ''}`,
  }));

  // Get selected collection data (for single mode)
  const selectedCollectionData = collections?.find((c) => c.name === selectedCollection);
  const ragConfig = selectedCollectionData?.rag_config;
  const isRagEnabled = selectedCollectionData?.rag_enabled === true;

  // Auto-select first collection with RAG enabled
  useEffect(() => {
    if (collections && collections.length > 0 && !selectedCollection) {
      if (urlCollectionName) {
        const urlCollection = collections.find((c) => c.name === urlCollectionName);
        if (urlCollection) {
          setSelectedCollection(urlCollection.name);
          return;
        }
      }
      const enabledCollection = collections.find((c) => c.rag_enabled === true);
      setSelectedCollection(enabledCollection?.name || collections[0].name);
    }
  }, [collections, selectedCollection, urlCollectionName]);

  // Load existing conversation when continuing
  useEffect(() => {
    if (existingConversation && existingConversation.messages) {
      const loadedMessages: ChatMessage[] = existingConversation.messages.map((msg) => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      }));
      setMessages(loadedMessages);
      setConversationId(existingConversation.id);

      const lastAssistant = existingConversation.messages
        .filter((m) => m.role === 'assistant')
        .pop();
      if (lastAssistant?.sources) {
        setSources(lastAssistant.sources);
      }
    }
  }, [existingConversation]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent, streamingThinking]);

  const handleSend = async () => {
    if (!input.trim() || isStreaming) return;

    const userMessage = input.trim();
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: userMessage }]);
    setSources([]);
    setCollectionsUsed([]);

    // Use streaming for both single and multi-collection
    setIsStreaming(true);
    setStreamingContent('');
    setStreamingThinking('');
    setIsThinkingPhase(false);
    contentRef.current = '';
    thinkingRef.current = '';

    try {
      if (chatMode === 'single') {
        if (!selectedCollection) return;

        await streamRagChat(
          selectedCollection,
          {
            message: userMessage,
            conversation_id: conversationId,
            include_sources: true,
          },
          {
            onSources: (newSources) => {
              // Map streaming source format to ExtendedSource format
              const mappedSources: ExtendedSource[] = newSources.map((s) => ({
                document_id: s.document_id,
                document_name: s.document_name,
                chunk_content: s.content,
                relevance_score: s.score,
                collection_name: s.collection,
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
              setCollectionsUsed([selectedCollection]);
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
      } else {
        if (selectedCollections.length === 0) return;

        await streamMultiRagChat(
          {
            collections: selectedCollections,
            message: userMessage,
            include_sources: true,
            top_k: 10,
          },
          {
            onSources: (newSources) => {
              // Convert to extended format
              const extendedSources: ExtendedSource[] = newSources.map((s) => ({
                document_id: s.document_id,
                document_name: s.document_name,
                chunk_content: s.content,
                relevance_score: s.score,
                collection_name: s.collection,
              }));
              setSources(extendedSources);
              // Extract unique collections from sources
              const usedCollections = [...new Set(newSources.map((s) => s.collection))];
              setCollectionsUsed(usedCollections);
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
            onDone: () => {
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
      }
    } catch {
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

  const handleClearChat = () => {
    setMessages([]);
    setSources([]);
    setConversationId(undefined);
    setCollectionsUsed([]);
    setStreamingContent('');
    setStreamingThinking('');
    setIsStreaming(false);
  };

  const toggleThinking = (index: number) => {
    setMessages((prev) =>
      prev.map((msg, i) =>
        i === index ? { ...msg, isThinkingExpanded: !msg.isThinkingExpanded } : msg
      )
    );
  };

  const handleCollectionChange = (name: string) => {
    setSelectedCollection(name);
    handleClearChat();
  };

  const handleModeChange = (mode: ChatMode) => {
    setChatMode(mode);
    handleClearChat();
  };

  const toggleMultiCollection = (name: string) => {
    setSelectedCollections((prev) =>
      prev.includes(name) ? prev.filter((c) => c !== name) : [...prev, name]
    );
  };

  const selectAllRagCollections = () => {
    setSelectedCollections(ragEnabledCollections.map((c) => c.name));
  };

  const copyEndpoint = () => {
    const endpoint = `${API_CONFIG.baseUrl}/v1/rag`;
    navigator.clipboard.writeText(endpoint);
    setCopied(true);
    toast.success('Endpoint copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  };

  const isPending = isStreaming;
  const canChat =
    chatMode === 'single'
      ? selectedCollection && isRagEnabled
      : selectedCollections.length > 0 && selectedCollections.some((name) =>
          ragEnabledCollections.some((c) => c.name === name)
        );

  if (collectionsLoading) {
    return (
      <div>
        <Header />
        <PageSpinner />
      </div>
    );
  }

  if (!collections || collections.length === 0) {
    return (
      <div>
        <Header />
        <div className="p-4 md:p-8">
          <EmptyState
            icon={<MessageSquare className="w-8 h-8" />}
            title="No Collections"
            description="Create a collection and upload documents to use RAG Chat."
            action={
              <Button onClick={() => (window.location.href = '/collections')}>
                Go to Collections
              </Button>
            }
          />
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col">
      <Header />

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <aside className="w-[300px] border-r border-border-light bg-surface-secondary flex flex-col hidden md:flex">
          {/* Mode Toggle */}
          <div className="p-4 border-b border-border-light">
            <div className="flex gap-2">
              <button
                onClick={() => handleModeChange('single')}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-[13px] font-medium transition-all',
                  chatMode === 'single'
                    ? 'bg-primary text-white'
                    : 'bg-surface text-text-secondary hover:text-foreground'
                )}
              >
                <FolderOpen className="w-4 h-4" />
                Single
              </button>
              <button
                onClick={() => handleModeChange('multi')}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-[13px] font-medium transition-all',
                  chatMode === 'multi'
                    ? 'bg-primary text-white'
                    : 'bg-surface text-text-secondary hover:text-foreground'
                )}
              >
                <Layers className="w-4 h-4" />
                Multi
              </button>
            </div>
          </div>

          {/* Collection Selector */}
          <div className="p-4 border-b border-border-light">
            {chatMode === 'single' ? (
              <Select
                label="Collection"
                options={collectionOptions}
                value={selectedCollection}
                onChange={(e) => handleCollectionChange(e.target.value)}
              />
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-medium text-foreground">
                    Collections ({selectedCollections.length})
                  </span>
                  <button
                    onClick={selectAllRagCollections}
                    className="text-[11px] text-primary hover:underline"
                  >
                    Select RAG Enabled
                  </button>
                </div>
                <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
                  {collections.map((collection) => {
                    const isSelected = selectedCollections.includes(collection.name);
                    const hasRag = collection.rag_enabled;
                    return (
                      <button
                        key={collection.name}
                        onClick={() => toggleMultiCollection(collection.name)}
                        disabled={!hasRag}
                        className={cn(
                          'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[13px] text-left transition-all',
                          hasRag
                            ? isSelected
                              ? 'bg-primary/10 border border-primary text-primary'
                              : 'bg-surface border border-border-light text-foreground hover:border-primary'
                            : 'bg-surface-secondary/50 border border-border-light text-text-tertiary cursor-not-allowed'
                        )}
                      >
                        {isSelected && <Check className="w-3.5 h-3.5 flex-shrink-0" />}
                        <FolderOpen className="w-3.5 h-3.5 flex-shrink-0" />
                        <span className="truncate flex-1">{collection.name}</span>
                        {hasRag ? (
                          <Badge variant="success" className="text-[9px] px-1.5">
                            RAG
                          </Badge>
                        ) : (
                          <Badge variant="default" className="text-[9px] px-1.5">
                            No RAG
                          </Badge>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* RAG Status / Info */}
          <div className="p-4 flex-1 overflow-y-auto">
            <div className="space-y-4">
              {/* Status Card */}
              {chatMode === 'single' && selectedCollection && (
                <Card className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[13px] font-medium text-foreground">RAG API</span>
                    {isRagEnabled ? (
                      <Badge variant="success">Enabled</Badge>
                    ) : (
                      <Badge variant="default">Disabled</Badge>
                    )}
                  </div>

                  {isRagEnabled && ragConfig && (
                    <div className="space-y-2 text-[12px] text-text-secondary">
                      <div className="flex justify-between">
                        <span>Provider:</span>
                        <span className="text-foreground">
                          {llmProviders.find((p) => p.id === ragConfig.llm_provider_id)?.name ||
                            'Unknown'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Model:</span>
                        <span className="text-foreground">{ragConfig.model}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Top K:</span>
                        <span className="text-foreground">{ragConfig.top_k}</span>
                      </div>
                    </div>
                  )}

                  {isRagEnabled ? (
                    <div className="flex gap-2 mt-3">
                      <Button
                        variant="secondary"
                        size="sm"
                        className="flex-1"
                        onClick={() => setIsConfigModalOpen(true)}
                      >
                        <Settings className="w-3.5 h-3.5 mr-1.5" />
                        Configure
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-error hover:bg-error/10"
                        onClick={() => disableRagMutation.mutate(selectedCollection)}
                        disabled={disableRagMutation.isPending}
                      >
                        {disableRagMutation.isPending ? (
                          <Spinner size="sm" />
                        ) : (
                          <Power className="w-3.5 h-3.5" />
                        )}
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="secondary"
                      size="sm"
                      className="w-full mt-3"
                      onClick={() => setIsConfigModalOpen(true)}
                    >
                      <Settings className="w-3.5 h-3.5 mr-1.5" />
                      Enable RAG
                    </Button>
                  )}
                </Card>
              )}

              {chatMode === 'multi' && selectedCollections.length > 0 && (
                <Card className="p-4">
                  <div className="text-[13px] font-medium text-foreground mb-2">
                    Multi-Collection Mode
                  </div>
                  <p className="text-[12px] text-text-secondary mb-3">
                    Searching across {selectedCollections.length} collection
                    {selectedCollections.length > 1 ? 's' : ''}. The AI will combine knowledge from
                    all selected sources.
                  </p>
                  {collectionsUsed.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {collectionsUsed.map((name) => (
                        <Badge key={name} variant="primary" className="text-[10px]">
                          {name}
                        </Badge>
                      ))}
                    </div>
                  )}
                </Card>
              )}

              {/* API Endpoint */}
              {canChat && (
                <Card className="p-4">
                  <div className="text-[13px] font-medium text-foreground mb-2">API Endpoint</div>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-[11px] text-primary bg-primary/5 px-2 py-1.5 rounded truncate">
                      POST /v1/rag
                    </code>
                    <button
                      onClick={copyEndpoint}
                      className="p-1.5 text-text-secondary hover:text-foreground rounded transition-colors"
                      title="Copy endpoint"
                    >
                      {copied ? (
                        <Check className="w-4 h-4 text-success" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </Card>
              )}

              {/* Sources */}
              {sources.length > 0 && (
                <Card className="p-4">
                  <div className="text-[13px] font-medium text-foreground mb-3">
                    Sources ({sources.length})
                  </div>
                  <div className="space-y-2 max-h-[300px] overflow-y-auto">
                    {sources.map((source, index) => (
                      <div
                        key={index}
                        className="p-2.5 bg-surface rounded-lg border border-border-light"
                      >
                        <div className="flex items-start gap-2">
                          <FileText className="w-4 h-4 text-text-tertiary flex-shrink-0 mt-0.5" />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-[12px] font-medium text-foreground truncate">
                                {source.document_name}
                              </span>
                              {source.collection_name && (
                                <Badge variant="default" className="text-[9px] px-1.5">
                                  {source.collection_name}
                                </Badge>
                              )}
                            </div>
                            <p className="text-[11px] text-text-tertiary line-clamp-3">
                              {source.chunk_content}
                            </p>
                            <div className="text-[10px] text-primary mt-1.5">
                              Relevance: {(source.relevance_score * 100).toFixed(0)}%
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              )}
            </div>
          </div>
        </aside>

        {/* Chat Area */}
        <main className="flex-1 flex flex-col min-w-0">
          {/* Mobile Mode & Collection Selector */}
          <div className="md:hidden p-3 border-b border-border-light space-y-3">
            <div className="flex gap-2">
              <button
                onClick={() => handleModeChange('single')}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-[13px] font-medium',
                  chatMode === 'single' ? 'bg-primary text-white' : 'bg-surface-secondary text-text-secondary'
                )}
              >
                <FolderOpen className="w-4 h-4" />
                Single
              </button>
              <button
                onClick={() => handleModeChange('multi')}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-[13px] font-medium',
                  chatMode === 'multi' ? 'bg-primary text-white' : 'bg-surface-secondary text-text-secondary'
                )}
              >
                <Layers className="w-4 h-4" />
                Multi
              </button>
            </div>
            {chatMode === 'single' && (
              <Select
                options={collectionOptions}
                value={selectedCollection}
                onChange={(e) => handleCollectionChange(e.target.value)}
              />
            )}
          </div>

          {!canChat ? (
            /* No RAG enabled */
            <div className="flex-1 flex items-center justify-center p-8">
              <div className="text-center max-w-md">
                <div className="w-16 h-16 mx-auto rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
                  <Sparkles className="w-8 h-8 text-primary" />
                </div>
                <h3 className="text-[18px] font-semibold text-foreground mb-2">
                  {chatMode === 'single'
                    ? `Enable RAG for "${selectedCollection}"`
                    : 'Select RAG-enabled Collections'}
                </h3>
                <p className="text-[14px] text-text-secondary mb-6">
                  {chatMode === 'single'
                    ? 'Configure an LLM provider to chat with your documents using AI-powered retrieval augmented generation.'
                    : 'Select one or more collections with RAG enabled to start chatting across multiple knowledge bases.'}
                </p>
                {chatMode === 'single' && (
                  <Button onClick={() => setIsConfigModalOpen(true)}>
                    <Settings className="w-4 h-4 mr-2" />
                    Configure RAG
                  </Button>
                )}
              </div>
            </div>
          ) : (
            /* Chat Interface */
            <>
              {/* Chat Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-border-light">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
                    {chatMode === 'single' ? (
                      <MessageSquare className="w-5 h-5 text-primary" />
                    ) : (
                      <Layers className="w-5 h-5 text-primary" />
                    )}
                  </div>
                  <div>
                    <h3 className="text-[15px] font-medium text-foreground">
                      {chatMode === 'single'
                        ? `Chat with ${selectedCollection}`
                        : `Chat with ${selectedCollections.length} collections`}
                    </h3>
                    <p className="text-[12px] text-text-secondary">
                      {chatMode === 'single'
                        ? `${ragConfig?.model} · ${selectedCollectionData?.vector_count || 0} vectors`
                        : selectedCollections.join(', ')}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => router.push('/rag/history')}
                    title="Chat history"
                  >
                    <History className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={handleClearChat} title="Clear chat">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                  {chatMode === 'single' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setIsConfigModalOpen(true)}
                      title="Settings"
                    >
                      <Settings className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.length === 0 && !isStreaming ? (
                  <div className="flex flex-col items-center justify-center h-full text-center">
                    <div className="w-16 h-16 rounded-2xl bg-surface-secondary flex items-center justify-center mb-4">
                      <Bot className="w-8 h-8 text-text-tertiary" />
                    </div>
                    <p className="text-[15px] font-medium text-foreground mb-1">
                      Start a conversation
                    </p>
                    <p className="text-[13px] text-text-tertiary max-w-sm">
                      {chatMode === 'single'
                        ? `Ask any question about the documents in "${selectedCollection}".`
                        : `Ask any question and the AI will search across ${selectedCollections.length} collections.`}
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
                          <div className="max-w-[75%] flex flex-col gap-2">
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

                    {/* Streaming message for single collection */}
                    {isStreaming && (
                      <div className="flex gap-3 justify-start">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <Bot className="w-4 h-4 text-primary" />
                        </div>
                        <div className="max-w-[75%] flex flex-col gap-2">
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

              {/* Input */}
              <div className="p-4 border-t border-border-light">
                <div className="flex gap-3">
                  <div className="flex-1 relative">
                    <textarea
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder={
                        chatMode === 'multi'
                          ? 'Ask a question across all selected collections...'
                          : 'Ask a question about your documents...'
                      }
                      rows={1}
                      className="w-full px-4 py-3 pr-12 bg-surface-secondary border border-border-light rounded-xl text-[14px] text-foreground placeholder:text-text-tertiary focus:outline-none focus:border-primary resize-none"
                    />
                  </div>
                  <Button onClick={handleSend} disabled={!input.trim() || isPending} className="h-auto px-4">
                    <Send className="w-4 h-4" />
                  </Button>
                </div>
                <p className="text-[11px] text-text-tertiary mt-2 text-center">
                  Press Enter to send · Shift+Enter for new line
                </p>
              </div>
            </>
          )}
        </main>
      </div>

      {/* Config Modal */}
      {selectedCollection && chatMode === 'single' && (
        <RagConfigModal
          collectionName={selectedCollection}
          isOpen={isConfigModalOpen}
          onClose={() => setIsConfigModalOpen(false)}
          currentConfig={ragConfig ?? undefined}
        />
      )}
    </div>
  );
}
