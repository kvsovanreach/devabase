'use client';

import { X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import {
  FilterCondition,
  FilterOperator,
  FILTER_OPERATORS,
  MetadataField,
  COMMON_METADATA_FIELDS,
} from '@/types/filters';
import { cn } from '@/lib/utils';

interface FilterRowProps {
  condition: FilterCondition;
  fields?: MetadataField[];
  onChange: (condition: FilterCondition) => void;
  onRemove: () => void;
  className?: string;
}

export function FilterRow({
  condition,
  fields = COMMON_METADATA_FIELDS,
  onChange,
  onRemove,
  className,
}: FilterRowProps) {
  const currentOperator = FILTER_OPERATORS.find((op) => op.value === condition.operator);
  const isArrayOperator = currentOperator?.supportsArray;

  const fieldOptions = [
    { value: '', label: 'Select field...' },
    ...fields.map((f) => ({
      value: f.name,
      label: f.name,
    })),
    { value: '_custom', label: '+ Custom field' },
  ];

  const operatorOptions = FILTER_OPERATORS.map((op) => ({
    value: op.value,
    label: op.label,
  }));

  const handleFieldChange = (value: string) => {
    if (value === '_custom') {
      // For custom field, set to empty string and let user type
      onChange({ ...condition, field: '' });
    } else {
      onChange({ ...condition, field: value });
    }
  };

  const handleOperatorChange = (value: string) => {
    const newOperator = value as FilterOperator;
    const operatorInfo = FILTER_OPERATORS.find((op) => op.value === newOperator);

    // Reset value if switching between array and non-array operators
    let newValue = condition.value;
    if (operatorInfo?.supportsArray && !Array.isArray(condition.value)) {
      // Convert single value to array
      newValue = condition.value ? [String(condition.value)] : [];
    } else if (!operatorInfo?.supportsArray && Array.isArray(condition.value)) {
      // Convert array to single value
      newValue = condition.value[0] || '';
    }

    onChange({ ...condition, operator: newOperator, value: newValue });
  };

  const handleValueChange = (value: string) => {
    if (isArrayOperator) {
      // Parse comma-separated values for array operators
      const values = value.split(',').map((v) => v.trim()).filter(Boolean);
      onChange({ ...condition, value: values });
    } else {
      onChange({ ...condition, value });
    }
  };

  // Check if field is a custom (not in predefined list)
  const isCustomField = condition.field && !fields.some((f) => f.name === condition.field);
  const displayFieldValue = isCustomField ? '_custom' : condition.field;

  // Format value for display
  const displayValue = Array.isArray(condition.value)
    ? condition.value.join(', ')
    : String(condition.value);

  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      {/* Field selector or custom input */}
      {isCustomField ? (
        <Input
          value={condition.field}
          onChange={(e) => onChange({ ...condition, field: e.target.value })}
          placeholder="Field name"
          className="w-28 text-[13px]"
        />
      ) : (
        <div className="w-28 flex-shrink-0">
          <Select
            options={fieldOptions}
            value={displayFieldValue}
            onChange={(e) => handleFieldChange(e.target.value)}
            placeholder="Field"
            className="!text-[13px] !py-1.5"
          />
        </div>
      )}

      {/* Operator selector */}
      <div className="w-24 flex-shrink-0">
        <Select
          options={operatorOptions}
          value={condition.operator}
          onChange={(e) => handleOperatorChange(e.target.value)}
          className="!text-[13px] !py-1.5"
        />
      </div>

      {/* Value input */}
      <Input
        value={displayValue}
        onChange={(e) => handleValueChange(e.target.value)}
        placeholder={isArrayOperator ? 'val1, val2' : 'Value'}
        className="flex-1 min-w-0 text-[13px]"
      />

      {/* Remove button */}
      <button
        type="button"
        onClick={onRemove}
        className="p-1.5 rounded-lg text-text-tertiary hover:text-error hover:bg-error/5 transition-colors flex-shrink-0"
        title="Remove filter"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
