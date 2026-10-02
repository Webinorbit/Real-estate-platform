"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CalendarClock, CheckCircle2, Mail, MessageSquare, Phone, ShieldCheck, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Avatar } from "@/components/ui/misc";
import { LANGUAGES } from "@/lib/constants";
import { cn } from "@/lib/utils";

const MODES = [
  { value: "ENQUIRY", label: "Enquire", icon: MessageSquare },
  { value: "TOUR_BOOKING", label: "Book a visit", icon: CalendarClock },
  { value: "CALLBACK", label: "Call me", icon: Phone },
];

function nextSlots() {
  const out = [];
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 3);
  for (let i = 0; i < 8; i++) {
    const hour = d.getHours();
    if (hour >= 10 && hour <= 18) out.push(new Date(d));
    d.setHours(d.getHours() + 3);
    if (d.getHours() < 10) d.setHours(10);
  }
  return out.slice(0, 6);
}

export function LeadForm({ propertyId, propertyTitle, defaultMode = "ENQUIRY", source, compact = false, className }) {
  const [mode, setMode] = useState(source || defaultMode);
  const [step, setStep] = useState(1);
  const [values, setValues] = useState({ name: "", email: "", phone: "", message: "", language: "", preferredAt: "", website: "" });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);

  const set = (k) => (e) => {
    setValues((v) => ({ ...v, [k]: e.target.value }));
    setErrors((er) => ({ ...er, [k]: undefined }));
  };

  const validateStep1 = () => {
    const er = {};
    if (values.name.trim().length < 2) er.name = "Please enter your name";
    if (!/^\S+@\S+\.\S+$/.test(values.email)) er.email = "Enter a valid email";
    if (mode !== "ENQUIRY" && values.phone.replace(/\D/g, "").length < 7) er.phone = "A phone number helps us reach you";
    setErrors(er);
    return !Object.keys(er).length;
  };

  const next = (e) => {
    e.preventDefault();
    if (validateStep1()) setStep(2);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (mode === "TOUR_BOOKING" && !values.preferredAt) {
      setErrors({ preferredAt: "Pick a time that suits you" });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...values, propertyId: propertyId || null, source: mode === "ENQUIRY" && !propertyId ? "CONTACT" : mode }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.fields) {
          setErrors(data.fields);
          setStep(1);
        }
        throw new Error(data.error || "Something went wrong");
      }
      setDone(data);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className={cn("text-center", className)} role="status">
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 260, damping: 14, delay: 0.1 }} className="mx-auto mb-3 grid size-14 place-items-center rounded-full bg-success/15 text-success">
          <CheckCircle2 className="size-8" />
        </motion.div>
        <h3 className="font-heading text-2xl font-semibold">Request received</h3>
        {done.broker ? (
          <>
            <p className="mt-1 text-sm text-muted-foreground">We matched you with the advisor best placed to help.</p>
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }} className="mt-5 flex items-center gap-4 rounded-2xl border border-border bg-muted/50 p-4 text-left">
              <Avatar name={done.broker.name} src={done.broker.photoUrl} size={56} />
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-primary">Your advisor</p>
                <p className="truncate font-heading text-lg font-semibold">{done.broker.name}</p>
                <p className="truncate text-sm text-muted-foreground">{done.broker.title || "Property advisor"}</p>
                {done.broker.languages?.length > 0 && <p className="mt-0.5 truncate text-xs text-muted-foreground">Speaks {done.broker.languages.join(", ")}</p>}
              </div>
            </motion.div>
            <p className="mt-4 flex items-center justify-center gap-1.5 text-sm text-muted-foreground">
              <Sparkles className="size-4 text-accent" /> Expect a reply within {done.slaMinutes} minutes during working hours.
            </p>
            {done.broker.phone && (
              <a href={`tel:${done.broker.phone}`} className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline">
                <Phone className="size-4" /> {done.broker.phone}
              </a>
            )}
          </>
        ) : (
          <p className="mt-1 text-sm text-muted-foreground">Our team will be in touch shortly.</p>
        )}
      </motion.div>
    );
  }

  const slots = mode === "TOUR_BOOKING" ? nextSlots() : [];

  return (
    <div className={className}>
      <div role="tablist" aria-label="How can we help" className="mb-4 grid grid-cols-3 gap-1 rounded-xl bg-muted p-1">
        {MODES.map((m) => (
          <button
            key={m.value}
            type="button"
            role="tab"
            aria-selected={mode === m.value}
            onClick={() => {
              setMode(m.value);
              setStep(1);
            }}
            className={cn("flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-medium transition-all sm:text-sm", mode === m.value ? "bg-card shadow-soft" : "text-muted-foreground hover:text-foreground")}
          >
            <m.icon className="size-4" /> {m.label}
          </button>
        ))}
      </div>

      <div className="mb-3 flex items-center gap-2" aria-hidden>
        {[1, 2].map((s) => (
          <span key={s} className={cn("h-1 flex-1 rounded-full transition-colors", step >= s ? "bg-primary" : "bg-border")} />
        ))}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        {step === 1 ? (
          <motion.form key="s1" initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} onSubmit={next} className="space-y-3.5" noValidate>
            <Field label="Your name" error={errors.name} htmlFor="lf-name">
              <Input id="lf-name" autoComplete="name" value={values.name} onChange={set("name")} placeholder="Aarav Mehta" />
            </Field>
            <Field label="Email" error={errors.email} htmlFor="lf-email">
              <Input id="lf-email" type="email" autoComplete="email" value={values.email} onChange={set("email")} placeholder="you@example.com" />
            </Field>
            <Field label={mode === "ENQUIRY" ? "Phone (optional)" : "Phone"} error={errors.phone} htmlFor="lf-phone">
              <Input id="lf-phone" type="tel" autoComplete="tel" value={values.phone} onChange={set("phone")} placeholder="+91 98xxxxxx10" />
            </Field>
            <input tabIndex={-1} autoComplete="off" value={values.website} onChange={set("website")} className="hidden" aria-hidden />
            <Button type="submit" className="w-full">Continue</Button>
          </motion.form>
        ) : (
          <motion.form key="s2" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 16 }} onSubmit={submit} className="space-y-3.5" noValidate>
            {mode === "TOUR_BOOKING" && (
              <Field label="Preferred time" error={errors.preferredAt}>
                <div className="grid grid-cols-2 gap-2">
                  {slots.map((d) => {
                    const iso = d.toISOString();
                    const active = values.preferredAt === iso;
                    return (
                      <button
                        key={iso}
                        type="button"
                        aria-pressed={active}
                        onClick={() => setValues((v) => ({ ...v, preferredAt: iso }))}
                        className={cn("rounded-xl border px-3 py-2 text-left text-xs transition-all", active ? "border-primary bg-primary/10 font-semibold text-primary" : "border-input hover:border-foreground/40")}
                      >
                        <span className="block">{d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}</span>
                        <span className="text-muted-foreground">{d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</span>
                      </button>
                    );
                  })}
                </div>
              </Field>
            )}
            <Field label="Preferred language" hint="We route you to an advisor who speaks it." htmlFor="lf-lang">
              <Select id="lf-lang" value={values.language} onChange={set("language")}>
                <option value="">Any</option>
                {LANGUAGES.map((l) => (
                  <option key={l}>{l}</option>
                ))}
              </Select>
            </Field>
            <Field label="Message (optional)" htmlFor="lf-msg">
              <Textarea
                id="lf-msg"
                rows={3}
                value={values.message}
                onChange={set("message")}
                placeholder={propertyTitle ? `I'm interested in ${propertyTitle}…` : "Tell us what you are looking for…"}
              />
            </Field>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setStep(1)}>Back</Button>
              <Button type="submit" loading={busy} className="flex-1">
                <Mail className="size-4" /> {mode === "TOUR_BOOKING" ? "Confirm visit" : mode === "CALLBACK" ? "Request call" : "Send enquiry"}
              </Button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      {!compact && (
        <p className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground">
          <ShieldCheck className="size-3.5" /> Your details go only to the advisor assigned to you.
        </p>
      )}
    </div>
  );
}
