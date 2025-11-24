"use client";

import { useState, useEffect, useRef } from "react";

type GpuInfo = {
  name: string;
  util: number;
  used_gb: number;
  total_gb: number;
};

type MetricsResponse = {
  uptime_sec: number;
  cpu: number;
  ram_used_gb: number;
  ram_total_gb: number;
  gpu: {
    available: boolean;
    gpus?: GpuInfo[];
  };
  detailed?: any;
};

export default function Home() {
  const [ip, setIp] = useState("");
  const [token, setToken] = useState("");
  const [data, setData] = useState<MetricsResponse | null>(null);
  const [examplesHistory, setExamplesHistory] = useState<number[]>([]);
  const historyMax = 40;
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);

  // copy state
  const [copied, setCopied] = useState(false);
  const copyTimeoutRef = useRef<number | null>(null);

  // Helper to normalize the API response format
  function normalizeDetailedResponse(json: any) {
    // Support both shapes:
    // 1) { ok: true, data: { current_round: ..., ... } }
    // 2) { ok: true, data: { ok: true, data: { current_round: ... } } }
    if (!json) return null;
    if (json.data === undefined) return null;
    // if double-wrapped, unwrap
    if (json.data.data !== undefined) {
      return json.data.data;
    }
    return json.data;
  }

  async function fetchMetrics(auto = false) {
    if (!ip) return;

    if (!auto) {
      setLoading(true);
      setError("");
    }

    try {
      const res = await fetch(
        `/api/node-metrics?ip=${encodeURIComponent(ip)}&ts=${Date.now()}`,
        { cache: "no-store" }
      );
      const json = await res.json();

      if (!json.ok) {
        throw new Error(json.error || "Failed to fetch metrics");
      }

      const metrics = json.data as MetricsResponse;
      // If we already have detailed merged, preserve it
      setData((prev) => (prev ? { ...metrics, detailed: prev.detailed ?? metrics.detailed } : metrics));
    } catch (e) {
      console.error(e);
      if (!auto) {
        setError("❌ Cannot connect. Is your agent running and port 9105 open?");
        setData(null);
      }
    } finally {
      if (!auto) {
        setLoading(false);
      }
    }
  }

  async function fetchDetailed(auto = false) {
    if (!ip) return;
    try {
      const tokenQuery = token ? `&token=${encodeURIComponent(token)}` : "";
      const res = await fetch(
        `/api/node-detailed?ip=${encodeURIComponent(ip)}${tokenQuery}&ts=${Date.now()}`,
        { cache: "no-store" }
      );
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Failed to fetch detailed metrics");

      const info = normalizeDetailedResponse(json);
      if (!info) {
        throw new Error("Detailed response missing");
      }

      // Merge the detailed object into the main `data` state so UI reads from data.detailed
      setData((prev) => {
        if (prev) {
          return { ...prev, detailed: info };
        } else {
          // We didn't have base metrics yet. Insert a minimal metrics wrapper so UI won't break.
          return {
            uptime_sec: 0,
            cpu: 0,
            ram_used_gb: 0,
            ram_total_gb: 0,
            gpu: { available: false },
            detailed: info,
          } as MetricsResponse;
        }
      });

      // update examples history if present
      const latest = info.examples_s_latest ?? null;
      setExamplesHistory((prev) => {
        const next = latest !== null ? [...prev, Number(latest)] : [...prev];
        if (next.length > historyMax) next.splice(0, next.length - historyMax);
        return next;
      });
    } catch (e) {
      console.error("Detailed fetch error", e);
      if (!auto) {
        setError((prev) => prev || "⚠️ Detailed metrics unavailable");
      }
    }
  }

  useEffect(() => {
    if (!autoRefresh || !ip) return;
    fetchMetrics(true);
    fetchDetailed(true);
    const id = setInterval(() => {
      fetchMetrics(true);
      fetchDetailed(true);
    }, 3000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefresh, ip, token]);

  function formatUptime(sec: number) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return `${h}h ${m}m ${s}s`;
  }

  function Sparkline({ data }: { data: number[] }) {
    if (!data || data.length === 0) {
      return <div className="text-xs text-slate-400">no data</div>;
    }
    const width = 160;
    const height = 40;
    const max = Math.max(...data);
    const min = Math.min(...data);
    const range = Math.max(1e-6, max - min);
    const points = data.map((v, i) => {
      const x = (i / (data.length - 1 || 1)) * width;
      const y = height - ((v - min) / range) * height;
      return `${x},${y}`;
    }).join(" ");
    return (
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="rounded-md bg-slate-950/60 p-1">
        <polyline fill="none" stroke="#10b981" strokeWidth={2} points={points} strokeLinejoin="round" strokeLinecap="round" />
      </svg>
    );
  }

  async function handleConnect() {
    setError("");
    await fetchMetrics(false);
    await fetchDetailed(false);
  }

  function installCommandForIp(ipValue: string) {
    const installer = "https://raw.githubusercontent.com/kaushalvasoya2001/gensyn-node-agent/main/install.sh";
    if (ipValue) {
      return `NODE_IP=${ipValue} curl -sL ${installer} | sudo bash`;
    }
    return `curl -sL ${installer} | sudo bash`;
  }

  async function handleCopyCommand() {
    const cmd = installCommandForIp(ip);
    try {
      await navigator.clipboard.writeText(cmd);
      setCopied(true);
      if (copyTimeoutRef.current) {
        window.clearTimeout(copyTimeoutRef.current);
      }
      copyTimeoutRef.current = window.setTimeout(() => {
        setCopied(false);
      }, 2200);
    } catch (e) {
      console.error("copy failed", e);
    }
  }

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) window.clearTimeout(copyTimeoutRef.current);
    };
  }, []);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex justify-center px-4 py-10">
      <div className="w-full max-w-5xl space-y-8">
        <header className="space-y-2">
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight flex items-center gap-2">
            ⚡ Gensyn Node Dashboard
          </h1>
          <p className="text-slate-400 max-w-2xl">
            Monitor your Gensyn node in real-time. Install the agent on your
            VPS, open port <span className="font-mono">9105</span>, paste your
            node IP below, and see live CPU, RAM, GPU, and node metrics.
          </p>
        </header>

        {/* Connect Card */}
        <section className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 md:p-6 flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
          <div className="space-y-2 w-full md:w-auto">
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Node IP address
            </label>
            <div className="flex gap-2">
              <input
                value={ip}
                onChange={(e) => setIp(e.target.value)}
                placeholder="e.g. 37.120.160.112"
                className="flex-1 md:w-64 px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 font-mono"
              />
              <button
                onClick={handleConnect}
                disabled={!ip || loading}
                className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-sm disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loading ? "Connecting..." : "Connect"}
              </button>
            </div>

            <div className="mt-2">
              <label className="text-xs text-slate-400">Optional node token</label>
              <input
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="if your agent requires a token"
                className="mt-1 w-full md:w-72 px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-slate-100 text-sm font-mono"
              />
            </div>

            {error && (
              <p className="text-xs text-red-400 mt-1">
                {error} <br />
                Make sure: agent is running, firewall allows{" "}
                <span className="font-mono">9105/tcp</span>, and IP is correct.
              </p>
            )}
          </div>

          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-400 flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                className="accent-emerald-500"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                disabled={!ip}
              />
              Auto-refresh every 3s
            </label>
          </div>
        </section>

        {/* One-line installer card: only show when there is no connected data yet */}
        {!data && (
          <section className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 md:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm text-slate-400">One-line agent install</p>
                <p className="mt-2 text-xs text-slate-300 max-w-2xl">
                  Copy this command, run on your node to install the agent, then paste your node IP above and click Connect.
                </p>
              </div>

              <div className="ml-4">
                <button
                  onClick={handleCopyCommand}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-sm text-slate-200 hover:bg-slate-700"
                >
                  {copied ? "Copied!" : "Copy command"}
                </button>
              </div>
            </div>

            <div className="mt-4 bg-slate-950/40 border border-slate-800 rounded-md p-3 font-mono text-sm break-words">
              <code>{installCommandForIp(ip)}</code>
            </div>
          </section>
        )}

        {/* Metrics */}
        {data && (
          <section className="space-y-6">
            {/* Summary */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4 space-y-1">
                <p className="text-xs uppercase tracking-wide text-slate-400">
                  Node status
                </p>
                <p className="text-base font-semibold">✅ Connected</p>
                <p className="text-xs text-slate-500">
                  Uptime: {formatUptime(data.uptime_sec)}
                </p>
              </div>
              <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4 space-y-1">
                <p className="text-xs uppercase tracking-wide text-slate-400">
                  CPU usage
                </p>
                <p className="text-base font-semibold">
                  {data.cpu.toFixed(1)}%
                </p>
              </div>
              <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4 space-y-1">
                <p className="text-xs uppercase tracking-wide text-slate-400">
                  Memory usage
                </p>
                <p className="text-base font-semibold">
                  {data.ram_used_gb.toFixed(2)} /{" "}
                  {data.ram_total_gb.toFixed(2)} GB
                </p>
              </div>
            </div>

            {/* Detailed cards: Current Round, Examples/s, Pass Rate */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* CURRENT ROUND */}
              <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4 space-y-1">
                <p className="text-xs uppercase tracking-wide text-slate-400">
                  CURRENT ROUND
                </p>

                <p className="text-2xl font-bold text-emerald-400">
                  {data?.detailed?.current_round ?? "—"}
                </p>

                <p className="text-xs text-slate-500">
                  Last start: {data?.detailed?.latest_start_round ?? "—"}
                </p>
              </div>

              {/* Examples / s */}
              <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4">
                <p className="text-xs uppercase tracking-wide text-slate-400">EXAMPLES / S</p>
                <p className="text-base font-semibold">
                  {data?.detailed?.examples_s_latest !== undefined && data?.detailed?.examples_s_latest !== null
                    ? Number(data.detailed.examples_s_latest).toFixed(2)
                    : "—"}
                </p>
                <p className="text-xs text-slate-500">avg: {data?.detailed?.examples_s_avg ? Number(data.detailed.examples_s_avg).toFixed(2) : "—"}</p>
                <div className="mt-2"><Sparkline data={examplesHistory} /></div>
              </div>

              {/* Pass Rate */}
              <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4">
                <p className="text-xs uppercase tracking-wide text-slate-400">PASS RATE</p>
                {data?.detailed ? (
                  (() => {
                    const ok = Number(data.detailed.proofs_ok ?? 0);
                    const fail = Number(data.detailed.proofs_fail ?? 0);
                    const total = ok + fail;
                    const rate = total > 0 ? ((ok / total) * 100).toFixed(1) + "%" : "—";
                    return <p className="text-base font-semibold">{rate}</p>;
                  })()
                ) : (
                  <p className="text-base font-semibold">—</p>
                )}
                <p className="text-xs text-slate-500">OK: {data?.detailed?.proofs_ok ?? 0} • Fail: {data?.detailed?.proofs_fail ?? 0}</p>
              </div>
            </div>

            {/* GPU */}
            <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4 md:p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">GPU status</h2>
                <span className="text-xs text-slate-400">
                  {data.gpu?.available && data.gpu.gpus
                    ? `Detected ${data.gpu.gpus.length} GPU(s)`
                    : "No NVIDIA GPU detected (CPU-only mode)"}
                </span>
              </div>

              {data.gpu?.available && data.gpu.gpus && data.gpu.gpus.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {data.gpu.gpus.map((g, idx) => (
                    <div
                      key={idx}
                      className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 space-y-2"
                    >
                      <p className="text-sm font-semibold truncate">
                        {g.name}
                      </p>
                      <p className="text-xs text-slate-400">
                        Utilization:{" "}
                        <span className="font-mono">{g.util}%</span>
                      </p>
                      <p className="text-xs text-slate-400">
                        Memory:{" "}
                        <span className="font-mono">
                          {g.used_gb.toFixed(2)} / {g.total_gb.toFixed(2)} GB
                        </span>
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-400">
                  No GPU data available. This node may be running in CPU-only
                  mode, which is still compatible with Gensyn workers.
                </p>
              )}
            </div>
          </section>
        )}

        {!data && !error && (
          <p className="text-sm text-slate-500">
            No data yet — connect a node by entering its IP above.
          </p>
        )}
      </div>
    </main>
  );
}
