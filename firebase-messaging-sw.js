importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey:            "AIzaSyA471HhqxfeT2Evrt9tzYasm04X6Fzd_-k",
  authDomain:        "dpoyo-e0a5a.firebaseapp.com",
  projectId:         "dpoyo-e0a5a",
  storageBucket:     "dpoyo-e0a5a.firebasestorage.app",
  messagingSenderId: "746211541880",
  appId:             "1:746211541880:web:4720a4527b7e0beb387e8d",
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title || "D'Poyo";
  const body  = payload.notification?.body  || "¡Tienes un mensaje de D'Poyo!";
  self.registration.showNotification(title, {
    body,
    icon:    '/icons/icon-192.png',
    badge:   '/icons/icon-192.png',
    tag:     'dpoyo-fcm-bg',
    vibrate: [200, 100, 200],
    data:    payload.data || { url: '/' },
  });
});
