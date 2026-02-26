'use client';

import { useState, useCallback, useEffect } from 'react';
import Editor from '@monaco-editor/react';
import { Play, History, Database, ChevronDown, ChevronUp, Table2 } from 'lucide-react';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { useExecuteSql, useSqlHistory, useSqlSchema, ExecuteResult, QueryHistoryEntry, TableInfo as SqlTableInfo, SchemaColumnInfo } from '@/hooks/use-sql';
import { cn } from '@/lib/utils';

export default function SqlPage() {
  const executeSql = useExecuteSql();
  const { data: history } = useSqlHistory();
  const { data: schema } = useSqlSchema();

  const [query, setQuery] = useState('SELECT * FROM ');
  const [result, setResult] = useState<ExecuteResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  // Handle query execution
  const handleExecute = async () => {
    if (!query.trim()) return;

    setError(null);
    setResult(null);

    try {
      const data = await executeSql.mutateAsync(query);
      setResult(data);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Query failed');
      setResult(null);
    }
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

      <div className="flex-1 flex overflow-hidden">
        {/* Schema Sidebar */}
        <aside className="w-[220px] lg:w-[260px] border-r border-border-light bg-surface-secondary overflow-y-auto hidden md:block">
          <div className="p-3 border-b border-border-light">
            <div className="flex items-center gap-2 text-[13px] font-medium text-foreground">
              <Database className="w-4 h-4 text-primary" />
              Schema
            </div>
          </div>

          {schema?.tables && schema.tables.length > 0 ? (
            <div className="p-2">
              {schema.tables.map((table: SqlTableInfo) => (
                <details key={table.name} className="group">
                  <summary className="px-2 py-1.5 rounded text-[13px] text-foreground hover:bg-surface-hover cursor-pointer flex items-center gap-1.5">
                    <ChevronDown className="w-3 h-3 text-text-tertiary group-open:hidden flex-shrink-0" />
                    <ChevronUp className="w-3 h-3 text-text-tertiary hidden group-open:block flex-shrink-0" />
                    <Table2 className="w-3.5 h-3.5 text-text-secondary flex-shrink-0" />
                    <span className="truncate">{table.name}</span>
                  </summary>
                  <div className="pl-7 pr-2 py-1 space-y-0.5">
                    {table.columns.map((col: SchemaColumnInfo) => (
                      <button
                        key={col.name}
                        onClick={() => setQuery(q => q + col.name)}
                        className="w-full text-left text-[11px] text-text-secondary hover:text-foreground flex items-center gap-2 py-0.5 px-1 rounded hover:bg-surface-hover"
                      >
                        <span className="text-foreground truncate">{col.name}</span>
                        <span className="text-text-tertiary text-[10px] truncate">{col.data_type}</span>
                      </button>
                    ))}
                  </div>
                </details>
              ))}
            </div>
          ) : (
            <div className="p-4 text-[13px] text-text-tertiary">
              No tables found
            </div>
          )}
        </aside>

        {/* Main Content */}
        <main className="flex-1 flex flex-col min-w-0">
          {/* Toolbar */}
          <div className="flex items-center gap-2 px-4 py-2 border-b border-border-light bg-surface">
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
            <span className="text-[11px] text-text-tertiary hidden sm:inline">
              {navigator.platform?.includes('Mac') ? '⌘' : 'Ctrl'}+Enter
            </span>
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
            <div className="border-b border-border-light bg-surface-secondary max-h-[150px] overflow-y-auto">
              <div className="p-2 space-y-1">
                {history.slice(0, 15).map((entry: QueryHistoryEntry) => (
                  <button
                    key={entry.id}
                    onClick={() => {
                      setQuery(entry.query);
                      setShowHistory(false);
                    }}
                    className="w-full text-left px-3 py-2 rounded text-[12px] font-mono text-text-secondary hover:bg-surface-hover hover:text-foreground truncate"
                    title={entry.query}
                  >
                    {entry.query}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Editor */}
          <div className="h-[200px] md:h-[250px] border-b border-border-light flex-shrink-0">
            <Editor
              height="100%"
              defaultLanguage="sql"
              value={query}
              onChange={(value) => setQuery(value || '')}
              theme="vs-dark"
              options={{
                minimap: { enabled: false },
                fontSize: 13,
                lineNumbers: 'on',
                scrollBeyondLastLine: false,
                wordWrap: 'on',
                automaticLayout: true,
                padding: { top: 12, bottom: 12 },
                fontFamily: "'SF Mono', SFMono-Regular, ui-monospace, Menlo, Monaco, monospace",
              }}
            />
          </div>

          {/* Results */}
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
              <>
                {/* Stats */}
                <div className="px-4 py-2 text-[12px] text-text-secondary border-b border-border-light bg-surface flex items-center gap-4">
                  <span><strong className="text-foreground">{result.row_count}</strong> rows</span>
                  <span><strong className="text-foreground">{result.execution_time_ms}</strong>ms</span>
                </div>

                {/* Table */}
                {result.columns.length > 0 ? (
                  <div className="overflow-auto">
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
                        {result.rows.map((row, rowIndex) => (
                          <tr key={rowIndex} className="hover:bg-surface-hover border-b border-border-light">
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
              </>
            )}

            {!result && !error && (
              <div className="flex-1 flex items-center justify-center p-8">
                <div className="text-center">
                  <Database className="w-12 h-12 text-text-tertiary mx-auto mb-4" />
                  <p className="text-[15px] text-text-secondary">Run a query to see results</p>
                  <p className="text-[13px] text-text-tertiary mt-1">
                    Press {navigator.platform?.includes('Mac') ? '⌘' : 'Ctrl'}+Enter to execute
                  </p>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
