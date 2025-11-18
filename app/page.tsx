"use client";

import { useState, useEffect } from "react";

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
};

export default function Home() {
  const [ip, setIp] = useState("");
  const [data, setData] = useState<MetricsResponse | null>(null);
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);

  async function fetchMetrics(auto = false) {
    if (!ip) return;
    if (!auto) {
      setLoading(true);
      setError("");
    }

    try {
      const res = await fetch(`http://${ip}:9105/metrics?ts=${Date.now()}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Failed to fetch metrics");
      const json = (await res.json()) as MetricsResponse;
      setData(json);
    } catch (e) {
      if (!auto) {
        setError("❌ Cannot connect. Is your agent running and port 9105 open?");
        setData(null);
      }
    } finally {
      if (!auto) setLoading(false);
    }
  }

  useEffect(() => {
    if (!autoRefresh || !ip) return;
    const id = setInterval(() => fetchMetrics(true), 3000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefresh, ip]);

  function formatUptime(sec: number) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return `${h}h ${m}m ${s}s`;
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex justify-center px-4 py-10">
      <div className="w-full max-w-5xl space-y-8">
        <header className="space-y-2">
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight flex items-center gap-2">
            ⚡ Gensyn Node Dashboard
          </h1>
          <p className="text-slate-400 max-w-2xl">
            Monitor your Gensyn node in real-time. Install the agent on your VPS,
            open port <span className="font-mono">9105</span>, paste your node IP
            below, and see live CPU, RAM and GPU metrics.
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
                placeholder="e.g. 34.93.14.221"
                className="flex-1 md:w-64 px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 font-mono"
              />
              <button
                onClick={() => fetchMetrics(false)}
                disabled={!ip || loading}
                className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-sm disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loading ? "Connecting..." : "Connect"}
              </button>
            </div>
            {error && (
              <p className="text-xs text-red-400 mt-1">
                {error} <br />
                Make sure: agent is running, firewall allows <span className="font-mono">9105/tcp</span>, and IP is correct.
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

        {/* Metrics */}
        {data && (
          <section className="space-y-6">
            {/* Summary */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4 space-y-1">
                <p className="text-xs uppercase tracking-wide text-slate-400">
                  Node status
                </p>
                <p className="text-base font-semibold">
                  {data ? "✅ Connected" : "Not connected"}
                </p>
                <p className="text-xs text-slate-500">
                  Uptime: {formatUptime(data.uptime_sec)}
                </p>
              </div>
              <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4 space-y-1">
                <p className="text-xs uppercase tracking-wide text-slate-400">
                  CPU usage
                </p>
                <p className="text-base font-semibold">{data.cpu.toFixed(1)}%</p>
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

            {/* GPU */}
            <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4 md:p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">GPU status</h2>
                <span className="text-xs text-slate-400">
                  {data.gpu.available
                    ? `Detected ${data.gpu.gpus?.length ?? 0} GPU(s)`
                    : "No NVIDIA GPU detected (CPU-only mode)"}
                </span>
              </div>

              {data.gpu.available && data.gpu.gpus && data.gpu.gpus.length > 0 ? (
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

            {/* Raw JSON */}
            <div className="bg-slate-950 border border-slate-900 rounded-2xl p-4">
              <p className="text-xs text-slate-400 mb-2">
                Raw metrics (debug view)
              </p>
              <pre className="text-xs md:text-sm text-emerald-300 overflow-x-auto">
                {JSON.stringify(data, null, 2)}
              </pre>
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
