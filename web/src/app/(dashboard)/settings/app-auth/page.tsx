'use client';

import { useState } from 'react';
import { useAppUsers, useUpdateAppUser, useDeleteAppUser } from '@/hooks/use-app-users';
import { useProjectStore } from '@/stores/project-store';
import { Header } from '@/components/layout/header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Modal, ModalFooter } from '@/components/ui/modal';
import { ConfirmModal } from '@/components/ui/confirm-modal';
import { EmptyState } from '@/components/ui/empty-state';
import { PageSpinner } from '@/components/ui/spinner';
import {
  FolderKanban,
  Users,
  UserCheck,
  UserX,
  Clock,
  Trash2,
  Eye,
  Search,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  Mail,
  MailCheck,
  Pencil,
} from 'lucide-react';
import { formatRelativeTime, getInitials, cn } from '@/lib/utils';
import toast from 'react-hot-toast';
import { AppUser, AppUserStatus } from '@/types';

const statusBadgeVariants: Record<string, 'success' | 'warning' | 'error' | 'default'> = {
  active: 'success',
  pending: 'warning',
  suspended: 'error',
  deleted: 'default',
};

const statusOptions = [
  { value: 'active', label: 'Active' },
  { value: 'pending', label: 'Pending' },
  { value: 'suspended', label: 'Suspended' },
];

const PAGE_SIZE = 20;

