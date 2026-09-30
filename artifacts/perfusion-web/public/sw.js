const CACHE_NAME = "perfusion-v1";
let callbackInstallationId = null;
const appBasePath = new URL(self.registration.scope).pathname.replace(/\/$/, "");
const caseFilePath = (bookingId) =>
  `${appBasePath}/case-file/${encodeURIComponent(bookingId)}`;

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SET_CALLBACK_INSTALLATION_ID" && typeof event.data.installationId === "string") {
    callbackInstallationId = event.data.installationId;
  }
});

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    console.error("[SW] Failed to parse push payload");
    return;
  }

  const { type, title, body, bookingId, sessionGeneration, callerName, videoRoomUrl, recipientRole } = payload;

  if (type === "callback_device_reminder") {
    if (!bookingId) return;
    const caseFileUrl = caseFilePath(bookingId);
    event.waitUntil(self.registration.showNotification(title || "Call-back device confirmation due", {
      body: body || "Please confirm the consultation call-back device.",
      icon: "/favicon.png",
      badge: "/favicon.png",
      tag: `callback-device-${bookingId}`,
      renotify: false,
      data: { type, bookingId, url: caseFileUrl },
    }));
    return;
  }

  if (type === "incoming_call") {
    if (!bookingId || !sessionGeneration) {
      console.warn("[SW] Ignoring incoming call without a session generation");
      return;
    }
    // Derive returnTo based on recipient's role so they land on the right portal page
    const returnTo = recipientRole === "provider" ? "/provider/bookings" : "/user/orders";
    const notificationOptions = {
      body: body || `${callerName} is calling`,
      icon: "/favicon.png",
      badge: "/favicon.png",
      tag: `call-${bookingId}`,
      renotify: false,
      silent: false,
      requireInteraction: true,
      vibrate: [300, 100, 300, 100, 300, 100, 300],
      data: {
        type,
        bookingId,
        sessionGeneration,
        callerName,
        callerRole: payload.callerRole,
        videoRoomUrl,
        mediaProvider: payload.mediaProvider,
        serviceName: payload.serviceName,
        callType: payload.callType,
        installationId: payload.installationId || payload.callbackInstallationId || callbackInstallationId,
        url: `/video/${encodeURIComponent(videoRoomUrl)}?returnTo=${returnTo}&accepted=true&sessionGeneration=${encodeURIComponent(sessionGeneration)}`,
      },
      actions: [
        { action: "accept", title: "Accept" },
        { action: "decline", title: "Decline" },
      ],
    };

    event.waitUntil((async () => {
      // A push can arrive after the caller hung up or after a newer session
      // replaced it. Verify the server's current generation before ringing.
      const statusResponse = await fetch(`/api/call/status/${encodeURIComponent(bookingId)}`, {
        credentials: "include",
        cache: "no-store",
      });
      if (!statusResponse.ok) return;
      const currentSession = await statusResponse.json();
      if (currentSession?.status !== "ringing" || currentSession.sessionGeneration !== sessionGeneration) {
        return;
      }

      // Show one notification for the currently ringing generation.
      await self.registration.showNotification(title || "Perfusion", notificationOptions);

      // Also message open pages so they can display their incoming-call UI.
      const openClients = await clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of openClients) {
        client.postMessage({
          type: "INCOMING_CALL",
          bookingId,
          sessionGeneration,
          callerName,
          callerRole: payload.callerRole,
          videoRoomUrl,
          mediaProvider: payload.mediaProvider,
          callType: payload.callType,
          serviceName: payload.serviceName,
          subtitle: payload.subtitle,
        });
      }
    })());
    return;
  }

  if (
    bookingId &&
    sessionGeneration &&
    ["call_accepted", "call_declined", "call_timeout", "call_cancelled", "call_ended"].includes(type)
  ) {
    // Acceptance, hang-up, timeout, or cancellation on another device must
    // remove only the notification belonging to this exact call generation.
    event.waitUntil(
      self.registration.getNotifications({ tag: `call-${bookingId}` }).then((notifications) => {
        notifications.forEach((notification) => {
          if (notification.data?.sessionGeneration === sessionGeneration) {
            notification.close();
          }
        });
      })
    );
  }
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const { bookingId, sessionGeneration, videoRoomUrl, url } = data;
  const installationId = data.installationId || callbackInstallationId;

  if (data.type === "callback_device_reminder") {
    const targetUrl = url || (bookingId ? caseFilePath(bookingId) : `${appBasePath}/user/orders`);
    event.waitUntil((async () => {
      const allClients = await clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of allClients) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(targetUrl);
    })());
    return;
  }

  if (event.action === "decline" && bookingId && sessionGeneration) {
    // Bind the action to the generation that created this notification.
    event.waitUntil(
      fetch(`/api/call/decline/${bookingId}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionGeneration, ...(installationId ? { installationId } : {}) }),
      }).then((response) => {
        if (!response.ok) console.info("[SW] Ignored stale incoming-call decline", bookingId);
      }).catch((error) => console.error("[SW] Could not decline incoming call", error))
    );
    return;
  }

  // Accept or click — open the video room
  const targetUrl = url || "/user/orders";

  event.waitUntil(
    (async () => {
      // Accept the call first
      if (bookingId && sessionGeneration) {
        const response = await fetch(`/api/call/accept/${bookingId}`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionGeneration, ...(installationId ? { installationId } : {}) }),
        });
        if (!response.ok) {
          console.info("[SW] Ignored stale incoming-call accept", bookingId);
          const openClients = await clients.matchAll({ type: "window", includeUncontrolled: true });
          openClients.forEach((client) => client.postMessage({ type: "CALL_ACTION_REJECTED", bookingId, sessionGeneration }));
          return;
        }
      }

      // Focus existing window or open new one
      const allClients = await clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of allClients) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })()
  );
});

self.addEventListener("notificationclose", (event) => {
  // Notification dismissed without action — treat as decline
  const data = event.notification.data || {};
  const { bookingId, sessionGeneration, type } = data;
  if (type === "incoming_call" && bookingId && sessionGeneration) {
    event.waitUntil(fetch(`/api/call/decline/${bookingId}`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionGeneration,
        ...((data.installationId || callbackInstallationId)
          ? { installationId: data.installationId || callbackInstallationId }
          : {}),
      }),
    }).catch((error) => console.error("[SW] Could not decline dismissed incoming call", error)));
  }
});
