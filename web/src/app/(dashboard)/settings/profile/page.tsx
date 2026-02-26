'use client';

import { useState } from 'react';
import { Header } from '@/components/layout/header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuthStore } from '@/stores/auth-store';
import { getInitials } from '@/lib/utils';
import toast from 'react-hot-toast';

export default function ProfileSettingsPage() {
  const { user, updateUser, isLoading } = useAuthStore();
  const [name, setName] = useState(user?.name || '');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    try {
      await updateUser({ name: name.trim() });
      toast.success('Profile updated');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update profile';
      toast.error(message);
    }
  };

  if (!user) return null;

  return (
    <div>
      <Header />
      <div className="p-4 md:p-8 space-y-6">
        <div>
          <h2 className="text-[22px] md:text-[26px] font-semibold text-foreground tracking-tight">Profile</h2>
          <p className="text-[14px] md:text-[15px] text-text-secondary mt-1">
            Manage your account settings and preferences.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Personal Information</CardTitle>
            <CardDescription>Update your profile details</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-5 mb-6 md:mb-8 pb-6 md:pb-8 border-b border-border-light">
              <div className="w-16 h-16 md:w-20 md:h-20 rounded-2xl bg-gradient-to-br from-primary to-primary-hover flex items-center justify-center shadow-lg shadow-primary/30 flex-shrink-0">
                {user.avatar_url ? (
                  <img
                    src={user.avatar_url}
                    alt={user.name}
                    className="w-16 h-16 md:w-20 md:h-20 rounded-2xl object-cover"
                  />
                ) : (
                  <span className="text-xl md:text-2xl font-semibold text-white">
                    {getInitials(user.name)}
                  </span>
                )}
              </div>
              <div className="text-center sm:text-left">
                <h3 className="text-[16px] md:text-[17px] font-semibold text-foreground">{user.name}</h3>
                <p className="text-[14px] md:text-[15px] text-text-secondary mt-0.5">{user.email}</p>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <Input
                label="Email"
                type="email"
                value={user.email}
                disabled
                helperText="Email cannot be changed"
              />
              <Input
                label="Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
              <div className="pt-4">
                <Button type="submit" isLoading={isLoading} className="w-full sm:w-auto">
                  Save Changes
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
