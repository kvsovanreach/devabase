'use client';

import { useState, useMemo } from 'react';
import { Header } from '@/components/layout/header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Spinner } from '@/components/ui/spinner';
import { Select } from '@/components/ui/select';
import { GraphViewer } from '@/components/knowledge/graph-viewer';
import {
  useEntities,
  useEntity,
  useEntityGraph,
  useSearchEntities,
  useKnowledgeStats,
  useDeleteEntity,
} from '@/hooks/use-knowledge';
import {
  Share2,
  Search,
  Users,
  Building2,
  MapPin,
  Lightbulb,
  Package,
  Calendar,
  Code,
  Circle,
  ArrowRight,
  ArrowLeft,
  Trash2,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Entity } from '@/types';

const entityTypeIcons: Record<string, React.ReactNode> = {
  person: <Users className="w-4 h-4" />,
  organization: <Building2 className="w-4 h-4" />,
  location: <MapPin className="w-4 h-4" />,
  concept: <Lightbulb className="w-4 h-4" />,
  product: <Package className="w-4 h-4" />,
  event: <Calendar className="w-4 h-4" />,
  technology: <Code className="w-4 h-4" />,
};

const entityTypeColors: Record<string, string> = {
  person: 'bg-blue-500',
  organization: 'bg-purple-500',
  location: 'bg-green-500',
  concept: 'bg-amber-500',
  product: 'bg-pink-500',
  event: 'bg-cyan-500',
  technology: 'bg-indigo-500',
};

