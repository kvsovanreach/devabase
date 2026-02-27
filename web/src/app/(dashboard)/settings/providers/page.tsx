'use client';

import { useState, useEffect } from 'react';
import { Header } from '@/components/layout/header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Modal, ModalFooter } from '@/components/ui/modal';
import { ConfirmModal } from '@/components/ui/confirm-modal';
import { EmptyState } from '@/components/ui/empty-state';
import { Badge } from '@/components/ui/badge';
import { useProjectStore } from '@/stores/project-store';
import api from '@/lib/api';
import {
  FolderKanban,
  Plus,
  Trash2,
  Pencil,
  Bot,
  Layers,
  Check,
  Eye,
  EyeOff,
  Star,
  Zap,
  CheckCircle2,
  XCircle,
  ArrowUpDown,
} from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';
import {
  LLMProvider,
  EmbeddingProvider,
  RerankProvider,
  LLMProviderType,
  EmbeddingProviderType,
  RerankProviderType,
  ProjectSettings,
} from '@/types';

const llmProviderOptions = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'google', label: 'Google AI' },
  { value: 'custom', label: 'Custom (OpenAI Compatible)' },
];

const embeddingProviderOptions = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'cohere', label: 'Cohere' },
  { value: 'voyage', label: 'Voyage AI' },
  { value: 'custom', label: 'Custom' },
];

const rerankProviderOptions = [
  { value: 'cohere', label: 'Cohere' },
  { value: 'jina', label: 'Jina AI' },
  { value: 'custom', label: 'Custom' },
];

const defaultRerankModels: Record<RerankProviderType, string[]> = {
  cohere: ['rerank-english-v3.0', 'rerank-multilingual-v3.0', 'rerank-english-v2.0'],
  jina: ['jina-reranker-v2-base-multilingual', 'jina-reranker-v1-base-en'],
  custom: [],
};

const defaultModels: Record<LLMProviderType, string[]> = {
  openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
  anthropic: ['claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022', 'claude-3-opus-20240229'],
  google: ['gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-1.0-pro'],
  custom: [],
};

const defaultEmbeddingModels: Record<EmbeddingProviderType, { model: string; dimensions: number }[]> = {
  openai: [
    { model: 'text-embedding-3-small', dimensions: 1536 },
    { model: 'text-embedding-3-large', dimensions: 3072 },
    { model: 'text-embedding-ada-002', dimensions: 1536 },
  ],
  cohere: [
    { model: 'embed-english-v3.0', dimensions: 1024 },
    { model: 'embed-multilingual-v3.0', dimensions: 1024 },
  ],
  voyage: [
    { model: 'voyage-large-2', dimensions: 1536 },
    { model: 'voyage-code-2', dimensions: 1536 },
  ],
  custom: [],
};

function generateId(): string {
  return Math.random().toString(36).substring(2, 11);
}

