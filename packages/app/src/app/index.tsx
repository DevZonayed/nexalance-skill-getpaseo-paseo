import { useEffect } from "react";
import { usePathname, useRouter } from "expo-router";

const WELCOME_ROUTE = "/welcome";

export default function Index() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (pathname !== "/" && pathname !== "") {
      return;
    }
    router.replace(WELCOME_ROUTE as any);
  }, [pathname, router]);

  return null;
}
