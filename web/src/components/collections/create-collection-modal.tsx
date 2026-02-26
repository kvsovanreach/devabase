'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Modal, ModalFooter } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { useCreateCollection } from '@/hooks/use-collections';
import { useProjectStore } from '@/stores/project-store';
import { EmbeddingProvider, ProjectSettings } from '@/types';
import { AlertCircle, Settings } from 'lucide-react';
import toast from 'react-hot-toast';

interface CreateCollectionModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const distanceMetrics = [
  { value: 'cosine', label: 'Cosine (Recommended)' },
  { value: 'l2', label: 'Euclidean (L2)' },
  { value: 'ip', label: 'Inner Product' },
];

export function CreateCollectionModal({ isOpen, onClose }: CreateCollectionModalProps) {
  const createCollection = useCreateCollection();
  const { currentProject } = useProjectStore();

  const [name, setName] = useState('');
  const [metric, setMetric] = useState('cosine');
  const [selectedEmbeddingId, setSelectedEmbeddingId] = useState('');
  const [dimensions, setDimensions] = useState(1536);

  // Get embedding providers from project settings
  const projectSettings = currentProject?.settings as unknown as ProjectSettings | undefined;
  const embeddingProviders: EmbeddingProvider[] = projectSettings?.embedding_providers || [];
  const defaultEmbeddingId = projectSettings?.default_embedding_provider;

  // Set default embedding provider when modal opens
  useEffect(() => {
    if (isOpen && embeddingProviders.length > 0) {
      const defaultProvider = embeddingProviders.find(p => p.id === defaultEmbeddingId) || embeddingProviders[0];
      setSelectedEmbeddingId(defaultProvider.id);
      setDimensions(defaultProvider.dimensions);
    }
  }, [isOpen, embeddingProviders, defaultEmbeddingId]);

  // Update dimensions when embedding provider changes
  const handleEmbeddingChange = (providerId: string) => {
    setSelectedEmbeddingId(providerId);
    const provider = embeddingProviders.find(p => p.id === providerId);
    if (provider) {
      setDimensions(provider.dimensions);
    }
  };

  const embeddingOptions = embeddingProviders.map((p) => ({
    value: p.id,
    label: `${p.name} (${p.model}, ${p.dimensions}d)`,
  }));

  const selectedProvider = embeddingProviders.find(p => p.id === selectedEmbeddingId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    if (embeddingProviders.length === 0) {
      toast.error('Please configure an embedding provider first');
      return;
    }

    if (!selectedEmbeddingId) {
      toast.error('Please select an embedding provider');
      return;
    }

    try {
      await createCollection.mutateAsync({
        name: name.trim().toLowerCase().replace(/\s+/g, '_'),
        dimensions,
        metric,
        metadata: {
          embedding_provider_id: selectedEmbeddingId,
          embedding_provider_name: selectedProvider?.name,
          embedding_model: selectedProvider?.model,
          embedding_max_tokens: selectedProvider?.max_tokens || 512,
        },
      });
      toast.success('Collection created successfully');
      handleClose();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create collection';
      toast.error(message);
    }
  };

  const handleClose = () => {
    setName('');
    setMetric('cosine');
    setSelectedEmbeddingId('');
    setDimensions(1536);
    onClose();
  };

  const hasNoEmbedding = embeddingProviders.length === 0;

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Create Collection"
      description="Create a new collection to store your documents and embeddings."
    >
      {hasNoEmbedding ? (
        <div className="py-6">
          <div className="flex flex-col items-center text-center">
            <div className="w-14 h-14 rounded-2xl bg-warning/10 flex items-center justify-center mb-4">
              <AlertCircle className="w-7 h-7 text-warning" />
            </div>
            <h3 className="text-[16px] font-semibold text-foreground mb-2">
              No Embedding Provider Configured
            </h3>
            <p className="text-[14px] text-text-secondary mb-6 max-w-sm">
              You need to configure an embedding provider before creating a collection.
              This determines how your documents will be converted to vectors.
            </p>
            <Link href="/settings/providers" onClick={handleClose}>
              <Button>
                <Settings className="w-4 h-4 mr-2" />
                Configure Embedding Provider
              </Button>
            </Link>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit}>
          <div className="space-y-5">
            <Input
              label="Collection Name"
              placeholder="my_collection"
              value={name}
              onChange={(e) => setName(e.target.value)}
              helperText="Lowercase letters, numbers, and underscores only"
              required
            />

            <Select
              label="Embedding Provider"
              options={embeddingOptions}
              value={selectedEmbeddingId}
              onChange={(e) => handleEmbeddingChange(e.target.value)}
              helperText={selectedProvider ? `Vectors will have ${dimensions} dimensions` : 'Select an embedding provider'}
            />

            <div className="p-3 bg-surface-secondary rounded-lg">
              <div className="flex items-center justify-between text-[13px]">
                <span className="text-text-secondary">Dimensions</span>
                <span className="font-medium text-foreground">{dimensions}</span>
              </div>
              {selectedProvider && (
                <div className="flex items-center justify-between text-[13px] mt-1">
                  <span className="text-text-secondary">Model</span>
                  <span className="font-medium text-foreground">{selectedProvider.model}</span>
                </div>
              )}
            </div>

            <Select
              label="Distance Metric"
              options={distanceMetrics}
              value={metric}
              onChange={(e) => setMetric(e.target.value)}
              helperText="Cosine is recommended for most embedding models"
            />
          </div>
          <ModalFooter>
            <Button type="button" variant="secondary" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" isLoading={createCollection.isPending}>
              Create Collection
            </Button>
          </ModalFooter>
        </form>
      )}
    </Modal>
  );
}
