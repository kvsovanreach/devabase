import { LoginForm } from '@/components/auth/login-form';

export default function LoginPage() {
  return (
    <div>
      <h2 className="text-[22px] font-semibold text-foreground tracking-tight text-center mb-8">
        Sign in to your account
      </h2>
      <LoginForm />
    </div>
  );
}
