'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { ChevronRight, Home, Menu } from 'lucide-react';
import { UserMenu } from './user-menu';
import { useProjectStore } from '@/stores/project-store';
import { useSidebarStore } from '@/stores/sidebar-store';

// Map of path segments to display names
const pathNames: Record<string, string> = {
  dashboard: 'Dashboard',
  collections: 'Collections',
  documents: 'Documents',
  search: 'Search',
  rag: 'RAG Chat',
  history: 'History',
  prompts: 'Prompts',
  webhooks: 'Webhooks',
  keys: 'API Keys',
  settings: 'Settings',
  profile: 'Profile',
  project: 'Project',
  members: 'Members',
  providers: 'AI Providers',
  tables: 'Tables',
  sql: 'SQL Editor',
  schema: 'Schema',
  playground: 'Playground',
  analytics: 'Analytics',
};

export function Header() {
  const pathname = usePathname();
  const { currentProject } = useProjectStore();
  const { setMobileOpen } = useSidebarStore();

  // Generate breadcrumb items from pathname
  const generateBreadcrumbs = () => {
    const segments = pathname.split('/').filter(Boolean);
    const breadcrumbs: { label: string; href: string; isLast: boolean }[] = [];

    let currentPath = '';

    segments.forEach((segment, index) => {
      currentPath += `/${segment}`;
      // Check if this is the last segment considering project name will be added
      const isLast = index === segments.length - 1;

      // Check if segment is a dynamic value (like a collection name or UUID)
      const isDynamicSegment = !pathNames[segment] && segment.length > 0;

      // Use the segment as label if it's dynamic, otherwise use the mapped name
      const label = isDynamicSegment
        ? decodeURIComponent(segment)
        : pathNames[segment] || segment;

      breadcrumbs.push({
        label,
        href: currentPath,
        isLast,
      });
    });

    return breadcrumbs;
  };

  const breadcrumbs = generateBreadcrumbs();
  const hasMultipleBreadcrumbs = breadcrumbs.length > 0;

  return (
    <header className="h-[60px] border-b border-border-light bg-surface flex items-center justify-between px-4 md:px-8">
      <nav className="flex items-center min-w-0 flex-1">
        {/* Mobile menu button */}
        <button
          onClick={() => setMobileOpen(true)}
          className="lg:hidden p-2 -ml-2 mr-2 text-text-secondary hover:text-foreground rounded-lg hover:bg-surface-hover"
        >
          <Menu className="w-5 h-5" />
        </button>

        <Link
          href="/dashboard"
          className="text-text-secondary hover:text-foreground transition-colors flex-shrink-0"
        >
          <Home className="w-4 h-4" />
        </Link>

        {/* Project Name - always shown after home if project exists */}
        {currentProject && (
          <div className="flex items-center min-w-0">
            <ChevronRight className="w-4 h-4 mx-2 text-text-tertiary flex-shrink-0" />
            {hasMultipleBreadcrumbs ? (
              <Link
                href="/dashboard"
                className="text-[15px] text-text-secondary hover:text-foreground transition-colors truncate"
              >
                {currentProject.name}
              </Link>
            ) : (
              <span className="text-[15px] font-medium text-foreground truncate">
                {currentProject.name}
              </span>
            )}
          </div>
        )}

        {/* Page breadcrumbs - hide some on mobile */}
        {breadcrumbs.map((crumb, index) => (
          <div key={crumb.href} className={`flex items-center min-w-0 ${index > 0 ? 'hidden sm:flex' : ''}`}>
            <ChevronRight className="w-4 h-4 mx-2 text-text-tertiary flex-shrink-0" />
            {crumb.isLast ? (
              <span className="text-[15px] font-medium text-foreground truncate">
                {crumb.label}
              </span>
            ) : (
              <Link
                href={crumb.href}
                className="text-[15px] text-text-secondary hover:text-foreground transition-colors truncate"
              >
                {crumb.label}
              </Link>
            )}
          </div>
        ))}
      </nav>
      <div className="flex items-center gap-2 flex-shrink-0 ml-2">
        <UserMenu />
      </div>
    </header>
  );
}
