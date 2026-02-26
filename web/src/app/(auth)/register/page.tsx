import { RegisterForm } from '@/components/auth/register-form';

export default function RegisterPage() {
  return (
    <div>
      <h2 className="text-[22px] font-semibold text-foreground tracking-tight text-center mb-8">
        Create your account
      </h2>
      <RegisterForm />
    </div>
  );
}
