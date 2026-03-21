export const WELCOME_ROUTE = "/welcome";

export function shouldWaitOnStartupRace(input: {
  onlineServerId: string | null;
  hasTimedOut: boolean;
  isDesktopStartupRace: boolean;
  daemonCount: number;
  pathname: string;
}): boolean {
  if (input.onlineServerId) {
    return false;
  }
  if (input.pathname === WELCOME_ROUTE) {
    return false;
  }
  if (input.hasTimedOut) {
    return false;
  }
  return input.isDesktopStartupRace || input.daemonCount > 0;
}

export function shouldRedirectToWelcome(input: {
  onlineServerId: string | null;
  hasTimedOut: boolean;
  pathname: string;
  isDesktopStartupRace: boolean;
  daemonCount: number;
}): boolean {
  if (input.onlineServerId || !input.hasTimedOut) {
    return false;
  }
  if (input.pathname !== "/" && input.pathname !== "") {
    return false;
  }
  return input.isDesktopStartupRace || input.daemonCount > 0;
}