export default function AppAuthSettingsPage() {
  const { currentProject } = useProjectStore();
  const [page, setPage] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const { data: usersResponse, isLoading } = useAppUsers({
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  });
  const updateAppUser = useUpdateAppUser();
  const deleteAppUser = useDeleteAppUser();

  const [viewUser, setViewUser] = useState<AppUser | null>(null);
  const [editUser, setEditUser] = useState<AppUser | null>(null);
  const [editStatus, setEditStatus] = useState<AppUserStatus>('active');
  const [editName, setEditName] = useState('');
  const [editEmailVerified, setEditEmailVerified] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; email: string } | null>(null);

  if (!currentProject) {
    return (
      <div>
        <Header />
        <div className="p-4 md:p-8">
          <EmptyState
            icon={<FolderKanban className="w-8 h-8" />}
            title="No project selected"
            description="Select a project to manage application users."
          />
        </div>
      </div>
    );
  }

  const users = usersResponse?.data || [];
  const pagination = usersResponse?.pagination;
  const totalUsers = pagination?.total || 0;
  const totalPages = pagination?.total_pages || 1;

  const filteredUsers = searchQuery
    ? users.filter(
        (u) =>
          u.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (u.name && u.name.toLowerCase().includes(searchQuery.toLowerCase()))
      )
    : users;

  const activeCount = users.filter((u) => u.status === 'active').length;
  const pendingCount = users.filter((u) => u.status === 'pending').length;
  const suspendedCount = users.filter((u) => u.status === 'suspended').length;

  const handleOpenEdit = (user: AppUser) => {
    setEditUser(user);
    setEditStatus(user.status);
    setEditName(user.name || '');
    setEditEmailVerified(user.email_verified);
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editUser) return;

    try {
      await updateAppUser.mutateAsync({
        id: editUser.id,
        data: {
          status: editStatus,
          name: editName || undefined,
          email_verified: editEmailVerified,
        },
      });
      toast.success('User updated');
      setEditUser(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update user';
      toast.error(message);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;

    try {
      await deleteAppUser.mutateAsync(deleteTarget.id);
      toast.success('User deleted');
      setDeleteTarget(null);
      setViewUser(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete user';
      toast.error(message);
    }
  };

  return (
    <div>
      <Header />
      <div className="p-4 md:p-8">
        {/* Page Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="text-[22px] md:text-[26px] font-semibold text-foreground tracking-tight">
              App Users
            </h2>
            <p className="text-[14px] md:text-[15px] text-text-secondary mt-1">
              Manage end-users registered through your application&apos;s authentication.
            </p>
          </div>
        </div>

        {isLoading ? (
          <PageSpinner />
        ) : users.length > 0 || page > 0 ? (
          <>
            {/* Stats Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-surface border border-border-light rounded-xl p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Users className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-[12px] text-text-secondary uppercase tracking-wider font-medium">
                      Total Users
                    </p>
                    <p className="text-[22px] font-bold text-foreground">{totalUsers}</p>
                  </div>
                </div>
              </div>
              <div className="bg-surface border border-border-light rounded-xl p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-success/10 flex items-center justify-center">
                    <UserCheck className="w-5 h-5 text-success" />
                  </div>
                  <div>
                    <p className="text-[12px] text-text-secondary uppercase tracking-wider font-medium">
                      Active
                    </p>
                    <p className="text-[22px] font-bold text-foreground">{activeCount}</p>
                  </div>
                </div>
              </div>
              <div className="bg-surface border border-border-light rounded-xl p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-warning/10 flex items-center justify-center">
                    <Clock className="w-5 h-5 text-warning" />
                  </div>
                  <div>
                    <p className="text-[12px] text-text-secondary uppercase tracking-wider font-medium">
                      Pending
                    </p>
                    <p className="text-[22px] font-bold text-foreground">{pendingCount}</p>
                  </div>
                </div>
              </div>
              <div className="bg-surface border border-border-light rounded-xl p-4">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "w-10 h-10 rounded-lg flex items-center justify-center",
                    suspendedCount > 0 ? "bg-error/10" : "bg-surface-secondary"
                  )}>
                    <UserX className={cn(
                      "w-5 h-5",
                      suspendedCount > 0 ? "text-error" : "text-text-tertiary"
                    )} />
                  </div>
                  <div>
                    <p className="text-[12px] text-text-secondary uppercase tracking-wider font-medium">
                      Suspended
                    </p>
                    <p className="text-[22px] font-bold text-foreground">{suspendedCount}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Search */}
            <div className="mb-4">
              <div className="relative max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary" />
                <input
                  type="text"
                  placeholder="Search by email or name..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-surface border border-border-light rounded-xl text-[14px] text-foreground placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30 transition-all"
                />
              </div>
            </div>

            {/* Users Table */}
            <div className="bg-surface border border-border-light rounded-xl overflow-hidden">
              {/* Table Header */}
              <div className="hidden md:grid md:grid-cols-[2fr_1fr_1fr_1fr_auto] gap-4 px-5 py-3 bg-surface-secondary border-b border-border-light">
                <div className="text-[11px] font-semibold text-text-tertiary uppercase tracking-wider">
                  User
                </div>
                <div className="text-[11px] font-semibold text-text-tertiary uppercase tracking-wider">
                  Status
                </div>
                <div className="text-[11px] font-semibold text-text-tertiary uppercase tracking-wider">
                  Email Verified
                </div>
                <div className="text-[11px] font-semibold text-text-tertiary uppercase tracking-wider">
                  Registered
                </div>
                <div className="w-24"></div>
              </div>

              {/* Table Rows */}
              <div className="divide-y divide-border-light">
                {filteredUsers.map((user) => (
                  <div
                    key={user.id}
                    className="grid grid-cols-1 md:grid-cols-[2fr_1fr_1fr_1fr_auto] gap-2 md:gap-4 px-5 py-4 hover:bg-surface-hover/50 transition-colors"
                  >
                    {/* User */}
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary to-primary-hover flex items-center justify-center flex-shrink-0">
                        <span className="text-[11px] font-semibold text-white">
                          {getInitials(user.name || user.email)}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-[14px] font-medium text-foreground truncate">
                          {user.name || 'No name'}
                        </p>
                        <p className="text-[12px] text-text-tertiary truncate">
                          {user.email}
                        </p>
                      </div>
                    </div>

                    {/* Status */}
                    <div className="flex items-center">
                      <Badge variant={statusBadgeVariants[user.status] || 'default'}>
                        {user.status}
                      </Badge>
                    </div>

                    {/* Email Verified */}
                    <div className="hidden md:flex items-center">
                      {user.email_verified ? (
                        <span className="flex items-center gap-1.5 text-[13px] text-success">
                          <MailCheck className="w-4 h-4" />
                          Verified
                        </span>
                      ) : (
                        <span className="flex items-center gap-1.5 text-[13px] text-text-tertiary">
                          <Mail className="w-4 h-4" />
                          Unverified
                        </span>
                      )}
                    </div>

                    {/* Registered */}
                    <div className="hidden md:flex items-center">
                      <span className="text-[13px] text-text-secondary">
                        {formatRelativeTime(user.created_at)}
                      </span>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => setViewUser(user)}
                        className="p-2 rounded-lg text-text-secondary hover:text-primary hover:bg-primary/5 transition-colors"
                        title="View details"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleOpenEdit(user)}
                        className="p-2 rounded-lg text-text-secondary hover:text-info hover:bg-info/5 transition-colors"
                        title="Edit user"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setDeleteTarget({ id: user.id, email: user.email })}
                        className="p-2 rounded-lg text-text-secondary hover:text-error hover:bg-error/5 transition-colors"
                        title="Delete user"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Mobile: Additional Info */}
                    <div className="md:hidden flex items-center gap-4 text-[12px] text-text-tertiary mt-1">
                      <Badge variant={statusBadgeVariants[user.status] || 'default'} className="text-[11px]">
                        {user.status}
                      </Badge>
                      <span>{user.email_verified ? 'Verified' : 'Unverified'}</span>
                      <span>Registered {formatRelativeTime(user.created_at)}</span>
                    </div>
                  </div>
                ))}
              </div>

              {filteredUsers.length === 0 && searchQuery && (
                <div className="px-5 py-8 text-center">
                  <p className="text-[14px] text-text-secondary">No users matching &quot;{searchQuery}&quot;</p>
                </div>
              )}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4">
                <p className="text-[13px] text-text-secondary">
                  Showing {page * PAGE_SIZE + 1}-{Math.min((page + 1) * PAGE_SIZE, totalUsers)} of {totalUsers} users
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={page === 0}
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <span className="text-[13px] text-text-secondary px-2">
                    Page {page + 1} of {totalPages}
                  </span>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setPage((p) => p + 1)}
                    disabled={!pagination?.has_next}
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}

            {/* Usage Hint */}
            <div className="mt-6 p-4 bg-surface-secondary/50 border border-border-light rounded-xl">
              <p className="text-[13px] text-text-secondary">
                <span className="font-medium text-foreground">App Authentication: </span>
                These are end-users registered via your app&apos;s{' '}
                <code className="px-1.5 py-0.5 bg-surface rounded text-primary text-[12px]">POST /v1/auth/app/register</code>{' '}
                and{' '}
                <code className="px-1.5 py-0.5 bg-surface rounded text-primary text-[12px]">POST /v1/auth/app/login</code>{' '}
                endpoints. Use the SDK or API to integrate authentication into your application.
              </p>
            </div>
          </>
        ) : (
          <EmptyState
            icon={<ShieldCheck className="w-8 h-8" />}
            title="No app users yet"
            description="Users will appear here when they register through your application's auth endpoints."
          />
        )}
      </div>

      {/* View User Modal */}
      <Modal
        isOpen={!!viewUser}
        onClose={() => setViewUser(null)}
        title="User Details"
        description={viewUser?.email || ''}
      >
        {viewUser && (
          <div className="space-y-5">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-gradient-to-br from-primary to-primary-hover flex items-center justify-center flex-shrink-0">
                <span className="text-[18px] font-semibold text-white">
                  {getInitials(viewUser.name || viewUser.email)}
                </span>
              </div>
              <div>
                <p className="text-[16px] font-medium text-foreground">
                  {viewUser.name || 'No name'}
                </p>
                <p className="text-[14px] text-text-secondary">{viewUser.email}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 bg-surface-secondary rounded-xl">
                <p className="text-[11px] text-text-tertiary uppercase tracking-wider font-medium mb-1">Status</p>
                <Badge variant={statusBadgeVariants[viewUser.status] || 'default'}>
                  {viewUser.status}
                </Badge>
              </div>
              <div className="p-3 bg-surface-secondary rounded-xl">
                <p className="text-[11px] text-text-tertiary uppercase tracking-wider font-medium mb-1">Email</p>
                <span className={cn(
                  "text-[13px] font-medium",
                  viewUser.email_verified ? "text-success" : "text-text-tertiary"
                )}>
                  {viewUser.email_verified ? 'Verified' : 'Unverified'}
                </span>
              </div>
              <div className="p-3 bg-surface-secondary rounded-xl">
                <p className="text-[11px] text-text-tertiary uppercase tracking-wider font-medium mb-1">Registered</p>
                <span className="text-[13px] text-foreground">{formatRelativeTime(viewUser.created_at)}</span>
              </div>
              <div className="p-3 bg-surface-secondary rounded-xl">
                <p className="text-[11px] text-text-tertiary uppercase tracking-wider font-medium mb-1">Phone</p>
                <span className="text-[13px] text-foreground">{viewUser.phone || 'Not set'}</span>
              </div>
            </div>

            {viewUser.metadata && Object.keys(viewUser.metadata).length > 0 && (
              <div className="p-3 bg-surface-secondary rounded-xl">
                <p className="text-[11px] text-text-tertiary uppercase tracking-wider font-medium mb-2">Metadata</p>
                <pre className="text-[12px] text-text-secondary font-mono overflow-x-auto whitespace-pre-wrap">
                  {JSON.stringify(viewUser.metadata, null, 2)}
                </pre>
              </div>
            )}

            <div className="p-3 bg-surface-secondary rounded-xl">
              <p className="text-[11px] text-text-tertiary uppercase tracking-wider font-medium mb-1">User ID</p>
              <code className="text-[12px] text-text-secondary font-mono">{viewUser.id}</code>
            </div>

            <ModalFooter>
              <Button
                variant="danger"
                onClick={() => {
                  setDeleteTarget({ id: viewUser.id, email: viewUser.email });
                }}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete User
              </Button>
              <Button
                onClick={() => {
                  handleOpenEdit(viewUser);
                  setViewUser(null);
                }}
              >
                <Pencil className="w-4 h-4 mr-2" />
                Edit User
              </Button>
            </ModalFooter>
          </div>
        )}
      </Modal>

      {/* Edit User Modal */}
      <Modal
        isOpen={!!editUser}
        onClose={() => setEditUser(null)}
        title="Edit User"
        description={editUser?.email || ''}
      >
        {editUser && (
          <form onSubmit={handleUpdate}>
            <div className="space-y-5">
              <Input
                label="Name"
                placeholder="User name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
              />
              <Select
                label="Status"
                options={statusOptions}
                value={editStatus}
                onChange={(e) => setEditStatus(e.target.value as AppUserStatus)}
              />
              <div className="flex items-center justify-between p-3 bg-surface-secondary rounded-xl">
                <div>
                  <p className="text-[14px] font-medium text-foreground">Email Verified</p>
                  <p className="text-[12px] text-text-secondary mt-0.5">
                    Manually verify this user&apos;s email address
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={editEmailVerified}
                  onClick={() => setEditEmailVerified(!editEmailVerified)}
                  className={cn(
                    'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent',
                    'transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary/20',
                    editEmailVerified ? 'bg-primary' : 'bg-surface-hover'
                  )}
                >
                  <span
                    className={cn(
                      'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm',
                      'ring-0 transition duration-200 ease-in-out',
                      editEmailVerified ? 'translate-x-5' : 'translate-x-0'
                    )}
                  />
                </button>
              </div>
            </div>
            <ModalFooter>
              <Button type="button" variant="secondary" onClick={() => setEditUser(null)}>
                Cancel
              </Button>
              <Button type="submit" isLoading={updateAppUser.isPending}>
                Save Changes
              </Button>
            </ModalFooter>
          </form>
        )}
      </Modal>

      {/* Delete Confirmation */}
      <ConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete User"
        description={`Are you sure you want to delete ${deleteTarget?.email}? This will revoke all their sessions and soft-delete the account. This action cannot be undone.`}
        confirmText="Delete"
        variant="danger"
        isLoading={deleteAppUser.isPending}
      />
    </div>
  );
}
