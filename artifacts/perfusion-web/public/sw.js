const CACHE_NAME = "perfusion-v1";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(clients.claim());
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

  const { type, title, body, bookingId, callerName, videoRoomUrl, recipientRole } = payload;

  if (type === "incoming_call") {
    // Derive returnTo based on recipient's role so they land on the right portal page
    const returnTo = recipientRole === "provider" ? "/provider/bookings" : "/user/orders";
    const notificationOptions = {
      body: body || `${callerName} is calling`,
      icon: "/favicon.png",
      badge: "/favicon.png",
      tag: `call-${bookingId}`,
      renotify: true,
      silent: false,
      requireInteraction: true,
      vibrate: [300, 100, 300, 100, 300, 100, 300],
      data: {
        type,
        bookingId,
        callerName,
        callerRole: payload.callerRole,
        videoRoomUrl,
        serviceName: payload.serviceName,
        url: `/video/${encodeURIComponent(videoRoomUrl)}?returnTo=${returnTo}&accepted=true`,
      },
      actions: [
        { action: "accept", title: "Accept" },
        { action: "decline", title: "Decline" },
      ],
    };

    event.waitUntil(
      Promise.all([
        // Show the notification (triggers OS sound + vibration)
        self.registration.showNotification(title || "Perfusion", notificationOptions),
        // Also message any open page clients so the in-app overlay + ringtone
        // can fire the moment the user brings the app to the foreground
        clients.matchAll({ type: "window", includeUncontrolled: true }).then((openClients) => {
          for (const client of openClients) {
            client.postMessage({
              type: "INCOMING_CALL",
              bookingId,
              callerName,
              callerRole: payload.callerRole,
              videoRoomUrl,
              serviceName: payload.serviceName,
              subtitle: payload.subtitle,
            });
          }
        }),
      ])
    );
  }
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const { bookingId, videoRoomUrl, url } = data;

  if (event.action === "decline" && bookingId) {
    // Decline — send API call and close notification
    event.waitUntil(
      fetch(`/api/call/decline/${bookingId}`, {
        method: "POST",
        credentials: "include",
      }).catch(() => {})
    );
    return;
  }

  // Accept or click — open the video room
  const targetUrl = url || "/user/orders";

  event.waitUntil(
    (async () => {
      // Accept the call first
      if (bookingId) {
        await fetch(`/api/call/accept/${bookingId}`, {
          method: "POST",
          credentials: "include",
        }).catch(() => {});
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
  const { bookingId, type } = data;
  if (type === "incoming_call" && bookingId) {
    fetch(`/api/call/decline/${bookingId}`, {
      method: "POST",
      credentials: "include",
    }).catch(() => {});
  }
});
