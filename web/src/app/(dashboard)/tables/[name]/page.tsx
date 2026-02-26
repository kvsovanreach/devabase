'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Table2, Upload } from 'lucide-react';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PageSpinner } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { useTable, TableColumnInfo } from '@/hooks/use-tables';
import { DataBrowser } from '@/components/tables/data-browser';
import { ExportButton } from '@/components/tables/export-button';
import { ImportModal } from '@/components/tables/import-modal';

export default function TableDetailPage() {
  const params = useParams();
  const tableName = params.name as string;
  const { data: table, isLoading, error } = useTable(tableName);
  const [isImportOpen, setIsImportOpen] = useState(false);

  if (isLoading) {
    return (
      <div>
        <Header />
        <div className="p-8">
          <PageSpinner />
        </div>
      </div>
    );
  }

  if (error || !table) {
    return (
      <div>
        <Header />
        <div className="p-8">
          <EmptyState
            icon={<Table2 className="w-8 h-8" />}
            title="Table not found"
            description={`The table "${tableName}" does not exist.`}
            action={
              <Link href="/tables">
                <Button variant="secondary">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to Tables
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
      <div className="p-4 md:p-8">
        <div className="flex items-center justify-between gap-4 mb-6 md:mb-8">
          <div className="flex items-center gap-4">
            <Link href="/tables">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="w-4 h-4" />
              </Button>
            </Link>
            <div className="flex items-center gap-3 md:gap-4">
              <div className="w-10 h-10 md:w-11 md:h-11 rounded-xl bg-surface-secondary flex items-center justify-center flex-shrink-0">
                <Table2 className="w-5 h-5 text-text-secondary" />
              </div>
              <div>
                <h2 className="text-[20px] md:text-[24px] font-semibold text-foreground tracking-tight">
                  {table.name}
                </h2>
                <p className="text-[14px] md:text-[15px] text-text-secondary mt-0.5">
                  {table.columns.length} columns · {table.row_count} rows
                </p>
              </div>
            </div>
          </div>

          {/* Import/Export buttons */}
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setIsImportOpen(true)}
            >
              <Upload className="w-4 h-4 mr-2" />
              Import
            </Button>
            <ExportButton tableName={tableName} />
          </div>
        </div>

        {/* Schema Info */}
        <Card className="p-4 md:p-5 mb-4 md:mb-6">
          <h3 className="text-[12px] md:text-[13px] font-medium text-text-secondary uppercase tracking-wide mb-3">
            Schema
          </h3>
          <div className="flex flex-wrap gap-1.5 md:gap-2">
            {table.columns.map((col: TableColumnInfo) => (
              <div
                key={col.name}
                className="flex items-center gap-1.5 md:gap-2 px-2 md:px-3 py-1 md:py-1.5 bg-surface-secondary rounded-lg"
              >
                <span className="text-[12px] md:text-[13px] text-foreground font-medium">{col.name}</span>
                <span className="text-[11px] md:text-[12px] text-text-tertiary">{col.data_type}</span>
                {col.is_primary && (
                  <Badge variant="primary" size="sm">PK</Badge>
                )}
                {!col.is_nullable && !col.is_primary && (
                  <Badge variant="warning" size="sm">REQ</Badge>
                )}
              </div>
            ))}
          </div>
        </Card>

        {/* Data Browser */}
        <Card className="p-4 md:p-5">
          <DataBrowser table={table} />
        </Card>
      </div>

      {/* Import Modal */}
      <ImportModal
        tableName={tableName}
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
      />
    </div>
  );
}
