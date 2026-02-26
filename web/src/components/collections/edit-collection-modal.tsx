'use client';

import { useState, useEffect } from 'react';
import { Modal, ModalFooter } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Select } from '@/components/ui/select';
import { useUpdateCollection } from '@/hooks/use-collections';
import { useProjectStore } from '@/stores/project-store';
import { Collection, LLMProvider, ProjectSettings } from '@/types';
import toast from 'react-hot-toast';

interface EditCollectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  collection: Collection | null;
}

export function EditCollectionModal({ isOpen, onClose, collection }: EditCollectionModalProps) {
  const updateCollection = useUpdateCollection();
  const { currentProject } = useProjectStore();

  const [ragEnabled, setRagEnabled] = useState(false);
  const [selectedLLMId, setSelectedLLMId] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('You are a helpful assistant. Answer questions based on the provided context.');
  const [topK, setTopK] = useState(5);
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(1000);

  // Get LLM providers from project settings
  const projectSettings = currentProject?.settings as unknown as ProjectSettings | undefined;
  const llmProviders: LLMProvider[] = projectSettings?.llm_providers || [];
  const defaultLLMId = projectSettings?.default_llm_provider;

  // Initialize form when modal opens
  useEffect(() => {
    if (isOpen && collection) {
      setRagEnabled(collection.rag_enabled || false);

      // Parse RAG config if exists
      const ragConfig = collection.rag_config as {
        llm_provider_id?: string;
        system_prompt?: string;
        top_k?: number;
        temperature?: number;
        max_tokens?: number;
        model?: string;
      } | null;

      if (ragConfig) {
        setSelectedLLMId(ragConfig.llm_provider_id || defaultLLMId || '');
        setSystemPrompt(ragConfig.system_prompt || 'You are a helpful assistant. Answer questions based on the provided context.');
        setTopK(ragConfig.top_k || 5);
        setTemperature(ragConfig.temperature || 0.7);
        setMaxTokens(ragConfig.max_tokens || 1000);
      } else {
        setSelectedLLMId(defaultLLMId || (llmProviders[0]?.id || ''));
        setSystemPrompt('You are a helpful assistant. Answer questions based on the provided context.');
        setTopK(5);
        setTemperature(0.7);
        setMaxTokens(1000);
      }
    }
  }, [isOpen, collection, llmProviders, defaultLLMId]);

  const llmOptions = llmProviders.map((p) => ({
    value: p.id,
    label: `${p.name} (${p.default_model})`,
  }));

  const selectedProvider = llmProviders.find(p => p.id === selectedLLMId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!collection) return;

    if (ragEnabled && !selectedLLMId) {
      toast.error('Please select an LLM provider for RAG');
      return;
    }

    try {
      await updateCollection.mutateAsync({
        name: collection.name,
        data: {
          rag_enabled: ragEnabled,
          rag_config: ragEnabled ? {
            llm_provider_id: selectedLLMId,
            model: selectedProvider?.default_model || '',
            system_prompt: systemPrompt,
            top_k: topK,
            temperature: temperature,
            max_tokens: maxTokens,
          } : null,
        },
      });
      toast.success('Collection updated successfully');
      onClose();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update collection';
      toast.error(message);
    }
  };

  if (!collection) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Edit Collection"
      description={`Configure settings for "${collection.name}"`}
    >
      <form onSubmit={handleSubmit}>
        <div className="space-y-5">
          {/* Collection Info (Read-only) */}
          <div className="p-4 bg-surface-secondary rounded-xl space-y-2">
            <div className="flex items-center justify-between text-[13px]">
              <span className="text-text-secondary">Name</span>
              <span className="font-medium text-foreground">{collection.name}</span>
            </div>
            <div className="flex items-center justify-between text-[13px]">
              <span className="text-text-secondary">Dimensions</span>
              <span className="font-medium text-foreground">{collection.dimensions}</span>
            </div>
            <div className="flex items-center justify-between text-[13px]">
              <span className="text-text-secondary">Metric</span>
              <span className="font-medium text-foreground">{collection.metric}</span>
            </div>
            <div className="flex items-center justify-between text-[13px]">
              <span className="text-text-secondary">Vectors</span>
              <span className="font-medium text-foreground">{collection.vector_count.toLocaleString()}</span>
            </div>
          </div>

          {/* RAG Configuration */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-[14px] font-medium text-foreground">Enable RAG Chat</h4>
                <p className="text-[13px] text-text-secondary mt-0.5">
                  Allow chatting with documents in this collection
                </p>
              </div>
              <Switch
                checked={ragEnabled}
                onCheckedChange={setRagEnabled}
              />
            </div>

            {ragEnabled && (
              <div className="space-y-4 pt-2 border-t border-border-light">
                {llmProviders.length === 0 ? (
                  <div className="p-4 bg-warning/10 border border-warning/30 rounded-lg">
                    <p className="text-[13px] text-warning">
                      No LLM providers configured. Please add an LLM provider in Settings to enable RAG.
                    </p>
                  </div>
                ) : (
                  <>
                    <Select
                      label="LLM Provider"
                      options={llmOptions}
                      value={selectedLLMId}
                      onChange={(e) => setSelectedLLMId(e.target.value)}
                      helperText="Select the LLM to use for generating responses"
                    />

                    <div>
                      <label className="block text-[13px] font-medium text-foreground mb-2">
                        System Prompt
                      </label>
                      <textarea
                        value={systemPrompt}
                        onChange={(e) => setSystemPrompt(e.target.value)}
                        rows={3}
                        className="w-full px-3 py-2 text-[14px] bg-surface border border-border-light rounded-lg
                          focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary
                          placeholder:text-text-tertiary resize-none"
                        placeholder="You are a helpful assistant..."
                      />
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                      <Input
                        label="Top K"
                        type="number"
                        value={topK}
                        onChange={(e) => setTopK(parseInt(e.target.value) || 5)}
                        min={1}
                        max={20}
                      />
                      <Input
                        label="Temperature"
                        type="number"
                        value={temperature}
                        onChange={(e) => setTemperature(parseFloat(e.target.value) || 0.7)}
                        min={0}
                        max={2}
                        step={0.1}
                      />
                      <Input
                        label="Max Tokens"
                        type="number"
                        value={maxTokens}
                        onChange={(e) => setMaxTokens(parseInt(e.target.value) || 1000)}
                        min={100}
                        max={4000}
                      />
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        <ModalFooter>
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            isLoading={updateCollection.isPending}
            disabled={ragEnabled && llmProviders.length === 0}
          >
            Save Changes
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}
