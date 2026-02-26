'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard,
  FolderOpen,
  FileText,
  Search,
  Sparkles,
  Key,
  Settings,
  Database,
  PanelLeftClose,
  PanelLeft,
  Webhook,
  Table2,
  X,
  GitBranch,
  SquareTerminal,
  Box,
  Server,
  Play,
  MessageSquare,
  Code2,
  BarChart3,
  BookOpen,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ProjectSwitcher } from './project-switcher';
import { useSidebarStore } from '@/stores/sidebar-store';

interface NavItem {
  name: string;
  href: string;
  icon: LucideIcon;
}

interface NavGroup {
  label: string;
  icon?: LucideIcon;
  items: NavItem[];
}

const navigation: (NavItem | NavGroup)[] = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  {
    label: 'Vector DB',
    icon: Box,
    items: [
      { name: 'Collections', href: '/collections', icon: FolderOpen },
      { name: 'Documents', href: '/documents', icon: FileText },
      { name: 'Search', href: '/search', icon: Search },
    ],
  },
  {
    label: 'Relational DB',
    icon: Server,
    items: [
      { name: 'Tables', href: '/tables', icon: Table2 },
      { name: 'SQL Editor', href: '/sql', icon: SquareTerminal },
      { name: 'Schema', href: '/schema', icon: GitBranch },
    ],
  },
  {
    label: 'AI',
    icon: Sparkles,
    items: [
      { name: 'RAG Chat', href: '/rag', icon: MessageSquare },
      { name: 'Prompts', href: '/prompts', icon: Sparkles },
    ],
  },
  {
    label: 'Developer',
    icon: Code2,
    items: [
      { name: 'API Docs', href: '/api-docs', icon: BookOpen },
      { name: 'Playground', href: '/playground', icon: Play },
      { name: 'Analytics', href: '/analytics', icon: BarChart3 },
      { name: 'API Keys', href: '/keys', icon: Key },
      { name: 'Webhooks', href: '/webhooks', icon: Webhook },
    ],
  },
];

const bottomNavigation: NavItem[] = [
  { name: 'Settings', href: '/settings', icon: Settings },
];

function isNavGroup(item: NavItem | NavGroup): item is NavGroup {
  return 'items' in item;
}

