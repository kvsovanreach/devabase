'use client';

import Link from 'next/link';
import { Header } from '@/components/layout/header';
import { Card } from '@/components/ui/card';
import { User, FolderKanban, Users, ArrowRight, Bot, ShieldCheck } from 'lucide-react';

const settingsLinks = [
  {
    title: 'Profile',
    description: 'Manage your account settings and preferences',
    href: '/settings/profile',
    icon: User,
    color: 'text-primary',
    bgColor: 'bg-primary-muted',
  },
  {
    title: 'Project',
    description: 'Configure your current project settings',
    href: '/settings/project',
    icon: FolderKanban,
    color: 'text-success',
    bgColor: 'bg-success-muted',
  },
  {
    title: 'Team Members',
    description: 'Manage project members and invitations',
    href: '/settings/members',
    icon: Users,
    color: 'text-warning',
    bgColor: 'bg-warning-muted',
  },
  {
    title: 'App Users',
    description: 'Manage end-user authentication and accounts',
    href: '/settings/app-auth',
    icon: ShieldCheck,
    color: 'text-error',
    bgColor: 'bg-error-muted',
  },
  {
    title: 'AI Providers',
    description: 'Configure LLM and embedding providers',
    href: '/settings/providers',
    icon: Bot,
    color: 'text-info',
    bgColor: 'bg-info-muted',
  },
];

export default function SettingsPage() {
  return (
    <div>
      <Header />
      <div className="p-8">
        <div className="mb-8">
          <h2 className="text-[22px] md:text-[26px] font-semibold text-foreground tracking-tight">Settings</h2>
          <p className="text-[15px] text-text-secondary mt-1">
            Manage your account and project settings.
          </p>
        </div>

        <div className="grid gap-4 max-w-2xl">
          {settingsLinks.map((link) => (
            <Link key={link.href} href={link.href}>
              <Card hover className="p-5">
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-xl ${link.bgColor} flex items-center justify-center flex-shrink-0`}>
                    <link.icon className={`w-6 h-6 ${link.color}`} />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-[15px] font-medium text-foreground">{link.title}</h3>
                    <p className="text-[13px] text-text-secondary mt-0.5">{link.description}</p>
                  </div>
                  <ArrowRight className="w-5 h-5 text-text-tertiary" />
                </div>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
