'use client';

import { Plus, Layers, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FilterRow } from './filter-row';
import {
  FilterGroup as FilterGroupType,
  FilterItem,
  LogicalOperator,
  MetadataField,
  isFilterGroup,
  createFilterCondition,
  createFilterGroup,
} from '@/types/filters';
import { cn } from '@/lib/utils';

interface FilterGroupProps {
  group: FilterGroupType;
  fields?: MetadataField[];
  onChange: (group: FilterGroupType) => void;
  onRemove?: () => void;
  isRoot?: boolean;
  className?: string;
}

export function FilterGroup({
  group,
  fields,
  onChange,
  onRemove,
  isRoot = false,
  className,
}: FilterGroupProps) {
  const handleOperatorChange = (operator: LogicalOperator) => {
    onChange({ ...group, operator });
  };

  const handleConditionChange = (index: number, item: FilterItem) => {
    const newConditions = [...group.conditions];
    newConditions[index] = item;
    onChange({ ...group, conditions: newConditions });
  };

  const handleRemoveCondition = (index: number) => {
    const newConditions = group.conditions.filter((_, i) => i !== index);
    onChange({ ...group, conditions: newConditions });
  };

  const handleAddCondition = () => {
    onChange({
      ...group,
      conditions: [...group.conditions, createFilterCondition()],
    });
  };

  const handleAddGroup = () => {
    const newGroup = createFilterGroup(group.operator === '$and' ? '$or' : '$and');
    // Add one empty condition to the new group
    newGroup.conditions.push(createFilterCondition());
    onChange({
      ...group,
      conditions: [...group.conditions, newGroup],
    });
  };

  return (
    <div
      className={cn(
        'relative',
        !isRoot && 'pl-4 border-l-2 border-primary/30 ml-2',
        className
      )}
    >
      {/* Operator toggle and remove button */}
      <div className="flex items-center gap-2 mb-3">
        <div className="flex items-center gap-1 bg-surface-secondary rounded-lg p-0.5">
          <button
            type="button"
            onClick={() => handleOperatorChange('$and')}
            className={cn(
              'px-3 py-1.5 rounded-md text-[12px] font-semibold uppercase tracking-wide transition-colors',
              group.operator === '$and'
                ? 'bg-primary text-white'
                : 'text-text-secondary hover:text-foreground'
            )}
          >
            AND
          </button>
          <button
            type="button"
            onClick={() => handleOperatorChange('$or')}
            className={cn(
              'px-3 py-1.5 rounded-md text-[12px] font-semibold uppercase tracking-wide transition-colors',
              group.operator === '$or'
                ? 'bg-primary text-white'
                : 'text-text-secondary hover:text-foreground'
            )}
          >
            OR
          </button>
        </div>

        {!isRoot && onRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="p-1.5 rounded-lg text-text-tertiary hover:text-error hover:bg-error/5 transition-colors"
            title="Remove group"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Conditions */}
      <div className="space-y-2">
        {group.conditions.map((item, index) =>
          isFilterGroup(item) ? (
            <FilterGroup
              key={item.id}
              group={item}
              fields={fields}
              onChange={(updatedGroup) => handleConditionChange(index, updatedGroup)}
              onRemove={() => handleRemoveCondition(index)}
            />
          ) : (
            <FilterRow
              key={item.id}
              condition={item}
              fields={fields}
              onChange={(updatedCondition) => handleConditionChange(index, updatedCondition)}
              onRemove={() => handleRemoveCondition(index)}
            />
          )
        )}
      </div>

      {/* Add buttons */}
      <div className="flex items-center gap-2 mt-3">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleAddCondition}
        >
          <Plus className="w-4 h-4 mr-1" />
          Add Condition
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleAddGroup}
        >
          <Layers className="w-4 h-4 mr-1" />
          Add Group
        </Button>
      </div>
    </div>
  );
}
