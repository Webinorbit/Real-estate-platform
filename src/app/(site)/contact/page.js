import { Clock, Mail, MapPin, MessageCircle, Phone } from "lucide-react";
import { getTenant } from "@/lib/tenant";
import { Card } from "@/components/ui/misc";
import { LeadForm } from "@/components/site/lead-form";
import { Reveal } from "@/components/site/motion";

export const metadata = { title: "Talk to an advisor", description: "Tell us what you are looking for and we will match you with the right advisor." };

function Row({ icon: Icon, label, value, href }) {
  if (!value) return null;
  const body = (
    <span className="flex items-start gap-4">
      <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Icon className="size-5" /></span>
      <span>
        <span className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
        <span className="font-medium">{value}</span>
      </span>
    </span>
  );
  return href ? <a href={href} className="block rounded-xl transition-colors hover:text-primary">{body}</a> : <div>{body}</div>;
}

export default async function ContactPage() {
  const tenant = await getTenant();
  const wa = tenant.whatsapp?.replace(/\D/g, "");
  return (
    <div className="mx-auto max-w-6xl px-4 pb-24 pt-28 sm:px-6">
      <div className="grid gap-12 lg:grid-cols-[1fr_26rem]">
        <Reveal>
          <p className="mb-2 text-sm font-semibold uppercase tracking-[0.18em] text-primary">Contact</p>
          <h1 className="font-heading text-4xl font-semibold sm:text-5xl">Let us find your next address</h1>
          <p className="mt-4 max-w-xl text-muted-foreground">Share a little about what you need. We match you with the advisor who speaks your language and knows your neighbourhood best, usually within minutes.</p>
          <div className="mt-10 space-y-6">
            <Row icon={Phone} label="Call" value={tenant.contactPhone} href={tenant.contactPhone ? `tel:${tenant.contactPhone}` : undefined} />
            <Row icon={MessageCircle} label="WhatsApp" value={tenant.whatsapp} href={wa ? `https://wa.me/${wa}` : undefined} />
            <Row icon={Mail} label="Email" value={tenant.contactEmail} href={tenant.contactEmail ? `mailto:${tenant.contactEmail}` : undefined} />
            <Row icon={MapPin} label="Office" value={tenant.address} />
            <Row icon={Clock} label="Hours" value="Mon–Fri 9:00–19:00 · Sat 10:00–17:00" />
          </div>
        </Reveal>
        <Reveal delay={0.1}>
          <Card className="p-6 lg:sticky lg:top-24">
            <h2 className="mb-4 font-heading text-xl font-semibold">Send us a message</h2>
            <LeadForm defaultMode="CALLBACK" />
          </Card>
        </Reveal>
      </div>
    </div>
  );
}
