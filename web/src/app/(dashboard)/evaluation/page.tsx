'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Modal, ModalFooter } from '@/components/ui/modal';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { PageSpinner } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { useEvaluationDatasets, useCreateDataset, useDeleteDataset } from '@/hooks/use-evaluation';
import { useCollections } from '@/hooks/use-collections';
import {
  FlaskConical,
  Plus,
  Trash2,
  ChevronRight,
  Target,
  TrendingUp,
  Clock,
  FolderOpen,
  BarChart3,
} from 'lucide-react';
import { formatRelativeTime } from '@/lib/utils';
import toast from 'react-hot-toast';

export default function EvaluationPage() {
  const router = useRouter();
  const { data: datasets, isLoading } = useEvaluationDatasets();
  const { data: collections } = useCollections();
  const createDataset = useCreateDataset();
  const deleteDataset = useDeleteDataset();

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [newDataset, setNewDataset] = useState({
    name: '',
    collection_name: '',
    description: '',
  });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDataset.name.trim() || !newDataset.collection_name) return;

    try {
      await createDataset.mutateAsync({
        name: newDataset.name.trim(),
        collection_name: newDataset.collection_name,
        description: newDataset.description.trim() || undefined,
      });
      toast.success('Dataset created');
      setShowCreateModal(false);
      setNewDataset({ name: '', collection_name: '', description: '' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create dataset';
      toast.error(message);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;

    try {
      await deleteDataset.mutateAsync(deleteTarget);
      toast.success('Dataset deleted');
      setDeleteTarget(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete dataset';
      toast.error(message);
    }
  };

  // Calculate aggregate metrics from latest runs
  const aggregateMetrics = datasets?.reduce(
    (acc, d) => {
      if (d.run_count > 0) {
        acc.totalDatasets++;
        acc.totalCases += d.case_count;
        acc.totalRuns += d.run_count;
      }
      return acc;
    },
    { totalDatasets: 0, totalCases: 0, totalRuns: 0 }
  ) || { totalDatasets: 0, totalCases: 0, totalRuns: 0 };

  const collectionOptions = (collections || []).map((c) => ({
    value: c.name,
    label: c.name,
  }));

  if (isLoading) {
    return (
      <div>
        <Header />
        <PageSpinner />
      </div>
    );
  }

  return (
    <div>
      <Header />
      <div className="p-4 md:p-8">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 md:mb-8">
          <div>
            <h2 className="text-[22px] md:text-[26px] font-semibold text-foreground tracking-tight">
              Evaluation Dashboard
            </h2>
            <p className="text-[14px] md:text-[15px] text-text-secondary mt-1">
              Track retrieval quality with precision, recall, MRR, and NDCG metrics.
            </p>
          </div>
          <Button onClick={() => setShowCreateModal(true)}>
            <Plus className="w-4 h-4 mr-2" />
            New Dataset
          </Button>
        </div>

        {/* Metrics Overview */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <FlaskConical className="w-4 h-4 text-primary" />
              <span className="text-[12px] text-text-secondary">Test Datasets</span>
            </div>
            <p className="text-[24px] font-bold text-foreground">{datasets?.length || 0}</p>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Target className="w-4 h-4 text-info" />
              <span className="text-[12px] text-text-secondary">Total Cases</span>
            </div>
            <p className="text-[24px] font-bold text-foreground">{aggregateMetrics.totalCases}</p>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-4 h-4 text-success" />
              <span className="text-[12px] text-text-secondary">Total Runs</span>
            </div>
            <p className="text-[24px] font-bold text-foreground">{aggregateMetrics.totalRuns}</p>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <BarChart3 className="w-4 h-4 text-warning" />
              <span className="text-[12px] text-text-secondary">Active Datasets</span>
            </div>
            <p className="text-[24px] font-bold text-foreground">{aggregateMetrics.totalDatasets}</p>
          </Card>
        </div>

        {/* Datasets List */}
        {!datasets || datasets.length === 0 ? (
          <EmptyState
            icon={<FlaskConical className="w-8 h-8" />}
            title="No evaluation datasets"
            description="Create your first test dataset to start measuring retrieval quality."
            action={
              <Button onClick={() => setShowCreateModal(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Create Dataset
              </Button>
            }
          />
        ) : (
          <div className="space-y-3">
            <h3 className="text-[14px] font-semibold text-foreground uppercase tracking-wide">
              Test Datasets
            </h3>
            {datasets.map((dataset) => (
              <Card
                key={dataset.id}
                className="p-4 cursor-pointer hover:shadow-md transition-all"
                onClick={() => router.push(`/evaluation/${dataset.id}`)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <h4 className="text-[15px] font-semibold text-foreground truncate">
                        {dataset.name}
                      </h4>
                      <Badge variant="default" className="text-[10px]">
                        <FolderOpen className="w-3 h-3 mr-1" />
                        {dataset.collection_name}
                      </Badge>
                    </div>
                    {dataset.description && (
                      <p className="text-[13px] text-text-secondary mb-2 line-clamp-1">
                        {dataset.description}
                      </p>
                    )}
                    <div className="flex items-center gap-4 text-[12px] text-text-tertiary">
                      <span className="flex items-center gap-1">
                        <Target className="w-3.5 h-3.5" />
                        {dataset.case_count} cases
                      </span>
                      <span className="flex items-center gap-1">
                        <TrendingUp className="w-3.5 h-3.5" />
                        {dataset.run_count} runs
                      </span>
                      {dataset.last_run && (
                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" />
                          Last run: {formatRelativeTime(dataset.last_run)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteTarget(dataset.id);
                      }}
                      className="p-2 text-text-tertiary hover:text-error rounded-lg hover:bg-error/5 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    <ChevronRight className="w-5 h-5 text-text-tertiary" />
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Create Dataset Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Create Test Dataset"
        description="Create a new evaluation dataset to test retrieval quality."
      >
        <form onSubmit={handleCreate} className="space-y-4">
          <Input
            label="Dataset Name"
            value={newDataset.name}
            onChange={(e) => setNewDataset({ ...newDataset, name: e.target.value })}
            placeholder="e.g., FAQ Queries"
            required
          />
          <Select
            label="Collection"
            options={collectionOptions}
            value={newDataset.collection_name}
            onChange={(e) => setNewDataset({ ...newDataset, collection_name: e.target.value })}
            placeholder="Select collection"
          />
          <Input
            label="Description"
            value={newDataset.description}
            onChange={(e) => setNewDataset({ ...newDataset, description: e.target.value })}
            placeholder="Optional description..."
          />
          <ModalFooter>
            <Button type="button" variant="secondary" onClick={() => setShowCreateModal(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              isLoading={createDataset.isPending}
              disabled={!newDataset.name.trim() || !newDataset.collection_name}
            >
              Create Dataset
            </Button>
          </ModalFooter>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete Dataset"
        description="Are you sure you want to delete this dataset? This will also delete all test cases and run history."
      >
        <ModalFooter>
          <Button variant="secondary" onClick={() => setDeleteTarget(null)}>
            Cancel
          </Button>
          <Button variant="danger" onClick={handleDelete} isLoading={deleteDataset.isPending}>
            Delete Dataset
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
