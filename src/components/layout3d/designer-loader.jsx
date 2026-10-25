"use client";

import dynamic from "next/dynamic";
import { BrandLoader } from "@/components/brand-loader";

// three.js only runs in the browser: load the designer client-side, with the brand loader meanwhile.
const Designer = dynamic(() => import("@/components/layout3d/designer"), {
  ssr: false,
  loading: () => <BrandLoader label="Building 3D layout" />,
});

export function DesignerLoader(props) {
  return <Designer {...props} />;
}
