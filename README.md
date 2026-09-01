# Horizon NER — GitHub Pages + Firebase

## Architecture
GitHub Pages hosts the Client and Admin static interfaces.
Firebase Realtime Database is the shared realtime source of truth.
Open-Meteo supplies prototype weather readings.

Client -> Firebase:
- SOS
- hazard reports

Admin -> Firebase:
- emergency broadcasts
- report verification/resolution
- shared weather state

Both interfaces read `/state`, `/reports`, `/sos`, and `/alerts` from the same Firebase project.

## Deploy
1. Create a public GitHub repository.
2. Upload the contents of this folder.
3. GitHub: Settings -> Pages -> Deploy from branch -> `main` -> `/ (root)`.
4. Open the generated GitHub Pages URL.
5. Client: `/client/`
6. Admin: `/admin/`

## Firebase
The project is already configured for the GeoGuard web app supplied in the setup.
Database: `geoguard-007` in `asia-southeast1`.

`firebase-rules.json` is intentionally open for controlled prototyping only.
Before public/real-world use, add Firebase Authentication and restrictive Realtime Database rules.

## Weather
Because GitHub Pages is static, the Admin browser performs the prototype weather sync:
- first load if `/state` is empty
- every 15 minutes while Admin is open
- one shared `/state` object is written
- all connected clients receive the exact same snapshot

For autonomous 24/7 updates later, add a secure scheduled backend.

## Security
Never upload Firebase Admin SDK service-account private keys. The web configuration is client-side configuration; database rules/authentication provide access control.

## v2 navigation repair
The Admin navigation is now handled outside the Firebase module, so Overview/Risk Map/Reports/SOS/Broadcast/Rescue tabs remain clickable even if a Firebase or network module has a temporary error. Firebase errors are shown in the status area.

## v3 repair
Admin page rendering is isolated per section, numeric Firebase values are normalized, and a map fallback is included if the Leaflet CDN is unavailable.


## v4 Admin fix
The Admin uses `hidden` page switching, initializes the full map only after opening it, includes the missing `sendAlert` handler, and removes the duplicate rescue renderer.


## v5 Rescue Dispatch
Admin Rescue Ops now supports prototype dispatching:
1. A mobile SOS appears in Rescue Ops in real time.
2. Admin clicks **Dispatch Nearest Unit**.
3. A free prototype unit is assigned and `/dispatches` is written to Firebase.
4. The SOS record is updated with the assigned unit.
5. Client receives a realtime Rescue Update.
6. Admin can complete the dispatch, which resolves the SOS.

This is a software prototype; unit GPS/routing and actual emergency-service integration can be added later.


## v6 Broadcast fix
Admin Broadcast now writes directly to `/alerts` using Firebase `push()`. Both Admin and Client listen to the same `/alerts` path. New alerts trigger an in-app toast immediately on connected pages, while the alert history is also retained.
