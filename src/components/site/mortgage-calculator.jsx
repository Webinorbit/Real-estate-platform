"use client";

import { useMemo, useState } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card } from "@/components/ui/misc";
import { RangeSlider } from "@/components/ui/controls";
import { formatMoneyFull, formatPriceCompact, monthlyEmi } from "@/lib/format";

function SliderRow({ label, value, display, children }) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-semibold">{display}</span>
      </div>
      {children}
    </div>
  );
}

export function MortgageCalculator({ price, currency = "INR", locale = "en-IN" }) {
  const [downPct, setDownPct] = useState(20);
  const [rate, setRate] = useState(8.5);
  const [years, setYears] = useState(20);

  const { principal, emi, total, interest, series } = useMemo(() => {
    const principal = Math.round(price * (1 - downPct / 100));
    const emi = monthlyEmi(principal, rate, years);
    const total = emi * years * 12;
    const r = rate / 12 / 100;
    let balance = principal;
    const series = [{ year: 0, balance: principal, paid: 0 }];
    let paid = 0;
    for (let m = 1; m <= years * 12; m++) {
      const interestPart = balance * r;
      const principalPart = emi - interestPart;
      balance = Math.max(0, balance - principalPart);
      paid += emi;
      if (m % 12 === 0) series.push({ year: m / 12, balance: Math.round(balance), paid: Math.round(paid) });
    }
    return { principal, emi, total, interest: total - principal, series };
  }, [price, downPct, rate, years]);

  const principalShare = total ? (principal / total) * 100 : 100;

  return (
    <Card className="p-6">
      <div className="grid gap-8 lg:grid-cols-[1fr_1.1fr]">
        <div className="space-y-6">
          <SliderRow label="Down payment" display={`${downPct}% · ${formatPriceCompact(price * (downPct / 100), currency)}`}>
            <RangeSlider min={5} max={80} step={1} value={[downPct]} onValueChange={([v]) => setDownPct(v)} label="Down payment percent" />
          </SliderRow>
          <SliderRow label="Interest rate" display={`${rate.toFixed(1)}% p.a.`}>
            <RangeSlider min={3} max={14} step={0.1} value={[rate]} onValueChange={([v]) => setRate(Number(v.toFixed(1)))} label="Interest rate" />
          </SliderRow>
          <SliderRow label="Loan tenure" display={`${years} years`}>
            <RangeSlider min={5} max={30} step={1} value={[years]} onValueChange={([v]) => setYears(v)} label="Loan tenure in years" />
          </SliderRow>
        </div>

        <div>
          <p className="text-sm text-muted-foreground">Estimated monthly EMI</p>
          <p className="font-heading text-4xl font-semibold text-primary" aria-live="polite">
            {formatMoneyFull(Math.round(emi), currency, locale)}
          </p>
          <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-accent/60" role="img" aria-label={`Principal ${principalShare.toFixed(0)} percent, interest ${(100 - principalShare).toFixed(0)} percent`}>
            <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${principalShare}%` }} />
          </div>
          <div className="mt-2 flex justify-between text-xs text-muted-foreground">
            <span><i className="mr-1.5 inline-block size-2 rounded-full bg-primary" />Principal {formatPriceCompact(principal, currency)}</span>
            <span><i className="mr-1.5 inline-block size-2 rounded-full bg-accent" />Interest {formatPriceCompact(interest, currency)}</span>
          </div>
          <div className="mt-4 h-36">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="bal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="year" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}y`} />
                <YAxis hide />
                <Tooltip
                  formatter={(v) => [formatPriceCompact(v, currency), "Outstanding"]}
                  labelFormatter={(l) => `After ${l} years`}
                  contentStyle={{ borderRadius: 12, border: "1px solid var(--border)", background: "var(--card)", color: "var(--foreground)", fontSize: 12 }}
                />
                <Area type="monotone" dataKey="balance" stroke="var(--primary)" strokeWidth={2.5} fill="url(#bal)" animationDuration={500} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Outstanding loan balance over time. Indicative only; actual terms depend on your lender.</p>
        </div>
      </div>
    </Card>
  );
}
