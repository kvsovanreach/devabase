'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';
import { useProjectStore } from '@/stores/project-store';
import { useSidebarStore } from '@/stores/sidebar-store';
import { Sidebar } from '@/components/layout/sidebar';
import { PageSpinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { isAuthenticated, fetchUser } = useAuthStore();
  const { fetchProjects } = useProjectStore();
  const { isCollapsed } = useSidebarStore();
  const [isLoading, setIsLoading] = useState(true);
  const [isHydrated, setIsHydrated] = useState(false);

  // Wait for Zustand store hydration
  useEffect(() => {
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    // Don't check auth until hydrated
    if (!isHydrated) return;

    const init = async () => {
      if (!isAuthenticated) {
        router.push('/login');
        return;
      }

      try {
        await Promise.all([fetchUser(), fetchProjects()]);
      } catch {
        // Error handled in stores
      }
      setIsLoading(false);
    };

    init();
  }, [isHydrated, isAuthenticated, fetchUser, fetchProjects, router]);

  // Show loading while hydrating or loading data
  if (!isHydrated || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background-secondary">
        <PageSpinner />
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background-secondary">
      <Sidebar />
      <main
        className={cn(
          'transition-all duration-300 ease-in-out min-h-screen',
          // Desktop: add padding for sidebar
          'lg:pl-[260px]',
          isCollapsed && 'lg:pl-[72px]',
          // Mobile: no padding (sidebar is overlay)
          'pl-0'
        )}
      >
        {children}
      </main>
    </div>
  );
}
