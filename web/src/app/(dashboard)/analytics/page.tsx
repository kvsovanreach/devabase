'use client';

import { useState, useMemo } from 'react';
import { Header } from '@/components/layout/header';
import { Card } from '@/components/ui/card';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { PageSpinner } from '@/components/ui/spinner';
import { useUsageAnalytics, useStorageStats, UsageByEndpoint } from '@/hooks/use-analytics';
import {
  Activity,
  Zap,
  Clock,
  AlertTriangle,
  Database,
  FileText,
  FolderOpen,
  TrendingUp,
  Server,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const periodOptions = [
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
];

export default function AnalyticsPage() {
  const [period, setPeriod] = useState('30');

  const dateRange = useMemo(() => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - parseInt(period));
    return {
      start_date: start.toISOString(),
      end_date: end.toISOString(),
    };
  }, [period]);

  const { data: usage, isLoading: usageLoading } = useUsageAnalytics(dateRange);
  const { data: storage, isLoading: storageLoading } = useStorageStats();

  const isLoading = usageLoading || storageLoading;

  // Calculate error rate
  const errorRate = usage?.summary.total_requests
    ? ((usage.summary.error_count / usage.summary.total_requests) * 100).toFixed(2)
    : '0';

  // Format latency
  const formatLatency = (ms: number) => {
    if (ms < 1000) return `${Math.round(ms)}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  return (
    <div>
      <Header />
      <div className="p-4 md:p-8">
        {/* Page Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="text-[22px] md:text-[26px] font-semibold text-foreground tracking-tight">
              Analytics
            </h2>
            <p className="text-[14px] md:text-[15px] text-text-secondary mt-1">
              Monitor API usage, performance, and resource consumption.
            </p>
          </div>
          <div className="w-[180px]">
            <Select
              options={periodOptions}
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
            />
          </div>
        </div>

        {isLoading ? (
          <PageSpinner />
        ) : (
          <>
            {/* Summary Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              {/* Total Requests */}
              <Card className="p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Activity className="w-5 h-5 text-primary" />
                  </div>
                  <span className="text-[13px] text-text-secondary font-medium">Total Requests</span>
                </div>
                <p className="text-[28px] font-bold text-foreground">
                  {(usage?.summary.total_requests || 0).toLocaleString()}
                </p>
                <p className="text-[12px] text-text-tertiary mt-1">
                  Last {period} days
                </p>
              </Card>

              {/* Total Tokens */}
              <Card className="p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-info/10 flex items-center justify-center">
                    <Zap className="w-5 h-5 text-info" />
                  </div>
                  <span className="text-[13px] text-text-secondary font-medium">Total Tokens</span>
                </div>
                <p className="text-[28px] font-bold text-foreground">
                  {(usage?.summary.total_tokens || 0).toLocaleString()}
                </p>
                <p className="text-[12px] text-text-tertiary mt-1">
                  Embedding + LLM tokens
                </p>
              </Card>

              {/* Avg Latency */}
              <Card className="p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-success/10 flex items-center justify-center">
                    <Clock className="w-5 h-5 text-success" />
                  </div>
                  <span className="text-[13px] text-text-secondary font-medium">Avg Latency</span>
                </div>
                <p className="text-[28px] font-bold text-foreground">
                  {formatLatency(usage?.summary.avg_latency_ms || 0)}
                </p>
                <p className="text-[12px] text-text-tertiary mt-1">
                  Response time
                </p>
              </Card>

              {/* Error Rate */}
              <Card className="p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-error/10 flex items-center justify-center">
                    <AlertTriangle className="w-5 h-5 text-error" />
                  </div>
                  <span className="text-[13px] text-text-secondary font-medium">Error Rate</span>
                </div>
                <p className="text-[28px] font-bold text-foreground">
                  {errorRate}%
                </p>
                <p className="text-[12px] text-text-tertiary mt-1">
                  {usage?.summary.error_count || 0} errors
                </p>
              </Card>
            </div>

            {/* Storage Stats */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
              <Card className="p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center">
                    <FolderOpen className="w-5 h-5 text-purple-500" />
                  </div>
                  <span className="text-[13px] text-text-secondary font-medium">Collections</span>
                </div>
                <p className="text-[28px] font-bold text-foreground">
                  {storage?.collections || 0}
                </p>
              </Card>

              <Card className="p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-cyan-500/10 flex items-center justify-center">
                    <Database className="w-5 h-5 text-cyan-500" />
                  </div>
                  <span className="text-[13px] text-text-secondary font-medium">Vectors</span>
                </div>
                <p className="text-[28px] font-bold text-foreground">
                  {(storage?.vectors || 0).toLocaleString()}
                </p>
              </Card>

              <Card className="p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center">
                    <FileText className="w-5 h-5 text-orange-500" />
                  </div>
                  <span className="text-[13px] text-text-secondary font-medium">Documents</span>
                </div>
                <p className="text-[28px] font-bold text-foreground">
                  {(storage?.documents || 0).toLocaleString()}
                </p>
              </Card>
            </div>

            {/* Usage by Endpoint */}
            <Card className="p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-surface-secondary flex items-center justify-center">
                    <Server className="w-5 h-5 text-text-secondary" />
                  </div>
                  <div>
                    <h3 className="text-[15px] font-semibold text-foreground">Usage by Endpoint</h3>
                    <p className="text-[13px] text-text-secondary">Top 20 most used API endpoints</p>
                  </div>
                </div>
                <Badge variant="default">{usage?.by_endpoint.length || 0} endpoints</Badge>
              </div>

              {usage?.by_endpoint && usage.by_endpoint.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border-light">
                        <th className="text-left py-3 px-4 text-[12px] font-medium text-text-secondary uppercase tracking-wider">
                          Endpoint
                        </th>
                        <th className="text-right py-3 px-4 text-[12px] font-medium text-text-secondary uppercase tracking-wider">
                          Requests
                        </th>
                        <th className="text-right py-3 px-4 text-[12px] font-medium text-text-secondary uppercase tracking-wider">
                          Tokens
                        </th>
                        <th className="text-right py-3 px-4 text-[12px] font-medium text-text-secondary uppercase tracking-wider">
                          Avg Latency
                        </th>
                        <th className="text-right py-3 px-4 text-[12px] font-medium text-text-secondary uppercase tracking-wider">
                          % of Total
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {usage.by_endpoint.map((endpoint: UsageByEndpoint, index: number) => {
                        const percentage = usage.summary.total_requests
                          ? ((endpoint.request_count / usage.summary.total_requests) * 100).toFixed(1)
                          : '0';

                        return (
                          <tr
                            key={endpoint.endpoint}
                            className={cn(
                              'border-b border-border-light last:border-0',
                              index % 2 === 0 ? 'bg-surface' : 'bg-surface-secondary/30'
                            )}
                          >
                            <td className="py-3 px-4">
                              <code className="text-[13px] font-mono text-foreground">
                                {endpoint.endpoint}
                              </code>
                            </td>
                            <td className="py-3 px-4 text-right">
                              <span className="text-[14px] font-medium text-foreground">
                                {endpoint.request_count.toLocaleString()}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-right">
                              <span className="text-[14px] text-text-secondary">
                                {endpoint.total_tokens.toLocaleString()}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-right">
                              <span className="text-[14px] text-text-secondary">
                                {formatLatency(endpoint.avg_latency_ms)}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <div className="w-16 h-2 bg-surface-secondary rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-primary rounded-full"
                                    style={{ width: `${percentage}%` }}
                                  />
                                </div>
                                <span className="text-[13px] text-text-tertiary w-12 text-right">
                                  {percentage}%
                                </span>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-12">
                  <TrendingUp className="w-12 h-12 text-text-tertiary mx-auto mb-3" />
                  <p className="text-[15px] text-text-secondary">No usage data yet</p>
                  <p className="text-[13px] text-text-tertiary mt-1">
                    Start making API calls to see analytics here.
                  </p>
                </div>
              )}
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
