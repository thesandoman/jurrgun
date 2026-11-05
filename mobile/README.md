# Jurrgun app (Expo)

The phone app for Jurrgun. Owned by the Mobile App department.

v1 is a shell around the live site, https://jurrgun.apps.sv-academy.org (owner: "Expo shell first"). It loads the site in a web view and adds:

- Android's back button
- a native offline screen
- phone links handed to the right app
- outside links in the system browser
- `jurrgun://` links
- Google and LINE sign-in in the phone's browser (`src/lib/sign-in.ts`)

The website in the rest of this repo is separate. Its typecheck, tests and SV Cloud deploy never touch `mobile/`.

## Run it

```bash
cd mobile
npm install
npx expo start      # scan the QR code with Expo Go
npx tsc --noEmit    # typecheck
npx expo-doctor     # config and dependency check
```

Google and LINE sign-in hand back to `jurrgun://auth`, so they only finish in an installed build. In Expo Go, sign in with your email.

## Rules

- **No secrets here.** No EAS tokens, signing keys, Apple or Google credentials, or push keys. They stay in the owner's Expo, Apple and SV Cloud dashboards. `.gitignore` already blocks key and certificate files.
- **The app stores no session token.** Sign-in ends with the site's normal HttpOnly cookie inside the web view.
- **No analytics or crash SDKs.** Each one would be another data processor for the privacy notice.
- **Push stays off** until Privacy & Security's notice line for Expo lands. Payloads are "Jurrgun" plus one generic line, never names or messages.
- **Nothing goes public** (store listings, TestFlight invites to people other than the owner, public links) without the owner's OK through Main. Testers get a one-line warning about what Expo or Apple can see before they install.
- Bundle id: `app.jurrgun` (iOS and Android).
