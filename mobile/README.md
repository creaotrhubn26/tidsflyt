# Tidsflyt Mobile App (Expo + React Native)

## 🚀 Oppstart

Dette er Expo-oppsettet for Tidsflyt mobilapp. Backend APIene er klare og kan brukes direkte.

### Installasjon

```bash
# Opprett ny Expo app
npx create-expo-app@latest tidsflyt-mobile --template blank-typescript

cd tidsflyt-mobile

# Installer nødvendige dependencies
npm install axios @tanstack/react-query
npm install @react-navigation/native @react-navigation/native-stack @react-navigation/bottom-tabs
npm install expo-router react-native-safe-area-context react-native-screens
npm install date-fns expo-secure-store
npm install @react-native-async-storage/async-storage

# For UI komponenter (valgfritt)
npm install react-native-paper
```

### API Konfigurasjon

Opprett `lib/api.ts`:

```typescript
import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

// Endre til din backend URL
const API_URL = __DEV__ 
  ? 'http://localhost:5000'  // Lokal development
  : 'https://your-production-url.com';  // Production

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
});

// Auth interceptor
api.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync('authToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default api;
```

### Mappestruktur

```
tidsflyt-mobile/
├── app/
│   ├── (auth)/
│   │   ├── login.tsx
│   │   └── register.tsx
│   ├── (tabs)/
│   │   ├── dashboard.tsx
│   │   ├── time-tracking.tsx
│   │   ├── reports.tsx
│   │   ├── leave.tsx
│   │   └── profile.tsx
│   ├── _layout.tsx
│   └── index.tsx
├── components/
│   ├── TimeEntryCard.tsx
│   ├── StatCard.tsx
│   └── LeaveRequestCard.tsx
├── lib/
│   ├── api.ts
│   ├── queryClient.ts
│   └── auth.ts
├── hooks/
│   ├── useAuth.ts
│   ├── useTimeEntries.ts
│   └── useLeaveRequests.ts
└── package.json
```

## 📱 Tilgjengelige APIer

Backend har følgende endepunkter klare for mobilapp:

### Tidsregistrering
- `GET /api/time-entries` - Hent tidsposter
- `POST /api/time-entries` - Opprett tidspost
- `PATCH /api/time-entries/:id` - Oppdater tidspost
- `DELETE /api/time-entries/:id` - Slett tidspost

### Fravær
- `GET /api/leave/types` - Hent fraværstyper
- `GET /api/leave/balance` - Hent fraværsbalanse
- `POST /api/leave/requests` - Opprett fraværssøknad
- `GET /api/leave/requests` - Hent fraværssøknader

### Gjentakende tidsposter
- `GET /api/recurring` - Hent gjentakende oppføringer
- `POST /api/recurring` - Opprett gjentakende oppføring
- `PATCH /api/recurring/:id` - Oppdater oppføring

### Overtid
- `GET /api/overtime/settings` - Hent innstillinger
- `GET /api/overtime/entries` - Hent overtidsregistreringer
- `GET /api/overtime/summary` - Hent månedsoversikt
- `POST /api/overtime/calculate` - Beregn overtid

### Fakturaer
- `GET /api/invoices` - Hent fakturaer
- `POST /api/invoices/generate` - Generer faktura
- `GET /api/invoices/:id/pdf` - Last ned PDF

### Rapporter
- `GET /api/export/excel` - Generer Excel
- `GET /api/export/csv` - Generer CSV
- `GET /api/export/pdf` - Generer PDF

## 🎨 Eksempel: Time Entry Screen

```typescript
// app/(tabs)/time-tracking.tsx
import { useState } from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import { useQuery, useMutation } from '@tanstack/react-query';
import api from '@/lib/api';

export default function TimeTrackingScreen() {
  const { data: entries, isLoading } = useQuery({
    queryKey: ['time-entries'],
    queryFn: async () => {
      const { data } = await api.get('/api/time-entries');
      return data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (entry) => {
      const { data } = await api.post('/api/time-entries', entry);
      return data;
    },
  });

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Mine Tidsposter</Text>
      <FlatList
        data={entries}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{item.title}</Text>
            <Text>{item.hours} timer</Text>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  card: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 8,
    marginBottom: 8,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
});
```

## 🔐 Autentisering

Backend bruker session-basert autentisering. For mobilapp må du:

1. **Lagre session token** fra login
2. **Sende token** i hver request (Authorization header)
3. **Håndtere logout** ved å slette token

```typescript
// hooks/useAuth.ts
import * as SecureStore from 'expo-secure-store';
import api from '@/lib/api';

export function useAuth() {
  const login = async (username: string, password: string) => {
    const { data } = await api.post('/api/login', { username, password });
    await SecureStore.setItemAsync('authToken', data.token);
    return data;
  };

  const logout = async () => {
    await api.post('/api/logout');
    await SecureStore.deleteItemAsync('authToken');
  };

  return { login, logout };
}
```

## 🏃 Kjør appen

```bash
# Start Expo development server
npx expo start

# Kjør på iOS simulator
npx expo run:ios

# Kjør på Android emulator
npx expo run:android

# Scan QR code med Expo Go app på telefon
```

## 📦 Production Build

```bash
# iOS build
eas build --platform ios

# Android build
eas build --platform android

# Submit til App Store / Google Play
eas submit --platform ios
eas submit --platform android
```

## ✅ Backend er klar!

All backend-logikk er implementert og testet. Du kan starte mobilapp-utviklingen umiddelbart:

- ✅ RESTful JSON APIs
- ✅ CORS konfigurert
- ✅ Autentisering implementert
- ✅ 30+ endepunkter klare
- ✅ TypeScript types tilgjengelig i `shared/schema.ts`

## 🎯 Neste steg

1. **Opprett Expo prosjekt**: `npx create-expo-app@latest tidsflyt-mobile`
2. **Kopier API config**: Bruk eksemplene over
3. **Start med enkel skjerm**: F.eks. time tracking
4. **Test mot backend**: Koble til localhost eller staging
5. **Bygge ut UI**: Bruke React Native Paper eller eget design

God fornøyelse med mobilutviklingen! 🚀