export function Sidebar() {
  const pathname = usePathname();
  const { isCollapsed, isMobileOpen, toggleSidebar, setMobileOpen } = useSidebarStore();

  // Close mobile menu on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname, setMobileOpen]);

  // Close mobile menu on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileOpen(false);
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [setMobileOpen]);

  return (
    <>
      {/* Mobile Overlay */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed left-0 top-0 h-screen bg-surface border-r border-border-light flex flex-col z-50 transition-all duration-300 ease-in-out',
          // Desktop: normal sidebar
          'lg:translate-x-0',
          isCollapsed ? 'lg:w-[72px]' : 'lg:w-[260px]',
          // Mobile: drawer
          'w-[280px]',
          isMobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
      >
        {/* Logo */}
        <div
          className={cn(
            'h-[60px] flex items-center border-b border-border-light',
            isCollapsed ? 'lg:justify-center lg:px-0' : '',
            'px-5'
          )}
        >
          <Link
            href="/dashboard"
            className="flex items-center gap-2.5 overflow-hidden flex-1"
          >
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center flex-shrink-0">
              <Database className="w-[18px] h-[18px] text-white" />
            </div>
            <span
              className={cn(
                'text-[17px] font-semibold text-foreground tracking-tight whitespace-nowrap',
                isCollapsed && 'lg:hidden'
              )}
            >
              Devabase
            </span>
          </Link>
          {/* Mobile close button */}
          <button
            onClick={() => setMobileOpen(false)}
            className="lg:hidden p-2 -mr-2 text-text-secondary hover:text-foreground"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Project Switcher */}
        <div className={cn('p-4 border-b border-border-light', isCollapsed && 'lg:hidden')}>
          <ProjectSwitcher />
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-2 px-3">
          <ul className="space-y-0.5">
            {navigation.map((item, index) => {
              if (isNavGroup(item)) {
                // Render group
                const GroupIcon = item.icon;
                return (
                  <li key={item.label} className={cn(index > 0 && 'mt-3')}>
                    {/* Group Label */}
                    <div
                      className={cn(
                        'flex items-center gap-2 px-3 py-1.5 text-[11px] font-semibold text-text-tertiary uppercase tracking-wider',
                        isCollapsed && 'lg:justify-center lg:px-0'
                      )}
                    >
                      {GroupIcon && (
                        <GroupIcon className="w-3.5 h-3.5 flex-shrink-0" />
                      )}
                      <span className={cn(isCollapsed && 'lg:hidden')}>{item.label}</span>
                    </div>
                    {/* Group Items */}
                    <ul className="mt-1 space-y-0.5">
                      {item.items.map((subItem) => {
                        const isActive = pathname === subItem.href || pathname.startsWith(subItem.href + '/');
                        return (
                          <li key={subItem.name}>
                            <Link
                              href={subItem.href}
                              title={isCollapsed ? subItem.name : undefined}
                              className={cn(
                                'flex items-center gap-3 px-3 py-1.5 rounded-lg text-[14px] font-medium transition-all duration-150',
                                isActive
                                  ? 'bg-primary text-white shadow-sm'
                                  : 'text-text-secondary hover:text-foreground hover:bg-surface-hover',
                                isCollapsed && 'lg:justify-center lg:px-0'
                              )}
                            >
                              <subItem.icon className={cn('w-[17px] h-[17px] flex-shrink-0', isActive ? 'text-white' : '')} />
                              <span className={cn(isCollapsed && 'lg:hidden')}>{subItem.name}</span>
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  </li>
                );
              }

              // Render single item
              const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
              return (
                <li key={item.name} className={cn(index > 0 && navigation[index - 1] && isNavGroup(navigation[index - 1]) && 'mt-4')}>
                  <Link
                    href={item.href}
                    title={isCollapsed ? item.name : undefined}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2 rounded-lg text-[15px] font-medium transition-all duration-150',
                      isActive
                        ? 'bg-primary text-white shadow-sm'
                        : 'text-text-secondary hover:text-foreground hover:bg-surface-hover',
                      isCollapsed && 'lg:justify-center lg:px-0'
                    )}
                  >
                    <item.icon className={cn('w-[18px] h-[18px] flex-shrink-0', isActive ? 'text-white' : '')} />
                    <span className={cn(isCollapsed && 'lg:hidden')}>{item.name}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Bottom Navigation */}
        <div className="p-3 border-t border-border-light">
          <ul className="space-y-0.5">
            {bottomNavigation.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
              return (
                <li key={item.name}>
                  <Link
                    href={item.href}
                    title={isCollapsed ? item.name : undefined}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2 rounded-lg text-[15px] font-medium transition-all duration-150',
                      isActive
                        ? 'bg-primary text-white shadow-sm'
                        : 'text-text-secondary hover:text-foreground hover:bg-surface-hover',
                      isCollapsed && 'lg:justify-center lg:px-0'
                    )}
                  >
                    <item.icon className={cn('w-[18px] h-[18px] flex-shrink-0', isActive ? 'text-white' : '')} />
                    <span className={cn(isCollapsed && 'lg:hidden')}>{item.name}</span>
                  </Link>
                </li>
              );
            })}
          </ul>

          {/* Collapse Toggle - Desktop only */}
          <button
            onClick={toggleSidebar}
            title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className={cn(
              'hidden lg:flex w-full items-center gap-3 px-3 py-2 mt-1 rounded-lg text-[15px] font-medium transition-all duration-150',
              'text-text-secondary hover:text-foreground hover:bg-surface-hover',
              isCollapsed && 'lg:justify-center lg:px-0'
            )}
          >
            {isCollapsed ? (
              <PanelLeft className="w-[18px] h-[18px] flex-shrink-0" />
            ) : (
              <>
                <PanelLeftClose className="w-[18px] h-[18px] flex-shrink-0" />
                <span>Collapse</span>
              </>
            )}
          </button>
        </div>
      </aside>
    </>
  );
}