export default function ProvidersSettingsPage() {
  const { currentProject, updateProject, isLoading } = useProjectStore();

  // Settings state
  const [settings, setSettings] = useState<ProjectSettings>({
    llm_providers: [],
    embedding_providers: [],
    reranking_providers: [],
  });

  // LLM Provider Modal
  const [isLLMModalOpen, setIsLLMModalOpen] = useState(false);
  const [editingLLM, setEditingLLM] = useState<LLMProvider | null>(null);
  const [llmName, setLLMName] = useState('');
  const [llmType, setLLMType] = useState<LLMProviderType>('openai');
  const [llmApiKey, setLLMApiKey] = useState('');
  const [llmBaseUrl, setLLMBaseUrl] = useState('');
  const [llmModels, setLLMModels] = useState('');
  const [llmDefaultModel, setLLMDefaultModel] = useState('');
  const [showLLMApiKey, setShowLLMApiKey] = useState(false);

  // Embedding Provider Modal
  const [isEmbeddingModalOpen, setIsEmbeddingModalOpen] = useState(false);
  const [editingEmbedding, setEditingEmbedding] = useState<EmbeddingProvider | null>(null);
  const [embeddingName, setEmbeddingName] = useState('');
  const [embeddingType, setEmbeddingType] = useState<EmbeddingProviderType>('openai');
  const [embeddingApiKey, setEmbeddingApiKey] = useState('');
  const [embeddingBaseUrl, setEmbeddingBaseUrl] = useState('');
  const [embeddingModel, setEmbeddingModel] = useState('');
  const [embeddingDimensions, setEmbeddingDimensions] = useState(1536);
  const [embeddingMaxTokens, setEmbeddingMaxTokens] = useState(512);
  const [showEmbeddingApiKey, setShowEmbeddingApiKey] = useState(false);

  // Reranking Provider Modal
  const [isRerankModalOpen, setIsRerankModalOpen] = useState(false);
  const [editingRerank, setEditingRerank] = useState<RerankProvider | null>(null);
  const [rerankName, setRerankName] = useState('');
  const [rerankType, setRerankType] = useState<RerankProviderType>('cohere');
  const [rerankApiKey, setRerankApiKey] = useState('');
  const [rerankBaseUrl, setRerankBaseUrl] = useState('');
  const [rerankModel, setRerankModel] = useState('');
  const [showRerankApiKey, setShowRerankApiKey] = useState(false);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'llm' | 'embedding' | 'rerank'; id: string; name: string } | null>(null);

  // Test connection state
  const [testingProvider, setTestingProvider] = useState<{ type: 'llm' | 'embedding'; provider: LLMProvider | EmbeddingProvider } | null>(null);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; response?: string } | null>(null);
  const [isTesting, setIsTesting] = useState(false);

  // Load settings from project
  useEffect(() => {
    if (currentProject?.settings) {
      const projectSettings = currentProject.settings as unknown as ProjectSettings;
      setSettings({
        llm_providers: projectSettings.llm_providers || [],
        embedding_providers: projectSettings.embedding_providers || [],
        reranking_providers: projectSettings.reranking_providers || [],
        default_llm_provider: projectSettings.default_llm_provider,
        default_embedding_provider: projectSettings.default_embedding_provider,
        default_reranking_provider: projectSettings.default_reranking_provider,
      });
    }
  }, [currentProject]);

  // Save settings
  const saveSettings = async (newSettings: ProjectSettings) => {
    if (!currentProject) return;

    try {
      await updateProject(currentProject.id, {
        settings: newSettings as unknown as Record<string, unknown>,
      });
      setSettings(newSettings);
      toast.success('Settings saved');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save settings';
      toast.error(message);
    }
  };

  // LLM Provider handlers
  const handleOpenLLMModal = (provider?: LLMProvider) => {
    if (provider) {
      setEditingLLM(provider);
      setLLMName(provider.name);
      setLLMType(provider.type);
      setLLMApiKey(provider.api_key);
      setLLMBaseUrl(provider.base_url || '');
      setLLMModels(provider.models.join(', '));
      setLLMDefaultModel(provider.default_model || '');
    } else {
      setEditingLLM(null);
      setLLMName('');
      setLLMType('openai');
      setLLMApiKey('');
      setLLMBaseUrl('');
      setLLMModels(defaultModels.openai.join(', '));
      setLLMDefaultModel(defaultModels.openai[0]);
    }
    setShowLLMApiKey(false);
    setIsLLMModalOpen(true);
  };

  const handleSaveLLM = async () => {
    if (!llmName.trim() || !llmApiKey.trim()) {
      toast.error('Name and API key are required');
      return;
    }

    const models = llmModels.split(',').map(m => m.trim()).filter(Boolean);
    if (models.length === 0) {
      toast.error('At least one model is required');
      return;
    }

    const provider: LLMProvider = {
      id: editingLLM?.id || generateId(),
      name: llmName.trim(),
      type: llmType,
      api_key: llmApiKey.trim(),
      base_url: llmBaseUrl.trim() || undefined,
      models,
      default_model: llmDefaultModel || models[0],
      is_active: editingLLM?.is_active ?? true,
    };

    let newProviders: LLMProvider[];
    if (editingLLM) {
      newProviders = settings.llm_providers.map(p => p.id === editingLLM.id ? provider : p);
    } else {
      newProviders = [...settings.llm_providers, provider];
    }

    await saveSettings({
      ...settings,
      llm_providers: newProviders,
      default_llm_provider: settings.default_llm_provider || provider.id,
    });

    setIsLLMModalOpen(false);
  };

  // Embedding Provider handlers
  const handleOpenEmbeddingModal = (provider?: EmbeddingProvider) => {
    if (provider) {
      setEditingEmbedding(provider);
      setEmbeddingName(provider.name);
      setEmbeddingType(provider.type);
      setEmbeddingApiKey(provider.api_key);
      setEmbeddingBaseUrl(provider.base_url || '');
      setEmbeddingModel(provider.model);
      setEmbeddingDimensions(provider.dimensions);
      setEmbeddingMaxTokens(provider.max_tokens || 512);
    } else {
      setEditingEmbedding(null);
      setEmbeddingName('');
      setEmbeddingType('openai');
      setEmbeddingApiKey('');
      setEmbeddingBaseUrl('');
      setEmbeddingModel(defaultEmbeddingModels.openai[0].model);
      setEmbeddingDimensions(defaultEmbeddingModels.openai[0].dimensions);
      setEmbeddingMaxTokens(512);
    }
    setShowEmbeddingApiKey(false);
    setIsEmbeddingModalOpen(true);
  };

  const handleSaveEmbedding = async () => {
    if (!embeddingName.trim() || !embeddingApiKey.trim()) {
      toast.error('Name and API key are required');
      return;
    }

    // Model is required for non-custom providers
    if (embeddingType !== 'custom' && !embeddingModel.trim()) {
      toast.error('Model is required');
      return;
    }

    // URL is required for custom providers
    if (embeddingType === 'custom' && !embeddingBaseUrl.trim()) {
      toast.error('Endpoint URL is required for custom providers');
      return;
    }

    if (embeddingDimensions < 1) {
      toast.error('Dimensions must be at least 1');
      return;
    }

    const provider: EmbeddingProvider = {
      id: editingEmbedding?.id || generateId(),
      name: embeddingName.trim(),
      type: embeddingType,
      api_key: embeddingApiKey.trim(),
      base_url: embeddingBaseUrl.trim() || undefined,
      model: embeddingModel.trim() || 'custom',
      dimensions: embeddingDimensions,
      max_tokens: embeddingMaxTokens,
      is_active: editingEmbedding?.is_active ?? true,
    };

    let newProviders: EmbeddingProvider[];
    if (editingEmbedding) {
      newProviders = settings.embedding_providers.map(p => p.id === editingEmbedding.id ? provider : p);
    } else {
      newProviders = [...settings.embedding_providers, provider];
    }

    await saveSettings({
      ...settings,
      embedding_providers: newProviders,
      default_embedding_provider: settings.default_embedding_provider || provider.id,
    });

    setIsEmbeddingModalOpen(false);
  };

  // Reranking Provider handlers
  const handleOpenRerankModal = (provider?: RerankProvider) => {
    if (provider) {
      setEditingRerank(provider);
      setRerankName(provider.name);
      setRerankType(provider.type);
      setRerankApiKey(provider.api_key);
      setRerankBaseUrl(provider.base_url || '');
      setRerankModel(provider.model || '');
    } else {
      setEditingRerank(null);
      setRerankName('');
      setRerankType('cohere');
      setRerankApiKey('');
      setRerankBaseUrl('');
      setRerankModel(defaultRerankModels.cohere[0]);
    }
    setShowRerankApiKey(false);
    setIsRerankModalOpen(true);
  };

  const handleSaveRerank = async () => {
    if (!rerankName.trim() || !rerankApiKey.trim()) {
      toast.error('Name and API key are required');
      return;
    }

    if (rerankType === 'custom' && !rerankBaseUrl.trim()) {
      toast.error('Base URL is required for custom providers');
      return;
    }

    const provider: RerankProvider = {
      id: editingRerank?.id || generateId(),
      name: rerankName.trim(),
      type: rerankType,
      api_key: rerankApiKey.trim(),
      base_url: rerankBaseUrl.trim() || undefined,
      model: rerankModel.trim() || undefined,
      is_active: editingRerank?.is_active ?? true,
    };

    let newProviders: RerankProvider[];
    if (editingRerank) {
      newProviders = (settings.reranking_providers || []).map(p => p.id === editingRerank.id ? provider : p);
    } else {
      newProviders = [...(settings.reranking_providers || []), provider];
    }

    await saveSettings({
      ...settings,
      reranking_providers: newProviders,
      default_reranking_provider: settings.default_reranking_provider || provider.id,
    });

    setIsRerankModalOpen(false);
  };

  const handleRerankTypeChange = (type: RerankProviderType) => {
    setRerankType(type);
    const models = defaultRerankModels[type];
    setRerankModel(models[0] || '');
  };

  // Delete handler
  const handleDelete = async () => {
    if (!deleteTarget) return;

    if (deleteTarget.type === 'llm') {
      const newProviders = settings.llm_providers.filter(p => p.id !== deleteTarget.id);
      await saveSettings({
        ...settings,
        llm_providers: newProviders,
        default_llm_provider: settings.default_llm_provider === deleteTarget.id
          ? newProviders[0]?.id
          : settings.default_llm_provider,
      });
    } else if (deleteTarget.type === 'embedding') {
      const newProviders = settings.embedding_providers.filter(p => p.id !== deleteTarget.id);
      await saveSettings({
        ...settings,
        embedding_providers: newProviders,
        default_embedding_provider: settings.default_embedding_provider === deleteTarget.id
          ? newProviders[0]?.id
          : settings.default_embedding_provider,
      });
    } else if (deleteTarget.type === 'rerank') {
      const newProviders = (settings.reranking_providers || []).filter(p => p.id !== deleteTarget.id);
      await saveSettings({
        ...settings,
        reranking_providers: newProviders,
        default_reranking_provider: settings.default_reranking_provider === deleteTarget.id
          ? newProviders[0]?.id
          : settings.default_reranking_provider,
      });
    }

    setDeleteTarget(null);
  };

  // Set default provider
  const setDefaultProvider = async (type: 'llm' | 'embedding' | 'rerank', id: string) => {
    if (type === 'llm') {
      await saveSettings({ ...settings, default_llm_provider: id });
    } else if (type === 'embedding') {
      await saveSettings({ ...settings, default_embedding_provider: id });
    } else {
      await saveSettings({ ...settings, default_reranking_provider: id });
    }
  };

  // Handle type change for modals
  const handleLLMTypeChange = (type: LLMProviderType) => {
    setLLMType(type);
    const models = defaultModels[type];
    setLLMModels(models.join(', '));
    setLLMDefaultModel(models[0] || '');
  };

  const handleEmbeddingTypeChange = (type: EmbeddingProviderType) => {
    setEmbeddingType(type);
    const options = defaultEmbeddingModels[type];
    if (options.length > 0) {
      setEmbeddingModel(options[0].model);
      setEmbeddingDimensions(options[0].dimensions);
    } else {
      // Custom provider - clear model, use common default dimension
      setEmbeddingModel('');
      setEmbeddingDimensions(768);
    }
  };

  // Test LLM connection
  const testLLMProvider = async (provider: LLMProvider) => {
    setTestingProvider({ type: 'llm', provider });
    setTestResult(null);
    setIsTesting(true);

    try {
      const result = await api.testLLMProvider({
        provider_type: provider.type,
        api_key: provider.api_key,
        base_url: provider.base_url,
        model: provider.default_model || provider.models[0],
      });

      setTestResult({
        success: result.success,
        message: result.message,
        response: result.response,
      });
    } catch (error) {
      setTestResult({
        success: false,
        message: error instanceof Error ? error.message : 'Connection failed',
      });
    } finally {
      setIsTesting(false);
    }
  };

  // Test Embedding connection
  const testEmbeddingProvider = async (provider: EmbeddingProvider) => {
    setTestingProvider({ type: 'embedding', provider });
    setTestResult(null);
    setIsTesting(true);

    try {
      const result = await api.testEmbeddingProvider({
        provider_type: provider.type,
        api_key: provider.api_key,
        base_url: provider.base_url,
        model: provider.model,
      });

      setTestResult({
        success: result.success,
        message: result.message,
        response: result.response,
      });
    } catch (error) {
      setTestResult({
        success: false,
        message: error instanceof Error ? error.message : 'Connection failed',
      });
    } finally {
      setIsTesting(false);
    }
  };

  if (!currentProject) {
    return (
      <div>
        <Header />
        <div className="p-4 md:p-8">
          <EmptyState
            icon={<FolderKanban className="w-8 h-8" />}
            title="No project selected"
            description="Select a project to configure AI providers."
          />
        </div>
      </div>
    );
  }

  return (
    <div>
      <Header />
      <div className="p-4 md:p-8 space-y-6">
        <div>
          <h2 className="text-[22px] md:text-[26px] font-semibold text-foreground tracking-tight">AI Providers</h2>
          <p className="text-[14px] md:text-[15px] text-text-secondary mt-1">
            Configure LLM and embedding providers for your project.
          </p>
        </div>

        {/* LLM Providers */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Bot className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <CardTitle>LLM Providers</CardTitle>
                  <CardDescription>Language models for chat and completion</CardDescription>
                </div>
              </div>
              <Button size="sm" onClick={() => handleOpenLLMModal()}>
                <Plus className="w-4 h-4 mr-2" />
                Add Provider
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {settings.llm_providers.length > 0 ? (
              <div className="space-y-3">
                {settings.llm_providers.map((provider) => (
                  <div
                    key={provider.id}
                    className="flex items-center justify-between p-4 bg-surface-secondary rounded-xl"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-lg bg-surface flex items-center justify-center">
                        <Bot className="w-5 h-5 text-text-secondary" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-[14px] font-medium text-foreground">{provider.name}</span>
                          {settings.default_llm_provider === provider.id && (
                            <Badge variant="primary" size="sm">Default</Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="default" size="sm">{provider.type}</Badge>
                          <span className="text-[12px] text-text-tertiary">
                            {provider.models.length} model{provider.models.length !== 1 ? 's' : ''}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => testLLMProvider(provider)}
                        title="Test connection"
                        className="text-info hover:text-info"
                      >
                        <Zap className="w-4 h-4" />
                      </Button>
                      {settings.default_llm_provider !== provider.id && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDefaultProvider('llm', provider.id)}
                          title="Set as default"
                        >
                          <Star className="w-4 h-4" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleOpenLLMModal(provider)}
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeleteTarget({ type: 'llm', id: provider.id, name: provider.name })}
                        className="text-error hover:text-error"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={<Bot className="w-6 h-6" />}
                title="No LLM providers"
                description="Add an LLM provider to enable chat and completion features."
              />
            )}
          </CardContent>
        </Card>

        {/* Embedding Providers */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-info/10 flex items-center justify-center">
                  <Layers className="w-5 h-5 text-info" />
                </div>
                <div>
                  <CardTitle>Embedding Providers</CardTitle>
                  <CardDescription>Vector embeddings for semantic search</CardDescription>
                </div>
              </div>
              <Button size="sm" onClick={() => handleOpenEmbeddingModal()}>
                <Plus className="w-4 h-4 mr-2" />
                Add Provider
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {settings.embedding_providers.length > 0 ? (
              <div className="space-y-3">
                {settings.embedding_providers.map((provider) => (
                  <div
                    key={provider.id}
                    className="flex items-center justify-between p-4 bg-surface-secondary rounded-xl"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-lg bg-surface flex items-center justify-center">
                        <Layers className="w-5 h-5 text-text-secondary" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-[14px] font-medium text-foreground">{provider.name}</span>
                          {settings.default_embedding_provider === provider.id && (
                            <Badge variant="primary" size="sm">Default</Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="default" size="sm">{provider.type}</Badge>
                          <span className="text-[12px] text-text-tertiary">
                            {provider.model} · {provider.dimensions}d
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => testEmbeddingProvider(provider)}
                        title="Test connection"
                        className="text-info hover:text-info"
                      >
                        <Zap className="w-4 h-4" />
                      </Button>
                      {settings.default_embedding_provider !== provider.id && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDefaultProvider('embedding', provider.id)}
                          title="Set as default"
                        >
                          <Star className="w-4 h-4" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleOpenEmbeddingModal(provider)}
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeleteTarget({ type: 'embedding', id: provider.id, name: provider.name })}
                        className="text-error hover:text-error"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={<Layers className="w-6 h-6" />}
                title="No embedding providers"
                description="Add an embedding provider to enable vector search and RAG."
              />
            )}
          </CardContent>
        </Card>

        {/* Reranking Providers */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-warning/10 flex items-center justify-center">
                  <ArrowUpDown className="w-5 h-5 text-warning" />
                </div>
                <div>
                  <CardTitle>Reranking Providers</CardTitle>
                  <CardDescription>Cross-encoder models for result reranking</CardDescription>
                </div>
              </div>
              <Button size="sm" onClick={() => handleOpenRerankModal()}>
                <Plus className="w-4 h-4 mr-2" />
                Add Provider
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {(settings.reranking_providers?.length || 0) > 0 ? (
              <div className="space-y-3">
                {settings.reranking_providers?.map((provider) => (
                  <div
                    key={provider.id}
                    className="flex items-center justify-between p-4 bg-surface-secondary rounded-xl"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-lg bg-surface flex items-center justify-center">
                        <ArrowUpDown className="w-5 h-5 text-text-secondary" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-[14px] font-medium text-foreground">{provider.name}</span>
                          {settings.default_reranking_provider === provider.id && (
                            <Badge variant="primary" size="sm">Default</Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="default" size="sm">{provider.type}</Badge>
                          {provider.model && (
                            <span className="text-[12px] text-text-tertiary">
                              {provider.model}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {settings.default_reranking_provider !== provider.id && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDefaultProvider('rerank', provider.id)}
                          title="Set as default"
                        >
                          <Star className="w-4 h-4" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleOpenRerankModal(provider)}
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeleteTarget({ type: 'rerank', id: provider.id, name: provider.name })}
                        className="text-error hover:text-error"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={<ArrowUpDown className="w-6 h-6" />}
                title="No reranking providers"
                description="Add a reranking provider to improve search result relevance."
              />
            )}
          </CardContent>
        </Card>
      </div>

      {/* LLM Provider Modal */}
      <Modal
        isOpen={isLLMModalOpen}
        onClose={() => setIsLLMModalOpen(false)}
        title={editingLLM ? 'Edit LLM Provider' : 'Add LLM Provider'}
        description="Configure a language model provider for chat and completion."
        size="lg"
      >
        <div className="space-y-5">
          <Input
            label="Name"
            placeholder="My OpenAI"
            value={llmName}
            onChange={(e) => setLLMName(e.target.value)}
            required
          />
          <Select
            label="Provider Type"
            options={llmProviderOptions}
            value={llmType}
            onChange={(e) => handleLLMTypeChange(e.target.value as LLMProviderType)}
          />
          <div className="relative">
            <Input
              label="API Key"
              type={showLLMApiKey ? 'text' : 'password'}
              placeholder="sk-..."
              value={llmApiKey}
              onChange={(e) => setLLMApiKey(e.target.value)}
              required
            />
            <button
              type="button"
              onClick={() => setShowLLMApiKey(!showLLMApiKey)}
              className="absolute right-3 top-8 text-text-tertiary hover:text-foreground"
            >
              {showLLMApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {llmType === 'custom' && (
            <Input
              label="Base URL"
              placeholder="https://api.example.com/v1"
              value={llmBaseUrl}
              onChange={(e) => setLLMBaseUrl(e.target.value)}
              helperText="OpenAI-compatible API endpoint"
            />
          )}
          <Input
            label="Models"
            placeholder="gpt-4o, gpt-4o-mini"
            value={llmModels}
            onChange={(e) => setLLMModels(e.target.value)}
            helperText="Comma-separated list of available models"
          />
          <Input
            label="Default Model"
            placeholder="gpt-4o"
            value={llmDefaultModel}
            onChange={(e) => setLLMDefaultModel(e.target.value)}
          />
        </div>
        <ModalFooter>
          <Button variant="secondary" onClick={() => setIsLLMModalOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleSaveLLM} isLoading={isLoading}>
            {editingLLM ? 'Save Changes' : 'Add Provider'}
          </Button>
        </ModalFooter>
      </Modal>

      {/* Embedding Provider Modal */}
      <Modal
        isOpen={isEmbeddingModalOpen}
        onClose={() => setIsEmbeddingModalOpen(false)}
        title={editingEmbedding ? 'Edit Embedding Provider' : 'Add Embedding Provider'}
        description="Configure an embedding provider for vector search."
        size="lg"
      >
        <div className="space-y-5">
          <Input
            label="Name"
            placeholder="My OpenAI Embeddings"
            value={embeddingName}
            onChange={(e) => setEmbeddingName(e.target.value)}
            required
          />
          <Select
            label="Provider Type"
            options={embeddingProviderOptions}
            value={embeddingType}
            onChange={(e) => handleEmbeddingTypeChange(e.target.value as EmbeddingProviderType)}
          />
          <div className="relative">
            <Input
              label="API Key"
              type={showEmbeddingApiKey ? 'text' : 'password'}
              placeholder="sk-..."
              value={embeddingApiKey}
              onChange={(e) => setEmbeddingApiKey(e.target.value)}
              required
            />
            <button
              type="button"
              onClick={() => setShowEmbeddingApiKey(!showEmbeddingApiKey)}
              className="absolute right-3 top-8 text-text-tertiary hover:text-foreground"
            >
              {showEmbeddingApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {embeddingType === 'custom' && (
            <Input
              label="Endpoint URL"
              placeholder="http://localhost:8000/api/v1/embeddings"
              value={embeddingBaseUrl}
              onChange={(e) => setEmbeddingBaseUrl(e.target.value)}
              helperText="Full endpoint URL (e.g., VLLM, Ollama). Supports X-API-Key header."
              required
            />
          )}
          {embeddingType !== 'custom' ? (
            <Select
              label="Model"
              options={defaultEmbeddingModels[embeddingType].map(m => ({
                value: m.model,
                label: `${m.model} (${m.dimensions}d)`,
              }))}
              value={embeddingModel}
              onChange={(e) => {
                const selected = defaultEmbeddingModels[embeddingType].find(m => m.model === e.target.value);
                if (selected) {
                  setEmbeddingModel(selected.model);
                  setEmbeddingDimensions(selected.dimensions);
                }
              }}
            />
          ) : (
            <>
              <Input
                label="Model Name (optional)"
                placeholder="e.g., sroberta-multitask"
                value={embeddingModel}
                onChange={(e) => setEmbeddingModel(e.target.value)}
                helperText="Leave empty if model is part of the URL"
              />
              <Input
                label="Dimensions"
                type="number"
                placeholder="768"
                value={embeddingDimensions}
                onChange={(e) => setEmbeddingDimensions(parseInt(e.target.value) || 768)}
                min={1}
                helperText="Vector dimension size (check your model docs)"
              />
              <Input
                label="Max Input Tokens"
                type="number"
                placeholder="512"
                value={embeddingMaxTokens}
                onChange={(e) => setEmbeddingMaxTokens(parseInt(e.target.value) || 512)}
                min={32}
                helperText="Maximum tokens per chunk (your model: 128)"
              />
            </>
          )}
        </div>
        <ModalFooter>
          <Button variant="secondary" onClick={() => setIsEmbeddingModalOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleSaveEmbedding} isLoading={isLoading}>
            {editingEmbedding ? 'Save Changes' : 'Add Provider'}
          </Button>
        </ModalFooter>
      </Modal>

      {/* Reranking Provider Modal */}
      <Modal
        isOpen={isRerankModalOpen}
        onClose={() => setIsRerankModalOpen(false)}
        title={editingRerank ? 'Edit Reranking Provider' : 'Add Reranking Provider'}
        description="Configure a reranking provider to improve search relevance."
        size="lg"
      >
        <div className="space-y-5">
          <Input
            label="Name"
            placeholder="My Cohere Reranker"
            value={rerankName}
            onChange={(e) => setRerankName(e.target.value)}
            required
          />
          <Select
            label="Provider Type"
            options={rerankProviderOptions}
            value={rerankType}
            onChange={(e) => handleRerankTypeChange(e.target.value as RerankProviderType)}
          />
          <div className="relative">
            <Input
              label="API Key"
              type={showRerankApiKey ? 'text' : 'password'}
              placeholder="Enter API key..."
              value={rerankApiKey}
              onChange={(e) => setRerankApiKey(e.target.value)}
              required
            />
            <button
              type="button"
              onClick={() => setShowRerankApiKey(!showRerankApiKey)}
              className="absolute right-3 top-8 text-text-tertiary hover:text-foreground"
            >
              {showRerankApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {rerankType === 'custom' && (
            <Input
              label="Base URL"
              placeholder="https://api.example.com"
              value={rerankBaseUrl}
              onChange={(e) => setRerankBaseUrl(e.target.value)}
              helperText="API endpoint (must support /rerank)"
              required
            />
          )}
          {rerankType !== 'custom' ? (
            <Select
              label="Model"
              options={defaultRerankModels[rerankType].map(m => ({
                value: m,
                label: m,
              }))}
              value={rerankModel}
              onChange={(e) => setRerankModel(e.target.value)}
            />
          ) : (
            <Input
              label="Model (optional)"
              placeholder="rerank-model"
              value={rerankModel}
              onChange={(e) => setRerankModel(e.target.value)}
              helperText="Model identifier if required by your endpoint"
            />
          )}
        </div>
        <ModalFooter>
          <Button variant="secondary" onClick={() => setIsRerankModalOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleSaveRerank} isLoading={isLoading}>
            {editingRerank ? 'Save Changes' : 'Add Provider'}
          </Button>
        </ModalFooter>
      </Modal>

      {/* Delete Confirmation */}
      <ConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title={`Delete ${deleteTarget?.type === 'llm' ? 'LLM' : 'Embedding'} Provider`}
        description={`Are you sure you want to delete "${deleteTarget?.name}"? This action cannot be undone.`}
        confirmText="Delete"
        variant="danger"
        isLoading={isLoading}
      />

      {/* Test Connection Modal */}
      <Modal
        isOpen={!!testingProvider}
        onClose={() => {
          setTestingProvider(null);
          setTestResult(null);
        }}
        title={`Test ${testingProvider?.type === 'llm' ? 'LLM' : 'Embedding'} Connection`}
        size="md"
      >
        {testingProvider && (
          <>
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-3 bg-surface-secondary rounded-lg">
                <div className="w-10 h-10 rounded-lg bg-surface flex items-center justify-center">
                  {testingProvider.type === 'llm' ? (
                    <Bot className="w-5 h-5 text-primary" />
                  ) : (
                    <Layers className="w-5 h-5 text-info" />
                  )}
                </div>
                <div>
                  <div className="text-[14px] font-medium text-foreground">
                    {testingProvider.provider.name}
                  </div>
                  <div className="text-[12px] text-text-tertiary">
                    {testingProvider.provider.type} ·{' '}
                    {testingProvider.type === 'llm'
                      ? (testingProvider.provider as LLMProvider).default_model || (testingProvider.provider as LLMProvider).models[0]
                      : (testingProvider.provider as EmbeddingProvider).model}
                  </div>
                </div>
              </div>

              {isTesting ? (
                <div className="flex flex-col items-center justify-center py-8 gap-3">
                  <Spinner size="lg" />
                  <p className="text-[14px] text-text-secondary">
                    {testingProvider.type === 'llm'
                      ? 'Sending test message...'
                      : 'Generating test embedding...'}
                  </p>
                </div>
              ) : testResult ? (
                <div
                  className={cn(
                    'p-4 rounded-lg border',
                    testResult.success
                      ? 'bg-success/10 border-success/30'
                      : 'bg-error/10 border-error/30'
                  )}
                >
                  <div className="flex items-start gap-3">
                    {testResult.success ? (
                      <CheckCircle2 className="w-5 h-5 text-success flex-shrink-0 mt-0.5" />
                    ) : (
                      <XCircle className="w-5 h-5 text-error flex-shrink-0 mt-0.5" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p
                        className={cn(
                          'text-[14px] font-medium',
                          testResult.success ? 'text-success' : 'text-error'
                        )}
                      >
                        {testResult.message}
                      </p>
                      {testResult.response && (
                        <p className="text-[13px] text-text-secondary mt-1 break-words">
                          {testResult.response}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
            <ModalFooter>
              <Button
                variant="secondary"
                onClick={() => {
                  setTestingProvider(null);
                  setTestResult(null);
                }}
              >
                Close
              </Button>
              {testResult && !isTesting && (
                <Button
                  onClick={() => {
                    if (testingProvider.type === 'llm') {
                      testLLMProvider(testingProvider.provider as LLMProvider);
                    } else if (testingProvider.type === 'embedding') {
                      testEmbeddingProvider(testingProvider.provider as EmbeddingProvider);
                    }
                  }}
                >
                  <Zap className="w-4 h-4 mr-2" />
                  Test Again
                </Button>
              )}
            </ModalFooter>
          </>
        )}
      </Modal>
    </div>
  );
}
