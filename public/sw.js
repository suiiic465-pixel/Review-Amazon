// Native Service Worker for Web Push notifications
self.addEventListener("push", function (event) {
  let payload = { title: "Secret System Notification", body: "" };
  if (event.data) {
    try {
      payload = event.data.json();
    } catch (e) {
      payload = { title: "Secret System Notification", body: event.data.text() };
    }
  }

  const options = {
    body: payload.body,
    vibrate: [200, 100, 200],
    data: {
      url: "/"
    },
    actions: []
  };

  event.waitUntil(
    self.registration.showNotification(payload.title, options)
  );
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (clientList) {
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        if (client.url && "focus" in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow("/");
      }
    })
  );
});
