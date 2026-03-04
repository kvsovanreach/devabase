'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import Editor, { OnMount, Monaco } from '@monaco-editor/react';
import type { editor, languages, IDisposable, Position, CancellationToken } from 'monaco-editor';
import { Play, History, Database, ChevronDown, ChevronUp, Table2, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Check } from 'lucide-react';
import { Listbox, ListboxButton, ListboxOption, ListboxOptions } from '@headlessui/react';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { useExecuteSql, useSqlHistory, useSqlSchema, ExecuteResult, QueryHistoryEntry, TableInfo as SqlTableInfo, SchemaColumnInfo } from '@/hooks/use-sql';
import { useTheme } from '@/hooks/use-theme';
import { cn } from '@/lib/utils';

// SQL keyword snippets with proper syntax
const SQL_SNIPPETS: Array<{ label: string; insertText: string; detail: string; documentation?: string }> = [
  // Query structure
  { label: 'SELECT', insertText: 'SELECT ', detail: 'Select columns' },
  { label: 'SELECT *', insertText: 'SELECT * FROM ${1:table} ', detail: 'Select all columns' },
  { label: 'SELECT DISTINCT', insertText: 'SELECT DISTINCT ${1:column} FROM ${2:table} ', detail: 'Select unique values' },
  { label: 'FROM', insertText: 'FROM ${1:table} ', detail: 'From table' },
  { label: 'WHERE', insertText: 'WHERE ${1:condition} ', detail: 'Filter condition' },
  { label: 'AND', insertText: 'AND ${1:condition} ', detail: 'Additional condition' },
  { label: 'OR', insertText: 'OR ${1:condition} ', detail: 'Alternative condition' },
  { label: 'NOT', insertText: 'NOT ', detail: 'Negate condition' },
  { label: 'IN', insertText: 'IN (${1:values}) ', detail: 'Match any value in list' },
  { label: 'NOT IN', insertText: 'NOT IN (${1:values}) ', detail: 'Exclude values in list' },
  { label: 'LIKE', insertText: "LIKE '${1:%pattern%}' ", detail: 'Pattern matching' },
  { label: 'ILIKE', insertText: "ILIKE '${1:%pattern%}' ", detail: 'Case-insensitive pattern matching' },
  { label: 'BETWEEN', insertText: 'BETWEEN ${1:start} AND ${2:end} ', detail: 'Range condition' },
  { label: 'IS NULL', insertText: 'IS NULL ', detail: 'Check for null' },
  { label: 'IS NOT NULL', insertText: 'IS NOT NULL ', detail: 'Check for non-null' },

  // Joins
  { label: 'JOIN', insertText: 'JOIN ${1:table} ON ${2:condition} ', detail: 'Inner join' },
  { label: 'INNER JOIN', insertText: 'INNER JOIN ${1:table} ON ${2:condition} ', detail: 'Inner join tables' },
  { label: 'LEFT JOIN', insertText: 'LEFT JOIN ${1:table} ON ${2:condition} ', detail: 'Left outer join' },
  { label: 'RIGHT JOIN', insertText: 'RIGHT JOIN ${1:table} ON ${2:condition} ', detail: 'Right outer join' },
  { label: 'FULL JOIN', insertText: 'FULL OUTER JOIN ${1:table} ON ${2:condition} ', detail: 'Full outer join' },
  { label: 'CROSS JOIN', insertText: 'CROSS JOIN ${1:table} ', detail: 'Cartesian product' },

  // Grouping & Ordering
  { label: 'GROUP BY', insertText: 'GROUP BY ${1:column} ', detail: 'Group results' },
  { label: 'HAVING', insertText: 'HAVING ${1:condition} ', detail: 'Filter grouped results' },
  { label: 'ORDER BY', insertText: 'ORDER BY ${1:column} ', detail: 'Sort results' },
  { label: 'ORDER BY ASC', insertText: 'ORDER BY ${1:column} ASC ', detail: 'Sort ascending' },
  { label: 'ORDER BY DESC', insertText: 'ORDER BY ${1:column} DESC ', detail: 'Sort descending' },
  { label: 'LIMIT', insertText: 'LIMIT ${1:10} ', detail: 'Limit rows returned' },
  { label: 'OFFSET', insertText: 'OFFSET ${1:0} ', detail: 'Skip rows' },
  { label: 'LIMIT OFFSET', insertText: 'LIMIT ${1:10} OFFSET ${2:0} ', detail: 'Pagination' },

  // Insert/Update/Delete
  { label: 'INSERT INTO', insertText: 'INSERT INTO ${1:table} (${2:columns}) VALUES (${3:values})', detail: 'Insert row' },
  { label: 'UPDATE', insertText: 'UPDATE ${1:table} SET ${2:column} = ${3:value} WHERE ${4:condition}', detail: 'Update rows' },
  { label: 'DELETE FROM', insertText: 'DELETE FROM ${1:table} WHERE ${2:condition}', detail: 'Delete rows' },

  // Table operations
  { label: 'CREATE TABLE', insertText: 'CREATE TABLE ${1:name} (\n  ${2:column} ${3:type}\n)', detail: 'Create new table' },
  { label: 'DROP TABLE', insertText: 'DROP TABLE ${1:name}', detail: 'Delete table' },
  { label: 'ALTER TABLE', insertText: 'ALTER TABLE ${1:table}', detail: 'Modify table' },
  { label: 'ADD COLUMN', insertText: 'ADD COLUMN ${1:name} ${2:type}', detail: 'Add column to table' },
  { label: 'DROP COLUMN', insertText: 'DROP COLUMN ${1:name}', detail: 'Remove column' },
  { label: 'RENAME COLUMN', insertText: 'RENAME COLUMN ${1:old_name} TO ${2:new_name}', detail: 'Rename column' },

  // Constraints
  { label: 'PRIMARY KEY', insertText: 'PRIMARY KEY', detail: 'Primary key constraint' },
  { label: 'FOREIGN KEY', insertText: 'FOREIGN KEY (${1:column}) REFERENCES ${2:table}(${3:column})', detail: 'Foreign key constraint' },
  { label: 'UNIQUE', insertText: 'UNIQUE', detail: 'Unique constraint' },
  { label: 'NOT NULL', insertText: 'NOT NULL', detail: 'Not null constraint' },
  { label: 'DEFAULT', insertText: 'DEFAULT ${1:value}', detail: 'Default value' },

  // Set operations
  { label: 'UNION', insertText: 'UNION\nSELECT ${1:columns} FROM ${2:table}', detail: 'Combine results (distinct)' },
  { label: 'UNION ALL', insertText: 'UNION ALL\nSELECT ${1:columns} FROM ${2:table}', detail: 'Combine results (all)' },
  { label: 'INTERSECT', insertText: 'INTERSECT\nSELECT ${1:columns} FROM ${2:table}', detail: 'Common results' },
  { label: 'EXCEPT', insertText: 'EXCEPT\nSELECT ${1:columns} FROM ${2:table}', detail: 'Difference of results' },

  // Case expression
  { label: 'CASE', insertText: 'CASE\n  WHEN ${1:condition} THEN ${2:result}\n  ELSE ${3:default}\nEND', detail: 'Conditional expression' },
  { label: 'CASE WHEN', insertText: 'CASE WHEN ${1:condition} THEN ${2:result} ELSE ${3:default} END', detail: 'Inline conditional' },

  // Subquery
  { label: 'EXISTS', insertText: 'EXISTS (SELECT 1 FROM ${1:table} WHERE ${2:condition})', detail: 'Check subquery returns rows' },
  { label: 'NOT EXISTS', insertText: 'NOT EXISTS (SELECT 1 FROM ${1:table} WHERE ${2:condition})', detail: 'Check subquery returns no rows' },

  // Common table expression
  { label: 'WITH', insertText: 'WITH ${1:name} AS (\n  ${2:query}\n)\nSELECT * FROM ${1:name}', detail: 'Common Table Expression (CTE)' },

  // Other
  { label: 'AS', insertText: 'AS ${1:alias} ', detail: 'Column/table alias' },
  { label: 'DISTINCT', insertText: 'DISTINCT ', detail: 'Unique values only' },
  { label: 'TRUE', insertText: 'TRUE ', detail: 'Boolean true' },
  { label: 'FALSE', insertText: 'FALSE ', detail: 'Boolean false' },
  { label: 'ON', insertText: 'ON ${1:condition} ', detail: 'Join condition' },
  { label: 'USING', insertText: 'USING (${1:column}) ', detail: 'Join using column' },
  { label: 'RETURNING', insertText: 'RETURNING ${1:*}', detail: 'Return modified rows' },
];

