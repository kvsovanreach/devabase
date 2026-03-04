'use client';

import { useState, useRef, useEffect } from 'react';
import { Download, FileJson, FileSpreadsheet, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useExportTable, ExportFormat } from '@/hooks/use-import-export';
import { useProjectStore } from '@/stores/project-store';
import { cn } from '@/lib/utils';

interface ExportButtonProps {
  tableName: string;
}

export function ExportButton({ tableName }: ExportButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const exportMutation = useExportTable();
  const { currentProject } = useProjectStore();

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleExport = (format: ExportFormat) => {
    setIsOpen(false);
    exportMutation.mutate({ tableName, format, projectName: currentProject?.name });
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => setIsOpen(!isOpen)}
        disabled={exportMutation.isPending}
      >
        <Download className="w-4 h-4 mr-2" />
        Export
        <ChevronDown className={cn('w-4 h-4 ml-1 transition-transform', isOpen && 'rotate-180')} />
      </Button>

      {isOpen && (
        <div className="absolute right-0 mt-1 w-48 bg-surface border border-border-light rounded-lg shadow-lg z-50 py-1">
          <button
            onClick={() => handleExport('csv')}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-[14px] text-text-secondary hover:text-foreground hover:bg-surface-hover transition-colors"
          >
            <FileSpreadsheet className="w-4 h-4" />
            Export as CSV
          </button>
          <button
            onClick={() => handleExport('json')}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-[14px] text-text-secondary hover:text-foreground hover:bg-surface-hover transition-colors"
          >
            <FileJson className="w-4 h-4" />
            Export as JSON
          </button>
        </div>
      )}
    </div>
  );
}
