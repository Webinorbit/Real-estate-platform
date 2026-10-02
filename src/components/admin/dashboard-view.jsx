"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowDownRight, ArrowUpRight, Clock, Eye, Flame, Home, ShieldAlert, Target, Trophy, Users } from "lucide-react";
import { Avatar, Badge, Card } from "@/components/ui/misc";
import { LEAD_SOURCES, LEAD_STATUSES } from "@/lib/constants";
import { timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";

const STATUS_COLORS = { NEW: "#f59e0b", CONTACTED: "#38bdf8", VIEWING: "#8b5cf6", NEGOTIATION: "#ec4899", WON: "#22c55e", LOST: "#94a3b8" };
const SOURCE_COLORS = ["var(--primary)", "var(--accent)", "#8b5cf6", "#38bdf8"];
const tip = { borderRadius: 12, border: "1px solid var(--border)", background: "var(--card)", color: "var(--foreground)", fontSize: 12 };

function Spark({ data, color = "var(--primary)" }) {
  const rows = data.map((v, i) => ({ i, v }));
  return (
    <ResponsiveContainer width="100%" height={44}>
      <AreaChart data={rows} margin={{ top: 4, bottom: 0, left: 0, right: 0 }}>
        <defs>
          <linearGradient id={`sp-${color.replace(/\W/g, "")}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.35} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area type="monotone" dataKey="v" stroke={color} strokeWidth={2} fill={`url(#sp-${color.replace(/\W/g, "")})`} isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function Kpi({ icon: Icon, label, value, suffix, delta, deltaGoodWhenDown, spark, sub, i }) {
  const up = delta > 0;
  const good = delta == null ? null : deltaGoodWhenDown ? delta <= 0 : delta >= 0;
  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}>
      <Card className="overflow-hidden p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="mt-1 font-heading text-3xl font-semibold">
              {value ?? "–"}
              {value != null && suffix && <span className="ml-1 text-base font-medium text-muted-foreground">{suffix}</span>}
            </p>
          </div>
          <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary"><Icon className="size-5" /></span>
        </div>
        <div className="mt-1 flex items-center gap-2 text-xs">
          {delta != null && delta !== 0 && (
            <span className={cn("inline-flex items-center gap-0.5 font-semibold", good ? "text-success" : "text-danger")}>
              {up ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />} {Math.abs(delta)}%
            </span>
          )}
          <span className="text-muted-foreground">{sub}</span>
        </div>
        {spark && <div className="-mx-5 -mb-5 mt-2"><Spark data={spark} /></div>}
      </Card>
    </motion.div>
  );
}

function Countdown({ to }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const diff = Math.round((new Date(to).getTime() - now) / 1000);
  const abs = Math.abs(diff);
  const text = abs >= 3600 ? `${Math.floor(abs / 3600)}h ${Math.floor((abs % 3600) / 60)}m` : `${Math.floor(abs / 60)}:${String(abs % 60).padStart(2, "0")}`;
  return <span className={cn("tabular-nums font-semibold", diff < 0 ? "text-danger" : diff < 600 ? "text-warning" : "text-foreground")}>{diff < 0 ? `-${text}` : text}</span>;
}

export function DashboardView({ data, isStaff, firstName, tenantName }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), 30_000);
    return () => clearInterval(t);
  }, [router]);

  const { kpis, series, statusCounts, sourceCounts, leaderboard, atRisk, recent, topProperties } = data;
  const sourceLabel = Object.fromEntries(LEAD_SOURCES.map((s) => [s.value, s.label]));
  const statusLabel = Object.fromEntries(LEAD_STATUSES.map((s) => [s.value, s.label]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-3xl font-semibold">Good to see you, {firstName}</h1>
        <p className="mt-1 text-sm text-muted-foreground">Here is how {tenantName} performed over the last 30 days.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi i={0} icon={Users} label="New leads" value={kpis.leads.value} delta={kpis.leads.delta} spark={kpis.leads.spark} sub="vs previous 30 days" />
        <Kpi i={1} icon={Clock} label="Avg first response" value={kpis.response.value} suffix="min" spark={kpis.response.spark} deltaGoodWhenDown sub="time to first contact" />
        <Kpi i={2} icon={Target} label="Win rate" value={kpis.winRate.value} suffix="%" delta={kpis.winRate.delta} spark={kpis.winRate.spark} sub="leads converted" />
        <Kpi i={3} icon={Home} label="Active listings" value={kpis.listings.value} sub={`${kpis.listings.views.toLocaleString("en-IN")} total views`} />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.6fr_1fr]">
        <Card className="p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-heading text-lg font-semibold">Lead volume</h2>
            <div className="flex gap-4 text-xs text-muted-foreground">
              <span><i className="mr-1.5 inline-block size-2 rounded-full bg-primary" />Leads</span>
              <span><i className="mr-1.5 inline-block size-2 rounded-full bg-success" />Won</span>
            </div>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series} margin={{ top: 8, right: 8, left: -22, bottom: 0 }}>
                <defs>
                  <linearGradient id="gLeads" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
                <XAxis dataKey="date" tickFormatter={(d) => new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={24} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={tip} labelFormatter={(d) => new Date(d).toLocaleDateString("en-IN", { dateStyle: "medium" })} />
                <Area type="monotone" dataKey="leads" name="Leads" stroke="var(--primary)" strokeWidth={2.5} fill="url(#gLeads)" />
                <Area type="monotone" dataKey="won" name="Won" stroke="#22c55e" strokeWidth={2} fill="transparent" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="mb-4 font-heading text-lg font-semibold">Pipeline</h2>
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={statusCounts.map((s) => ({ ...s, label: statusLabel[s.status] }))} layout="vertical" margin={{ left: 0, right: 12, top: 0, bottom: 0 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="label" width={86} tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={tip} cursor={{ fill: "var(--muted)" }} />
                <Bar dataKey="count" name="Leads" radius={6} barSize={14}>
                  {statusCounts.map((s) => (
                    <Cell key={s.status} fill={STATUS_COLORS[s.status]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <h3 className="mb-2 mt-5 text-sm font-semibold text-muted-foreground">Lead sources</h3>
          <div className="flex items-center gap-4">
            <div className="size-28 shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={sourceCounts} dataKey="count" nameKey="source" innerRadius={32} outerRadius={52} paddingAngle={3} stroke="none">
                    {sourceCounts.map((s, i) => (
                      <Cell key={s.source} fill={SOURCE_COLORS[i % SOURCE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tip} formatter={(v, n) => [v, sourceLabel[n] || n]} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className="min-w-0 flex-1 space-y-1.5 text-sm">
              {sourceCounts.map((s, i) => (
                <li key={s.source} className="flex items-center gap-2">
                  <i className="size-2.5 shrink-0 rounded-full" style={{ background: SOURCE_COLORS[i % SOURCE_COLORS.length] }} />
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">{sourceLabel[s.source]}</span>
                  <span className="font-semibold">{s.count}</span>
                </li>
              ))}
            </ul>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-heading text-lg font-semibold"><Flame className="size-5 text-warning" /> SLA watch</h2>
            <Link href="/admin/leads?status=NEW" className="text-xs font-medium text-primary hover:underline">All new leads</Link>
          </div>
          {atRisk.length === 0 ? (
            <p className="rounded-xl bg-success/10 p-4 text-sm text-success">Every new lead has been answered. Nicely done.</p>
          ) : (
            <ul className="space-y-3">
              {atRisk.map((l) => (
                <li key={l.id}>
                  <Link href={`/admin/leads/${l.id}`} className="flex items-center gap-3 rounded-xl border border-border p-3 transition hover:border-primary/50 hover:bg-muted/50">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{l.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{l.broker || "Unassigned"}{l.property ? ` · ${l.property}` : ""}</p>
                    </div>
                    <div className="text-right text-xs">
                      <p className="text-muted-foreground">Respond in</p>
                      <Countdown to={l.slaDueAt} />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-6">
          <h2 className="mb-4 flex items-center gap-2 font-heading text-lg font-semibold">
            {isStaff ? <><Trophy className="size-5 text-accent" /> Broker leaderboard</> : <><Eye className="size-5 text-primary" /> Most viewed listings</>}
          </h2>
          {isStaff ? (
            <ul className="space-y-3">
              {leaderboard.slice(0, 6).map((b, i) => (
                <li key={b.id} className="flex items-center gap-3">
                  <span className="w-4 text-center text-xs font-bold text-muted-foreground">{i + 1}</span>
                  <Avatar name={b.name} src={b.photoUrl} size={36} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{b.name}</p>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted" title={`${b.open} of ${b.capacity} open`}>
                      <div className={cn("h-full rounded-full", b.open / b.capacity > 0.85 ? "bg-danger" : "bg-primary")} style={{ width: `${Math.min(100, (b.open / b.capacity) * 100)}%` }} />
                    </div>
                  </div>
                  <div className="text-right text-xs">
                    <p className="font-semibold">{b.won} won</p>
                    <p className="text-muted-foreground">{b.leads} leads{b.avgResponse != null ? ` · ${b.avgResponse}m` : ""}</p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <ul className="space-y-3">
              {topProperties.map((p) => (
                <li key={p.id} className="flex items-center gap-3">
                  <div className="relative size-12 shrink-0 overflow-hidden rounded-lg bg-muted">{p.image && <Image src={p.image} alt="" fill sizes="48px" className="object-cover" />}</div>
                  <p className="min-w-0 flex-1 truncate text-sm font-medium">{p.title}</p>
                  <Badge>{p.views} views</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-6">
          <h2 className="mb-4 font-heading text-lg font-semibold">Recent activity</h2>
          <ul className="space-y-4">
            {recent.map((a) => (
              <li key={a.id} className="flex gap-3">
                <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", a.type === "SLA_BREACH" || a.type === "ESCALATE" ? "bg-danger" : a.type === "REASSIGN" ? "bg-warning" : "bg-primary")} />
                <div className="min-w-0 text-sm">
                  <p className="line-clamp-2">
                    <Link href={`/admin/leads/${a.leadId}`} className="font-semibold hover:text-primary">{a.leadName}</Link>
                    <span className="text-muted-foreground"> · {a.note || a.type.toLowerCase()}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">{timeAgo(a.at)}</p>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {isStaff && topProperties.length > 0 && (
        <Card className="p-6">
          <h2 className="mb-4 flex items-center gap-2 font-heading text-lg font-semibold"><ShieldAlert className="hidden" /> <Eye className="size-5 text-primary" /> Most viewed listings</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {topProperties.map((p) => (
              <div key={p.id} className="overflow-hidden rounded-xl border border-border">
                <div className="relative aspect-[4/3] bg-muted">{p.image && <Image src={p.image} alt="" fill sizes="20vw" className="object-cover" />}</div>
                <div className="p-3">
                  <p className="line-clamp-1 text-sm font-medium">{p.title}</p>
                  <p className="text-xs text-muted-foreground">{p.views} views</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
