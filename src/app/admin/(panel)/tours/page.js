import Image from "next/image";
import Link from "next/link";
import { ExternalLink, Layers, View } from "lucide-react";
import { adminContext } from "@/lib/admin";
import { api } from "@/lib/api";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/misc";
import { NewTourDialog } from "@/components/admin/new-tour-dialog";

export const metadata = { title: "Virtual tours" };

export default async function ToursAdminPage({ searchParams }) {
  const sp = await searchParams;
  await adminContext({ staffOnly: true, feature: "tours" });
  const { tours, properties, defaultPropertyId: validDefault } = await api("/api/admin/tours", { query: { property: typeof sp.property === "string" ? sp.property : undefined } });

  return (
    <div>
      <PageHeader title="Virtual tours" description="Immersive 360° walk-throughs that turn browsers into viewers." actions={<NewTourDialog properties={properties} defaultPropertyId={validDefault} defaultOpen={Boolean(validDefault)} />} />
      {tours.length === 0 ? (
        <EmptyState icon={View} title="No tours yet" description="Create your first tour from a property. Upload 360° photos and connect rooms with arrows." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {tours.map((t) => {
            const cover = t.scenes[0]?.thumbUrl || t.scenes[0]?.panoramaUrl;
            return (
              <Card key={t.id} className="group overflow-hidden transition hover:-translate-y-0.5 hover:shadow-lift">
                <Link href={`/admin/tours/${t.id}`} className="block">
                  <div className="relative aspect-[16/9] bg-muted">
                    {cover ? <Image src={cover} alt="" fill sizes="400px" className="object-cover transition duration-500 group-hover:scale-105" /> : <div className="grid h-full place-items-center text-muted-foreground"><View className="size-8" /></div>}
                    <div className="absolute left-3 top-3 flex gap-1.5">
                      <Badge tone={t.published ? "success" : "dark"}>{t.published ? "Published" : "Draft"}</Badge>
                      {t.kind === "EXTERNAL" && <Badge tone="light"><ExternalLink className="size-3" /> External</Badge>}
                    </div>
                  </div>
                  <div className="p-4">
                    <p className="truncate font-semibold group-hover:text-primary">{t.title}</p>
                    <p className="truncate text-sm text-muted-foreground">{t.property.title} · {t.property.locality}</p>
                    <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground"><Layers className="size-3.5" /> {t.kind === "EXTERNAL" ? "Hosted elsewhere" : `${t._count.scenes} scene${t._count.scenes === 1 ? "" : "s"}`}</p>
                  </div>
                </Link>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