// Common alias suggestions
const ALIAS_SUGGESTIONS = ['a', 'b', 'c', 't', 't1', 't2', 'src', 'dst', 'tmp', 'sub', 'cte', 'result'];

// SQL functions with proper signatures
const SQL_FUNCTIONS: Array<{ label: string; insertText: string; detail: string; documentation?: string }> = [
  // Aggregate functions
  { label: 'COUNT(*)', insertText: 'COUNT(*)', detail: 'Count all rows' },
  { label: 'COUNT(column)', insertText: 'COUNT(${1:column})', detail: 'Count non-null values' },
  { label: 'COUNT(DISTINCT)', insertText: 'COUNT(DISTINCT ${1:column})', detail: 'Count unique values' },
  { label: 'SUM()', insertText: 'SUM(${1:column})', detail: 'Sum of values' },
  { label: 'AVG()', insertText: 'AVG(${1:column})', detail: 'Average of values' },
  { label: 'MIN()', insertText: 'MIN(${1:column})', detail: 'Minimum value' },
  { label: 'MAX()', insertText: 'MAX(${1:column})', detail: 'Maximum value' },
  { label: 'ARRAY_AGG()', insertText: 'ARRAY_AGG(${1:column})', detail: 'Aggregate into array' },
  { label: 'STRING_AGG()', insertText: "STRING_AGG(${1:column}, '${2:,}')", detail: 'Concatenate with delimiter' },
  { label: 'JSON_AGG()', insertText: 'JSON_AGG(${1:expression})', detail: 'Aggregate as JSON array' },

  // String functions
  { label: 'CONCAT()', insertText: 'CONCAT(${1:str1}, ${2:str2})', detail: 'Concatenate strings' },
  { label: 'UPPER()', insertText: 'UPPER(${1:string})', detail: 'Convert to uppercase' },
  { label: 'LOWER()', insertText: 'LOWER(${1:string})', detail: 'Convert to lowercase' },
  { label: 'TRIM()', insertText: 'TRIM(${1:string})', detail: 'Remove whitespace' },
  { label: 'LTRIM()', insertText: 'LTRIM(${1:string})', detail: 'Remove leading whitespace' },
  { label: 'RTRIM()', insertText: 'RTRIM(${1:string})', detail: 'Remove trailing whitespace' },
  { label: 'LENGTH()', insertText: 'LENGTH(${1:string})', detail: 'String length' },
  { label: 'SUBSTRING()', insertText: 'SUBSTRING(${1:string} FROM ${2:start} FOR ${3:length})', detail: 'Extract substring' },
  { label: 'REPLACE()', insertText: "REPLACE(${1:string}, '${2:from}', '${3:to}')", detail: 'Replace text' },
  { label: 'SPLIT_PART()', insertText: "SPLIT_PART(${1:string}, '${2:delimiter}', ${3:position})", detail: 'Split and get part' },

  // Null handling
  { label: 'COALESCE()', insertText: 'COALESCE(${1:value1}, ${2:value2})', detail: 'First non-null value' },
  { label: 'NULLIF()', insertText: 'NULLIF(${1:value1}, ${2:value2})', detail: 'Return null if equal' },

  // Date/Time functions
  { label: 'NOW()', insertText: 'NOW()', detail: 'Current timestamp' },
  { label: 'CURRENT_DATE', insertText: 'CURRENT_DATE', detail: 'Current date' },
  { label: 'CURRENT_TIME', insertText: 'CURRENT_TIME', detail: 'Current time' },
  { label: 'CURRENT_TIMESTAMP', insertText: 'CURRENT_TIMESTAMP', detail: 'Current timestamp' },
  { label: 'DATE_TRUNC()', insertText: "DATE_TRUNC('${1:day}', ${2:timestamp})", detail: 'Truncate to precision', documentation: "Precision: 'year', 'month', 'day', 'hour', 'minute'" },
  { label: 'DATE_PART()', insertText: "DATE_PART('${1:year}', ${2:timestamp})", detail: 'Extract date part' },
  { label: 'EXTRACT()', insertText: 'EXTRACT(${1:YEAR} FROM ${2:timestamp})', detail: 'Extract field from date' },
  { label: 'AGE()', insertText: 'AGE(${1:timestamp})', detail: 'Interval since timestamp' },
  { label: 'TO_CHAR()', insertText: "TO_CHAR(${1:timestamp}, '${2:YYYY-MM-DD}')", detail: 'Format as string' },
  { label: 'TO_DATE()', insertText: "TO_DATE('${1:string}', '${2:YYYY-MM-DD}')", detail: 'Parse date string' },

  // Math functions
  { label: 'ROUND()', insertText: 'ROUND(${1:number}, ${2:decimals})', detail: 'Round number' },
  { label: 'FLOOR()', insertText: 'FLOOR(${1:number})', detail: 'Round down' },
  { label: 'CEIL()', insertText: 'CEIL(${1:number})', detail: 'Round up' },
  { label: 'ABS()', insertText: 'ABS(${1:number})', detail: 'Absolute value' },
  { label: 'MOD()', insertText: 'MOD(${1:number}, ${2:divisor})', detail: 'Modulo (remainder)' },
  { label: 'POWER()', insertText: 'POWER(${1:base}, ${2:exponent})', detail: 'Power of number' },
  { label: 'SQRT()', insertText: 'SQRT(${1:number})', detail: 'Square root' },
  { label: 'RANDOM()', insertText: 'RANDOM()', detail: 'Random value 0-1' },

  // Type casting
  { label: 'CAST()', insertText: 'CAST(${1:value} AS ${2:type})', detail: 'Convert type' },
  { label: '::type', insertText: '::${1:type}', detail: 'PostgreSQL type cast' },

  // Window functions
  { label: 'ROW_NUMBER()', insertText: 'ROW_NUMBER() OVER (${1:ORDER BY column})', detail: 'Row number in partition' },
  { label: 'RANK()', insertText: 'RANK() OVER (${1:ORDER BY column})', detail: 'Rank with gaps' },
  { label: 'DENSE_RANK()', insertText: 'DENSE_RANK() OVER (${1:ORDER BY column})', detail: 'Rank without gaps' },
  { label: 'LAG()', insertText: 'LAG(${1:column}, ${2:1}) OVER (${3:ORDER BY column})', detail: 'Previous row value' },
  { label: 'LEAD()', insertText: 'LEAD(${1:column}, ${2:1}) OVER (${3:ORDER BY column})', detail: 'Next row value' },
  { label: 'FIRST_VALUE()', insertText: 'FIRST_VALUE(${1:column}) OVER (${2:ORDER BY column})', detail: 'First value in partition' },
  { label: 'LAST_VALUE()', insertText: 'LAST_VALUE(${1:column}) OVER (${2:ORDER BY column})', detail: 'Last value in partition' },

  // JSON functions
  { label: 'JSON_BUILD_OBJECT()', insertText: "JSON_BUILD_OBJECT('${1:key}', ${2:value})", detail: 'Build JSON object' },
  { label: 'JSONB_BUILD_OBJECT()', insertText: "JSONB_BUILD_OBJECT('${1:key}', ${2:value})", detail: 'Build JSONB object' },
  { label: "->", insertText: "->'${1:key}'", detail: 'Get JSON field as JSON' },
  { label: "->>", insertText: "->>'${1:key}'", detail: 'Get JSON field as text' },
];

