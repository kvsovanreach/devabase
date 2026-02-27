'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Modal, ModalFooter } from '@/components/ui/modal';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { PageSpinner } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty-state';
import {
  useEvaluationDataset,
  useEvaluationRuns,
  useCreateCase,
  useDeleteCase,
  useRunEvaluation,
} from '@/hooks/use-evaluation';
import {
  ChevronLeft,
  Plus,
  Trash2,
  Play,
  Target,
  TrendingUp,
  Clock,
  FolderOpen,
  Zap,
  Sparkles,
  BarChart3,
  CheckCircle,
  XCircle,
} from 'lucide-react';
import { formatRelativeTime, cn } from '@/lib/utils';
import toast from 'react-hot-toast';
import { EvaluationRun, RunEvaluationRequest } from '@/types';

export default function EvaluationDetailPage() {
  const params = useParams();
  const router = useRouter();
  const datasetId = params.id as string;

  const { data: dataset, isLoading: datasetLoading } = useEvaluationDataset(datasetId);
  const { data: runs, isLoading: runsLoading } = useEvaluationRuns(datasetId);
  const createCase = useCreateCase(datasetId);
  const deleteCase = useDeleteCase(datasetId);
  const runEvaluation = useRunEvaluation(datasetId);

  const [showAddCaseModal, setShowAddCaseModal] = useState(false);
  const [showRunModal, setShowRunModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [selectedRun, setSelectedRun] = useState<EvaluationRun | null>(null);

  const [newCase, setNewCase] = useState({
    query: '',
    expected_chunk_ids: '',
  });

  const [runConfig, setRunConfig] = useState<RunEvaluationRequest>({
    search_mode: 'vector',
    top_k: 5,
    vector_weight: 0.7,
    keyword_weight: 0.3,
  });

  const handleAddCase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCase.query.trim()) return;

    try {
      const chunkIds = newCase.expected_chunk_ids
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean);

      await createCase.mutateAsync({
        query: newCase.query.trim(),
        expected_chunk_ids: chunkIds,
      });
      toast.success('Test case added');
      setShowAddCaseModal(false);
      setNewCase({ query: '', expected_chunk_ids: '' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to add test case';
      toast.error(message);
    }
  };

  const handleDeleteCase = async () => {
    if (!deleteTarget) return;

    try {
      await deleteCase.mutateAsync(deleteTarget);
      toast.success('Test case deleted');
      setDeleteTarget(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete test case';
      toast.error(message);
    }
  };

  const handleRunEvaluation = async () => {
    try {
      const result = await runEvaluation.mutateAsync(runConfig);
      toast.success(`Evaluation complete: P@${runConfig.top_k}=${(result.metrics.precision_at_k * 100).toFixed(1)}%`);
      setShowRunModal(false);
      setSelectedRun(result.run);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to run evaluation';
      toast.error(message);
    }
  };

  const isLoading = datasetLoading || runsLoading;

  if (isLoading) {
    return (
      <div>
        <Header />
        <PageSpinner />
      </div>
    );
  }

  if (!dataset) {
    return (
      <div>
        <Header />
        <div className="p-4 md:p-8">
          <EmptyState
            icon={<Target className="w-8 h-8" />}
            title="Dataset not found"
            description="The evaluation dataset you're looking for doesn't exist."
            action={
              <Button onClick={() => router.push('/evaluation')}>
                <ChevronLeft className="w-4 h-4 mr-2" />
                Back to Evaluation
              </Button>
            }
          />
        </div>
      </div>
    );
  }

  const latestRun = runs?.[0];
  const displayRun = selectedRun || latestRun;

  return (
    <div>
      <Header />
      <div className="p-4 md:p-8">
        {/* Back Button */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push('/evaluation')}
          className="mb-4"
        >
          <ChevronLeft className="w-4 h-4 mr-1" />
          Back to Evaluation
        </Button>

        {/* Dataset Header */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h2 className="text-[22px] md:text-[26px] font-semibold text-foreground">
                {dataset.name}
              </h2>
              <Badge variant="default">
                <FolderOpen className="w-3 h-3 mr-1" />
                {dataset.collection_name}
              </Badge>
            </div>
            {dataset.description && (
              <p className="text-[14px] text-text-secondary">{dataset.description}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={() => setShowAddCaseModal(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Add Case
            </Button>
            <Button
              onClick={() => setShowRunModal(true)}
              disabled={!dataset.cases || dataset.cases.length === 0}
            >
              <Play className="w-4 h-4 mr-2" />
              Run Evaluation
            </Button>
          </div>
        </div>

        {/* Metrics Cards */}
        {displayRun && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <Target className="w-4 h-4 text-primary" />
                <span className="text-[12px] text-text-secondary">Precision@{displayRun.metrics.k}</span>
              </div>
              <p className="text-[28px] font-bold text-foreground">
                {(displayRun.metrics.precision_at_k * 100).toFixed(1)}%
              </p>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="w-4 h-4 text-info" />
                <span className="text-[12px] text-text-secondary">Recall@{displayRun.metrics.k}</span>
              </div>
              <p className="text-[28px] font-bold text-foreground">
                {(displayRun.metrics.recall_at_k * 100).toFixed(1)}%
              </p>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <BarChart3 className="w-4 h-4 text-success" />
                <span className="text-[12px] text-text-secondary">MRR</span>
              </div>
              <p className="text-[28px] font-bold text-foreground">
                {(displayRun.metrics.mrr * 100).toFixed(1)}%
              </p>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <Sparkles className="w-4 h-4 text-warning" />
                <span className="text-[12px] text-text-secondary">NDCG</span>
              </div>
              <p className="text-[28px] font-bold text-foreground">
                {(displayRun.metrics.ndcg * 100).toFixed(1)}%
              </p>
            </Card>
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-6">
          {/* Test Cases */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[14px] font-semibold text-foreground uppercase tracking-wide">
                Test Cases ({dataset.cases?.length || 0})
              </h3>
            </div>
            {!dataset.cases || dataset.cases.length === 0 ? (
              <Card className="p-6">
                <EmptyState
                  icon={<Target className="w-6 h-6" />}
                  title="No test cases"
                  description="Add test cases to evaluate retrieval quality."
                  action={
                    <Button size="sm" onClick={() => setShowAddCaseModal(true)}>
                      <Plus className="w-4 h-4 mr-2" />
                      Add Case
                    </Button>
                  }
                />
              </Card>
            ) : (
              <div className="space-y-2 max-h-[500px] overflow-y-auto">
                {dataset.cases.map((testCase, index) => {
                  // Find case result if run is selected
                  const caseResult = displayRun?.case_results?.find(
                    (r) => r.case_id === testCase.id
                  );
                  return (
                    <Card key={testCase.id} className="p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-[12px] font-semibold text-text-secondary">
                              #{index + 1}
                            </span>
                            {caseResult && (
                              <Badge
                                variant={caseResult.relevant_retrieved > 0 ? 'success' : 'error'}
                                className="text-[10px]"
                              >
                                {caseResult.relevant_retrieved > 0 ? (
                                  <CheckCircle className="w-3 h-3 mr-1" />
                                ) : (
                                  <XCircle className="w-3 h-3 mr-1" />
                                )}
                                {caseResult.relevant_retrieved}/{caseResult.expected_count}
                              </Badge>
                            )}
                          </div>
                          <p className="text-[13px] text-foreground line-clamp-2">
                            {testCase.query}
                          </p>
                          <p className="text-[11px] text-text-tertiary mt-1">
                            {testCase.expected_chunk_ids.length} expected chunks
                          </p>
                        </div>
                        <button
                          onClick={() => setDeleteTarget(testCase.id)}
                          className="p-1.5 text-text-tertiary hover:text-error rounded transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>

          {/* Run History */}
          <div>
            <h3 className="text-[14px] font-semibold text-foreground uppercase tracking-wide mb-4">
              Run History
            </h3>
            {!runs || runs.length === 0 ? (
              <Card className="p-6">
                <EmptyState
                  icon={<Clock className="w-6 h-6" />}
                  title="No evaluation runs"
                  description="Run an evaluation to see results."
                />
              </Card>
            ) : (
              <div className="space-y-2 max-h-[500px] overflow-y-auto">
                {runs.map((run) => (
                  <Card
                    key={run.id}
                    className={cn(
                      'p-3 cursor-pointer transition-all',
                      selectedRun?.id === run.id
                        ? 'ring-2 ring-primary'
                        : 'hover:shadow-md'
                    )}
                    onClick={() => setSelectedRun(run)}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Badge variant="default" className="text-[10px]">
                          {run.search_mode === 'hybrid' ? (
                            <Sparkles className="w-3 h-3 mr-1" />
                          ) : (
                            <Zap className="w-3 h-3 mr-1" />
                          )}
                          {run.search_mode}
                        </Badge>
                        <span className="text-[11px] text-text-tertiary">
                          k={run.config?.top_k || 5}
                        </span>
                      </div>
                      <span className="text-[11px] text-text-tertiary">
                        {formatRelativeTime(run.created_at)}
                      </span>
                    </div>
                    <div className="grid grid-cols-4 gap-2 text-center">
                      <div>
                        <p className="text-[10px] text-text-tertiary">P@K</p>
                        <p className="text-[13px] font-semibold text-foreground">
                          {(run.metrics.precision_at_k * 100).toFixed(0)}%
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] text-text-tertiary">R@K</p>
                        <p className="text-[13px] font-semibold text-foreground">
                          {(run.metrics.recall_at_k * 100).toFixed(0)}%
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] text-text-tertiary">MRR</p>
                        <p className="text-[13px] font-semibold text-foreground">
                          {(run.metrics.mrr * 100).toFixed(0)}%
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] text-text-tertiary">NDCG</p>
                        <p className="text-[13px] font-semibold text-foreground">
                          {(run.metrics.ndcg * 100).toFixed(0)}%
                        </p>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Add Case Modal */}
      <Modal
        isOpen={showAddCaseModal}
        onClose={() => setShowAddCaseModal(false)}
        title="Add Test Case"
        description="Add a query and its expected chunk IDs."
      >
        <form onSubmit={handleAddCase} className="space-y-4">
          <Input
            label="Query"
            value={newCase.query}
            onChange={(e) => setNewCase({ ...newCase, query: e.target.value })}
            placeholder="e.g., What is the refund policy?"
            required
          />
          <Input
            label="Expected Chunk IDs"
            value={newCase.expected_chunk_ids}
            onChange={(e) => setNewCase({ ...newCase, expected_chunk_ids: e.target.value })}
            placeholder="UUID1, UUID2, UUID3..."
            helperText="Comma-separated list of chunk UUIDs that should be retrieved."
          />
          <ModalFooter>
            <Button type="button" variant="secondary" onClick={() => setShowAddCaseModal(false)}>
              Cancel
            </Button>
            <Button type="submit" isLoading={createCase.isPending} disabled={!newCase.query.trim()}>
              Add Case
            </Button>
          </ModalFooter>
        </form>
      </Modal>

      {/* Run Evaluation Modal */}
      <Modal
        isOpen={showRunModal}
        onClose={() => setShowRunModal(false)}
        title="Run Evaluation"
        description="Configure and run the evaluation."
        size="md"
      >
        <div className="space-y-4">
          <Select
            label="Search Mode"
            options={[
              { value: 'vector', label: 'Vector Search' },
              { value: 'hybrid', label: 'Hybrid Search' },
            ]}
            value={runConfig.search_mode || 'vector'}
            onChange={(e) =>
              setRunConfig({ ...runConfig, search_mode: e.target.value as 'vector' | 'hybrid' })
            }
          />
          <Select
            label="Top K"
            options={[
              { value: '3', label: '3 results' },
              { value: '5', label: '5 results' },
              { value: '10', label: '10 results' },
              { value: '20', label: '20 results' },
            ]}
            value={String(runConfig.top_k || 5)}
            onChange={(e) => setRunConfig({ ...runConfig, top_k: parseInt(e.target.value) })}
          />
          {runConfig.search_mode === 'hybrid' && (
            <div className="p-4 bg-surface-secondary rounded-lg space-y-3">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[12px] font-medium text-foreground">Vector Weight</label>
                  <span className="text-[12px] font-mono text-primary">
                    {runConfig.vector_weight?.toFixed(2)}
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={runConfig.vector_weight || 0.7}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    setRunConfig({
                      ...runConfig,
                      vector_weight: v,
                      keyword_weight: Number((1 - v).toFixed(2)),
                    });
                  }}
                  className="w-full h-2 bg-border-light rounded-lg appearance-none cursor-pointer accent-primary"
                />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[12px] font-medium text-foreground">Keyword Weight</label>
                  <span className="text-[12px] font-mono text-info">
                    {runConfig.keyword_weight?.toFixed(2)}
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={runConfig.keyword_weight || 0.3}
                  onChange={(e) => {
                    const k = parseFloat(e.target.value);
                    setRunConfig({
                      ...runConfig,
                      keyword_weight: k,
                      vector_weight: Number((1 - k).toFixed(2)),
                    });
                  }}
                  className="w-full h-2 bg-border-light rounded-lg appearance-none cursor-pointer accent-info"
                />
              </div>
            </div>
          )}
          <ModalFooter>
            <Button variant="secondary" onClick={() => setShowRunModal(false)}>
              Cancel
            </Button>
            <Button onClick={handleRunEvaluation} isLoading={runEvaluation.isPending}>
              <Play className="w-4 h-4 mr-2" />
              Run Evaluation
            </Button>
          </ModalFooter>
        </div>
      </Modal>

      {/* Delete Case Confirmation */}
      <Modal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete Test Case"
        description="Are you sure you want to delete this test case?"
      >
        <ModalFooter>
          <Button variant="secondary" onClick={() => setDeleteTarget(null)}>
            Cancel
          </Button>
          <Button variant="danger" onClick={handleDeleteCase} isLoading={deleteCase.isPending}>
            Delete Case
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
