import { cookies } from "next/headers";

/** The visitor's chosen city from the location picker's cookie ("" = all cities). Server components only. */
export async function chosenCity() {
  try {
    return decodeURIComponent((await cookies()).get("loc_city")?.value || "").trim().slice(0, 80);
  } catch {
    return "";
  }
}
