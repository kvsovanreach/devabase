// Filter operators matching backend support in src/vector/search.rs
export type FilterOperator =
  | '$eq'     // equals
  | '$ne'     // not equals
  | '$gt'     // greater than
  | '$gte'    // greater than or equal
  | '$lt'     // less than
  | '$lte'    // less than or equal
  | '$in'     // in array
  | '$nin'    // not in array
  | '$contains'; // text contains

export type LogicalOperator = '$and' | '$or';

// Single filter condition
export interface FilterCondition {
  id: string;
  field: string;
  operator: FilterOperator;
  value: FilterValue;
}

// Filter value can be various types
export type FilterValue = string | number | boolean | string[] | number[];

// Group of conditions with AND/OR logic
export interface FilterGroup {
  id: string;
  operator: LogicalOperator;
  conditions: FilterItem[];
}

// A filter item can be either a condition or a nested group
export type FilterItem = FilterCondition | FilterGroup;

// Type guard to check if item is a group
export function isFilterGroup(item: FilterItem): item is FilterGroup {
  return 'conditions' in item;
}

// Operator metadata for UI
export interface OperatorOption {
  value: FilterOperator;
  label: string;
  description: string;
  supportsArray?: boolean;
}

export const FILTER_OPERATORS: OperatorOption[] = [
  { value: '$eq', label: 'equals', description: 'Exact match' },
  { value: '$ne', label: 'not equals', description: 'Does not match' },
  { value: '$gt', label: 'greater than', description: 'Value is greater' },
  { value: '$gte', label: 'greater or equal', description: 'Value is greater or equal' },
  { value: '$lt', label: 'less than', description: 'Value is less' },
  { value: '$lte', label: 'less or equal', description: 'Value is less or equal' },
  { value: '$contains', label: 'contains', description: 'Text contains substring' },
  { value: '$in', label: 'in list', description: 'Value is in list', supportsArray: true },
  { value: '$nin', label: 'not in list', description: 'Value is not in list', supportsArray: true },
];

// Generate unique IDs for filter items
export function generateFilterId(): string {
  return `filter_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

// Create empty filter condition
export function createFilterCondition(field = '', operator: FilterOperator = '$eq', value: FilterValue = ''): FilterCondition {
  return {
    id: generateFilterId(),
    field,
    operator,
    value,
  };
}

// Create empty filter group
export function createFilterGroup(operator: LogicalOperator = '$and'): FilterGroup {
  return {
    id: generateFilterId(),
    operator,
    conditions: [],
  };
}

// Convert FilterGroup to MongoDB-style query for API
export function buildFilterQuery(group: FilterGroup): Record<string, unknown> | null {
  if (group.conditions.length === 0) {
    return null;
  }

  const conditions = group.conditions
    .map((item) => {
      if (isFilterGroup(item)) {
        return buildFilterQuery(item);
      }
      // Skip conditions with empty field or value
      if (!item.field || item.value === '' || item.value === undefined) {
        return null;
      }
      return { [item.field]: { [item.operator]: item.value } };
    })
    .filter(Boolean);

  if (conditions.length === 0) {
    return null;
  }

  if (conditions.length === 1) {
    return conditions[0] as Record<string, unknown>;
  }

  return { [group.operator]: conditions };
}

// Parse common metadata fields from chunks/documents
export interface MetadataField {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'date';
  example?: string;
}

// Default common metadata fields
export const COMMON_METADATA_FIELDS: MetadataField[] = [
  { name: 'source', type: 'string', example: 'website' },
  { name: 'category', type: 'string', example: 'policies' },
  { name: 'author', type: 'string', example: 'John Doe' },
  { name: 'date', type: 'date', example: '2024-01-01' },
  { name: 'version', type: 'number', example: '1' },
  { name: 'language', type: 'string', example: 'en' },
  { name: 'status', type: 'string', example: 'active' },
];
