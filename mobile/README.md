# Gadgetvillage mobile

Empty on purpose.

The web app is a mobile-first PWA and covers everything a native build would
for the first stretch. Native earns its second codebase when push notifications
start driving real repeat sales, which is the alerts feature in phase 5, not
before.

When that day comes:

- React Native with Expo
- Reuse the domain types by publishing `backend/src/lib` as a shared package
- The API needs nothing new. Same endpoints, same tokens
- Refresh tokens move from an httpOnly cookie to Expo SecureStore. That is the
  one real architectural change, and it is contained to the auth client
