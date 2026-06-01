import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";

interface UserInfo {
  id: string;
  role: string;
  approvalStatus?: string;
  requiresAgreement?: boolean;
}

/**
 * AgreementGate is a route guard. When the authenticated user still needs to
 * accept the current agreement version (signalled by `requiresAgreement` on
 * /api/auth/user), it redirects them to the dedicated `/agreement` page and
 * keeps them there until they have signed. It never renders the agreement UI
 * itself — that lives on the route-accessible `/agreement` page.
 */
export function AgreementGate({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();

  const { data: user } = useQuery<UserInfo | null>({
    queryKey: ["/api/auth/user"],
    retry: false,
  });

  useEffect(() => {
    if (user && user.requiresAgreement && location !== "/agreement") {
      setLocation("/agreement");
    }
  }, [user, location, setLocation]);

  return <>{children}</>;
}
