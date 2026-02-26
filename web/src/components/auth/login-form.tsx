'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuthStore } from '@/stores/auth-store';
import { validateEmail, sanitizeInput } from '@/lib/config';
import toast from 'react-hot-toast';

export function LoginForm() {
  const router = useRouter();
  const { login, isLoading } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    const sanitizedEmail = sanitizeInput(email).toLowerCase();

    // Validate email
    if (!sanitizedEmail) {
      setErrors((prev) => ({ ...prev, email: 'Email is required' }));
      return;
    }

    if (!validateEmail(sanitizedEmail)) {
      setErrors((prev) => ({ ...prev, email: 'Please enter a valid email address' }));
      return;
    }

    // Validate password
    if (!password) {
      setErrors((prev) => ({ ...prev, password: 'Password is required' }));
      return;
    }

    try {
      await login(sanitizedEmail, password);
      toast.success('Welcome back!');
      router.push('/dashboard');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid email or password';
      toast.error(message);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <Input
          label="Email"
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        {errors.email && (
          <p className="mt-1 text-[13px] text-error">{errors.email}</p>
        )}
      </div>
      <div>
        <Input
          label="Password"
          type="password"
          placeholder="Enter your password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {errors.password && (
          <p className="mt-1 text-[13px] text-error">{errors.password}</p>
        )}
      </div>
      <Button type="submit" className="w-full" size="lg" isLoading={isLoading}>
        Sign in
      </Button>
      <p className="text-center text-[15px] text-text-secondary pt-2">
        Don&apos;t have an account?{' '}
        <Link href="/register" className="text-primary hover:text-primary-hover font-medium">
          Sign up
        </Link>
      </p>
    </form>
  );
}
