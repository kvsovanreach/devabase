'use client';

import { useState } from 'react';
import { useCollections } from '@/hooks/use-collections';
import { useSearch, useMultiCollectionSearch, MultiCollectionSearchResult } from '@/hooks/use-search';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Spinner } from '@/components/ui/spinner';
import { Search as SearchIcon, FileText, FolderOpen, Layers, Check } from 'lucide-react';
import { SearchResult } from '@/types';
import { cn } from '@/lib/utils';

type SearchMode = 'single' | 'multi';

// Union type for results
type UnifiedResult = (SearchResult & { collection_name?: string }) | MultiCollectionSearchResult;

export default function SearchPage() {
  const { data: collections } = useCollections();
  const searchMutation = useSearch();
  const multiSearchMutation = useMultiCollectionSearch();

  const [query, setQuery] = useState('');
  const [searchMode, setSearchMode] = useState<SearchMode>('single');
  const [selectedCollection, setSelectedCollection] = useState('');
  const [selectedCollections, setSelectedCollections] = useState<string[]>([]);
  const [limit, setLimit] = useState('10');
  const [results, setResults] = useState<UnifiedResult[] | null>(null);
  const [collectionsSearched, setCollectionsSearched] = useState<string[]>([]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    if (searchMode === 'single') {
      if (!selectedCollection) return;
      try {
        const data = await searchMutation.mutateAsync({
          query: query.trim(),
          collection: selectedCollection,
          limit: parseInt(limit),
        });
        setResults(data);
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
        });
        setResults(data.results);
        setCollectionsSearched(data.collections_searched);
      } catch {
        // Error handled by mutation
      }
    }
  };

  const toggleCollection = (collectionName: string) => {
    setSelectedCollections((prev) =>
      prev.includes(collectionName)
        ? prev.filter((c) => c !== collectionName)
        : [...prev, collectionName]
    );
  };

  const selectAllCollections = () => {
    if (collections) {
      setSelectedCollections(collections.map((c) => c.name));
    }
  };

  const clearAllCollections = () => {
    setSelectedCollections([]);
  };

  const collectionOptions = (collections || []).map((c) => ({
    value: c.name,
    label: c.name,
  }));

  const limitOptions = [
    { value: '5', label: '5 results' },
    { value: '10', label: '10 results' },
    { value: '20', label: '20 results' },
    { value: '50', label: '50 results' },
  ];

  const isPending = searchMutation.isPending || multiSearchMutation.isPending;
  const canSearch =
    query.trim() &&
    (searchMode === 'single' ? selectedCollection : selectedCollections.length > 0);

  return (
    <div>
      <Header />
      <div className="p-4 md:p-8">
        <div className="mb-6 md:mb-8">
          <h2 className="text-[22px] md:text-[26px] font-semibold text-foreground tracking-tight">
            Semantic Search
          </h2>
          <p className="text-[14px] md:text-[15px] text-text-secondary mt-1">
            Search your documents using natural language queries.
          </p>
        </div>

        <Card padding="md" className="mb-6 md:mb-8">
          <form onSubmit={handleSearch} className="space-y-4 md:space-y-5">
            {/* Search Mode Toggle */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSearchMode('single')}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-medium transition-all',
                  searchMode === 'single'
                    ? 'bg-primary text-white'
                    : 'bg-surface-secondary text-text-secondary hover:text-foreground'
                )}
              >
                <FolderOpen className="w-4 h-4" />
                Single Collection
              </button>
              <button
                type="button"
                onClick={() => setSearchMode('multi')}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-medium transition-all',
                  searchMode === 'multi'
                    ? 'bg-primary text-white'
                    : 'bg-surface-secondary text-text-secondary hover:text-foreground'
                )}
              >
                <Layers className="w-4 h-4" />
                Multi-Collection
              </button>
            </div>

            {/* Search Input */}
            <div className="flex flex-col sm:flex-row gap-3 md:gap-4">
              <div className="flex-1">
                <Input
                  placeholder="Enter your search query..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
              <Button
                type="submit"
                size="lg"
                isLoading={isPending}
                disabled={!canSearch}
                className="w-full sm:w-auto"
              >
                <SearchIcon className="w-4 h-4 mr-2" />
                Search
              </Button>
            </div>

            {/* Collection Selection */}
            {searchMode === 'single' ? (
              <div className="flex flex-col sm:flex-row gap-3 md:gap-4">
                <div className="w-full sm:w-56">
                  <Select
                    options={collectionOptions}
                    value={selectedCollection}
                    onChange={(e) => setSelectedCollection(e.target.value)}
                    placeholder="Select collection"
                  />
                </div>
                <div className="w-full sm:w-40">
                  <Select
                    options={limitOptions}
                    value={limit}
                    onChange={(e) => setLimit(e.target.value)}
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-medium text-foreground">
                    Select Collections ({selectedCollections.length} selected)
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={selectAllCollections}
                      className="text-[12px] text-primary hover:underline"
                    >
                      Select All
                    </button>
                    <span className="text-text-tertiary">|</span>
                    <button
                      type="button"
                      onClick={clearAllCollections}
                      className="text-[12px] text-text-secondary hover:text-foreground"
                    >
                      Clear
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(collections || []).map((collection) => {
                    const isSelected = selectedCollections.includes(collection.name);
                    return (
                      <button
                        key={collection.name}
                        type="button"
                        onClick={() => toggleCollection(collection.name)}
                        className={cn(
                          'flex items-center gap-2 px-3 py-1.5 rounded-full text-[13px] font-medium transition-all border',
                          isSelected
                            ? 'bg-primary/10 border-primary text-primary'
                            : 'bg-surface-secondary border-border-light text-text-secondary hover:border-primary hover:text-foreground'
                        )}
                      >
                        {isSelected && <Check className="w-3.5 h-3.5" />}
                        <FolderOpen className="w-3.5 h-3.5" />
                        {collection.name}
                        <span className="text-[11px] opacity-60">
                          ({collection.vector_count})
                        </span>
                      </button>
                    );
                  })}
                </div>
                <div className="w-full sm:w-40">
                  <Select
                    label="Results Limit"
                    options={limitOptions}
                    value={limit}
                    onChange={(e) => setLimit(e.target.value)}
                  />
                </div>
              </div>
            )}
          </form>
        </Card>

        <div>
          {isPending ? (
            <div className="flex justify-center py-12 md:py-16">
              <Spinner size="lg" />
            </div>
          ) : results === null ? (
            <EmptyState
              icon={<SearchIcon className="w-8 h-8" />}
              title="Start searching"
              description="Enter a query above to search your documents."
            />
          ) : results.length === 0 ? (
            <EmptyState
              icon={<SearchIcon className="w-8 h-8" />}
              title="No results found"
              description="Try a different query or search in different collections."
            />
          ) : (
            <div className="space-y-3 md:space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-[12px] md:text-[13px] font-medium text-text-secondary uppercase tracking-wide">
                  {results.length} result{results.length === 1 ? '' : 's'} found
                </p>
                {searchMode === 'multi' && collectionsSearched.length > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] text-text-tertiary">Searched:</span>
                    <div className="flex flex-wrap gap-1">
                      {collectionsSearched.map((name) => (
                        <Badge key={name} variant="default" className="text-[10px]">
                          {name}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              {results.map((result, index) => (
                <Card key={result.id} className="p-4 md:p-5">
                  <div className="flex items-start gap-3 md:gap-4">
                    <div className="flex-shrink-0 w-8 h-8 md:w-9 md:h-9 rounded-full bg-primary/10 flex items-center justify-center">
                      <span className="text-[12px] md:text-[13px] font-semibold text-primary">
                        {index + 1}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 md:gap-2.5 mb-2 md:mb-2.5">
                        <FileText className="w-4 h-4 text-text-secondary flex-shrink-0" />
                        <span className="text-[12px] md:text-[13px] text-text-secondary truncate">
                          Doc {result.document_id.slice(0, 8)}...
                        </span>
                        {'collection_name' in result && result.collection_name && (
                          <Badge variant="default" className="text-[10px]">
                            <FolderOpen className="w-3 h-3 mr-1" />
                            {result.collection_name}
                          </Badge>
                        )}
                        <Badge variant="primary">
                          {(result.score * 100).toFixed(1)}% match
                        </Badge>
                      </div>
                      <p className="text-[14px] md:text-[15px] text-foreground leading-relaxed whitespace-pre-wrap">
                        {result.content}
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
  );
}
