'use client';

import { Fragment } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Menu, MenuButton, MenuItem, MenuItems, Transition } from '@headlessui/react';
import { User, Settings, LogOut } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { cn, getInitials } from '@/lib/utils';

export function UserMenu() {
  const router = useRouter();
  const { user, logout } = useAuthStore();

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  if (!user) return null;

  return (
    <Menu as="div" className="relative">
      <MenuButton className="flex items-center gap-2.5 px-2 py-1.5 rounded-xl hover:bg-surface-hover transition-all duration-150">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-primary-hover flex items-center justify-center shadow-sm">
          {user.avatar_url ? (
            <img
              src={user.avatar_url}
              alt={user.name}
              className="w-8 h-8 rounded-full object-cover"
            />
          ) : (
            <span className="text-[13px] font-semibold text-white">
              {getInitials(user.name)}
            </span>
          )}
        </div>
        <span className="text-[15px] font-medium text-foreground hidden sm:block">{user.name.split(' ')[0]}</span>
      </MenuButton>

      <Transition
        as={Fragment}
        enter="transition ease-out duration-150"
        enterFrom="opacity-0 scale-95 -translate-y-1"
        enterTo="opacity-100 scale-100 translate-y-0"
        leave="transition ease-in duration-100"
        leaveFrom="opacity-100 scale-100 translate-y-0"
        leaveTo="opacity-0 scale-95 -translate-y-1"
      >
        <MenuItems className="absolute right-0 mt-2 w-60 bg-surface border border-border-light rounded-xl shadow-lg overflow-hidden z-50">
          <div className="px-4 py-3 border-b border-border-light bg-surface-secondary">
            <p className="text-[15px] font-medium text-foreground truncate">{user.name}</p>
            <p className="text-[13px] text-text-secondary truncate mt-0.5">{user.email}</p>
          </div>

          <div className="py-1.5">
            <MenuItem>
              {({ focus }) => (
                <Link
                  href="/settings/profile"
                  className={cn(
                    'flex items-center gap-3 px-4 py-2.5 text-[15px] text-foreground transition-colors',
                    focus ? 'bg-surface-hover' : ''
                  )}
                >
                  <User className="w-[18px] h-[18px] text-text-secondary" />
                  Profile
                </Link>
              )}
            </MenuItem>
            <MenuItem>
              {({ focus }) => (
                <Link
                  href="/settings"
                  className={cn(
                    'flex items-center gap-3 px-4 py-2.5 text-[15px] text-foreground transition-colors',
                    focus ? 'bg-surface-hover' : ''
                  )}
                >
                  <Settings className="w-[18px] h-[18px] text-text-secondary" />
                  Settings
                </Link>
              )}
            </MenuItem>
          </div>

          <div className="border-t border-border-light py-1.5">
            <MenuItem>
              {({ focus }) => (
                <button
                  onClick={handleLogout}
                  className={cn(
                    'w-full flex items-center gap-3 px-4 py-2.5 text-[15px] text-error transition-colors',
                    focus ? 'bg-error-muted' : ''
                  )}
                >
                  <LogOut className="w-[18px] h-[18px]" />
                  Sign out
                </button>
              )}
            </MenuItem>
          </div>
        </MenuItems>
      </Transition>
    </Menu>
  );
}
