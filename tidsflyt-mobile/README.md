# Tidsflyt Mobile - Expo App

## ✅ Status: KLAR FOR UTVIKLING

Expo-appen er fullstendig satt opp og klar til bruk!

## 📦 Installerte dependencies:
- ✅ expo
- ✅ react-native
- ✅ axios (API klient)
- ✅ @tanstack/react-query (data fetching)
- ✅ expo-secure-store (sikker token lagring)
- ✅ date-fns (dato-håndtering)

## 📱 Appstruktur:

```
tidsflyt-mobile/
├── App.tsx                      # Main app med QueryClient provider
├── lib/
│   ├── api.ts                   # API client med alle endpoints
│   └── queryClient.ts           # React Query konfigurasjon
├── hooks/
│   └── useAuth.ts               # Autentisering hook
├── app/
│   ├── LoginScreen.tsx          # Login side
│   └── HomeScreen.tsx           # Hovedside med tidsposter
└── package.json
```

## 🚀 Funksjonalitet:

### ✅ Autentisering
- Login med brukernavn/passord
- Token lagring i SecureStore
- Auto-sjekk ved oppstart
- Logout funksjonalitet

### ✅ Tidsposter
- Vis alle tidsposter
- Pull-to-refresh
- Slett tidsposter
- Formatert med norske datoer

### ✅ API Integration
Backend APIer tilgjengelig:
- Time entries (hent, opprett, oppdater, slett)
- Leave management (fraværstyper, balanser, søknader)
- Recurring entries (gjentakende oppføringer)
- Overtime (overtidsberegning og godkjenning)
- Invoices (fakturagenerering)
- Reports (Excel/CSV/PDF export)

## 🏃 Start appen:

```bash
cd tidsflyt-mobile
npm start
```

Deretter:
- **Trykk 'a'** for Android emulator
- **Trykk 'i'** for iOS simulator (krever macOS)
- **Scan QR-koden** med Expo Go appen på telefonen

## 🔧 Konfigurasjon:

Endre backend URL i `lib/api.ts`:

```typescript
const API_URL = __DEV__ 
  ? 'http://localhost:5000'           // Din lokale server
  : 'https://din-prod-url.com';       // Production URL
```

## 📖 Neste steg:

1. **Start backend**: `npm run dev` i hovedprosjektet
2. **Start Expo**: `npm start` i tidsflyt-mobile/
3. **Test login**: Bruk eksisterende bruker fra database
4. **Utvid funksjoner**: Legg til flere skjermer (leave, recurring, etc.)

## 🎨 Tilpass design:

Alle komponenter bruker React Native StyleSheet. Du kan enkelt:
- Endre farger i styles objektene
- Legge til ikoner med `@expo/vector-icons`
- Bruke UI-biblioteker som React Native Paper

God fornøyelse med mobilutviklingen! 📱🚀
