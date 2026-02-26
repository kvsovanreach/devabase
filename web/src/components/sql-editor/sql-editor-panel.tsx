'use client';

import { useCallback, useEffect, useState } from 'react';
import Editor from '@monaco-editor/react';
import { X, Play, History, Database, ChevronDown, ChevronUp, GripVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useSqlEditorStore } from '@/stores/sql-editor-store';
import { useExecuteSql, useSqlHistory, useSqlSchema, ExecuteResult, QueryHistoryEntry, TableInfo as SqlTableInfo, SchemaColumnInfo } from '@/hooks/use-sql';
import { cn } from '@/lib/utils';

export function SqlEditorPanel() {
  const { isOpen, width, query, setOpen, setWidth, setQuery, setLastQuery } = useSqlEditorStore();
  const executeSql = useExecuteSql();
  const { data: history } = useSqlHistory();
  const { data: schema } = useSqlSchema();

  const [result, setResult] = useState<ExecuteResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [showSchema, setShowSchema] = useState(false);
  const [isResizing, setIsResizing] = useState(false);

  // Handle query execution
  const handleExecute = async () => {
    if (!query.trim()) return;

    // Clear previous results and errors
    setError(null);
    setResult(null);
    setLastQuery(query);

    try {
      const data = await executeSql.mutateAsync(query);
      setResult(data);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Query failed');
      setResult(null);
    }
  };

  // Handle keyboard shortcuts (only on Tables pages where this component is mounted)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl + J to toggle panel
      if ((e.metaKey || e.ctrlKey) && e.key === 'j') {
        e.preventDefault();
        setOpen(!isOpen);
      }
      // Cmd/Ctrl + Enter to execute (when panel is open)
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && isOpen) {
        e.preventDefault();
        handleExecute();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, query, setOpen]);

  // Handle resize
  const handleMouseDown = useCallback(() => {
    setIsResizing(true);
  }, []);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = Math.max(350, Math.min(800, window.innerWidth - e.clientX));
      setWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, setWidth]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop for resize */}
      {isResizing && <div className="fixed inset-0 z-40 cursor-col-resize" />}

      {/* Panel */}
      <div
        className="fixed right-0 top-0 h-screen bg-surface border-l border-border z-50 flex flex-col"
        style={{ width: Math.min(width, window.innerWidth - 100) }}
      >
        {/* Resize handle */}
        <div
          className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary/50 transition-colors group"
          onMouseDown={handleMouseDown}
        >
          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-4 h-8 -ml-1.5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            <GripVertical className="w-3 h-3 text-text-tertiary" />
          </div>
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-3 md:px-4 py-2.5 md:py-3 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-primary" />
            <span className="font-medium text-foreground text-[14px] md:text-[15px]">SQL Editor</span>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowHistory(!showHistory)}
              className={cn(showHistory && 'bg-surface-hover')}
              title="Query History"
            >
              <History className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowSchema(!showSchema)}
              className={cn(showSchema && 'bg-surface-hover')}
              title="Schema"
            >
              <Database className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Schema/History Sidebar */}
        {(showHistory || showSchema) && (
          <div className="border-b border-border max-h-[180px] md:max-h-[200px] overflow-y-auto flex-shrink-0">
            {showHistory && history && (
              <div className="p-2 space-y-1">
                <div className="text-[10px] md:text-xs font-medium text-text-tertiary uppercase px-2 py-1">
                  History
                </div>
                {history.slice(0, 10).map((entry: QueryHistoryEntry) => (
                  <button
                    key={entry.id}
                    onClick={() => setQuery(entry.query)}
                    className="w-full text-left px-2 py-1.5 rounded text-[11px] md:text-xs font-mono text-text-secondary hover:bg-surface-hover truncate"
                    title={entry.query}
                  >
                    {entry.query.substring(0, 50)}...
                  </button>
                ))}
              </div>
            )}
            {showSchema && schema && (
              <div className="p-2 space-y-1">
                <div className="text-[10px] md:text-xs font-medium text-text-tertiary uppercase px-2 py-1">
                  Tables
                </div>
                {schema.tables.map((table: SqlTableInfo) => (
                  <details key={table.name} className="group">
                    <summary className="px-2 py-1.5 rounded text-[13px] md:text-sm text-foreground hover:bg-surface-hover cursor-pointer flex items-center gap-1">
                      <ChevronDown className="w-3 h-3 text-text-tertiary group-open:hidden" />
                      <ChevronUp className="w-3 h-3 text-text-tertiary hidden group-open:block" />
                      {table.name}
                    </summary>
                    <div className="pl-6 py-1 space-y-0.5">
                      {table.columns.map((col: SchemaColumnInfo) => (
                        <div
                          key={col.name}
                          className="text-[10px] md:text-xs text-text-secondary flex items-center gap-2"
                        >
                          <span className="text-foreground">{col.name}</span>
                          <span className="text-text-tertiary">{col.data_type}</span>
                        </div>
                      ))}
                    </div>
                  </details>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Editor */}
        <div className="flex-1 min-h-[120px] md:min-h-[150px] border-b border-border">
          <Editor
            height="100%"
            defaultLanguage="sql"
            value={query}
            onChange={(value) => setQuery(value || '')}
            theme="vs-dark"
            options={{
              minimap: { enabled: false },
              fontSize: 12,
              lineNumbers: 'on',
              scrollBeyondLastLine: false,
              wordWrap: 'on',
              automaticLayout: true,
              padding: { top: 8, bottom: 8 },
            }}
          />
        </div>

        {/* Execute button */}
        <div className="flex items-center gap-2 px-3 md:px-4 py-2 border-b border-border flex-shrink-0">
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
            Run
          </Button>
          <span className="text-[10px] md:text-xs text-text-tertiary">
            {navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'}+Enter
          </span>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-auto min-h-0">
          {error && (
            <div className="p-3 md:p-4 bg-error/10 border-b border-error/20">
              <div className="flex items-start gap-2">
                <svg className="w-4 h-4 text-error mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] md:text-sm font-medium text-error">Query Error</div>
                  <div className="text-[12px] md:text-sm text-error/80 mt-1 font-mono whitespace-pre-wrap break-words">{error}</div>
                </div>
              </div>
            </div>
          )}
          {result && (
            <div className="h-full flex flex-col">
              {/* Stats */}
              <div className="px-3 md:px-4 py-2 text-[11px] md:text-xs text-text-secondary border-b border-border flex-shrink-0">
                {result.row_count} rows · {result.execution_time_ms}ms
              </div>

              {/* Table */}
              {result.columns.length > 0 ? (
                <div className="overflow-auto flex-1">
                  <table className="w-full text-[12px] md:text-sm">
                    <thead className="sticky top-0 bg-surface-secondary">
                      <tr>
                        {result.columns.map((col, i) => (
                          <th
                            key={i}
                            className="px-2 md:px-3 py-2 text-left font-medium text-text-secondary border-b border-border whitespace-nowrap"
                          >
                            {col.name}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {result.rows.map((row, rowIndex) => (
                        <tr key={rowIndex} className="hover:bg-surface-hover">
                          {row.map((cell, cellIndex) => (
                            <td
                              key={cellIndex}
                              className="px-2 md:px-3 py-2 text-foreground border-b border-border whitespace-nowrap max-w-[150px] md:max-w-[200px] truncate"
                              title={String(cell ?? '')}
                            >
                              {cell === null ? (
                                <span className="text-text-tertiary italic">null</span>
                              ) : typeof cell === 'boolean' ? (
                                <span className={cell ? 'text-success' : 'text-text-tertiary'}>
                                  {String(cell)}
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
                <div className="p-3 md:p-4 text-[13px] md:text-sm text-text-secondary">No results</div>
              )}
            </div>
          )}
          {!result && !error && (
            <div className="p-3 md:p-4 text-[13px] md:text-sm text-text-tertiary">
              Run a query to see results
            </div>
          )}
        </div>
      </div>
    </>
  );
}
