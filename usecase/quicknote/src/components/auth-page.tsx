import { useState } from 'react';
import { useAuth } from '../lib/auth';
import { Zap, ArrowRight, Loader2 } from 'lucide-react';

export function AuthPage() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, register } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (mode === 'login') {
        await login(email, password);
      } else {
        await register(email, password, name);
      }
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left — Branding */}
      <div className="hidden lg:flex lg:w-[480px] xl:w-[560px] bg-gradient-to-br from-primary via-primary-dark to-indigo-900 text-white flex-col justify-between p-12">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/15 backdrop-blur flex items-center justify-center">
              <Zap className="w-5 h-5" />
            </div>
            <span className="text-2xl font-bold tracking-tight">QuickNote</span>
          </div>
        </div>

        <div className="space-y-6">
          <h1 className="text-4xl xl:text-5xl font-bold leading-tight">
            Your thoughts,<br />
            beautifully<br />
            organized.
          </h1>
          <p className="text-lg text-indigo-200 max-w-sm leading-relaxed">
            A minimal note-taking app built with Devabase — featuring notebooks,
            tags, collaboration, and real-time sync.
          </p>
        </div>

        <p className="text-sm text-indigo-300">
          Powered by Devabase App Auth + Tables SDK
        </p>
      </div>

      {/* Right — Auth Form */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-md">
          {/* Mobile branding */}
          <div className="lg:hidden flex items-center gap-2.5 mb-10">
            <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center">
              <Zap className="w-4.5 h-4.5 text-white" />
            </div>
            <span className="text-xl font-bold text-text tracking-tight">QuickNote</span>
          </div>

          <h2 className="text-2xl font-bold text-text">
            {mode === 'login' ? 'Welcome back' : 'Create an account'}
          </h2>
          <p className="mt-2 text-text-secondary">
            {mode === 'login'
              ? 'Sign in to access your notes'
              : 'Start organizing your thoughts today'}
          </p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
            {mode === 'register' && (
              <div>
                <label className="block text-sm font-medium text-text mb-1.5">Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  required
                  className="w-full px-4 py-2.5 rounded-xl border border-border bg-surface text-text placeholder:text-text-tertiary focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-text mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                className="w-full px-4 py-2.5 rounded-xl border border-border bg-surface text-text placeholder:text-text-tertiary focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-text mb-1.5">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min 8 characters"
                required
                minLength={8}
                className="w-full px-4 py-2.5 rounded-xl border border-border bg-surface text-text placeholder:text-text-tertiary focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
              />
            </div>

            {error && (
              <div className="px-4 py-3 rounded-xl bg-danger-light text-danger text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-white font-medium hover:bg-primary-dark transition-colors disabled:opacity-60"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  {mode === 'login' ? 'Sign In' : 'Create Account'}
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-text-secondary">
            {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
            <button
              onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}
              className="text-primary font-medium hover:text-primary-dark transition-colors"
            >
              {mode === 'login' ? 'Sign up' : 'Sign in'}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
