'use client';

import { useState, useCallback, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { useQueryClient } from '@tanstack/react-query';
import { Modal, ModalFooter } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { useCollections } from '@/hooks/use-collections';
import { useUploadDocument } from '@/hooks/use-documents';
import { Switch } from '@/components/ui/switch';
import { useProjectStore } from '@/stores/project-store';
import { ProjectSettings } from '@/types';
import { Upload, X, FileText, CheckCircle, AlertCircle, Loader2, Settings } from 'lucide-react';
import { cn, formatFileSize } from '@/lib/utils';
import toast from 'react-hot-toast';
import Link from 'next/link';

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultCollection?: string;
  onUploadComplete?: (collection: string) => void;
}

interface UploadFile {
  file: File;
  name: string;
  progress: number;
  status: 'pending' | 'uploading' | 'success' | 'error';
  error?: string;
}

// Extract filename without extension
function getNameWithoutExtension(filename: string): string {
  const lastDot = filename.lastIndexOf('.');
  return lastDot > 0 ? filename.substring(0, lastDot) : filename;
}

export function UploadModal({ isOpen, onClose, defaultCollection, onUploadComplete }: UploadModalProps) {
  const { data: collections } = useCollections();
  const queryClient = useQueryClient();
  const { currentProject } = useProjectStore();
  const [selectedCollection, setSelectedCollection] = useState(defaultCollection || '');
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [processDocuments, setProcessDocuments] = useState(false);

  // Check if embedding provider is configured
  const projectSettings = currentProject?.settings as unknown as ProjectSettings | undefined;
  const hasEmbeddingProvider = (projectSettings?.embedding_providers?.length || 0) > 0;

  // Sync selectedCollection when defaultCollection changes
  useEffect(() => {
    if (defaultCollection) {
      setSelectedCollection(defaultCollection);
    }
  }, [defaultCollection]);

  const uploadDocument = useUploadDocument(selectedCollection);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const newFiles = acceptedFiles.map((file) => ({
      file,
      name: getNameWithoutExtension(file.name),
      progress: 0,
      status: 'pending' as const,
    }));
    setFiles((prev) => [...prev, ...newFiles]);
  }, []);

  const updateFileName = (index: number, name: string) => {
    setFiles((prev) =>
      prev.map((f, idx) => (idx === index ? { ...f, name } : f))
    );
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'text/plain': ['.txt'],
      'text/markdown': ['.md'],
      'application/json': ['.json'],
    },
  });

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUpload = async () => {
    if (!selectedCollection || files.length === 0) return;

    setIsUploading(true);
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < files.length; i++) {
      if (files[i].status !== 'pending') continue;

      setFiles((prev) =>
        prev.map((f, idx) =>
          idx === i ? { ...f, status: 'uploading' as const } : f
        )
      );

      try {
        await uploadDocument.mutateAsync({
          file: files[i].file,
          name: files[i].name,
          process: processDocuments,
          onProgress: (progress) => {
            setFiles((prev) =>
              prev.map((f, idx) => (idx === i ? { ...f, progress } : f))
            );
          },
        });

        setFiles((prev) =>
          prev.map((f, idx) =>
            idx === i ? { ...f, status: 'success' as const, progress: 100 } : f
          )
        );
        successCount++;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Upload failed';
        setFiles((prev) =>
          prev.map((f, idx) =>
            idx === i ? { ...f, status: 'error' as const, error: message } : f
          )
        );
        errorCount++;
      }
    }

    setIsUploading(false);

    // Ensure queries are invalidated to trigger polling
    await queryClient.invalidateQueries({ queryKey: ['documents', selectedCollection] });
    await queryClient.invalidateQueries({ queryKey: ['documents'] });
    // Also invalidate collections to update vector counts after processing
    await queryClient.invalidateQueries({ queryKey: ['collections'] });

    if (errorCount === 0 && successCount > 0) {
      toast.success(
        processDocuments
          ? `${successCount} file(s) uploaded successfully. Processing...`
          : `${successCount} file(s) uploaded successfully.`
      );
      // Notify parent of the collection used for upload
      onUploadComplete?.(selectedCollection);
      setTimeout(() => {
        handleClose();
      }, 300);
    } else if (successCount > 0 && errorCount > 0) {
      toast.success(`${successCount} file(s) uploaded, ${errorCount} failed`);
      // Still notify parent even with partial success
      onUploadComplete?.(selectedCollection);
    } else if (errorCount > 0) {
      toast.error(`Failed to upload ${errorCount} file(s)`);
    }
  };

  const handleClose = () => {
    if (isUploading) return;
    setFiles([]);
    setSelectedCollection(defaultCollection || '');
    setProcessDocuments(false);
    onClose();
  };

  const collectionOptions = (collections || []).map((c) => ({
    value: c.name,
    label: c.name,
  }));

  const pendingFiles = files.filter((f) => f.status === 'pending');

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Upload Documents"
      description="Upload documents to a collection. Optionally process them for chunking and embedding."
      size="lg"
    >
      <div className="space-y-5">
        <Select
          label="Collection"
          options={collectionOptions}
          value={selectedCollection}
          onChange={(e) => setSelectedCollection(e.target.value)}
          placeholder="Select a collection"
        />

        {/* Process toggle */}
        <div className="flex items-center justify-between p-3 rounded-xl border border-border-light bg-surface-secondary/50">
          <div className="flex-1 mr-3">
            <p className="text-[14px] font-medium text-foreground">Process documents</p>
            <p className="text-[12px] text-text-secondary mt-0.5">
              Parse, chunk, and generate embeddings after upload
            </p>
          </div>
          <Switch
            checked={processDocuments}
            onCheckedChange={setProcessDocuments}
          />
        </div>

        {processDocuments && !hasEmbeddingProvider && (
          <div className="p-3 bg-warning/10 border border-warning/30 rounded-xl flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-warning flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-[13px] text-text-secondary">
                An embedding provider is required for processing.
              </p>
              <Link href="/settings/providers">
                <span className="text-[13px] text-primary hover:underline inline-flex items-center gap-1 mt-1">
                  <Settings className="w-3 h-3" />
                  Configure Provider
                </span>
              </Link>
            </div>
          </div>
        )}

        <div
          {...getRootProps()}
          className={cn(
            'border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all duration-200',
            isDragActive
              ? 'border-primary bg-primary-muted'
              : 'border-border-light hover:border-border hover:bg-surface-secondary'
          )}
        >
          <input {...getInputProps()} />
          <div className="w-14 h-14 mx-auto rounded-2xl bg-surface-secondary flex items-center justify-center mb-4">
            <Upload className="w-7 h-7 text-text-secondary" />
          </div>
          <p className="text-[15px] font-medium text-foreground">
            {isDragActive ? 'Drop files here' : 'Drag & drop files here'}
          </p>
          <p className="text-[13px] text-text-secondary mt-1.5">
            or click to browse (PDF, TXT, MD, JSON)
          </p>
        </div>

        {files.length > 0 && (
          <div className="space-y-3 max-h-64 overflow-y-auto">
            {files.map((uploadFile, index) => (
              <div
                key={index}
                className={cn(
                  'p-4 rounded-xl border transition-colors',
                  uploadFile.status === 'pending' && 'bg-surface-secondary border-border-light',
                  uploadFile.status === 'uploading' && 'bg-primary/5 border-primary/30',
                  uploadFile.status === 'success' && 'bg-success/10 border-success/30',
                  uploadFile.status === 'error' && 'bg-error/10 border-error/30'
                )}
              >
                <div className="flex items-center gap-3">
                  <div className={cn(
                    'w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0',
                    uploadFile.status === 'pending' && 'bg-surface-hover',
                    uploadFile.status === 'uploading' && 'bg-primary/10',
                    uploadFile.status === 'success' && 'bg-success/20',
                    uploadFile.status === 'error' && 'bg-error/20'
                  )}>
                    <FileText className={cn(
                      'w-5 h-5',
                      uploadFile.status === 'pending' && 'text-text-secondary',
                      uploadFile.status === 'uploading' && 'text-primary',
                      uploadFile.status === 'success' && 'text-success',
                      uploadFile.status === 'error' && 'text-error'
                    )} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] text-text-secondary truncate">
                      {uploadFile.file.name}
                    </p>
                    <p className="text-[12px] text-text-tertiary">
                      {formatFileSize(uploadFile.file.size)}
                    </p>
                  </div>
                  {uploadFile.status === 'pending' && (
                    <button
                      onClick={() => removeFile(index)}
                      className="p-1.5 text-text-secondary hover:text-foreground rounded-lg hover:bg-surface-hover transition-all duration-150"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                  {uploadFile.status === 'uploading' && (
                    <Loader2 className="w-5 h-5 text-primary animate-spin" />
                  )}
                  {uploadFile.status === 'success' && (
                    <CheckCircle className="w-5 h-5 text-success" />
                  )}
                  {uploadFile.status === 'error' && (
                    <AlertCircle className="w-5 h-5 text-error" />
                  )}
                </div>
                {uploadFile.status === 'pending' && (
                  <div className="mt-3">
                    <Input
                      label="Document Name"
                      value={uploadFile.name}
                      onChange={(e) => updateFileName(index, e.target.value)}
                      placeholder="Enter document name"
                      className="text-[14px]"
                    />
                  </div>
                )}
                {uploadFile.status === 'uploading' && (
                  <div className="mt-3 w-full bg-surface-hover rounded-full h-1.5">
                    <div
                      className="bg-primary h-1.5 rounded-full transition-all duration-300"
                      style={{ width: `${uploadFile.progress}%` }}
                    />
                  </div>
                )}
                {uploadFile.status === 'error' && (
                  <p className="text-[13px] text-error mt-2">{uploadFile.error}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <ModalFooter>
        <Button type="button" variant="secondary" onClick={handleClose} disabled={isUploading}>
          Cancel
        </Button>
        <Button
          onClick={handleUpload}
          disabled={!selectedCollection || pendingFiles.length === 0 || (processDocuments && !hasEmbeddingProvider)}
          isLoading={isUploading}
        >
          Upload {pendingFiles.length > 0 ? `(${pendingFiles.length})` : ''}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
