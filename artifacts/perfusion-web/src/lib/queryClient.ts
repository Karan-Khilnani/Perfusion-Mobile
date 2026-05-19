import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    if (res.status === 403) {
      try {
        const data = JSON.parse(text);
        if (data.needsApproval) {
          window.location.href = "/pending-approval";
          return;
        }
        if (data.needsVerification) {
          window.location.href = "/verify-email";
          return;
        }
        if (data.registrationRejected) {
          window.location.href = "/pending-approval";
          return;
        }
        if (data.message) {
          throw new Error(data.message);
        }
      } catch (e) {
        if (e instanceof Error) throw e;
      }
    }
    try {
      const data = JSON.parse(text);
      if (data.message) throw new Error(data.message);
    } catch (e) {
      if (e instanceof Error) throw e;
    }
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const res = await fetch(url, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    if (res.status === 403) {
      const text = await res.text();
      try {
        const data = JSON.parse(text);
        if (data.needsApproval) {
          window.location.href = "/pending-approval";
          return null;
        }
        if (data.needsVerification) {
          window.location.href = "/verify-email";
          return null;
        }
        if (data.registrationRejected) {
          window.location.href = "/pending-approval";
          return null;
        }
        if (data.message) throw new Error(data.message);
      } catch (e) {
        if (e instanceof Error) throw e;
      }
      throw new Error(`403: ${text}`);
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
