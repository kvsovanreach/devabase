'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuthStore } from '@/stores/auth-store';
import { validateEmail, validatePassword, sanitizeInput } from '@/lib/config';
import toast from 'react-hot-toast';

export function RegisterForm() {
  const router = useRouter();
  const { register, isLoading } = useAuthStore();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    const sanitizedName = sanitizeInput(name);
    const sanitizedEmail = sanitizeInput(email).toLowerCase();

    // Validate name
    if (!sanitizedName || sanitizedName.length < 2) {
      setErrors((prev) => ({ ...prev, name: 'Name must be at least 2 characters' }));
      return;
    }

    if (sanitizedName.length > 100) {
      setErrors((prev) => ({ ...prev, name: 'Name must be less than 100 characters' }));
      return;
    }

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
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
      setErrors((prev) => ({ ...prev, password: passwordValidation.errors[0] }));
      return;
    }

    // Validate password confirmation
    if (password !== confirmPassword) {
      setErrors((prev) => ({ ...prev, confirmPassword: 'Passwords do not match' }));
      return;
    }

    try {
      await register(sanitizedEmail, password, sanitizedName);
      toast.success('Account created successfully!');
      router.push('/dashboard');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Registration failed';
      toast.error(message);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <Input
          label="Name"
          type="text"
          placeholder="Your name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          maxLength={100}
        />
        {errors.name && (
          <p className="mt-1 text-[13px] text-error">{errors.name}</p>
        )}
      </div>
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
          placeholder="At least 8 characters"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {errors.password && (
          <p className="mt-1 text-[13px] text-error">{errors.password}</p>
        )}
        <p className="mt-1 text-[12px] text-text-tertiary">
          Must contain uppercase, lowercase, and a number
        </p>
      </div>
      <div>
        <Input
          label="Confirm Password"
          type="password"
          placeholder="Confirm your password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
        />
        {errors.confirmPassword && (
          <p className="mt-1 text-[13px] text-error">{errors.confirmPassword}</p>
        )}
      </div>
      <Button type="submit" className="w-full" size="lg" isLoading={isLoading}>
        Create account
      </Button>
      <p className="text-center text-[15px] text-text-secondary pt-2">
        Already have an account?{' '}
        <Link href="/login" className="text-primary hover:text-primary-hover font-medium">
          Sign in
        </Link>
      </p>
    </form>
  );
}
