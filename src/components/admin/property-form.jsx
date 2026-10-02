"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Save } from "lucide-react";
import { saveProperty } from "@/app/admin/(panel)/properties/actions";
import { ImageListField } from "@/components/admin/image-uploader";
import { LocationPicker } from "@/components/admin/location-picker";
import { Button } from "@/components/ui/button";
import { Chip, Field, Input, Select, SegmentedControl, Textarea } from "@/components/ui/form";
import { Switch } from "@/components/ui/controls";
import { Card } from "@/components/ui/misc";
import { AMENITIES, PROPERTY_STATUSES, PROPERTY_TYPES } from "@/lib/constants";
import { titleCase } from "@/lib/format";

function Section({ title, description, children }) {
  return (
    <Card className="p-5 sm:p-6">
      <h2 className="font-heading text-xl font-semibold">{title}</h2>
      {description && <p className="mb-4 mt-0.5 text-sm text-muted-foreground">{description}</p>}
      <div className={description ? "" : "mt-4"}>{children}</div>
    </Card>
  );
}

export function PropertyForm({ id, initial, brokers, tenant }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [v, setV] = useState(initial);
  const [errors, setErrors] = useState({});
  const set = (patch) => setV((cur) => ({ ...cur, ...patch }));
  const bind = (key) => ({ value: v[key] ?? "", onChange: (e) => set({ [key]: e.target.value }) });
  const rent = v.listingType === "RENT";

  const submit = (e) => {
    e.preventDefault();
    const next = {};
    if (v.title.trim().length < 3) next.title = "Give the listing a title";
    if (!Number(v.price)) next.price = "Enter a price";
    if (!v.locality.trim()) next.locality = "Required";
    if (!v.city.trim()) next.city = "Required";
    setErrors(next);
    if (Object.keys(next).length) {
      toast.error("Please fix the highlighted fields");
      document.querySelector("[data-invalid='true']")?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    start(async () => {
      const res = await saveProperty(id || null, { ...v, listingBrokerId: v.listingBrokerId || null });
      if (!res.ok) return toast.error(res.error);
      toast.success(id ? "Property saved" : "Property created");
      if (!id) router.replace(`/admin/properties/${res.id}`);
      else router.refresh();
    });
  };

  const inv = (key) => ({ "data-invalid": errors[key] ? "true" : undefined, "aria-invalid": Boolean(errors[key]) });

  return (
    <form onSubmit={submit} className="space-y-5">
      <Section title="Basics">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Title" error={errors.title} className="sm:col-span-2">
            <Input {...bind("title")} {...inv("title")} placeholder="e.g. Skyline Residences 3 BHK with sea view" maxLength={140} />
          </Field>
          <Field label="Listing type">
            <SegmentedControl value={v.listingType} onChange={(listingType) => set({ listingType })} options={[{ value: "SALE", label: "For sale" }, { value: "RENT", label: "For rent" }]} />
          </Field>
          <Field label="Property type">
            <Select {...bind("type")}>
              {PROPERTY_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </Select>
          </Field>
          <Field label={rent ? `Rent (${tenant.currency})` : `Price (${tenant.currency})`} error={errors.price}>
            <Input type="number" min="0" inputMode="numeric" {...bind("price")} {...inv("price")} placeholder={rent ? "85000" : "25000000"} />
          </Field>
          {rent ? (
            <Field label="Rent period">
              <Select {...bind("priceUnit")}>
                <option value="month">per month</option>
                <option value="week">per week</option>
                <option value="day">per day</option>
                <option value="year">per year</option>
              </Select>
            </Field>
          ) : (
            <Field label="Status">
              <Select {...bind("status")}>
                {PROPERTY_STATUSES.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}
              </Select>
            </Field>
          )}
          {rent && (
            <Field label="Status">
              <Select {...bind("status")}>
                {PROPERTY_STATUSES.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}
              </Select>
            </Field>
          )}
          <Field label="Listing agent" hint="Used by the ‘Listing agent first’ routing strategy.">
            <Select {...bind("listingBrokerId")}>
              <option value="">No dedicated agent</option>
              {brokers.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
          </Field>
          <div className="flex items-center sm:col-span-2">
            <Switch id="featured" checked={v.featured} onCheckedChange={(featured) => set({ featured })} label="Feature on the home page" />
          </div>
        </div>
      </Section>

      <Section title="Description">
        <Textarea rows={7} {...bind("description")} placeholder="Tell buyers what makes this property special: layout, views, neighbourhood, finishes…" maxLength={10000} />
      </Section>

      <Section title="Specifications">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Field label="Bedrooms"><Input type="number" min="0" {...bind("beds")} /></Field>
          <Field label="Bathrooms"><Input type="number" min="0" {...bind("baths")} /></Field>
          <Field label={`Area (${tenant.areaUnit})`}><Input type="number" min="0" {...bind("areaSqft")} /></Field>
          <Field label="Parking spots"><Input type="number" min="0" {...bind("parking")} /></Field>
          <Field label="Year built"><Input type="number" min="1800" max="2100" {...bind("yearBuilt")} /></Field>
          <Field label="Floor"><Input type="number" min="0" {...bind("floor")} /></Field>
          <Field label="Total floors"><Input type="number" min="0" {...bind("totalFloors")} /></Field>
          <Field label="Furnishing">
            <Select {...bind("furnishing")}>
              <option value="">Not specified</option>
              <option>Unfurnished</option>
              <option>Semi-furnished</option>
              <option>Fully furnished</option>
            </Select>
          </Field>
          <Field label="Facing">
            <Select {...bind("facing")}>
              <option value="">Not specified</option>
              {["North", "South", "East", "West", "North-East", "North-West", "South-East", "South-West"].map((d) => <option key={d}>{d}</option>)}
            </Select>
          </Field>
        </div>
      </Section>

      <Section title="Location" description="Drop the pin exactly where the property is. This is what buyers see on the search map.">
        <div className="mb-4 grid gap-4 sm:grid-cols-2">
          <Field label="Street address" className="sm:col-span-2"><Input {...bind("address")} placeholder="Building / street" /></Field>
          <Field label="Locality" error={errors.locality}><Input {...bind("locality")} {...inv("locality")} placeholder="Bandra West" /></Field>
          <Field label="City" error={errors.city}><Input {...bind("city")} {...inv("city")} placeholder="Mumbai" /></Field>
          <Field label="State"><Input {...bind("state")} /></Field>
          <Field label="Postal code"><Input {...bind("postalCode")} /></Field>
        </div>
        <LocationPicker lat={Number(v.lat)} lng={Number(v.lng)} zoom={Number(v.lat) === tenant.mapLat ? tenant.mapZoom : 15} onChange={({ lat, lng }) => set({ lat, lng })} />
      </Section>

      <Section title="Amenities">
        <div className="flex flex-wrap gap-2">
          {AMENITIES.map((a) => (
            <Chip key={a} active={v.amenities.includes(a)} onClick={() => set({ amenities: v.amenities.includes(a) ? v.amenities.filter((x) => x !== a) : [...v.amenities, a] })}>
              {a}
            </Chip>
          ))}
        </div>
      </Section>

      <Section title="Photos" description="Drag to reorder. The first photo is the cover shown on cards and the map.">
        <ImageListField value={v.images} onChange={(images) => set({ images })} />
        <Field label="Video link (optional)" hint="A YouTube or Vimeo URL shown on the property page." className="mt-5">
          <Input type="url" {...bind("videoUrl")} placeholder="https://" />
        </Field>
      </Section>

      <div className="sticky bottom-3 z-30 flex items-center justify-between gap-3 rounded-2xl border border-border bg-background/90 px-4 py-3 shadow-lift backdrop-blur-md">
        <Link href="/admin/properties" className="text-sm text-muted-foreground hover:text-foreground">← Back to properties</Link>
        <Button type="submit" loading={pending}><Save className="size-4" /> {id ? "Save changes" : "Create property"}</Button>
      </div>
    </form>
  );
}
