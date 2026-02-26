'use client';

import { useState, useCallback } from 'react';
import { Upload, X, FileSpreadsheet, FileJson, AlertCircle, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { Spinner } from '@/components/ui/spinner';
import { useImportTable, ImportResult } from '@/hooks/use-import-export';
import { useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';

interface ImportModalProps {
  tableName: string;
  isOpen: boolean;
  onClose: () => void;
}

interface ParsedData {
  headers: string[];
  rows: Record<string, string>[];
  fileType: 'csv' | 'json';
}

export function ImportModal({ tableName, isOpen, onClose }: ImportModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<ParsedData | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  const queryClient = useQueryClient();
  const importMutation = useImportTable();

  const resetState = () => {
    setFile(null);
    setParsedData(null);
    setParseError(null);
    setResult(null);
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const parseCSV = (text: string): ParsedData => {
    const lines = text.trim().split('\n');
    if (lines.length < 1) throw new Error('Empty CSV file');

    const headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
    const rows = lines.slice(1).map((line) => {
      const values = line.split(',').map((v) => v.trim().replace(/^"|"$/g, ''));
      const row: Record<string, string> = {};
      headers.forEach((header, index) => {
        row[header] = values[index] || '';
      });
      return row;
    });

    return { headers, rows, fileType: 'csv' };
  };

  const parseJSON = (text: string): ParsedData => {
    const data = JSON.parse(text);
    if (!Array.isArray(data)) throw new Error('JSON must be an array of objects');
    if (data.length === 0) throw new Error('Empty JSON array');

    const headers = Object.keys(data[0]);
    const rows = data.map((item) => {
      const row: Record<string, string> = {};
      headers.forEach((header) => {
        const value = item[header];
        row[header] = value !== null && value !== undefined ? String(value) : '';
      });
      return row;
    });

    return { headers, rows, fileType: 'json' };
  };

  const handleFile = useCallback(async (selectedFile: File) => {
    setFile(selectedFile);
    setParseError(null);
    setParsedData(null);

    try {
      const text = await selectedFile.text();
      let parsed: ParsedData;

      if (selectedFile.name.endsWith('.csv')) {
        parsed = parseCSV(text);
      } else if (selectedFile.name.endsWith('.json')) {
        parsed = parseJSON(text);
      } else {
        throw new Error('Unsupported file type. Please use CSV or JSON.');
      }

      setParsedData(parsed);
    } catch (error) {
      setParseError(error instanceof Error ? error.message : 'Failed to parse file');
    }
  }, []);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(false);

      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile) {
        handleFile(droppedFile);
      }
    },
    [handleFile]
  );

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      handleFile(selectedFile);
    }
  };

  const handleImport = async () => {
    if (!file) return;

    try {
      const importResult = await importMutation.mutateAsync({ tableName, file });
      setResult(importResult);
      queryClient.invalidateQueries({ queryKey: ['tables', tableName] });
      queryClient.invalidateQueries({ queryKey: ['table-rows', tableName] });
    } catch {
      // Error handled by mutation
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={`Import Data to "${tableName}"`}>
      <div className="space-y-4">
        {result ? (
          // Result view
          <div className="space-y-4">
            <div
              className={cn(
                'p-4 rounded-lg border',
                result.errors.length > 0
                  ? 'bg-warning/10 border-warning/30'
                  : 'bg-success/10 border-success/30'
              )}
            >
              <div className="flex items-center gap-3 mb-2">
                {result.errors.length > 0 ? (
                  <AlertCircle className="w-5 h-5 text-warning" />
                ) : (
                  <CheckCircle className="w-5 h-5 text-success" />
                )}
                <span className="text-[15px] font-medium text-foreground">
                  {result.errors.length > 0
                    ? 'Import completed with errors'
                    : 'Import successful'}
                </span>
              </div>
              <div className="text-[14px] text-text-secondary">
                Imported {result.imported} of {result.total} rows
              </div>
            </div>

            {result.errors.length > 0 && (
              <div className="max-h-[200px] overflow-y-auto">
                <div className="text-[13px] font-medium text-text-secondary mb-2">
                  Errors ({result.errors.length})
                </div>
                <div className="space-y-1">
                  {result.errors.slice(0, 10).map((error, index) => (
                    <div
                      key={index}
                      className="text-[13px] text-error/80 p-2 bg-error/5 rounded"
                    >
                      Row {error.row}: {error.message}
                    </div>
                  ))}
                  {result.errors.length > 10 && (
                    <div className="text-[13px] text-text-tertiary">
                      ... and {result.errors.length - 10} more errors
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="flex justify-end">
              <Button onClick={handleClose}>Done</Button>
            </div>
          </div>
        ) : (
          <>
            {/* File drop zone */}
            <div
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              className={cn(
                'border-2 border-dashed rounded-lg p-8 text-center transition-colors',
                dragActive
                  ? 'border-primary bg-primary/5'
                  : 'border-border-light hover:border-primary/50'
              )}
            >
              <input
                type="file"
                id="file-input"
                accept=".csv,.json"
                onChange={handleFileInput}
                className="hidden"
              />
              <label
                htmlFor="file-input"
                className="cursor-pointer flex flex-col items-center gap-3"
              >
                <Upload className="w-10 h-10 text-text-tertiary" />
                <div>
                  <span className="text-[14px] text-foreground">Drop CSV or JSON file here</span>
                  <span className="text-[14px] text-text-tertiary"> or click to browse</span>
                </div>
              </label>
            </div>

            {/* File info */}
            {file && (
              <div className="flex items-center gap-3 p-3 bg-surface-secondary rounded-lg">
                {file.name.endsWith('.csv') ? (
                  <FileSpreadsheet className="w-5 h-5 text-success" />
                ) : (
                  <FileJson className="w-5 h-5 text-info" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-[14px] font-medium text-foreground truncate">
                    {file.name}
                  </div>
                  <div className="text-[12px] text-text-tertiary">
                    {(file.size / 1024).toFixed(1)} KB
                  </div>
                </div>
                <button
                  onClick={resetState}
                  className="p-1 text-text-tertiary hover:text-foreground"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Parse error */}
            {parseError && (
              <div className="p-3 bg-error/10 border border-error/30 rounded-lg">
                <div className="flex items-center gap-2 text-[14px] text-error">
                  <AlertCircle className="w-4 h-4" />
                  {parseError}
                </div>
              </div>
            )}

            {/* Preview */}
            {parsedData && (
              <div className="space-y-3">
                <div className="text-[13px] font-medium text-text-secondary">
                  Preview ({parsedData.rows.length} rows)
                </div>
                <div className="max-h-[200px] overflow-auto border border-border-light rounded-lg">
                  <table className="w-full text-[13px]">
                    <thead className="bg-surface-secondary sticky top-0">
                      <tr>
                        {parsedData.headers.map((header) => (
                          <th
                            key={header}
                            className="px-3 py-2 text-left text-text-secondary font-medium border-b border-border-light"
                          >
                            {header}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {parsedData.rows.slice(0, 5).map((row, index) => (
                        <tr key={index} className="border-b border-border-light last:border-0">
                          {parsedData.headers.map((header) => (
                            <td key={header} className="px-3 py-2 text-foreground">
                              {row[header]}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {parsedData.rows.length > 5 && (
                  <div className="text-[12px] text-text-tertiary text-center">
                    ... {parsedData.rows.length - 5} more rows
                  </div>
                )}
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="ghost" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                onClick={handleImport}
                disabled={!parsedData || importMutation.isPending}
              >
                {importMutation.isPending ? (
                  <>
                    <Spinner size="sm" className="mr-2" />
                    Importing...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4 mr-2" />
                    Import {parsedData?.rows.length || 0} rows
                  </>
                )}
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
