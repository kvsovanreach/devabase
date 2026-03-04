'use client';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useCollections } from '@/hooks/use-collections';
import { useSearch, useMultiCollectionSearch, useHybridSearch, MultiCollectionSearchResult } from '@/hooks/use-search';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Spinner } from '@/components/ui/spinner';
import { FilterBuilder } from '@/components/filters';
import {
  Search as SearchIcon,
  FileText,
  FolderOpen,
  Layers,
  Check,
  Zap,
  Type,
  Sparkles,
  Filter,
  ChevronDown,
  X,
  SlidersHorizontal,
  ArrowUpDown,
} from 'lucide-react';
import type { SearchResult, HybridSearchResult } from '@/types';
import { cn } from '@/lib/utils';

type SearchMode = 'single' | 'multi';
type SearchType = 'vector' | 'hybrid';

type UnifiedResult = (SearchResult & { collection?: string; collection_name?: string; vector_score?: number; keyword_score?: number }) | MultiCollectionSearchResult | HybridSearchResult;

export default function SearchPage() {
  const { data: collections } = useCollections();
  const searchMutation = useSearch();
  const multiSearchMutation = useMultiCollectionSearch();
  const hybridSearchMutation = useHybridSearch();

  const [query, setQuery] = useState('');
  const [searchMode, setSearchMode] = useState<SearchMode>('single');
  const [searchType, setSearchType] = useState<SearchType>('vector');
  const [selectedCollection, setSelectedCollection] = useState('');
  const [selectedCollections, setSelectedCollections] = useState<string[]>([]);

  // Get collection with most vectors for auto-selection
  const collectionWithMostVectors = useMemo(() => {
    if (!collections || collections.length === 0) return '';
    const sorted = [...collections].sort((a, b) => b.vector_count - a.vector_count);
    return sorted[0]?.name ?? '';
  }, [collections]);

  // Auto-select collection with most vectors when collections load
  useEffect(() => {
    if (collectionWithMostVectors && !selectedCollection) {
      setSelectedCollection(collectionWithMostVectors);
    }
  }, [collectionWithMostVectors, selectedCollection]);
  const [limit, setLimit] = useState('10');
  const [results, setResults] = useState<UnifiedResult[] | null>(null);
  const [collectionsSearched, setCollectionsSearched] = useState<string[]>([]);
  const [filter, setFilter] = useState<Record<string, unknown> | null>(null);

  const [vectorWeight, setVectorWeight] = useState(0.7);
  const [keywordWeight, setKeywordWeight] = useState(0.3);
  const [rerankEnabled, setRerankEnabled] = useState(false);

  const [showFilters, setShowFilters] = useState(false);
  const [showHybridPanel, setShowHybridPanel] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);
  const hybridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
        setShowFilters(false);
      }
      if (hybridRef.current && !hybridRef.current.contains(e.target as Node)) {
        setShowHybridPanel(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleFilterChange = useCallback((newFilter: Record<string, unknown> | null) => {
    setFilter(newFilter);
  }, []);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    if (searchMode === 'single') {
      if (!selectedCollection) return;
      try {
        if (searchType === 'hybrid') {
          const data = await hybridSearchMutation.mutateAsync({
            query: query.trim(),
            collection: selectedCollection,
            limit: parseInt(limit),
            vector_weight: vectorWeight,
            keyword_weight: keywordWeight,
            filter: filter || undefined,
          });
          setResults(data);
        } else {
          const data = await searchMutation.mutateAsync({
            query: query.trim(),
            collection: selectedCollection,
            limit: parseInt(limit),
            filter: filter || undefined,
            rerank: rerankEnabled,
          });
          setResults(data);
        }
        setCollectionsSearched([selectedCollection]);
      } catch {
        // Error handled by mutation
      }
    } else {
      if (selectedCollections.length === 0) return;
      try {
        const data = await multiSearchMutation.mutateAsync({
          collections: selectedCollections,
          query: query.trim(),
          top_k: parseInt(limit),
          filter: filter || undefined,
        });
        setResults(data.results);
        setCollectionsSearched(data.collections_searched);
      } catch {
        // Error handled by mutation
      }
    }
  };

  const toggleCollection = (name: string) => {
    setSelectedCollections((prev) =>
      prev.includes(name) ? prev.filter((c) => c !== name) : [...prev, name]
    );
  };

  const collectionOptions = (collections || []).map((c) => ({
    value: c.name,
    label: c.name,
  }));

  const limitOptions = [
    { value: '5', label: '5' },
    { value: '10', label: '10' },
    { value: '20', label: '20' },
    { value: '50', label: '50' },
  ];

  const isPending = searchMutation.isPending || multiSearchMutation.isPending || hybridSearchMutation.isPending;
  const canSearch = query.trim() && (searchMode === 'single' ? selectedCollection : selectedCollections.length > 0);
  const activeFilterCount = filter ? Object.keys(filter).length : 0;

  return (
    <div className="flex flex-col h-screen">
      <Header />
      <div className="flex-1 overflow-hidden flex flex-col p-4 md:p-6">
        {/* Search Section */}
        <div className="flex-shrink-0 mb-4">
          <form onSubmit={handleSearch}>
            {/* Search Bar - Large and Prominent */}
            <div className="relative mb-3">
              <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-text-tertiary" />
              <input
                type="text"
                placeholder="Search your documents..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full h-12 pl-12 pr-28 rounded-xl border border-border-light bg-surface text-[15px] text-foreground placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
              <Button
                type="submit"
                size="sm"
                isLoading={isPending}
                disabled={!canSearch}
                className="absolute right-2 top-1/2 -translate-y-1/2"
              >
                Search
              </Button>
            </div>

            {/* Options Row - All controls h-9 (36px) */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Mode: Single/Multi */}
              <div className="flex items-center h-9 border border-border-light rounded-lg overflow-hidden">
                <button
                  type="button"
                  onClick={() => setSearchMode('single')}
                  className={cn(
                    'flex items-center gap-1.5 h-full px-3 text-[13px] font-medium transition-colors',
                    searchMode === 'single'
                      ? 'bg-primary text-white'
                      : 'bg-surface text-text-secondary hover:bg-surface-hover'
                  )}
                >
                  <FolderOpen className="w-4 h-4" />
                  Single
                </button>
                <button
                  type="button"
                  onClick={() => setSearchMode('multi')}
                  className={cn(
                    'flex items-center gap-1.5 h-full px-3 text-[13px] font-medium transition-colors',
                    searchMode === 'multi'
                      ? 'bg-primary text-white'
                      : 'bg-surface text-text-secondary hover:bg-surface-hover'
                  )}
                >
                  <Layers className="w-4 h-4" />
                  Multi
                </button>
              </div>

              {/* Collection(s) */}
              {searchMode === 'single' ? (
                <Select
                  options={collectionOptions}
                  value={selectedCollection}
                  onChange={(e) => setSelectedCollection(e.target.value)}
                  placeholder="Select collection"
                  className="w-48 !h-9 !py-0 !rounded-lg text-[13px]"
                />
              ) : (
                <div className="flex items-center gap-1 flex-wrap">
                  {(collections || []).map((c) => {
                    const selected = selectedCollections.includes(c.name);
                    return (
                      <button
                        key={c.name}
                        type="button"
                        onClick={() => toggleCollection(c.name)}
                        className={cn(
                          'flex items-center gap-1 h-9 px-3 rounded-lg text-[13px] font-medium border transition-colors',
                          selected
                            ? 'bg-primary/10 border-primary text-primary'
                            : 'bg-surface border-border-light text-text-secondary hover:border-primary'
                        )}
                      >
                        {selected && <Check className="w-3.5 h-3.5" />}
                        {c.name}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Divider */}
              <div className="w-px h-6 bg-border-light hidden sm:block" />

              {/* Search Type (single mode) */}
              {searchMode === 'single' && (
                <div className="flex items-center h-9 border border-border-light rounded-lg overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setSearchType('vector')}
                    className={cn(
                      'flex items-center gap-1.5 h-full px-3 text-[13px] font-medium transition-colors',
                      searchType === 'vector'
                        ? 'bg-primary text-white'
                        : 'bg-surface text-text-secondary hover:bg-surface-hover'
                    )}
                  >
                    <Zap className="w-4 h-4" />
                    Vector
                  </button>
                  <button
                    type="button"
                    onClick={() => setSearchType('hybrid')}
                    className={cn(
                      'flex items-center gap-1.5 h-full px-3 text-[13px] font-medium transition-colors',
                      searchType === 'hybrid'
                        ? 'bg-primary text-white'
                        : 'bg-surface text-text-secondary hover:bg-surface-hover'
                    )}
                  >
                    <Sparkles className="w-4 h-4" />
                    Hybrid
                  </button>
                </div>
              )}

              {/* Rerank Toggle (only for vector search) */}
              {searchMode === 'single' && searchType === 'vector' && (
                <button
                  type="button"
                  onClick={() => setRerankEnabled(!rerankEnabled)}
                  className={cn(
                    'flex items-center gap-1.5 h-9 px-3 rounded-lg text-[13px] font-medium border transition-colors',
                    rerankEnabled
                      ? 'bg-primary/10 border-primary text-primary'
                      : 'border-border-light text-text-secondary hover:border-primary'
                  )}
                >
                  <ArrowUpDown className="w-4 h-4" />
                  Rerank
                </button>
              )}

              {/* Hybrid Weights */}
              {searchMode === 'single' && searchType === 'hybrid' && (
                <div className="relative" ref={hybridRef}>
                  <button
                    type="button"
                    onClick={() => setShowHybridPanel(!showHybridPanel)}
                    className={cn(
                      'flex items-center gap-1.5 h-9 px-3 rounded-lg text-[13px] font-medium border transition-colors',
                      showHybridPanel
                        ? 'bg-primary/10 border-primary text-primary'
                        : 'border-border-light text-text-secondary hover:border-primary'
                    )}
                  >
                    <SlidersHorizontal className="w-4 h-4" />
                    {vectorWeight}:{keywordWeight}
                  </button>
                  {showHybridPanel && (
                    <div className="absolute top-full left-0 mt-1 w-72 p-4 bg-surface border border-border-light rounded-xl shadow-lg z-50">
                      <div className="space-y-4">
                        <div>
                          <div className="flex justify-between text-[12px] mb-1">
                            <span className="flex items-center gap-1 text-text-secondary">
                              <Zap className="w-3.5 h-3.5 text-primary" /> Vector
                            </span>
                            <span className="font-mono text-primary">{vectorWeight}</span>
                          </div>
                          <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.1"
                            value={vectorWeight}
                            onChange={(e) => {
                              const v = parseFloat(e.target.value);
                              setVectorWeight(v);
                              setKeywordWeight(Number((1 - v).toFixed(1)));
                            }}
                            className="w-full h-2 bg-border-light rounded-full appearance-none cursor-pointer accent-primary"
                          />
                        </div>
                        <div>
                          <div className="flex justify-between text-[12px] mb-1">
                            <span className="flex items-center gap-1 text-text-secondary">
                              <Type className="w-3.5 h-3.5 text-info" /> Keyword
                            </span>
                            <span className="font-mono text-info">{keywordWeight}</span>
                          </div>
                          <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.1"
                            value={keywordWeight}
                            onChange={(e) => {
                              const k = parseFloat(e.target.value);
                              setKeywordWeight(k);
                              setVectorWeight(Number((1 - k).toFixed(1)));
                            }}
                            className="w-full h-2 bg-border-light rounded-full appearance-none cursor-pointer accent-info"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Limit */}
              <div className="flex items-center gap-1.5">
                <span className="text-[12px] text-text-tertiary">Top</span>
                <Select
                  options={limitOptions}
                  value={limit}
                  onChange={(e) => setLimit(e.target.value)}
                  className="w-20 !h-9 !py-0 !rounded-lg text-[13px]"
                />
              </div>

              {/* Filters */}
              <div className="relative" ref={filterRef}>
                <button
                  type="button"
                  onClick={() => setShowFilters(!showFilters)}
                  className={cn(
                    'flex items-center gap-1.5 h-9 px-3 rounded-lg text-[13px] font-medium border transition-colors',
                    activeFilterCount > 0 || showFilters
                      ? 'bg-primary/10 border-primary text-primary'
                      : 'border-border-light text-text-secondary hover:border-primary'
                  )}
                >
                  <Filter className="w-4 h-4" />
                  Filters
                  {activeFilterCount > 0 && (
                    <span className="px-1.5 py-0.5 rounded-full bg-primary text-white text-[10px]">
                      {activeFilterCount}
                    </span>
                  )}
                  <ChevronDown className={cn('w-3.5 h-3.5 transition-transform', showFilters && 'rotate-180')} />
                </button>
                {showFilters && (
                  <div className="absolute top-full right-0 mt-1 w-[420px] bg-surface border border-border-light rounded-xl shadow-lg z-50 flex flex-col max-h-[400px]">
                    <div className="flex-shrink-0 p-3 border-b border-border-light flex items-center justify-between">
                      <span className="text-[13px] font-medium text-foreground">Metadata Filters</span>
                      <button
                        type="button"
                        onClick={() => setShowFilters(false)}
                        className="p-1 text-text-tertiary hover:text-foreground rounded"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="flex-1 overflow-y-auto overflow-x-hidden p-3 scrollbar-none">
                      <FilterBuilder
                        onChange={handleFilterChange}
                        collapsible={false}
                        defaultExpanded={true}
                        showPreview={false}
                        className="border-0 p-0"
                      />
                    </div>
                  </div>
                )}
              </div>

              {activeFilterCount > 0 && (
                <button
                  type="button"
                  onClick={() => setFilter(null)}
                  className="h-9 px-2 text-[12px] text-error hover:underline"
                >
                  Clear
                </button>
              )}
            </div>
          </form>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-auto">
          {isPending ? (
            <div className="flex justify-center py-16">
              <Spinner size="lg" />
            </div>
          ) : results === null ? (
            <EmptyState
              icon={<SearchIcon className="w-8 h-8" />}
              title="Start searching"
              description="Enter a query to search your documents."
            />
          ) : results.length === 0 ? (
            <EmptyState
              icon={<SearchIcon className="w-8 h-8" />}
              title="No results found"
              description="Try a different query or collection."
            />
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between sticky top-0 bg-background py-2 z-10">
                <p className="text-[13px] font-medium text-text-secondary">
                  {results.length} result{results.length === 1 ? '' : 's'} found
                </p>
                {searchMode === 'multi' && collectionsSearched.length > 0 && (
                  <div className="flex items-center gap-1">
                    {collectionsSearched.map((name) => (
                      <Badge key={name} variant="default" className="text-[10px]">
                        {name}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              {results.map((result, index) => {
                const isHybridResult = 'vector_score' in result && 'keyword_score' in result;
                const hasRerankScore = 'rerank_score' in result && result.rerank_score !== undefined && result.rerank_score !== null;
                return (
                  <Card key={result.id} className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <span className="text-[12px] font-semibold text-primary">{index + 1}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          <FileText className="w-4 h-4 text-text-tertiary" />
                          <span className="text-[12px] text-text-tertiary font-mono">
                            {result.document_id.slice(0, 8)}
                          </span>
                          {(('collection' in result && result.collection) || ('collection_name' in result && result.collection_name)) && (
                            <Badge variant="default" className="text-[10px]">
                              <FolderOpen className="w-3 h-3 mr-1" />
                              {('collection' in result && result.collection) || ('collection_name' in result && result.collection_name)}
                            </Badge>
                          )}
                          {hasRerankScore ? (
                            <>
                              <Badge variant="primary">
                                <ArrowUpDown className="w-3 h-3 mr-0.5" />
                                {((result as SearchResult).rerank_score! * 100).toFixed(1)}%
                              </Badge>
                              <Badge variant="default" className="text-[10px]">
                                <Zap className="w-3 h-3 mr-0.5" />
                                {(result.score * 100).toFixed(0)}%
                              </Badge>
                            </>
                          ) : (
                            <Badge variant="primary">
                              {(result.score * 100).toFixed(1)}% match
                            </Badge>
                          )}
                          {isHybridResult && (
                            <>
                              <Badge variant="default" className="text-[10px]">
                                <Zap className="w-3 h-3 mr-0.5" />
                                {((result as HybridSearchResult).vector_score * 100).toFixed(0)}%
                              </Badge>
                              <Badge variant="default" className="text-[10px]">
                                <Type className="w-3 h-3 mr-0.5" />
                                {((result as HybridSearchResult).keyword_score * 100).toFixed(0)}%
                              </Badge>
                            </>
                          )}
                        </div>
                        <p className="text-[14px] text-foreground leading-relaxed whitespace-pre-wrap">
                          {result.content}
                        </p>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
