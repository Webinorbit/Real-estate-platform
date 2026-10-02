import {
  Playfair_Display,
  Cormorant_Garamond,
  Fraunces,
  Manrope,
  Poppins,
  Inter,
  DM_Sans,
} from "next/font/google";

// next/font requires each loader call to be a top-level const.
const playfair = Playfair_Display({ subsets: ["latin"], display: "swap", preload: false, variable: "--font-playfair" });
const cormorant = Cormorant_Garamond({ subsets: ["latin"], display: "swap", preload: false, weight: ["400", "500", "600", "700"], variable: "--font-cormorant" });
const fraunces = Fraunces({ subsets: ["latin"], display: "swap", preload: false, variable: "--font-fraunces" });
const manrope = Manrope({ subsets: ["latin"], display: "swap", preload: false, variable: "--font-manrope" });
const poppins = Poppins({ subsets: ["latin"], display: "swap", preload: false, weight: ["400", "500", "600", "700"], variable: "--font-poppins" });
const inter = Inter({ subsets: ["latin"], display: "swap", preload: false, variable: "--font-inter" });
const dmsans = DM_Sans({ subsets: ["latin"], display: "swap", preload: false, variable: "--font-dmsans" });

const loaders = { playfair, cormorant, fraunces, manrope, poppins, inter, dmsans };

/** Only the two fonts a tenant selected are applied, so other fonts are never downloaded. */
export function fontClassFor(...keys) {
  const used = new Set(keys.filter((k) => loaders[k]));
  if (!used.size) used.add("inter");
  return [...used].map((k) => loaders[k].variable).join(" ");
}
