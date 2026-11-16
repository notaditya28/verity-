import "server-only";
import { cookies } from "next/headers";

export type UiRole = "creator" | "manager";
export const ROLE_COOKIE = "verity_role";

/** Demo "auth": the role comes from a cookie set by the header switcher. No login by design. */
export async function getRole(): Promise<UiRole> {
  const store = await cookies();
  return store.get(ROLE_COOKIE)?.value === "manager" ? "manager" : "creator";
}