export default function SqlPage() {
  const { isDark } = useTheme();
  const executeSql = useExecuteSql();
  const { data: history } = useSqlHistory();
  const { data: schema } = useSqlSchema();

  const [query, setQuery] = useState('SELECT * FROM ');
  const [result, setResult] = useState<ExecuteResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const pageSizeOptions = [20, 50, 100, 250];

  const completionProviderRef = useRef<IDisposable | null>(null);
  const schemaRef = useRef(schema);

  // Keep schema ref updated
  useEffect(() => {
    schemaRef.current = schema;
  }, [schema]);

  // Monaco editor mount handler with autocomplete
  const handleEditorMount: OnMount = (editor, monaco) => {
    // Dispose previous provider if exists
    if (completionProviderRef.current) {
      completionProviderRef.current.dispose();
    }

    // Register SQL completion provider
    completionProviderRef.current = monaco.languages.registerCompletionItemProvider('sql', {
      triggerCharacters: [' ', '.', ',', '('],
      provideCompletionItems: (model: editor.ITextModel, position: Position) => {
        const word = model.getWordUntilPosition(position);
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        };

        const textBeforeCursor = model.getValueInRange({
          startLineNumber: 1,
          startColumn: 1,
          endLineNumber: position.lineNumber,
          endColumn: position.column,
        });
        const textUpper = textBeforeCursor.toUpperCase();

        // Check if we're after AS keyword (for alias suggestions)
        const asMatch = textBeforeCursor.match(/\bAS\s+(\w*)$/i);
        const afterAs = asMatch !== null;

        // Check if we're after a table name (for alias suggestions)
        const tableAliasMatch = textBeforeCursor.match(/\bFROM\s+(\w+)\s+(\w*)$/i) ||
                                textBeforeCursor.match(/\bJOIN\s+(\w+)\s+(\w*)$/i);

        const suggestions: languages.CompletionItem[] = [];

        // If after AS, prioritize alias suggestions
        if (afterAs) {
          // Add common alias suggestions
          ALIAS_SUGGESTIONS.forEach((alias) => {
            suggestions.push({
              label: alias,
              kind: monaco.languages.CompletionItemKind.Variable,
              insertText: alias + ' ',
              range,
              detail: 'Alias',
              sortText: '0' + alias,
            });
          });

          // Add table name abbreviations as aliases
          const currentSchema = schemaRef.current;
          if (currentSchema?.tables) {
            currentSchema.tables.forEach((table: SqlTableInfo) => {
              // First letter of table
              const abbrev1 = table.name.charAt(0).toLowerCase();
              // First 3 letters
              const abbrev3 = table.name.substring(0, 3).toLowerCase();
              // Camel case extraction (e.g., user_orders -> uo)
              const camelAbbrev = table.name.split(/[_-]/).map(p => p.charAt(0)).join('').toLowerCase();

              [abbrev1, abbrev3, camelAbbrev].forEach((abbrev) => {
                if (abbrev && !ALIAS_SUGGESTIONS.includes(abbrev)) {
                  suggestions.push({
                    label: abbrev,
                    kind: monaco.languages.CompletionItemKind.Variable,
                    insertText: abbrev + ' ',
                    range,
                    detail: `Alias for ${table.name}`,
                    sortText: '0' + abbrev,
                  });
                }
              });
            });
          }
        }

        // If after table name (FROM/JOIN table), suggest alias
        if (tableAliasMatch) {
          const tableName = tableAliasMatch[1];
          const abbrev = tableName.charAt(0).toLowerCase();
          const abbrev3 = tableName.substring(0, 3).toLowerCase();

          suggestions.push({
            label: abbrev,
            kind: monaco.languages.CompletionItemKind.Variable,
            insertText: abbrev + ' ',
            range,
            detail: `Alias for ${tableName}`,
            sortText: '0' + abbrev,
          });

          if (abbrev3 !== abbrev) {
            suggestions.push({
              label: abbrev3,
              kind: monaco.languages.CompletionItemKind.Variable,
              insertText: abbrev3 + ' ',
              range,
              detail: `Alias for ${tableName}`,
              sortText: '0' + abbrev3,
            });
          }
        }

        // Add SQL keyword snippets
        SQL_SNIPPETS.forEach((snippet) => {
          suggestions.push({
            label: snippet.label,
            kind: monaco.languages.CompletionItemKind.Keyword,
            insertText: snippet.insertText,
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            range,
            detail: snippet.detail,
            documentation: snippet.documentation,
            sortText: '0' + snippet.label, // Prioritize keywords
          });
        });

        // Add SQL functions
        SQL_FUNCTIONS.forEach((func) => {
          suggestions.push({
            label: func.label,
            kind: monaco.languages.CompletionItemKind.Function,
            insertText: func.insertText,
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            range,
            detail: func.detail,
            documentation: func.documentation,
            sortText: '1' + func.label, // Functions after keywords
          });
        });

        // Add table names from schema
        const currentSchema = schemaRef.current;
        if (currentSchema?.tables) {
          currentSchema.tables.forEach((table: SqlTableInfo) => {
            // Table name suggestion
            suggestions.push({
              label: table.name,
              kind: monaco.languages.CompletionItemKind.Class,
              insertText: table.name,
              range,
              detail: `Table (${table.columns.length} columns)`,
              documentation: `Columns: ${table.columns.map((c: SchemaColumnInfo) => c.name).join(', ')}`,
              sortText: '2' + table.name, // Tables after functions
            });

            // SELECT * FROM table snippet
            suggestions.push({
              label: `SELECT * FROM ${table.name}`,
              kind: monaco.languages.CompletionItemKind.Snippet,
              insertText: `SELECT * FROM ${table.name}`,
              range,
              detail: 'Quick select all',
              sortText: '3' + table.name,
            });

            // Add column suggestions
            table.columns.forEach((col: SchemaColumnInfo) => {
              suggestions.push({
                label: col.name,
                kind: monaco.languages.CompletionItemKind.Field,
                insertText: col.name,
                range,
                detail: `${col.data_type}`,
                documentation: `${table.name}.${col.name}${col.is_nullable ? ' (nullable)' : ' (required)'}`,
                sortText: '4' + col.name,
              });

              // Also add table.column format
              suggestions.push({
                label: `${table.name}.${col.name}`,
                kind: monaco.languages.CompletionItemKind.Field,
                insertText: `${table.name}.${col.name}`,
                range,
                detail: col.data_type,
                documentation: `Column from ${table.name}`,
                sortText: '5' + table.name + col.name,
              });
            });
          });
        }

        return { suggestions };
      },
    });

    // Enable quick suggestions
    editor.updateOptions({
      quickSuggestions: {
        other: true,
        comments: false,
        strings: false,
      },
      suggestOnTriggerCharacters: true,
      wordBasedSuggestions: 'off',
      suggest: {
        showKeywords: true,
        showSnippets: true,
        showWords: false,
      },
    });
  };

  // Handle query execution
  const handleExecute = async () => {
    if (!query.trim()) return;

    setError(null);
    setResult(null);
    setCurrentPage(1); // Reset to first page on new query

    try {
      const data = await executeSql.mutateAsync(query);
      setResult(data);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Query failed');
      setResult(null);
    }
  };

  // Pagination calculations
  const totalRows = result?.rows.length || 0;
  const totalPages = Math.ceil(totalRows / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalRows);
  const paginatedRows = result?.rows.slice(startIndex, endIndex) || [];

  const goToPage = (page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
  };

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        handleExecute();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [query]);

  return (
    <div className="h-screen flex flex-col">
      <Header />

      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border-light bg-surface flex-shrink-0">
        <Button
          onClick={handleExecute}
          disabled={executeSql.isPending || !query.trim()}
          size="sm"
        >
          {executeSql.isPending ? (
            <Spinner size="sm" className="mr-2" />
          ) : (
            <Play className="w-4 h-4 mr-2" />
          )}
          Run Query
        </Button>
        <div className="flex-1" />
        <Button
          variant={showHistory ? 'secondary' : 'ghost'}
          size="sm"
          onClick={() => setShowHistory(!showHistory)}
        >
          <History className="w-4 h-4 mr-1.5" />
          <span className="hidden sm:inline">History</span>
        </Button>
      </div>

      {/* History Dropdown */}
      {showHistory && history && history.length > 0 && (
        <div className="border-b border-border-light bg-surface-secondary max-h-[120px] overflow-y-auto flex-shrink-0">
          <div className="p-2 space-y-1">
            {history.slice(0, 15).map((entry: QueryHistoryEntry) => (
              <button
                key={entry.id}
                onClick={() => {
                  setQuery(entry.query);
                  setShowHistory(false);
                }}
                className="w-full text-left px-3 py-1.5 rounded text-[12px] font-mono text-text-secondary hover:bg-surface-hover hover:text-foreground truncate"
                title={entry.query}
              >
                {entry.query}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Row: Schema + Editor */}
        <div className="flex h-[180px] md:h-[220px] border-b border-border-light flex-shrink-0">
          {/* Schema Sidebar */}
          <aside className="w-[180px] lg:w-[220px] border-r border-border-light bg-surface-secondary overflow-y-auto hidden md:block flex-shrink-0">
            <div className="p-2 border-b border-border-light">
              <div className="flex items-center gap-2 text-[12px] font-medium text-foreground">
                <Database className="w-3.5 h-3.5 text-primary" />
                Schema
              </div>
            </div>

            {schema?.tables && schema.tables.length > 0 ? (
              <div className="p-1.5">
                {schema.tables.map((table: SqlTableInfo) => (
                  <details key={table.name} className="group">
                    <summary className="px-2 py-1 rounded text-[12px] text-foreground hover:bg-surface-hover cursor-pointer flex items-center gap-1.5">
                      <ChevronDown className="w-3 h-3 text-text-tertiary group-open:hidden flex-shrink-0" />
                      <ChevronUp className="w-3 h-3 text-text-tertiary hidden group-open:block flex-shrink-0" />
                      <Table2 className="w-3 h-3 text-text-secondary flex-shrink-0" />
                      <span className="truncate">{table.name}</span>
                    </summary>
                    <div className="pl-6 pr-2 py-0.5 space-y-0">
                      {table.columns.map((col: SchemaColumnInfo) => (
                        <button
                          key={col.name}
                          onClick={() => setQuery(q => q + col.name)}
                          className="w-full text-left text-[10px] text-text-secondary hover:text-foreground flex items-center gap-1.5 py-0.5 px-1 rounded hover:bg-surface-hover"
                        >
                          <span className="text-foreground truncate">{col.name}</span>
                          <span className="text-text-tertiary truncate">{col.data_type}</span>
                        </button>
                      ))}
                    </div>
                  </details>
                ))}
              </div>
            ) : (
              <div className="p-3 text-[12px] text-text-tertiary">
                No tables found
              </div>
            )}
          </aside>

          {/* Editor */}
          <div className="flex-1 min-w-0">
            <Editor
              height="100%"
              defaultLanguage="sql"
              value={query}
              onChange={(value) => setQuery(value || '')}
              theme={isDark ? 'vs-dark' : 'light'}
              onMount={handleEditorMount}
              options={{
                minimap: { enabled: false },
                fontSize: 13,
                lineNumbers: 'on',
                scrollBeyondLastLine: false,
                scrollBeyondLastColumn: 0,
                wordWrap: 'on',
                automaticLayout: true,
                padding: { top: 12, bottom: 12 },
                overviewRulerBorder: false,
                overviewRulerLanes: 0,
                quickSuggestions: true,
                suggestOnTriggerCharacters: true,
              }}
            />
          </div>
        </div>

        {/* Results - Full Width Below */}
        <div className="flex-1 overflow-auto bg-background">
            {error && (
              <div className="p-4 bg-error/10 border-b border-error/20">
                <div className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-error mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                  <div className="min-w-0">
                    <div className="text-[14px] font-medium text-error">Query Error</div>
                    <div className="text-[13px] text-error/80 mt-1 font-mono whitespace-pre-wrap break-words">{error}</div>
                  </div>
                </div>
              </div>
            )}

            {result && (
              <div className="flex flex-col h-full">
                {/* Stats Bar */}
                <div className="px-4 py-2 text-[12px] text-text-secondary border-b border-border-light bg-surface flex items-center gap-4 flex-shrink-0">
                  <span><strong className="text-foreground">{result.row_count}</strong> rows</span>
                  <span><strong className="text-foreground">{result.execution_time_ms}</strong>ms</span>
                  {totalRows > pageSize && (
                    <span className="text-text-tertiary">
                      Showing {startIndex + 1}-{endIndex} of {totalRows}
                    </span>
                  )}
                </div>

                {/* Table */}
                {result.columns.length > 0 ? (
                  <div className="flex-1 overflow-auto">
                    <table className="w-full text-[13px]">
                      <thead className="sticky top-0 bg-surface-secondary">
                        <tr>
                          {result.columns.map((col, i) => (
                            <th
                              key={i}
                              className="px-4 py-2.5 text-left font-medium text-text-secondary border-b border-border-light whitespace-nowrap"
                            >
                              {col.name}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {paginatedRows.map((row, rowIndex) => (
                          <tr key={startIndex + rowIndex} className="hover:bg-surface-hover border-b border-border-light">
                            {row.map((cell, cellIndex) => (
                              <td
                                key={cellIndex}
                                className="px-4 py-2 text-foreground whitespace-nowrap max-w-[300px] truncate"
                                title={String(cell ?? '')}
                              >
                                {cell === null ? (
                                  <span className="text-text-tertiary italic">null</span>
                                ) : typeof cell === 'boolean' ? (
                                  <span className={cell ? 'text-success' : 'text-text-tertiary'}>
                                    {String(cell)}
                                  </span>
                                ) : typeof cell === 'object' ? (
                                  <span className="text-text-secondary font-mono text-[11px]">
                                    {JSON.stringify(cell)}
                                  </span>
                                ) : (
                                  String(cell)
                                )}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="p-4 text-[13px] text-text-secondary">
                    Query executed successfully. No rows returned.
                  </div>
                )}

                {/* Pagination Controls */}
                <div className="px-4 py-2 border-t border-border-light bg-surface flex items-center justify-between flex-shrink-0">
                  <span className="text-sm text-text-secondary">
                    {totalPages > 1 ? (
                      <>Page {currentPage} of {totalPages} · </>
                    ) : null}
                    Showing {paginatedRows.length} of {totalRows} rows
                  </span>

                  <div className="flex items-center gap-3">
                    <Listbox value={pageSize} onChange={(value) => { setPageSize(value); setCurrentPage(1); }}>
                      <div className="relative">
                        <ListboxButton className="flex items-center gap-2 pl-3 pr-2 py-1.5 text-[13px] bg-surface-secondary border border-border-light rounded-xl text-foreground cursor-pointer transition-all duration-150 hover:bg-surface-hover hover:border-border focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/20">
                          <span>{pageSize} / page</span>
                          <ChevronDown className="w-3.5 h-3.5 text-text-tertiary" />
                        </ListboxButton>
                        <ListboxOptions className="absolute bottom-full mb-1 right-0 z-50 min-w-[120px] bg-surface border border-border-light rounded-xl shadow-lg overflow-hidden focus:outline-none">
                          <div className="py-1">
                            {pageSizeOptions.map((size) => (
                              <ListboxOption
                                key={size}
                                value={size}
                                className={({ focus, selected }) => cn(
                                  'flex items-center justify-between px-3 py-2 text-[13px] cursor-pointer transition-colors',
                                  focus ? 'bg-surface-hover' : '',
                                  selected ? 'text-primary font-medium' : 'text-foreground'
                                )}
                              >
                                {({ selected }) => (
                                  <>
                                    <span>{size} / page</span>
                                    {selected && <Check className="w-3.5 h-3.5 text-primary" />}
                                  </>
                                )}
                              </ListboxOption>
                            ))}
                          </div>
                        </ListboxOptions>
                      </div>
                    </Listbox>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => goToPage(1)}
                        disabled={currentPage === 1}
                        className="p-1.5 rounded-lg hover:bg-surface-hover disabled:opacity-40 disabled:cursor-not-allowed text-text-secondary hover:text-foreground"
                        title="First page"
                      >
                        <ChevronsLeft className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => goToPage(currentPage - 1)}
                        disabled={currentPage === 1}
                        className="p-1.5 rounded-lg hover:bg-surface-hover disabled:opacity-40 disabled:cursor-not-allowed text-text-secondary hover:text-foreground"
                        title="Previous page"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => goToPage(currentPage + 1)}
                        disabled={totalPages <= 1 || currentPage >= totalPages}
                        className="p-1.5 rounded-lg hover:bg-surface-hover disabled:opacity-40 disabled:cursor-not-allowed text-text-secondary hover:text-foreground"
                        title="Next page"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => goToPage(totalPages)}
                        disabled={totalPages <= 1 || currentPage >= totalPages}
                        className="p-1.5 rounded-lg hover:bg-surface-hover disabled:opacity-40 disabled:cursor-not-allowed text-text-secondary hover:text-foreground"
                        title="Last page"
                      >
                        <ChevronsRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

          {!result && !error && (
            <div className="flex-1 flex items-center justify-center p-8">
              <div className="text-center">
                <Database className="w-12 h-12 text-text-tertiary mx-auto mb-4" />
                <p className="text-[15px] text-text-secondary">Run a query to see results</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