export default function KnowledgePage() {
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string>('');
  const [graphDepth, setGraphDepth] = useState(1);

  const { data: stats, isLoading: statsLoading } = useKnowledgeStats();
  const { data: entities, isLoading: entitiesLoading } = useEntities({
    entity_type: filterType || undefined,
    limit: 100,
  });
  const { data: selectedEntity, isLoading: entityLoading } = useEntity(selectedEntityId);
  const { data: graphData, isLoading: graphLoading } = useEntityGraph(selectedEntityId, graphDepth);
  const searchMutation = useSearchEntities();
  const deleteMutation = useDeleteEntity();

  const [searchResults, setSearchResults] = useState<Entity[] | null>(null);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) {
      setSearchResults(null);
      return;
    }
    const results = await searchMutation.mutateAsync({
      query: searchQuery.trim(),
      entity_type: filterType || undefined,
      limit: 20,
    });
    setSearchResults(results);
  };

  const handleClearSearch = () => {
    setSearchQuery('');
    setSearchResults(null);
  };

  const displayedEntities = searchResults || entities || [];

  const entityTypes = useMemo(() => {
    const types = new Set<string>();
    entities?.forEach((e) => types.add(e.entity_type));
    return Array.from(types).sort();
  }, [entities]);

  const handleDeleteEntity = async (entityId: string) => {
    if (!confirm('Are you sure you want to delete this entity? This will also remove all its relationships.')) {
      return;
    }
    await deleteMutation.mutateAsync(entityId);
    if (selectedEntityId === entityId) {
      setSelectedEntityId(null);
    }
  };

  return (
    <div className="flex flex-col h-screen">
      <Header />
      <div className="flex-1 overflow-hidden flex flex-col p-4 md:p-6">
        {/* Stats Cards */}
        <div className="flex-shrink-0 grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Share2 className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-semibold text-foreground">
                  {statsLoading ? '-' : stats?.total_entities || 0}
                </p>
                <p className="text-[12px] text-text-tertiary">Entities</p>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-info/10 flex items-center justify-center">
                <ArrowRight className="w-5 h-5 text-info" />
              </div>
              <div>
                <p className="text-2xl font-semibold text-foreground">
                  {statsLoading ? '-' : stats?.total_relationships || 0}
                </p>
                <p className="text-[12px] text-text-tertiary">Relationships</p>
              </div>
            </div>
          </Card>
          <Card className="p-4 col-span-2">
            <p className="text-[12px] text-text-tertiary mb-2">By Type</p>
            <div className="flex flex-wrap gap-2">
              {statsLoading ? (
                <Spinner size="sm" />
              ) : (
                stats?.entities_by_type.slice(0, 5).map((item) => (
                  <Badge key={item.entity_type} variant="default" className="text-[11px]">
                    {entityTypeIcons[item.entity_type.toLowerCase()] || <Circle className="w-3 h-3" />}
                    <span className="ml-1 capitalize">{item.entity_type}</span>
                    <span className="ml-1 opacity-70">{item.count}</span>
                  </Badge>
                ))
              )}
            </div>
          </Card>
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-hidden flex gap-4">
          {/* Entity List Panel */}
          <div className="w-80 flex-shrink-0 flex flex-col bg-surface border border-border-light rounded-xl overflow-hidden">
            {/* Search */}
            <div className="p-3 border-b border-border-light">
              <form onSubmit={handleSearch} className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary" />
                  <input
                    type="text"
                    placeholder="Search entities..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full h-9 pl-9 pr-8 text-[13px] rounded-lg border border-border-light bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={handleClearSearch}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-text-tertiary hover:text-foreground"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
                <Button type="submit" size="sm" variant="secondary" isLoading={searchMutation.isPending}>
                  <Search className="w-4 h-4" />
                </Button>
              </form>
              <div className="mt-2">
                <Select
                  options={[
                    { value: '', label: 'All Types' },
                    ...entityTypes.map((t) => ({ value: t, label: t.charAt(0).toUpperCase() + t.slice(1) })),
                  ]}
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value)}
                  className="w-full !h-8 text-[12px]"
                />
              </div>
            </div>

            {/* Entity List */}
            <div className="flex-1 overflow-auto">
              {entitiesLoading ? (
                <div className="flex justify-center py-8">
                  <Spinner size="md" />
                </div>
              ) : displayedEntities.length === 0 ? (
                <EmptyState
                  icon={<Share2 className="w-6 h-6" />}
                  title="No entities"
                  description={searchQuery ? 'No entities match your search.' : 'Extract entities from documents to populate the knowledge graph.'}
                  className="py-8"
                />
              ) : (
                <div className="p-2 space-y-1">
                  {displayedEntities.map((entity) => (
                    <button
                      key={entity.id}
                      onClick={() => setSelectedEntityId(entity.id)}
                      className={cn(
                        'w-full flex items-center gap-3 p-3 rounded-lg text-left transition-colors',
                        selectedEntityId === entity.id
                          ? 'bg-primary/10 border border-primary'
                          : 'hover:bg-surface-hover border border-transparent'
                      )}
                    >
                      <div
                        className={cn(
                          'w-8 h-8 rounded-full flex items-center justify-center text-white flex-shrink-0',
                          entityTypeColors[entity.entity_type.toLowerCase()] || 'bg-gray-500'
                        )}
                      >
                        {entityTypeIcons[entity.entity_type.toLowerCase()] || <Circle className="w-4 h-4" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-medium text-foreground truncate">{entity.name}</p>
                        <p className="text-[11px] text-text-tertiary capitalize">{entity.entity_type}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Graph View */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {selectedEntityId ? (
              <>
                {/* Graph Controls */}
                <div className="flex-shrink-0 flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <h2 className="text-[15px] font-medium text-foreground">
                      {entityLoading ? 'Loading...' : selectedEntity?.name}
                    </h2>
                    {selectedEntity && (
                      <Badge variant="default" className="capitalize text-[11px]">
                        {selectedEntity.entity_type}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] text-text-tertiary">Depth:</span>
                    <Select
                      options={[
                        { value: '1', label: '1' },
                        { value: '2', label: '2' },
                        { value: '3', label: '3' },
                      ]}
                      value={graphDepth.toString()}
                      onChange={(e) => setGraphDepth(parseInt(e.target.value))}
                      className="w-16 !h-8 text-[12px]"
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDeleteEntity(selectedEntityId)}
                      disabled={deleteMutation.isPending}
                    >
                      <Trash2 className="w-4 h-4 text-error" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setSelectedEntityId(null)}>
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                {/* Graph */}
                <div className="flex-1 min-h-0">
                  {graphLoading ? (
                    <div className="flex items-center justify-center h-full bg-surface-secondary rounded-xl">
                      <Spinner size="lg" />
                    </div>
                  ) : (
                    <GraphViewer
                      data={graphData || null}
                      centerId={selectedEntityId}
                      onNodeClick={(nodeId) => setSelectedEntityId(nodeId)}
                      className="h-full"
                    />
                  )}
                </div>

                {/* Relationships Panel */}
                {selectedEntity && (
                  <div className="flex-shrink-0 mt-3 grid grid-cols-2 gap-3">
                    <Card className="p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <ArrowRight className="w-4 h-4 text-primary" />
                        <span className="text-[12px] font-medium text-foreground">
                          Outgoing ({selectedEntity.outgoing_relationships.length})
                        </span>
                      </div>
                      <div className="space-y-1 max-h-32 overflow-auto">
                        {selectedEntity.outgoing_relationships.length === 0 ? (
                          <p className="text-[11px] text-text-tertiary">No outgoing relationships</p>
                        ) : (
                          selectedEntity.outgoing_relationships.slice(0, 5).map((rel) => (
                            <button
                              key={rel.relationship.id}
                              onClick={() => setSelectedEntityId(rel.related_entity.id)}
                              className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-surface-hover text-left"
                            >
                              <span className="text-[11px] text-info">{rel.relationship.relationship_type}</span>
                              <ArrowRight className="w-3 h-3 text-text-tertiary" />
                              <span className="text-[11px] text-foreground truncate">{rel.related_entity.name}</span>
                            </button>
                          ))
                        )}
                      </div>
                    </Card>
                    <Card className="p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <ArrowLeft className="w-4 h-4 text-success" />
                        <span className="text-[12px] font-medium text-foreground">
                          Incoming ({selectedEntity.incoming_relationships.length})
                        </span>
                      </div>
                      <div className="space-y-1 max-h-32 overflow-auto">
                        {selectedEntity.incoming_relationships.length === 0 ? (
                          <p className="text-[11px] text-text-tertiary">No incoming relationships</p>
                        ) : (
                          selectedEntity.incoming_relationships.slice(0, 5).map((rel) => (
                            <button
                              key={rel.relationship.id}
                              onClick={() => setSelectedEntityId(rel.related_entity.id)}
                              className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-surface-hover text-left"
                            >
                              <span className="text-[11px] text-foreground truncate">{rel.related_entity.name}</span>
                              <ArrowRight className="w-3 h-3 text-text-tertiary" />
                              <span className="text-[11px] text-success">{rel.relationship.relationship_type}</span>
                            </button>
                          ))
                        )}
                      </div>
                    </Card>
                  </div>
                )}
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center bg-surface-secondary rounded-xl">
                <EmptyState
                  icon={<Share2 className="w-8 h-8" />}
                  title="Select an entity"
                  description="Click on an entity from the list to view its knowledge graph."
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
