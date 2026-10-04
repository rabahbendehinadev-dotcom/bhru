import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { Eye, EyeOff, User, Lock } from 'lucide-react';
import { Logo, Card, Btn, Field, Badge } from '@/components/bhru/ui';
import { login, errorMessage } from '@/lib/store';

export function AuthFrame({ children, step }: { children: React.ReactNode; step?: string }) {
  return (
    <div className="grid min-h-[100dvh] place-items-center p-4">
      <div className="w-full max-w-[420px]">
        <div className="mb-5 flex items-center justify-between"><Logo sub="SaaS for Unlock Servers" size={38} />{step && <span className="text-[11px] text-muted-foreground">{step}</span>}</div>
        {children}
        <div className="mt-4 grid grid-cols-3 gap-2 text-center text-[11px] text-muted-foreground">
          <span>Secure<br />Protected session</span><span>Fast setup<br />Two steps</span><span>Professional<br />Built for servers</span>
        </div>
      </div>
    </div>
  );
}

export default function Login() {
  const [, nav] = useLocation();
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState('');
  const [pw, setPw] = useState('');
  const [show, setShow] = useState(false);
  const [err, setErr] = useState('');
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setErr('');
    try { const role = await login(q, pw); nav(role === 'admin' ? '/admin' : '/'); }
    catch (error) { setErr(errorMessage(error)); }
    finally { setBusy(false); }
  };
  return (
    <AuthFrame>
      <Card className="p-5">
        <div className="mb-1 flex items-center gap-2"><h1 className="text-[17px] font-semibold">Sign in to BHRU</h1></div>
        <p className="mb-4 text-[12.5px] text-muted-foreground">Use your account credentials to access your server or platform administration.</p>
        <form onSubmit={submit} className="space-y-3">
          <Field label="Email or username" error={err}>
            <div className="relative"><User size={14} className="absolute left-2.5 top-2.5 text-muted-foreground" /><input className="input pl-8" value={q} onChange={(e) => { setQ(e.target.value); setErr(''); }} placeholder="Email or username" required autoComplete="username" data-testid="input-login-id" /></div>
          </Field>
          <Field label="Password">
            <div className="relative"><Lock size={14} className="absolute left-2.5 top-2.5 text-muted-foreground" />
              <input className="input px-8" type={show ? 'text' : 'password'} value={pw} onChange={(e) => setPw(e.target.value)} required autoComplete="current-password" data-testid="input-login-password" />
              <button type="button" onClick={() => setShow(!show)} className="absolute right-2.5 top-2.5 text-muted-foreground" aria-label="Toggle password">{show ? <EyeOff size={14} /> : <Eye size={14} />}</button></div>
          </Field>
          <Btn v="primary" type="submit" className="w-full" disabled={busy} data-testid="button-login">{busy ? 'Signing in...' : 'Sign in'}</Btn>
        </form>
        <p className="mt-3 text-center text-[12px] text-muted-foreground">New to BHRU? <Link href="/register" className="font-medium text-brand" data-testid="link-register">Create an account</Link></p>
      </Card>
    </AuthFrame>
  );
}
