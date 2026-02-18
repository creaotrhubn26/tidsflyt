import { useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl, Alert, ScrollView } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { timeEntriesApi } from '../lib/api';
import { useAuth } from '../hooks/useAuth';
import { format } from 'date-fns';
import { nb } from 'date-fns/locale';

// Import screens
import LeaveScreen from './LeaveScreen';
import RecurringScreen from './RecurringScreen';
import OvertimeScreen from './OvertimeScreen';
import InvoicesScreen from './InvoicesScreen';
import ReportsScreen from './ReportsScreen';

type Screen = 'home' | 'leave' | 'recurring' | 'overtime' | 'invoices' | 'reports';

export default function HomeScreen() {
  const queryClient = useQueryClient();
  const { logout, user } = useAuth();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [currentScreen, setCurrentScreen] = useState<Screen>('home');

  // Fetch time entries
  const { data: entries = [], isLoading } = useQuery({
    queryKey: ['time-entries'],
    queryFn: async () => {
      const { data } = await timeEntriesApi.getAll();
      return data;
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await timeEntriesApi.delete(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['time-entries'] });
    },
  });

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ['time-entries'] });
    setIsRefreshing(false);
  };

  const handleDelete = (id: number, title: string) => {
    Alert.alert(
      'Slett tidspost',
      `Er du sikker på at du vil slette "${title}"?`,
      [
        { text: 'Avbryt', style: 'cancel' },
        { text: 'Slett', style: 'destructive', onPress: () => deleteMutation.mutate(id) },
      ]
    );
  };

  const renderEntry = ({ item }: any) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>{item.title}</Text>
        <Text style={styles.hours}>{item.hours}t</Text>
      </View>
      
      <Text style={styles.date}>
        {format(new Date(item.date), 'EEEE d. MMMM yyyy', { locale: nb })}
      </Text>
      
      {item.description && (
        <Text style={styles.description}>{item.description}</Text>
      )}
      
      <View style={styles.cardFooter}>
        <View style={styles.tags}>
          {item.activity && (
            <View style={styles.tag}>
              <Text style={styles.tagText}>{item.activity}</Text>
            </View>
          )}
          {item.project && (
            <View style={styles.tag}>
              <Text style={styles.tagText}>{item.project}</Text>
            </View>
          )}
        </View>
        
        <TouchableOpacity
          style={styles.deleteButton}
          onPress={() => handleDelete(item.id, item.title)}
        >
          <Text style={styles.deleteText}>Slett</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  // Render different screens based on navigation
  if (currentScreen === 'leave') return <LeaveScreen onBack={() => setCurrentScreen('home')} />;
  if (currentScreen === 'recurring') return <RecurringScreen onBack={() => setCurrentScreen('home')} />;
  if (currentScreen === 'overtime') return <OvertimeScreen onBack={() => setCurrentScreen('home')} />;
  if (currentScreen === 'invoices') return <InvoicesScreen onBack={() => setCurrentScreen('home')} />;
  if (currentScreen === 'reports') return <ReportsScreen onBack={() => setCurrentScreen('home')} />;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Tidsflyt</Text>
          <Text style={styles.userText}>Velkommen, {user?.name || 'Bruker'}</Text>
        </View>
        <TouchableOpacity style={styles.logoutButton} onPress={logout}>
          <Text style={styles.logoutText}>Logg ut</Text>
        </TouchableOpacity>
      </View>

      <ScrollView>
        {/* Navigation Menu */}
        <View style={styles.menuSection}>
          <Text style={styles.menuTitle}>Funksjoner</Text>
          <View style={styles.menuGrid}>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => setCurrentScreen('leave')}
            >
              <Text style={styles.menuIcon}>🏖️</Text>
              <Text style={styles.menuLabel}>Fravær</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => setCurrentScreen('recurring')}
            >
              <Text style={styles.menuIcon}>🔁</Text>
              <Text style={styles.menuLabel}>Gjentakende</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => setCurrentScreen('overtime')}
            >
              <Text style={styles.menuIcon}>⏰</Text>
              <Text style={styles.menuLabel}>Overtid</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => setCurrentScreen('invoices')}
            >
              <Text style={styles.menuIcon}>📄</Text>
              <Text style={styles.menuLabel}>Fakturaer</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => setCurrentScreen('reports')}
            >
              <Text style={styles.menuIcon}>📊</Text>
              <Text style={styles.menuLabel}>Rapporter</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Time Entries Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Siste tidsposter</Text>
          {isLoading ? (
            <View style={styles.loading}>
              <Text>Laster tidsposter...</Text>
            </View>
          ) : entries.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>Ingen tidsposter registrert</Text>
              <Text style={styles.emptySubtext}>Start registrering på web</Text>
            </View>
          ) : (
            entries.slice(0, 5).map((entry: any) => (
              <View key={entry.id} style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text style={styles.cardTitle}>{entry.title}</Text>
                  <Text style={styles.hours}>{entry.hours}t</Text>
                </View>
                <Text style={styles.date}>
                  {format(new Date(entry.date), 'dd.MM.yyyy', { locale: nb })}
                </Text>
                {entry.activity && (
                  <View style={styles.tag}>
                    <Text style={styles.tagText}>{entry.activity}</Text>
                  </View>
                )}
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    paddingTop: 50,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  userText: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  logoutButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#007AFF',
  },
  logoutText: {
    color: '#007AFF',
    fontWeight: '600',
  },
  list: {
    padding: 16,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    flex: 1,
  },
  hours: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#007AFF',
  },
  date: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  description: {
    fontSize: 14,
    color: '#666',
    marginBottom: 12,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tags: {
    flexDirection: 'row',
    gap: 8,
    flex: 1,
  },
  tag: {
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  tagText: {
    fontSize: 12,
    color: '#666',
  },
  deleteButton: {
    padding: 8,
  },
  deleteText: {
    color: '#FF3B30',
    fontSize: 14,
    fontWeight: '500',
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: {
    alignItems: 'center',
    marginTop: 50,
  },
  emptyText: {
    fontSize: 18,
    color: '#666',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
  },
  menuSection: {
    padding: 16,
  },
  menuTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    marginBottom: 16,
  },
  menuGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  menuItem: {
    width: '30%',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  menuIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  menuLabel: {
    fontSize: 12,
    color: '#333',
    fontWeight: '500',
    textAlign: 'center',
  },
  section: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
});
