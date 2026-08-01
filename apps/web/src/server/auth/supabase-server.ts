import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { authCookiePolicy } from "./session-cookie";

interface CookieRecord {
  name: string;
  value: string;
}

export interface ServerCookieStore {
  getAll(): CookieRecord[];
  set(name: string, value: string, options: CookieOptions): void;
}

export function createSupabaseBffClient({
  url,
  publishableKey,
  cookies,
}: {
  url: string;
  publishableKey: string;
  cookies: ServerCookieStore;
}) {
  if (!/^https?:\/\//.test(url) || publishableKey.length < 20) {
    throw new Error("Supabase public server configuration is invalid.");
  }

  return createServerClient(url, publishableKey, {
    cookieOptions: authCookiePolicy,
    cookies: {
      getAll: () => cookies.getAll(),
      setAll: (updates) => {
        for (const update of updates) {
          cookies.set(update.name, update.value, {
            ...update.options,
            httpOnly: true,
            secure: true,
            sameSite: "lax",
            path: "/",
          });
        }
      },
    },
  });
}
