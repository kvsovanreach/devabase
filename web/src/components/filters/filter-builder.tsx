'use client';

import { useState, useEffect, useCallback } from 'react';
import { Filter, ChevronDown, ChevronUp, Code } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FilterGroup } from './filter-group';
import {
  FilterGroup as FilterGroupType,
  MetadataField,
  COMMON_METADATA_FIELDS,
  createFilterGroup,
  createFilterCondition,
  buildFilterQuery,
} from '@/types/filters';
import { cn } from '@/lib/utils';

interface FilterBuilderProps {
  onChange?: (filter: Record<string, unknown> | null) => void;
  fields?: MetadataField[];
  initialFilter?: FilterGroupType;
  className?: string;
  collapsible?: boolean;
  defaultExpanded?: boolean;
  showPreview?: boolean;
}

export function FilterBuilder({
  onChange,
  fields = COMMON_METADATA_FIELDS,
  initialFilter,
  className,
  collapsible = true,
  defaultExpanded = false,
  showPreview = true,
}: FilterBuilderProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [showJsonPreview, setShowJsonPreview] = useState(false);
  const [filterGroup, setFilterGroup] = useState<FilterGroupType>(() => {
    if (initialFilter) return initialFilter;
    // Start with an empty AND group
    const group = createFilterGroup('$and');
    return group;
  });

  // Memoize the filter query calculation
  const filterQuery = buildFilterQuery(filterGroup);
  const hasFilters = filterGroup.conditions.length > 0;
  const validFilterCount = filterGroup.conditions.filter((c) => {
    if ('conditions' in c) return c.conditions.length > 0;
    return c.field && c.value !== '';
  }).length;

  // Notify parent of changes
  useEffect(() => {
    onChange?.(filterQuery);
  }, [filterQuery, onChange]);

  const handleFilterChange = useCallback((group: FilterGroupType) => {
    setFilterGroup(group);
  }, []);

  const handleAddFilter = () => {
    setFilterGroup((prev) => ({
      ...prev,
      conditions: [...prev.conditions, createFilterCondition()],
    }));
    if (!isExpanded) {
      setIsExpanded(true);
    }
  };

  const handleClear = () => {
    const emptyGroup = createFilterGroup('$and');
    setFilterGroup(emptyGroup);
  };

  // Check if we're in embedded mode (no border/collapsible)
  const isEmbedded = !collapsible && className?.includes('border-0');

  return (
    <div className={cn(!isEmbedded && 'bg-surface border border-border-light rounded-xl', className)}>
      {/* Header - only show if not embedded */}
      {!isEmbedded && (
        <div
          className={cn(
            'flex items-center justify-between px-4 py-3',
            collapsible && 'cursor-pointer',
            hasFilters && isExpanded && 'border-b border-border-light'
          )}
          onClick={collapsible ? () => setIsExpanded(!isExpanded) : undefined}
        >
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-text-secondary" />
            <span className="text-[14px] font-medium text-foreground">Filters</span>
            {validFilterCount > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[11px] font-semibold">
                {validFilterCount} active
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {!hasFilters && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  handleAddFilter();
                }}
              >
                Add Filter
              </Button>
            )}
            {collapsible && hasFilters && (
              isExpanded ? (
                <ChevronUp className="w-4 h-4 text-text-tertiary" />
              ) : (
                <ChevronDown className="w-4 h-4 text-text-tertiary" />
              )
            )}
          </div>
        </div>
      )}

      {/* Filter content */}
      {(isEmbedded || (hasFilters && isExpanded)) && (
        <div className={cn(!isEmbedded && 'p-4')}>
          {/* Add filter button for embedded mode when empty */}
          {isEmbedded && !hasFilters && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleAddFilter}
              className="w-full"
            >
              Add Filter
            </Button>
          )}

          {hasFilters && (
            <>
              <FilterGroup
                group={filterGroup}
                fields={fields}
                onChange={handleFilterChange}
                isRoot
              />

              {/* Actions and preview */}
              <div className="flex items-center justify-between mt-3 pt-3 border-t border-border-light">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleClear}
                >
                  Clear All
                </Button>
                {showPreview && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowJsonPreview(!showJsonPreview)}
                  >
                    <Code className="w-4 h-4 mr-1" />
                    {showJsonPreview ? 'Hide' : 'Show'} JSON
                  </Button>
                )}
              </div>

              {/* JSON preview */}
              {showPreview && showJsonPreview && filterQuery && (
                <div className="mt-3 p-3 bg-surface-secondary rounded-lg">
                  <pre className="text-[12px] font-mono text-text-secondary overflow-x-auto">
                    {JSON.stringify(filterQuery, null, 2)}
                  </pre>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// Export individual components for flexibility
export { FilterGroup } from './filter-group';
export { FilterRow } from './filter-row';
