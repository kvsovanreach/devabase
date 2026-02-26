'use client';

import { useState, useEffect, useMemo } from 'react';
import { AlertCircle, Settings } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { RagConfig, ProjectSettings } from '@/types';
import { useEnableRag, defaultRagConfig } from '@/hooks/use-rag';
import { useProjectStore } from '@/stores/project-store';
import Link from 'next/link';

interface RagConfigModalProps {
  collectionName: string;
  isOpen: boolean;
  onClose: () => void;
  currentConfig?: Partial<RagConfig>;
}

export function RagConfigModal({
  collectionName,
  isOpen,
  onClose,
  currentConfig,
}: RagConfigModalProps) {
  const { currentProject } = useProjectStore();
  const projectSettings = currentProject?.settings as unknown as ProjectSettings | undefined;
  const llmProviders = projectSettings?.llm_providers || [];

  // Memoize activeProviders to prevent infinite re-renders
  const activeProviders = useMemo(
    () => llmProviders.filter((p) => p.is_active),
    [llmProviders]
  );

  const [config, setConfig] = useState<RagConfig>({
    ...defaultRagConfig,
    ...currentConfig,
  });
  const [initialized, setInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const enableRagMutation = useEnableRag();

  // Get the selected provider
  const selectedProvider = activeProviders.find((p) => p.id === config.llm_provider_id);

  // Get available models for selected provider
  const availableModels = selectedProvider?.models || [];

  // Initialize config when modal opens
  useEffect(() => {
    if (isOpen && !initialized) {
      let initialConfig = {
        ...defaultRagConfig,
        ...currentConfig,
      };

      // If no provider selected, use the default or first active provider
      if (!initialConfig.llm_provider_id && activeProviders.length > 0) {
        const defaultProviderId = projectSettings?.default_llm_provider;
        const provider = activeProviders.find((p) => p.id === defaultProviderId) || activeProviders[0];
        initialConfig.llm_provider_id = provider.id;
        initialConfig.model = provider.default_model || provider.models[0] || '';
      }

      setConfig(initialConfig);
      setError(null);
      setInitialized(true);
    }
  }, [isOpen, initialized, currentConfig, activeProviders, projectSettings?.default_llm_provider]);

  // Reset initialized state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setInitialized(false);
    }
  }, [isOpen]);

  // Update model when provider changes
  const handleProviderChange = (providerId: string) => {
    const provider = activeProviders.find((p) => p.id === providerId);
    setConfig((c) => ({
      ...c,
      llm_provider_id: providerId,
      model: provider?.default_model || provider?.models[0] || '',
    }));
  };

  const handleSave = async () => {
    setError(null);

    if (!config.llm_provider_id) {
      setError('Please select an LLM provider');
      return;
    }

    if (!config.model) {
      setError('Please select a model');
      return;
    }

    try {
      await enableRagMutation.mutateAsync({
        collectionName,
        config: { ...config, enabled: true },
      });
      onClose();
    } catch {
      // Error handled by mutation
    }
  };

  // No LLM providers configured
  if (activeProviders.length === 0) {
    return (
      <Modal isOpen={isOpen} onClose={onClose} title={`Configure RAG for "${collectionName}"`}>
        <div className="py-8 text-center">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-warning/10 flex items-center justify-center mb-4">
            <AlertCircle className="w-7 h-7 text-warning" />
          </div>
          <h3 className="text-[16px] font-semibold text-foreground mb-2">
            No LLM Provider Configured
          </h3>
          <p className="text-[14px] text-text-secondary mb-6 max-w-sm mx-auto">
            You need to configure an LLM provider in your project settings before enabling RAG.
          </p>
          <Link href="/settings/providers">
            <Button>
              <Settings className="w-4 h-4 mr-2" />
              Configure Providers
            </Button>
          </Link>
        </div>
      </Modal>
    );
  }

  const providerOptions = activeProviders.map((p) => ({
    value: p.id,
    label: `${p.name} (${p.type})`,
  }));

  const modelOptions = availableModels.map((m) => ({
    value: m,
    label: m,
  }));

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Configure RAG for "${collectionName}"`}>
      <div className="space-y-5">
        {/* Provider Selection */}
        <Select
          label="LLM Provider"
          options={providerOptions}
          value={config.llm_provider_id}
          onChange={(e) => handleProviderChange(e.target.value)}
          placeholder="Select a provider"
        />

        {/* Model Selection */}
        {selectedProvider && (
          <Select
            label="Model"
            options={modelOptions}
            value={config.model}
            onChange={(e) => setConfig((c) => ({ ...c, model: e.target.value }))}
            placeholder="Select a model"
          />
        )}

        {/* System Prompt */}
        <div>
          <label className="block text-[13px] font-medium text-text-secondary mb-2">
            System Prompt
          </label>
          <textarea
            rows={3}
            value={config.system_prompt}
            onChange={(e) => setConfig((c) => ({ ...c, system_prompt: e.target.value }))}
            className="w-full px-4 py-3 bg-surface-secondary border border-border-light rounded-lg text-[14px] text-foreground placeholder:text-text-tertiary focus:outline-none focus:border-primary resize-none"
            placeholder="You are a helpful assistant..."
          />
        </div>

        {/* Advanced Settings */}
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-[13px] font-medium text-text-secondary mb-2">
              Temperature
            </label>
            <Input
              type="number"
              min={0}
              max={2}
              step={0.1}
              value={config.temperature}
              onChange={(e) =>
                setConfig((c) => ({ ...c, temperature: parseFloat(e.target.value) || 0.7 }))
              }
            />
          </div>
          <div>
            <label className="block text-[13px] font-medium text-text-secondary mb-2">
              Max Tokens
            </label>
            <Input
              type="number"
              min={100}
              max={4096}
              step={100}
              value={config.max_tokens}
              onChange={(e) =>
                setConfig((c) => ({ ...c, max_tokens: parseInt(e.target.value) || 1000 }))
              }
            />
          </div>
          <div>
            <label className="block text-[13px] font-medium text-text-secondary mb-2">
              Top K Results
            </label>
            <Input
              type="number"
              min={1}
              max={20}
              value={config.top_k}
              onChange={(e) =>
                setConfig((c) => ({ ...c, top_k: parseInt(e.target.value) || 5 }))
              }
            />
          </div>
        </div>

        {/* Info Note */}
        <div className="flex items-start gap-2 p-3 bg-info/10 border border-info/30 rounded-lg">
          <AlertCircle className="w-4 h-4 text-info flex-shrink-0 mt-0.5" />
          <p className="text-[12px] text-info/90">
            RAG will use the API credentials from your project&apos;s LLM provider settings.
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="p-3 bg-error/10 border border-error/30 rounded-lg">
            <p className="text-[13px] text-error">{error}</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={enableRagMutation.isPending}>
            {enableRagMutation.isPending ? (
              <>
                <Spinner size="sm" className="mr-2" />
                Saving...
              </>
            ) : (
              'Save & Enable'
            )}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
