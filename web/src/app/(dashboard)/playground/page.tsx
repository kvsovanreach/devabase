'use client';

import { useState, useEffect, Fragment } from 'react';
import Editor from '@monaco-editor/react';
import { Listbox, ListboxButton, ListboxOption, ListboxOptions, Transition } from '@headlessui/react';
import {
  Play,
  Copy,
  Check,
  Clock,
  ChevronDown,
  ChevronRight,
  Trash2,
  RotateCcw,
  Terminal,
} from 'lucide-react';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import {
  usePlaygroundStore,
  endpointCategories,
  HttpMethod,
} from '@/stores/playground-store';
import { useProjectStore } from '@/stores/project-store';
import api from '@/lib/api';
import { API_CONFIG } from '@/lib/config';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';

const methodColors: Record<HttpMethod, string> = {
  GET: 'bg-success/20 text-success',
  POST: 'bg-info/20 text-info',
  PUT: 'bg-warning/20 text-warning',
  PATCH: 'bg-warning/20 text-warning',
  DELETE: 'bg-error/20 text-error',
};

export default function PlaygroundPage() {
  const {
    method,
    path,
    body,
    response,
    status,
    duration,
    isLoading,
    error,
    history,
    setMethod,
    setPath,
    setBody,
    setResponse,
    setLoading,
    setError,
    addToHistory,
    clearHistory,
    loadFromHistory,
    loadFromTemplate,
    reset,
  } = usePlaygroundStore();

  const { currentProject } = useProjectStore();
  const [copied, setCopied] = useState(false);
  const [token, setToken] = useState<string | null>(null);


  // Get token on mount (client-side only)
  useEffect(() => {
    setToken(api.getStoredToken());
  }, []);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(['Collections'])
  );
  const [activeTab, setActiveTab] = useState<'body' | 'headers'>('body');
  const [showHistory, setShowHistory] = useState(false);

  const apiUrl = API_CONFIG.baseUrl;

  const toggleCategory = (name: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  };

  const handleSendRequest = async () => {
    if (!token) {
      setError('Not authenticated. Please log in.');
      return;
    }

    setLoading(true);
    setError(null);
    setResponse(null, null, null);

    const startTime = Date.now();

    try {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      };

      if (currentProject?.id) {
        headers['X-Project-ID'] = currentProject.id;
      }

      const options: RequestInit = {
        method,
        headers,
      };

      if (method !== 'GET' && method !== 'DELETE' && body.trim()) {
        options.body = body;
      }

      const res = await fetch(`${apiUrl}${path}`, options);
      const endTime = Date.now();
      const elapsed = endTime - startTime;

      let responseText: string;
      const contentType = res.headers.get('content-type');

      if (contentType?.includes('application/json')) {
        const json = await res.json();
        responseText = JSON.stringify(json, null, 2);
      } else {
        responseText = await res.text();
      }

      setResponse(responseText, res.status, elapsed);

      addToHistory({
        method,
        path,
        body: body || undefined,
        status: res.status,
        duration: elapsed,
      });
    } catch (err) {
      const elapsed = Date.now() - startTime;
      const errorMessage = err instanceof Error ? err.message : 'Request failed';
      setError(errorMessage);
      addToHistory({
        method,
        path,
        body: body || undefined,
        status: 0,
        duration: elapsed,
      });
    } finally {
      setLoading(false);
    }
  };

  const generateCurl = () => {
    let curl = `curl -X ${method} "${apiUrl}${path}"`;
    curl += ` \\\n  -H "Authorization: Bearer YOUR_API_KEY"`;
    curl += ` \\\n  -H "Content-Type: application/json"`;

    if (currentProject?.id) {
      curl += ` \\\n  -H "X-Project-ID: ${currentProject.id}"`;
    }

    if (method !== 'GET' && method !== 'DELETE' && body.trim()) {
      const escapedBody = body.replace(/'/g, "'\\''");
      curl += ` \\\n  -d '${escapedBody}'`;
    }

    return curl;
  };

  const handleCopyCurl = () => {
    navigator.clipboard.writeText(generateCurl());
    setCopied(true);
    toast.success('Copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  };

  const formatTimestamp = (ts: number) => {
    const date = new Date(ts);
    return date.toLocaleTimeString();
  };

  const getStatusColor = (s: number | null) => {
    if (!s) return 'text-text-tertiary';
    if (s >= 200 && s < 300) return 'text-success';
    if (s >= 400 && s < 500) return 'text-warning';
    return 'text-error';
  };

  return (
    <div className="h-screen flex flex-col">
      <Header />

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar - Endpoints & History */}
        <aside className="w-[240px] lg:w-[280px] border-r border-border-light bg-surface-secondary overflow-y-auto hidden md:flex flex-col">
          {/* Tabs */}
          <div className="flex border-b border-border-light">
            <button
              onClick={() => setShowHistory(false)}
              className={cn(
                'flex-1 px-4 py-2.5 text-[13px] font-medium transition-colors',
                !showHistory
                  ? 'text-foreground border-b-2 border-primary'
                  : 'text-text-secondary hover:text-foreground'
              )}
            >
              Endpoints
            </button>
            <button
              onClick={() => setShowHistory(true)}
              className={cn(
                'flex-1 px-4 py-2.5 text-[13px] font-medium transition-colors',
                showHistory
                  ? 'text-foreground border-b-2 border-primary'
                  : 'text-text-secondary hover:text-foreground'
              )}
            >
              History
            </button>
          </div>

          {!showHistory ? (
            /* Endpoints */
            <div className="flex-1 overflow-y-auto p-2">
              {endpointCategories.map((category) => (
                <div key={category.name} className="mb-1">
                  <button
                    onClick={() => toggleCategory(category.name)}
                    className="w-full flex items-center gap-2 px-2 py-1.5 text-[12px] font-semibold text-text-secondary uppercase tracking-wider hover:text-foreground"
                  >
                    {expandedCategories.has(category.name) ? (
                      <ChevronDown className="w-3 h-3" />
                    ) : (
                      <ChevronRight className="w-3 h-3" />
                    )}
                    {category.name}
                  </button>

                  {expandedCategories.has(category.name) && (
                    <div className="ml-2 space-y-0.5">
                      {category.endpoints.map((endpoint, idx) => (
                        <button
                          key={idx}
                          onClick={() => loadFromTemplate(endpoint)}
                          className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-[13px] hover:bg-surface-hover text-left"
                        >
                          <span
                            className={cn(
                              'px-1.5 py-0.5 rounded text-[10px] font-semibold',
                              methodColors[endpoint.method]
                            )}
                          >
                            {endpoint.method}
                          </span>
                          <span className="text-text-secondary truncate flex-1">
                            {endpoint.name}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            /* History */
            <div className="flex-1 overflow-y-auto">
              {history.length > 0 ? (
                <>
                  <div className="p-2 border-b border-border-light">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={clearHistory}
                      className="w-full text-text-secondary"
                    >
                      <Trash2 className="w-3 h-3 mr-1.5" />
                      Clear History
                    </Button>
                  </div>
                  <div className="p-2 space-y-1">
                    {history.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => loadFromHistory(item)}
                        className="w-full flex items-center gap-2 px-2 py-2 rounded text-[12px] hover:bg-surface-hover text-left"
                      >
                        <span
                          className={cn(
                            'px-1.5 py-0.5 rounded text-[10px] font-semibold flex-shrink-0',
                            methodColors[item.method]
                          )}
                        >
                          {item.method}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="text-text-secondary truncate">
                            {item.path}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5 text-[10px] text-text-tertiary">
                            <span className={getStatusColor(item.status || null)}>
                              {item.status || 'ERR'}
                            </span>
                            <span>{item.duration}ms</span>
                            <span>{formatTimestamp(item.timestamp)}</span>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <div className="p-4 text-center text-[13px] text-text-tertiary">
                  No history yet
                </div>
              )}
            </div>
          )}
        </aside>

        {/* Main Content */}
        <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Request Bar */}
          <div className="flex items-center gap-2 p-3 border-b border-border-light bg-surface">
            {/* Method Selector */}
            <Listbox value={method} onChange={(v) => setMethod(v as HttpMethod)}>
              <div className="relative">
                <ListboxButton
                  className={cn(
                    'flex items-center gap-2 px-3 py-2 rounded-xl text-[13px] font-semibold',
                    'border border-border-light bg-surface-secondary',
                    'hover:bg-surface-hover hover:border-border',
                    'focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/20',
                    'transition-all duration-150 cursor-pointer'
                  )}
                >
                  <span className={cn('px-1.5 py-0.5 rounded text-[11px]', methodColors[method])}>
                    {method}
                  </span>
                  <ChevronDown className="w-3.5 h-3.5 text-text-tertiary" />
                </ListboxButton>
                <Transition
                  as={Fragment}
                  enter="transition ease-out duration-150"
                  enterFrom="opacity-0 scale-95 -translate-y-1"
                  enterTo="opacity-100 scale-100 translate-y-0"
                  leave="transition ease-in duration-100"
                  leaveFrom="opacity-100 scale-100 translate-y-0"
                  leaveTo="opacity-0 scale-95 -translate-y-1"
                >
                  <ListboxOptions className="absolute z-50 mt-2 w-28 bg-surface border border-border-light rounded-xl shadow-[0_10px_40px_-10px_rgba(0,0,0,0.5)] overflow-hidden focus:outline-none">
                    <div className="py-1.5">
                      {(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as HttpMethod[]).map((m) => (
                        <ListboxOption key={m} value={m} as={Fragment}>
                          {({ focus, selected }) => (
                            <div
                              className={cn(
                                'flex items-center justify-between px-3 py-2 cursor-pointer transition-colors',
                                focus ? 'bg-surface-hover' : ''
                              )}
                            >
                              <span className={cn('px-1.5 py-0.5 rounded text-[11px] font-semibold', methodColors[m])}>
                                {m}
                              </span>
                              {selected && <Check className="w-3.5 h-3.5 text-primary" />}
                            </div>
                          )}
                        </ListboxOption>
                      ))}
                    </div>
                  </ListboxOptions>
                </Transition>
              </div>
            </Listbox>

            {/* URL Input */}
            <div className="flex-1 flex items-center bg-surface-secondary rounded-lg border border-border-light focus-within:border-primary">
              <span className="pl-3 text-[13px] text-text-tertiary">{apiUrl}</span>
              <input
                type="text"
                value={path}
                onChange={(e) => setPath(e.target.value)}
                placeholder="/v1/..."
                className="flex-1 px-2 py-2 bg-transparent text-[13px] text-foreground outline-none"
              />
            </div>

            {/* Send Button */}
            <Button onClick={handleSendRequest} disabled={isLoading}>
              {isLoading ? (
                <Spinner size="sm" className="mr-2" />
              ) : (
                <Play className="w-4 h-4 mr-2" />
              )}
              Send
            </Button>

            {/* Copy cURL */}
            <Button variant="ghost" onClick={handleCopyCurl} title="Copy as cURL">
              {copied ? (
                <Check className="w-4 h-4 text-success" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
            </Button>

            {/* Reset */}
            <Button variant="ghost" onClick={reset} title="Reset">
              <RotateCcw className="w-4 h-4" />
            </Button>
          </div>

          {/* Request/Response Split */}
          <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
            {/* Request Body */}
            <div className="flex-1 flex flex-col border-b lg:border-b-0 lg:border-r border-border-light min-h-[200px] lg:min-h-0">
              <div className="flex items-center gap-2 px-3 py-2 border-b border-border-light bg-surface-secondary">
                <button
                  onClick={() => setActiveTab('body')}
                  className={cn(
                    'px-3 py-1 rounded text-[13px] font-medium transition-colors',
                    activeTab === 'body'
                      ? 'bg-surface text-foreground'
                      : 'text-text-secondary hover:text-foreground'
                  )}
                >
                  Body
                </button>
                <button
                  onClick={() => setActiveTab('headers')}
                  className={cn(
                    'px-3 py-1 rounded text-[13px] font-medium transition-colors',
                    activeTab === 'headers'
                      ? 'bg-surface text-foreground'
                      : 'text-text-secondary hover:text-foreground'
                  )}
                >
                  Headers
                </button>
              </div>

              <div className="flex-1 min-h-0">
                {activeTab === 'body' ? (
                  <Editor
                    height="100%"
                    language="json"
                    value={body}
                    onChange={(value) => setBody(value || '')}
                    theme="vs-dark"
                    options={{
                      minimap: { enabled: false },
                      fontSize: 13,
                      lineNumbers: 'on',
                      scrollBeyondLastLine: false,
                      wordWrap: 'on',
                      automaticLayout: true,
                      padding: { top: 12, bottom: 12 },
                    }}
                  />
                ) : (
                  <div className="p-4 text-[13px] text-text-secondary">
                    <p className="mb-3">Auto-included headers:</p>
                    <div className="space-y-2 font-mono text-[12px]">
                      <div className="flex gap-2">
                        <span className="text-text-tertiary">Authorization:</span>
                        <span className="text-foreground">Bearer {token ? '***' : '(not set)'}</span>
                      </div>
                      <div className="flex gap-2">
                        <span className="text-text-tertiary">Content-Type:</span>
                        <span className="text-foreground">application/json</span>
                      </div>
                      <div className="flex gap-2">
                        <span className="text-text-tertiary">X-Project-ID:</span>
                        <span className="text-foreground">
                          {currentProject?.id || '(not set)'}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Response */}
            <div className="flex-1 flex flex-col min-h-[200px] lg:min-h-0">
              <div className="flex items-center gap-3 px-3 py-2 border-b border-border-light bg-surface-secondary">
                <span className="text-[13px] font-medium text-foreground">Response</span>
                {status !== null && (
                  <>
                    <Badge
                      variant={status >= 200 && status < 300 ? 'success' : 'error'}
                    >
                      {status}
                    </Badge>
                    {duration !== null && (
                      <span className="flex items-center gap-1 text-[12px] text-text-tertiary">
                        <Clock className="w-3 h-3" />
                        {duration}ms
                      </span>
                    )}
                  </>
                )}
              </div>

              <div className="flex-1 min-h-0 bg-background">
                {isLoading ? (
                  <div className="flex items-center justify-center h-full">
                    <Spinner size="lg" />
                  </div>
                ) : error ? (
                  <div className="p-4 overflow-auto h-full">
                    <div className="p-4 bg-error/10 rounded-lg border border-error/20">
                      <div className="text-[14px] font-medium text-error mb-1">
                        Error
                      </div>
                      <div className="text-[13px] text-error/80 font-mono">
                        {error}
                      </div>
                    </div>
                  </div>
                ) : response ? (
                  <Editor
                    height="100%"
                    language="json"
                    value={response}
                    theme="vs-dark"
                    options={{
                      readOnly: true,
                      minimap: { enabled: false },
                      fontSize: 13,
                      lineNumbers: 'off',
                      scrollBeyondLastLine: false,
                      wordWrap: 'on',
                      automaticLayout: true,
                      padding: { top: 12, bottom: 12 },
                    }}
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-text-tertiary">
                    <Terminal className="w-12 h-12 mb-4 opacity-50" />
                    <p className="text-[14px]">Send a request to see the response</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
