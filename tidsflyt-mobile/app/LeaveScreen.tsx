import { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, TextInput, Alert } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { leaveApi } from '../lib/api';
import { useAuth } from '../hooks/useAuth';
import { format } from 'date-fns';
import { nb } from 'date-fns/locale';

export default function LeaveScreen({ onBack }: { onBack?: () => void }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const currentYear = new Date().getFullYear();
  
  const [selectedType, setSelectedType] = useState<number | null>(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [notes, setNotes] = useState('');

  // Fetch leave types
  const { data: leaveTypes = [] } = useQuery({
    queryKey: ['leave-types'],
    queryFn: async () => {
      const { data } = await leaveApi.getTypes();
      return data;
    },
  });

  // Fetch balance
  const { data: balances = [] } = useQuery({
    queryKey: ['leave-balance', user?.id, currentYear],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data } = await leaveApi.getBalance(user.id, currentYear);
      return data;
    },
    enabled: !!user?.id,
  });

  // Fetch requests
  const { data: requests = [] } = useQuery({
    queryKey: ['leave-requests', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data } = await leaveApi.getRequests(user.id);
      return data;
    },
    enabled: !!user?.id,
  });

  // Create request mutation
  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const { data: result } = await leaveApi.createRequest(data);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leave-requests'] });
      queryClient.invalidateQueries({ queryKey: ['leave-balance'] });
      Alert.alert('✅ Sendt!', 'Fraværssøknad er sendt til godkjenning');
      resetForm();
    },
    onError: () => {
      Alert.alert('❌ Feil', 'Kunne ikke sende søknad');
    },
  });

  const resetForm = () => {
    setSelectedType(null);
    setStartDate('');
    setEndDate('');
    setNotes('');
  };

  const handleSubmit = () => {
    if (!selectedType || !startDate || !endDate) {
      Alert.alert('Feil', 'Vennligst fyll ut alle felter');
      return;
    }

    createMutation.mutate({
      leaveTypeId: selectedType,
      startDate,
      endDate,
      notes: notes || null,
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved': return { text: 'Godkjent', color: '#22c55e' };
      case 'rejected': return { text: 'Avvist', color: '#ef4444' };
      default: return { text: 'Venter', color: '#f59e0b' };
    }
  };

  return (
    <ScrollView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        {onBack && (
          <TouchableOpacity onPress={onBack} style={styles.backButton}>
            <Text style={styles.backText}>← Tilbake</Text>
          </TouchableOpacity>
        )}
        <Text style={styles.title}>Fravær</Text>
        <Text style={styles.subtitle}>Administrer feriedager og permisjon</Text>
      </View>

      {/* Balance Cards */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Min saldo ({currentYear})</Text>
        {balances.map((balance: any) => (
          <View key={balance.id} style={styles.balanceCard}>
            <Text style={styles.balanceType}>{balance.leaveTypeName}</Text>
            <View style={styles.balanceStats}>
              <View style={styles.balanceStat}>
                <Text style={styles.balanceLabel}>Total</Text>
                <Text style={styles.balanceValue}>{balance.totalDays}</Text>
              </View>
              <View style={styles.balanceStat}>
                <Text style={styles.balanceLabel}>Brukt</Text>
                <Text style={[styles.balanceValue, { color: '#ef4444' }]}>
                  {balance.usedDays}
                </Text>
              </View>
              <View style={styles.balanceStat}>
                <Text style={styles.balanceLabel}>Gjenstår</Text>
                <Text style={[styles.balanceValue, { color: '#22c55e' }]}>
                  {balance.remainingDays}
                </Text>
              </View>
            </View>
          </View>
        ))}
      </View>

      {/* New Request Form */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Ny søknad</Text>
        <View style={styles.form}>
          <Text style={styles.label}>Type fravær</Text>
          <View style={styles.typeGrid}>
            {leaveTypes.map((type: any) => (
              <TouchableOpacity
                key={type.id}
                style={[
                  styles.typeButton,
                  selectedType === type.id && styles.typeButtonSelected,
                ]}
                onPress={() => setSelectedType(type.id)}
              >
                <Text
                  style={[
                    styles.typeButtonText,
                    selectedType === type.id && styles.typeButtonTextSelected,
                  ]}
                >
                  {type.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>Fra dato (YYYY-MM-DD)</Text>
          <TextInput
            style={styles.input}
            value={startDate}
            onChangeText={setStartDate}
            placeholder="2024-01-15"
          />

          <Text style={styles.label}>Til dato (YYYY-MM-DD)</Text>
          <TextInput
            style={styles.input}
            value={endDate}
            onChangeText={setEndDate}
            placeholder="2024-01-20"
          />

          <Text style={styles.label}>Merknad (valgfri)</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={notes}
            onChangeText={setNotes}
            placeholder="Ekstra informasjon..."
            multiline
            numberOfLines={3}
          />

          <TouchableOpacity
            style={[styles.submitButton, createMutation.isPending && styles.buttonDisabled]}
            onPress={handleSubmit}
            disabled={createMutation.isPending}
          >
            <Text style={styles.submitButtonText}>
              {createMutation.isPending ? 'Sender...' : 'Send søknad'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Requests List */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Mine søknader</Text>
        {requests.length === 0 ? (
          <Text style={styles.emptyText}>Ingen søknader ennå</Text>
        ) : (
          requests.map((request: any) => {
            const badge = getStatusBadge(request.status);
            return (
              <View key={request.id} style={styles.requestCard}>
                <View style={styles.requestHeader}>
                  <Text style={styles.requestType}>{request.leaveTypeName}</Text>
                  <View style={[styles.badge, { backgroundColor: badge.color }]}>
                    <Text style={styles.badgeText}>{badge.text}</Text>
                  </View>
                </View>
                <Text style={styles.requestDate}>
                  {format(new Date(request.startDate), 'dd.MM.yyyy', { locale: nb })} -{' '}
                  {format(new Date(request.endDate), 'dd.MM.yyyy', { locale: nb })}
                </Text>
                <Text style={styles.requestDays}>{request.days} dager</Text>
                {request.notes && (
                  <Text style={styles.requestNotes}>{request.notes}</Text>
                )}
              </View>
            );
          })
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: '#fff',
    padding: 20,
    paddingTop: 50,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
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
  balanceCard: {
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
  balanceType: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  balanceStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  balanceStat: {
    alignItems: 'center',
  },
  balanceLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  balanceValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#007AFF',
  },
  form: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
    marginTop: 12,
    marginBottom: 6,
  },
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  typeButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    backgroundColor: '#fff',
  },
  typeButtonSelected: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  typeButtonText: {
    fontSize: 14,
    color: '#666',
  },
  typeButtonTextSelected: {
    color: '#fff',
    fontWeight: '600',
  },
  input: {
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  submitButton: {
    backgroundColor: '#007AFF',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginTop: 16,
  },
  buttonDisabled: {
    backgroundColor: '#ccc',
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  requestCard: {
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
  requestHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  requestType: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  requestDate: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  requestDays: {
    fontSize: 14,
    color: '#666',
  },
  requestNotes: {
    fontSize: 14,
    color: '#666',
    fontStyle: 'italic',
    marginTop: 8,
  },
  emptyText: {
    textAlign: 'center',
    color: '#999',
    fontSize: 14,
    padding: 20,
  },
  backButton: {
    marginBottom: 8,
  },
  backText: {
    color: '#007AFF',
    fontSize: 16,
  },
});
