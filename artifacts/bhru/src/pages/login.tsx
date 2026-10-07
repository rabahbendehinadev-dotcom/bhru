import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { Eye, EyeOff, User, Lock } from 'lucide-react';
import { Logo, Card, Btn, Field } from '@/components/bhru/ui';
import { PublicShell } from '@/components/public-auth/PublicShell';
import { PaField } from '@/components/public-auth/Fields';
import { login, errorMessage } from '@/lib/store';

export function AuthFrame({ children, step, minimal = false }: { children: React.ReactNode; step?: string; minimal?: boolean }) {
  return (
    <div className="grid min-h-[100dvh] place-items-center p-4">
      <div className="w-full max-w-[420px]">
        <div className="mb-5 flex items-center justify-between"><Logo sub="SaaS for Unlock Servers" size={38} />{step && <span className="text-[11px] text-muted-foreground">{step}</span>}</div>
        {children}
        {!minimal && <div className="mt-4 grid grid-cols-3 gap-2 text-center text-[11px] text-muted-foreground">
          <span>Secure<br />Protected session</span><span>Fast setup<br />Two steps</span><span>Professional<br />Built for servers</span>
        </div>}
      </div>
    </div>
  );
}

function SubscriberLogin() {
  const [, nav] = useLocation();
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setErr('');
    try { await login(q, pw); nav('/'); }
    catch (error) { setErr(errorMessage(error)); }
    finally { setBusy(false); }
  };
  return (
    <PublicShell mode="login">
      <h1 className="pa-h">Welcome back</h1>
      <p className="pa-sub">Sign in to your BHRU panel.</p>
      <form onSubmit={submit} className="pa-f" aria-busy={busy}>
        {err && <div className="pa-alert" role="alert" data-testid="text-login-error">{err}</div>}
        <PaField label="Email or username" name="username" icon={<User size={16} />} type="text" value={q} onChange={(e) => { setQ(e.target.value); setErr(''); }} placeholder="Email or username" required autoComplete="username" autoCapitalize="none" spellCheck={false} disabled={busy} data-testid="input-login-id" />
        <PaField label="Password" name="password" icon={<Lock size={16} />} password value={pw} onChange={(e) => setPw(e.target.value)} required autoComplete="current-password" disabled={busy} data-testid="input-login-password" />
        <button type="submit" className="pa-btn p w" disabled={busy} data-testid="button-login">{busy ? 'Signing in...' : 'Sign in'}</button>
      </form>
      <p className="pa-swap">New to BHRU? <Link href="/register" data-testid="link-register">Create an account</Link></p>
    </PublicShell>
  );
}

export default function Login({ adminPath }: { adminPath?: string }) {
  if (!adminPath) return <SubscriberLogin />;
  return <AdminLogin adminPath={adminPath} />;
}

function AdminLogin({ adminPath }: { adminPath: string }) {
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
    try { await login(q, pw, adminPath); nav(adminPath || '/'); }
    catch (error) { setErr(errorMessage(error)); }
    finally { setBusy(false); }
  };
  return (
    <AuthFrame minimal>
      <Card className="p-5">
        <div className="mb-4 flex items-center gap-2"><h1 className="text-[17px] font-semibold">{adminPath ? 'BHRU Platform Administration' : 'Sign in to BHRU'}</h1></div>
        <form onSubmit={submit} className="space-y-3">
          <Field label={adminPath ? 'Admin email' : 'Email or username'} error={err}>
            <div className="relative"><User size={14} className="absolute left-2.5 top-2.5 text-muted-foreground" /><input className="input pl-8" type={adminPath ? 'email' : 'text'} value={q} onChange={(e) => { setQ(e.target.value); setErr(''); }} placeholder={adminPath ? 'Admin email' : 'Email or username'} required autoComplete="username" data-testid="input-login-id" /></div>
          </Field>
          <Field label={adminPath ? 'Admin password' : 'Password'}>
            <div className="relative"><Lock size={14} className="absolute left-2.5 top-2.5 text-muted-foreground" />
              <input className="input px-8" type={show ? 'text' : 'password'} value={pw} onChange={(e) => setPw(e.target.value)} required autoComplete="current-password" data-testid="input-login-password" />
              <button type="button" onClick={() => setShow(!show)} className="absolute right-2.5 top-2.5 text-muted-foreground" aria-label="Toggle password">{show ? <EyeOff size={14} /> : <Eye size={14} />}</button></div>
          </Field>
          <Btn v="primary" type="submit" className="w-full" disabled={busy} data-testid="button-login">{busy ? 'Signing in...' : 'Sign in'}</Btn>
        </form>
      </Card>
    </AuthFrame>
  );
}
