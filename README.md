# AgriGest - Farm Management Application

AgriGest is a comprehensive farm management application designed to help farmers track and manage their agricultural operations, inventory, and areas.

## Features

- **Area Management**: Track and manage different farming areas with details like size, location, and current crops
- **Operation Tracking**: Record all farming operations with details on products used, operators, and dates
- **Inventory Management**: Keep track of products, stock levels, and usage
- **Season Planning**: Organize operations by seasons
- **Multi-tenant**: Support for multiple institutions with user management
- **Offline Support**: Cached reading plus local rainfall, monitoring reports and recommendations that sync on reconnect
- **Multilingual**: Support for English and Portuguese

## Technologies Used

- React with TypeScript
- Tailwind CSS for styling
- Supabase for backend and authentication
- Vite for build tooling
- PWA for offline capabilities

## Getting Started

### Prerequisites

- Node.js 22.12 or newer
- npm
- Supabase account

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/agrigest.git
   cd agrigest
   ```

2. Install dependencies:
   ```bash
   npm ci
   ```

3. Set up environment variables:
   Create a `.env` file in the root directory with the following variables:
   ```
   VITE_SUPABASE_URL=your_supabase_url
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```

4. Start the development server:
   ```bash
   npm run dev
   ```

## Deployment

The application can be deployed to any static hosting service like Netlify, Vercel, or GitHub Pages.

Keep `public/sw.js` when deploying the PWA: previously installed versions still check this
original worker URL for updates. It imports the current `service-worker.js` so those devices
can recover from an outdated application shell without clearing localStorage or IndexedDB.
Netlify serves both worker URLs without long-lived caching. Do not clear site data to fix
an outdated installation while unsynced field records may still exist on the device.

```bash
npm run build
```

## Build the native apps

The Windows, Android and iOS apps share the same React frontend. The native build goes into `dist-native`, and the web PWA build goes into `dist`. Configure the Supabase URL and a public client key in the environment before building.

- **Windows** — Install the Tauri prerequisites (Rust MSVC, Visual Studio C++ Build Tools and WebView2). Run `npm run desktop:build`. The x64 setup executable is generated under `src-tauri/target/release/bundle/nsis`.
- **Android** — Install Android Studio, JDK 21 and Android SDK 36. Run `npm run mobile:sync:android`. From `android`, run `gradlew.bat assembleDebug` on Windows. The debug APK is under `android/app/build/outputs/apk/debug`.
- **iOS** — On macOS with Xcode, run `npm run mobile:sync:ios`. Open `ios/App/App.xcodeproj` and configure the signing team before building for a device.

## Field monitoring

Area cards and the farm map show the growth stage from the latest observation date
in the selected season, with the monitoring date. Pending local reports are marked
as waiting to sync. The map layer can be toggled. Editing or deleting a report
refreshes the derived stage, including its local cache. Metadata is read in pages
so fields are not omitted after the first page of monitoring records.

Field cards default to natural A–Z ordering and also support Z–A or newest registration.
Monitoring reports default to newest observation date first and can be switched to
oldest first; the server query and the page cache use the same chosen order.

Select a season in the sidebar and open **Monitoramento**. Create a report for a field, then add a recommendation with products and their rates. **Realizar operação** opens a prefilled operation form. Saving it links the new operation to the recommendation in the same transaction. Open **Pluviometria** in the sidebar to record one daily rainfall reading per field and review the season’s readings. The rainfall layer on the farm map shows totals for the current week, month or selected season. Type any part of a label to filter a selection field.

The field-data migration was applied to the AgroGest project through its SQL Editor. For that project, reconcile its CLI migration history before using `supabase db push` for this migration. Use the migration normally in new environments after provisioning the existing schema.

## License

This project is licensed under the MIT License - see the LICENSE file for details.
## Offline field records

Sign in and load the selected season, fields and products before going offline.
On later openings, the cached session and matching profile let the app open local
data even when token renewal cannot reach Supabase or the device incorrectly reports
an online connection. Token renewal continues separately; remote writes still require
server authentication. Without a saved session/profile, the initial verification is
bounded and offers recovery instead of an indefinite loading screen.
Rainfall, monitoring reports and recommendations are stored in SQLite on Android and Windows
and IndexedDB in the PWA. The queue is scoped to the account and institution. It retries
after reconnecting while the app is open, using the same ID to prevent duplicate writes.
A recommendation linked to a local report waits for the report to sync. Executing a
recommendation requires an online connection and uses the existing stock transaction.

The migration granting authenticated clients permission to supply IDs for the three field
tables was applied to AgroGest through the SQL Editor. Reconcile CLI migration history before
using `supabase db push` for that project.

The seed crop catalog migration (`20261117170000`) was also applied to AgroGest through the SQL Editor. Reconcile that version in the CLI migration history before running `supabase db push`.
