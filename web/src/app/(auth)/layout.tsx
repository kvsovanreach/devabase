'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Database } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { isAuthenticated } = useAuthStore();

  useEffect(() => {
    if (isAuthenticated) {
      router.push('/dashboard');
    }
  }, [isAuthenticated, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-[400px]">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary shadow-lg shadow-primary/30 mb-5">
            <Database className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-[28px] font-semibold text-foreground tracking-tight">Devabase</h1>
          <p className="text-[15px] text-text-secondary mt-2">Vector Database & RAG Platform</p>
        </div>
        <div className="bg-surface border border-border-light rounded-2xl p-8 shadow-[0_4px_24px_-4px_rgba(0,0,0,0.3)]">
          {children}
        </div>
      </div>
    </div>
  );
}
