import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BarChart3, Download, Link as LinkIcon, LogIn, RefreshCw, Send } from 'lucide-react';
import './styles.css';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

type User = { id: string; email: string; role: 'marketer' | 'client'; client_id: string | null };
type LinkRow = {
  id: string;
  short_code: string;
  original_url: string;
  campaign_name: string | null;
  client_id: string;
  active: boolean;
  created_at: string;
};
type Stats = {
  total_clicks: number;
  unique_clicks: number;
  by_country: { country: string; count: number }[];
  by_device: { device_type: string; count: number }[];
  by_referrer: { referrer: string; count: number }[];
};
type Report = {
  id: string;
  status: string;
  download_url: string | null;
  created_at: string;
  error_message: string | null;
};

function App() {
  const [token, setToken] = useState(localStorage.getItem('token') ?? '');
  const [user, setUser] = useState<User | null>(null);
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [selected, setSelected] = useState<LinkRow | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const authHeaders = useMemo(() => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }), [token]);

  async function request(path: string, init: RequestInit = {}) {
    const res = await fetch(`${API}${path}`, { ...init, headers: { ...authHeaders, ...(init.headers ?? {}) } });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }

  async function login(email: string, password: string) {
    const data = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    }).then((res) => {
      if (!res.ok) throw new Error('Invalid credentials');
      return res.json();
    });
    localStorage.setItem('token', data.token);
    setToken(data.token);
    setUser(data.user);
  }

  async function loadLinks() {
    const data = await request('/api/links?limit=50');
    setLinks(data.data);
    setSelected((current) => current ?? data.data[0] ?? null);
  }

  async function loadReports() {
    const data = await request('/api/reports?limit=20');
    setReports(data.data);
  }

  async function createReport() {
    if (!selected) return;
    const dateTo = new Date();
    const dateFrom = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    await request('/api/reports', {
      method: 'POST',
      body: JSON.stringify({
        client_id: selected.client_id,
        link_ids: [selected.id],
        date_from: dateFrom.toISOString(),
        date_to: dateTo.toISOString()
      })
    });
    await loadReports();
  }

  useEffect(() => {
    if (!token) return;
    void loadLinks().catch(console.error);
    void loadReports().catch(console.error);
  }, [token]);

  useEffect(() => {
    if (!selected || !token) return;
    void request(`/api/links/${selected.id}/stats?period=day`).then(setStats).catch(console.error);
  }, [selected?.id, token]);

  useEffect(() => {
    if (!token) return;
    const id = setInterval(() => void loadReports().catch(console.error), 3000);
    return () => clearInterval(id);
  }, [token]);

  if (!token) return <Login onLogin={login} />;

  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-950">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-xl font-semibold">TrackFlow</h1>
            <p className="text-sm text-zinc-500">{user?.email ?? 'Dashboard'}</p>
          </div>
          <button className="icon-button" onClick={() => void loadLinks()} title="Refresh links">
            <RefreshCw size={18} />
          </button>
        </div>
      </header>
      <div className="mx-auto grid max-w-7xl gap-6 px-6 py-6 lg:grid-cols-[360px_1fr]">
        <section className="panel">
          <div className="panel-title">
            <LinkIcon size={18} />
            <span>Links</span>
          </div>
          <div className="space-y-2">
            {links.map((link) => (
              <button key={link.id} className={`link-row ${selected?.id === link.id ? 'active' : ''}`} onClick={() => setSelected(link)}>
                <span className="font-medium">{link.campaign_name ?? link.short_code}</span>
                <span className="text-xs text-zinc-500">{link.short_code}</span>
              </button>
            ))}
          </div>
        </section>
        <section className="space-y-6">
          <div className="panel">
            <div className="panel-title">
              <BarChart3 size={18} />
              <span>Statistics</span>
            </div>
            {selected && stats ? <StatsView link={selected} stats={stats} /> : <p className="text-sm text-zinc-500">No link selected.</p>}
          </div>
          <div className="panel">
            <div className="flex items-center justify-between">
              <div className="panel-title">
                <Download size={18} />
                <span>Reports</span>
              </div>
              <button className="primary-button" onClick={() => void createReport()}>
                <Send size={16} />
                Generate
              </button>
            </div>
            <div className="mt-4 space-y-2">
              {reports.map((report) => (
                <div className="report-row" key={report.id}>
                  <span>{new Date(report.created_at).toLocaleString()}</span>
                  <span className={`status ${report.status}`}>{report.status}</span>
                  {report.download_url && <a href={`${API}${report.download_url}`}>PDF</a>}
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function Login({ onLogin }: { onLogin: (email: string, password: string) => Promise<void> }) {
  const [email, setEmail] = useState('marketer@test.com');
  const [password, setPassword] = useState('test123');
  const [error, setError] = useState('');
  return (
    <main className="grid min-h-screen place-items-center bg-zinc-100 px-4">
      <form
        className="w-full max-w-sm rounded-lg border border-zinc-200 bg-white p-6 shadow-sm"
        onSubmit={(event) => {
          event.preventDefault();
          onLogin(email, password).catch((err) => setError(String(err.message ?? err)));
        }}
      >
        <h1 className="mb-5 text-2xl font-semibold">TrackFlow</h1>
        <input className="input" value={email} onChange={(event) => setEmail(event.target.value)} />
        <input className="input mt-3" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        <button className="primary-button mt-5 w-full justify-center">
          <LogIn size={16} />
          Log in
        </button>
      </form>
    </main>
  );
}

function StatsView({ link, stats }: { link: LinkRow; stats: Stats }) {
  return (
    <div>
      <div className="mb-4">
        <h2 className="text-lg font-semibold">{link.campaign_name ?? link.short_code}</h2>
        <a className="text-sm text-teal-700" href={`${API}/${link.short_code}`} target="_blank" rel="noreferrer">
          {API}/{link.short_code}
        </a>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Metric label="Total clicks" value={stats.total_clicks} />
        <Metric label="Unique clicks" value={stats.unique_clicks} />
      </div>
      <div className="mt-5 grid gap-4 md:grid-cols-3">
        <TopList title="Countries" rows={stats.by_country.map((r) => [r.country, r.count])} />
        <TopList title="Devices" rows={stats.by_device.map((r) => [r.device_type, r.count])} />
        <TopList title="Referrers" rows={stats.by_referrer.map((r) => [r.referrer, r.count])} />
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function TopList({ title, rows }: { title: string; rows: [string, number][] }) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold">{title}</h3>
      <div className="space-y-2">
        {rows.map(([label, count]) => (
          <div className="flex justify-between rounded border border-zinc-200 px-3 py-2 text-sm" key={label}>
            <span>{label}</span>
            <span className="font-medium">{count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
