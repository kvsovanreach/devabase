'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
import { useProjectStore } from '@/stores/project-store';
import api from '@/lib/api';
import { FolderKanban, Users, UserPlus, Trash2, Mail } from 'lucide-react';
import { getInitials, formatRelativeTime } from '@/lib/utils';
import toast from 'react-hot-toast';
import { CreateInvitationRequest, ProjectRole } from '@/types';

const roleOptions = [
  { value: 'admin', label: 'Admin' },
  { value: 'member', label: 'Member' },
  { value: 'viewer', label: 'Viewer' },
];

const roleBadgeVariants: Record<string, 'primary' | 'success' | 'warning' | 'default'> = {
  owner: 'primary',
  admin: 'success',
  member: 'warning',
  viewer: 'default',
};

interface RemoveTarget {
  type: 'member' | 'invitation';
  id: string;
  name: string;
}

export default function MembersSettingsPage() {
  const queryClient = useQueryClient();
  const { currentProject } = useProjectStore();
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<ProjectRole>('member');
  const [removeTarget, setRemoveTarget] = useState<RemoveTarget | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);

  const { data: members, isLoading: membersLoading } = useQuery({
    queryKey: ['members', currentProject?.id],
    queryFn: () => api.listMembers(currentProject!.id),
    enabled: !!currentProject,
  });

  const { data: invitations, isLoading: invitationsLoading } = useQuery({
    queryKey: ['invitations', currentProject?.id],
    queryFn: () => api.listInvitations(currentProject!.id),
    enabled: !!currentProject,
  });

  const createInvitation = useMutation({
    mutationFn: (data: CreateInvitationRequest) =>
      api.createInvitation(currentProject!.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invitations', currentProject?.id] });
    },
  });

  const revokeInvitation = useMutation({
    mutationFn: (invitationId: string) =>
      api.revokeInvitation(currentProject!.id, invitationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invitations', currentProject?.id] });
    },
  });

  const removeMember = useMutation({
    mutationFn: (userId: string) => api.removeMember(currentProject!.id, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['members', currentProject?.id] });
    },
  });

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;

    try {
      await createInvitation.mutateAsync({
        email: inviteEmail.trim(),
        role: inviteRole,
      });
      toast.success('Invitation sent');
      setIsInviteModalOpen(false);
      setInviteEmail('');
      setInviteRole('member');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to send invitation';
      toast.error(message);
    }
  };

  const handleRemove = async () => {
    if (!removeTarget) return;

    setIsRemoving(true);
    try {
      if (removeTarget.type === 'member') {
        await removeMember.mutateAsync(removeTarget.id);
        toast.success('Member removed');
      } else {
        await revokeInvitation.mutateAsync(removeTarget.id);
        toast.success('Invitation revoked');
      }
      setRemoveTarget(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : `Failed to ${removeTarget.type === 'member' ? 'remove member' : 'revoke invitation'}`;
      toast.error(message);
    } finally {
      setIsRemoving(false);
    }
  };

  if (!currentProject) {
    return (
      <div>
        <Header />
        <div className="p-4 md:p-8">
          <EmptyState
            icon={<FolderKanban className="w-8 h-8" />}
            title="No project selected"
            description="Select a project to manage its members."
          />
        </div>
      </div>
    );
  }

  const isLoading = membersLoading || invitationsLoading;
  const pendingInvitations = (invitations || []).filter((i) => i.status === 'pending');

  return (
    <div>
      <Header />
      <div className="p-4 md:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-[22px] md:text-[26px] font-semibold text-foreground tracking-tight">Team Members</h2>
            <p className="text-[14px] md:text-[15px] text-text-secondary mt-1">
              Manage project members and invitations.
            </p>
          </div>
          <Button onClick={() => setIsInviteModalOpen(true)} className="w-full sm:w-auto">
            <UserPlus className="w-4 h-4 mr-2" />
            Invite
          </Button>
        </div>

        {isLoading ? (
          <PageSpinner />
        ) : (
          <>
            <Card>
              <CardHeader>
                <CardTitle>Members ({members?.length || 0})</CardTitle>
                <CardDescription>People with access to this project</CardDescription>
              </CardHeader>
              <CardContent>
                {members && members.length > 0 ? (
                  <div className="space-y-3">
                    {members.map((member) => (
                      <div
                        key={member.id}
                        className="flex flex-col sm:flex-row sm:items-center justify-between p-3 md:p-4 bg-surface-secondary rounded-xl gap-3"
                      >
                        <div className="flex items-center gap-3 md:gap-4">
                          <div className="w-10 h-10 md:w-11 md:h-11 rounded-full bg-gradient-to-br from-primary to-primary-hover flex items-center justify-center shadow-sm flex-shrink-0">
                            <span className="text-[12px] md:text-[13px] font-semibold text-white">
                              {getInitials(member.user?.name || 'User')}
                            </span>
                          </div>
                          <div className="min-w-0">
                            <p className="text-[14px] md:text-[15px] font-medium text-foreground truncate">
                              {member.user?.name || 'Unknown'}
                            </p>
                            <p className="text-[12px] md:text-[13px] text-text-secondary truncate">
                              {member.user?.email || member.user_id}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 self-end sm:self-auto">
                          <Badge variant={roleBadgeVariants[member.role] || 'default'}>
                            {member.role}
                          </Badge>
                          {member.role !== 'owner' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setRemoveTarget({
                                type: 'member',
                                id: member.user_id,
                                name: member.user?.name || member.user?.email || 'this member',
                              })}
                              className="text-error hover:text-error hover:bg-error/5"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    icon={<Users className="w-8 h-8" />}
                    title="No members"
                    description="Invite team members to collaborate on this project."
                  />
                )}
              </CardContent>
            </Card>

            {pendingInvitations.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Pending Invitations ({pendingInvitations.length})</CardTitle>
                  <CardDescription>Invitations waiting to be accepted</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {pendingInvitations.map((invitation) => (
                      <div
                        key={invitation.id}
                        className="flex flex-col sm:flex-row sm:items-center justify-between p-3 md:p-4 bg-surface-secondary rounded-xl gap-3"
                      >
                        <div className="flex items-center gap-3 md:gap-4">
                          <div className="w-10 h-10 md:w-11 md:h-11 rounded-full bg-surface-hover flex items-center justify-center flex-shrink-0">
                            <Mail className="w-5 h-5 text-text-secondary" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-[14px] md:text-[15px] font-medium text-foreground truncate">{invitation.email}</p>
                            <p className="text-[12px] md:text-[13px] text-text-secondary">
                              Invited {formatRelativeTime(invitation.created_at)}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 self-end sm:self-auto">
                          <Badge variant={roleBadgeVariants[invitation.role] || 'default'}>
                            {invitation.role}
                          </Badge>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setRemoveTarget({
                              type: 'invitation',
                              id: invitation.id,
                              name: invitation.email,
                            })}
                            className="text-error hover:text-error hover:bg-error/5"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>

      <Modal
        isOpen={isInviteModalOpen}
        onClose={() => setIsInviteModalOpen(false)}
        title="Invite Team Member"
        description="Send an invitation to join this project."
      >
        <form onSubmit={handleInvite}>
          <div className="space-y-5">
            <Input
              label="Email Address"
              type="email"
              placeholder="colleague@example.com"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              required
            />
            <Select
              label="Role"
              options={roleOptions}
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as ProjectRole)}
            />
          </div>
          <ModalFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setIsInviteModalOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" isLoading={createInvitation.isPending}>
              Send Invitation
            </Button>
          </ModalFooter>
        </form>
      </Modal>

      <ConfirmModal
        isOpen={!!removeTarget}
        onClose={() => setRemoveTarget(null)}
        onConfirm={handleRemove}
        title={removeTarget?.type === 'member' ? 'Remove Member' : 'Revoke Invitation'}
        description={removeTarget?.type === 'member'
          ? `Are you sure you want to remove ${removeTarget?.name} from this project?`
          : `Are you sure you want to revoke the invitation for ${removeTarget?.name}?`
        }
        confirmText={removeTarget?.type === 'member' ? 'Remove' : 'Revoke'}
        variant="danger"
        isLoading={isRemoving}
      />
    </div>
  );
}
