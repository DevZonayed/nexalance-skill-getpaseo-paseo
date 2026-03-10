import { useEffect, useMemo } from "react";
import { useLocalSearchParams, usePathname, useRouter } from "expo-router";
import { useDaemonRegistry } from "@/contexts/daemon-registry-context";
import { useFormPreferences } from "@/hooks/use-form-preferences";
import { buildHostRootRoute } from "@/utils/host-routes";
import { StartupSplashScreen } from "@/screens/startup-splash-screen";
import { WelcomeScreen } from "@/components/welcome-screen";

export default function Index() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useLocalSearchParams<{ serverId?: string }>();
  const { daemons, isLoading: registryLoading, isReconciling } = useDaemonRegistry();
  const { preferences, isLoading: preferencesLoading } = useFormPreferences();
  const requestedServerId = useMemo(() => {
    return typeof params.serverId === "string" ? params.serverId.trim() : "";
  }, [params.serverId]);

  const targetServerId = useMemo(() => {
    if (daemons.length === 0) {
      return null;
    }
    if (requestedServerId) {
      const requested = daemons.find(
        (daemon) => daemon.serverId === requestedServerId
      );
      if (requested) {
        return requested.serverId;
      }
    }
    if (preferences.serverId) {
      const match = daemons.find((daemon) => daemon.serverId === preferences.serverId);
      if (match) {
        return match.serverId;
      }
    }
    return daemons[0]?.serverId ?? null;
  }, [daemons, preferences.serverId, requestedServerId]);

  useEffect(() => {
    if (registryLoading || preferencesLoading) {
      return;
    }
    if (!targetServerId) {
      return;
    }
    if (pathname !== "/" && pathname !== "") {
      return;
    }
    router.replace(buildHostRootRoute(targetServerId) as any);
  }, [pathname, preferencesLoading, registryLoading, router, targetServerId]);

  if (registryLoading || preferencesLoading) {
    return <StartupSplashScreen />;
  }

  if (!targetServerId) {
    if (isReconciling) {
      return <StartupSplashScreen />;
    }
    return <WelcomeScreen />;
  }

  return null;
}
