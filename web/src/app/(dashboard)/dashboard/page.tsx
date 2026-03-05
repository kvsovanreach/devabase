'use client';

import { useCollections } from '@/hooks/use-collections';
import { useTables } from '@/hooks/use-tables';
import { useWebhooks } from '@/hooks/use-webhooks';
import { useApiKeys } from '@/hooks/use-api-keys';
import { useProjectStore } from '@/stores/project-store';
import { Header } from '@/components/layout/header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Spinner } from '@/components/ui/spinner';
import {
  FolderOpen,
  FileText,
  Search,
  Key,
  Plus,
  ArrowRight,
  Database,
  Table2,
  Webhook,
  Zap,
  BookOpen,
  Terminal,
  CheckCircle2,
  ExternalLink,
  Home,
} from 'lucide-react';
import Link from 'next/link';

const webhookStatusVariants: Record<string, 'success' | 'warning' | 'default'> = {
  active: 'success',
  paused: 'warning',
  disabled: 'default',
};

export default function DashboardPage() {
  const { currentProject } = useProjectStore();
  const { data: collections, isLoading: collectionsLoading } = useCollections();
  const { data: tables, isLoading: tablesLoading } = useTables();
  const { data: webhooks, isLoading: webhooksLoading } = useWebhooks();
  const { data: apiKeys, isLoading: apiKeysLoading } = useApiKeys();

  const isLoading = collectionsLoading || tablesLoading || webhooksLoading || apiKeysLoading;

  // Calculate total rows across all tables
  const totalRows = tables?.reduce((acc, t) => acc + t.row_count, 0) || 0;
  const activeWebhooks = webhooks?.filter((w) => w.status === 'active').length || 0;

  const stats = [
    {
      name: 'Collections',
      value: collections?.length || 0,
      icon: FolderOpen,
      href: '/collections',
      color: 'text-primary',
      bgColor: 'bg-primary/10',
    },
    {
      name: 'Vectors',
      value: collections?.reduce((acc, c) => acc + c.vector_count, 0) || 0,
      icon: Database,
      href: '/search',
      color: 'text-emerald-500',
      bgColor: 'bg-emerald-500/10',
    },
    {
      name: 'Tables',
      value: tables?.length || 0,
      icon: Table2,
      href: '/tables',
      color: 'text-violet-500',
      bgColor: 'bg-violet-500/10',
    },
    {
      name: 'Table Rows',
      value: totalRows,
      icon: FileText,
      href: '/tables',
      color: 'text-amber-500',
      bgColor: 'bg-amber-500/10',
    },
    {
      name: 'Webhooks',
      value: webhooks?.length || 0,
      subtext: activeWebhooks > 0 ? `${activeWebhooks} active` : undefined,
      icon: Webhook,
      href: '/webhooks',
      color: 'text-rose-500',
      bgColor: 'bg-rose-500/10',
    },
    {
      name: 'API Keys',
      value: apiKeys?.data?.length || 0,
      icon: Key,
      href: '/keys',
      color: 'text-cyan-500',
      bgColor: 'bg-cyan-500/10',
    },
  ];

  // Check if user is new (no collections and no tables)
  const isNewUser =
    !isLoading && (collections?.length || 0) === 0 && (tables?.length || 0) === 0;

  // Getting started steps
  const gettingStartedSteps = [
    {
      title: 'Create a Collection',
      description: 'Store and search vector embeddings for AI applications',
      href: '/collections',
      icon: FolderOpen,
      completed: (collections?.length || 0) > 0,
    },
    {
      title: 'Create a Table',
      description: 'Store structured data with auto-generated REST API',
      href: '/tables',
      icon: Table2,
      completed: (tables?.length || 0) > 0,
    },
    {
      title: 'Generate an API Key',
      description: 'Secure access to your data from external applications',
      href: '/keys',
      icon: Key,
      completed: (apiKeys?.data?.length || 0) > 0,
    },
    {
      title: 'Set up Webhooks',
      description: 'Get notified when data changes in your project',
      href: '/webhooks',
      icon: Webhook,
      completed: (webhooks?.length || 0) > 0,
    },
  ];

  const completedSteps = gettingStartedSteps.filter((s) => s.completed).length;

  if (!currentProject) {
    return (
      <div>
        <Header />
        <div className="p-4 md:p-8">
          <EmptyState
            icon={<FolderOpen className="w-8 h-8" />}
            title="No project selected"
            description="Create a project to get started with your vector database."
            action={
              <Link href="/settings/project">
                <Button>
                  <Plus className="w-4 h-4 mr-2" />
                  Create Project
                </Button>
              </Link>
            }
          />
        </div>
      </div>
    );
  }

  return (
    <div>
      <Header />
      <div className="p-4 md:p-8 space-y-6 md:space-y-8">
        {/* Welcome Section */}
        <div className="bg-gradient-to-br from-primary/5 via-surface to-violet-500/5 rounded-2xl border border-border-light p-5 md:p-8 shadow-card">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
            <div>
              <h2 className="text-[22px] md:text-[28px] font-semibold text-foreground tracking-tight">
                Welcome to {currentProject.name}
              </h2>
              <p className="text-[15px] md:text-[17px] text-text-secondary mt-2 max-w-xl">
                Your all-in-one backend for vector search, structured data, and real-time events.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Link href="https://sovanreach.com/projects/devabase" target="_blank">
                <Button variant="secondary" size="sm">
                  <Home className="w-4 h-4 mr-2" />
                  <span className="hidden sm:inline">Home Page</span>
                  <span className="sm:hidden">Home</span>
                  <ExternalLink className="w-3 h-3 ml-1.5 opacity-50" />
                </Button>
              </Link>
              <Link href="https://sovanreach.com/projects/devabase/docs" target="_blank">
                <Button variant="secondary" size="sm">
                  <BookOpen className="w-4 h-4 mr-2" />
                  <span className="hidden sm:inline">Documentation</span>
                  <span className="sm:hidden">Docs</span>
                  <ExternalLink className="w-3 h-3 ml-1.5 opacity-50" />
                </Button>
              </Link>
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Spinner />
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 md:gap-4">
            {stats.map((stat) => (
              <Link key={stat.name} href={stat.href}>
                <Card hover className="p-4 md:p-5 h-full">
                  <div className="flex flex-col h-full">
                    <div className={`w-9 h-9 md:w-10 md:h-10 rounded-xl ${stat.bgColor} flex items-center justify-center mb-2 md:mb-3`}>
                      <stat.icon className={`w-4 h-4 md:w-5 md:h-5 ${stat.color}`} />
                    </div>
                    <p className="text-[12px] md:text-[13px] font-medium text-text-secondary">{stat.name}</p>
                    <p className="text-[22px] md:text-[28px] font-semibold text-foreground mt-1 tracking-tight">
                      {stat.value.toLocaleString()}
                    </p>
                    {stat.subtext && (
                      <p className="text-[11px] md:text-[12px] text-text-tertiary mt-1">{stat.subtext}</p>
                    )}
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}

        {/* Getting Started (for new users) */}
        {isNewUser && (
          <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Zap className="w-5 h-5 text-primary" />
                    Getting Started
                  </CardTitle>
                  <CardDescription>Complete these steps to set up your project</CardDescription>
                </div>
                <Badge variant="primary">
                  {completedSteps}/{gettingStartedSteps.length} completed
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                {gettingStartedSteps.map((step) => (
                  <Link key={step.title} href={step.href}>
                    <div
                      className={`p-4 rounded-xl border transition-all ${
                        step.completed
                          ? 'bg-success/5 border-success/20'
                          : 'bg-surface-secondary border-border-light hover:border-primary/30 hover:bg-surface-hover'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                            step.completed ? 'bg-success/10' : 'bg-surface'
                          }`}
                        >
                          {step.completed ? (
                            <CheckCircle2 className="w-5 h-5 text-success" />
                          ) : (
                            <step.icon className="w-5 h-5 text-text-secondary" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p
                            className={`text-[14px] md:text-[15px] font-medium ${
                              step.completed ? 'text-success' : 'text-foreground'
                            }`}
                          >
                            {step.title}
                          </p>
                          <p className="text-[12px] md:text-[13px] text-text-secondary mt-0.5">
                            {step.description}
                          </p>
                        </div>
                        {!step.completed && (
                          <ArrowRight className="w-4 h-4 text-text-tertiary flex-shrink-0 mt-1" />
                        )}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Quick Actions */}
        <div>
          <h3 className="text-[16px] md:text-[17px] font-semibold text-foreground tracking-tight mb-3 md:mb-4">
            Quick Actions
          </h3>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
            <Link href="/collections">
              <Card hover className="p-4 md:p-5">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
                  <div className="w-10 h-10 md:w-11 md:h-11 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <FolderOpen className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] md:text-[15px] font-medium text-foreground">New Collection</p>
                    <p className="text-[12px] md:text-[13px] text-text-secondary">Store vectors</p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-text-tertiary flex-shrink-0 hidden sm:block" />
                </div>
              </Card>
            </Link>
            <Link href="/tables">
              <Card hover className="p-4 md:p-5">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
                  <div className="w-10 h-10 md:w-11 md:h-11 rounded-xl bg-violet-500/10 flex items-center justify-center flex-shrink-0">
                    <Table2 className="w-5 h-5 text-violet-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] md:text-[15px] font-medium text-foreground">New Table</p>
                    <p className="text-[12px] md:text-[13px] text-text-secondary">Store data</p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-text-tertiary flex-shrink-0 hidden sm:block" />
                </div>
              </Card>
            </Link>
            <Link href="/search">
              <Card hover className="p-4 md:p-5">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
                  <div className="w-10 h-10 md:w-11 md:h-11 rounded-xl bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
                    <Search className="w-5 h-5 text-emerald-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] md:text-[15px] font-medium text-foreground">Search</p>
                    <p className="text-[12px] md:text-[13px] text-text-secondary">Query vectors</p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-text-tertiary flex-shrink-0 hidden sm:block" />
                </div>
              </Card>
            </Link>
            <Link href="/keys">
              <Card hover className="p-4 md:p-5">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
                  <div className="w-10 h-10 md:w-11 md:h-11 rounded-xl bg-cyan-500/10 flex items-center justify-center flex-shrink-0">
                    <Key className="w-5 h-5 text-cyan-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] md:text-[15px] font-medium text-foreground">API Keys</p>
                    <p className="text-[12px] md:text-[13px] text-text-secondary">Manage access</p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-text-tertiary flex-shrink-0 hidden sm:block" />
                </div>
              </Card>
            </Link>
          </div>
        </div>

        {/* Recent Collections & Tables */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recent Collections */}
          {collections && collections.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-3 md:mb-4">
                <h3 className="text-[16px] md:text-[17px] font-semibold text-foreground tracking-tight">
                  Recent Collections
                </h3>
                <Link
                  href="/collections"
                  className="text-[13px] md:text-[14px] text-primary hover:text-primary-hover font-medium"
                >
                  View all
                </Link>
              </div>
              <div className="flex flex-col gap-2 md:gap-3">
                {collections.slice(0, 4).map((collection) => (
                  <Link key={collection.name} href={`/collections/${collection.name}`} className="block">
                    <Card hover className="p-3 md:p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-8 h-8 md:w-9 md:h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                            <FolderOpen className="w-4 h-4 text-primary" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-[14px] md:text-[15px] font-medium text-foreground truncate">
                              {collection.name}
                            </p>
                            <p className="text-[11px] md:text-[12px] text-text-tertiary">
                              {collection.vector_count.toLocaleString()} vectors
                            </p>
                          </div>
                        </div>
                        <Badge variant="default" className="flex-shrink-0 ml-2">{collection.dimensions}d</Badge>
                      </div>
                    </Card>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Recent Tables */}
          {tables && tables.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-3 md:mb-4">
                <h3 className="text-[16px] md:text-[17px] font-semibold text-foreground tracking-tight">
                  Recent Tables
                </h3>
                <Link
                  href="/tables"
                  className="text-[13px] md:text-[14px] text-primary hover:text-primary-hover font-medium"
                >
                  View all
                </Link>
              </div>
              <div className="flex flex-col gap-2 md:gap-3">
                {tables.slice(0, 4).map((table) => (
                  <Link key={table.name} href={`/tables/${table.name}`} className="block">
                    <Card hover className="p-3 md:p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-8 h-8 md:w-9 md:h-9 rounded-lg bg-violet-500/10 flex items-center justify-center flex-shrink-0">
                            <Table2 className="w-4 h-4 text-violet-500" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-[14px] md:text-[15px] font-medium text-foreground truncate">{table.name}</p>
                            <p className="text-[11px] md:text-[12px] text-text-tertiary">
                              {table.row_count.toLocaleString()} rows · {table.columns.length} cols
                            </p>
                          </div>
                        </div>
                        <ArrowRight className="w-4 h-4 text-text-tertiary flex-shrink-0 ml-2" />
                      </div>
                    </Card>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Active Webhooks */}
        {webhooks && webhooks.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3 md:mb-4">
              <h3 className="text-[16px] md:text-[17px] font-semibold text-foreground tracking-tight">
                Webhooks
              </h3>
              <Link
                href="/webhooks"
                className="text-[13px] md:text-[14px] text-primary hover:text-primary-hover font-medium"
              >
                Manage
              </Link>
            </div>
            <Card>
              <div className="divide-y divide-border-light">
                {webhooks.slice(0, 5).map((webhook) => (
                  <Link
                    key={webhook.id}
                    href="/webhooks"
                    className="flex items-center justify-between p-3 md:p-4 hover:bg-surface-hover transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div
                        className={`w-8 h-8 md:w-9 md:h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                          webhook.status === 'active' ? 'bg-success/10' : 'bg-surface-secondary'
                        }`}
                      >
                        <Webhook
                          className={`w-4 h-4 ${
                            webhook.status === 'active' ? 'text-success' : 'text-text-tertiary'
                          }`}
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[14px] md:text-[15px] font-medium text-foreground truncate">{webhook.name}</p>
                        <p className="text-[11px] md:text-[12px] text-text-tertiary truncate">
                          {webhook.url}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 md:gap-3 flex-shrink-0 ml-2">
                      <p className="text-[11px] md:text-[12px] text-text-tertiary hidden sm:block">
                        {webhook.events.length} events
                      </p>
                      <Badge variant={webhookStatusVariants[webhook.status] || 'default'}>
                        {webhook.status}
                      </Badge>
                    </div>
                  </Link>
                ))}
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
