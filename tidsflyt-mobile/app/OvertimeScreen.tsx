import { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tantml:react-query';
import { overtimeApi } from '../lib/api';
import { format } from 'date-fns';
import { nb } from 'date-fns/locale';

export default function OvertimeScreen({ onBack }: { onBack?: () => void }) {
  const queryClient = useQueryClient();
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'));

  // Fetch entries
  const { data: entries = [], isLoading } = useQuery({
    queryKey: ['overtime-entries'],
    queryFn: async () => {
      const { data } = await overtimeApi.getEntries();
      return data;
    },
  });

  // Fetch summary
  const { data: summary } = useQuery({
    queryKey: ['overtime-summary', selectedMonth],
    queryFn: async () => {
      const { data } = await overtimeApi.getSummary(selectedMonth);
      return data;
    },
  });

  // Calculate mutation
  const calculateMutation = useMutation({
    mutationFn: async () => {
      const startDate = `${selectedMonth}-01`;
      const lastDay = new Date(
        parseInt(selectedMonth.split('-')[0]),
        parseInt(selectedMonth.split('-')[1]),
        0
      ).getDate();
      const endDate = `${selectedMonth}-${lastDay.toString().padStart(2, '0')}`;
      
      const { data } = await overtimeApi.calculate(startDate, endDate);
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['overtime-entries'] });
      queryClient.invalidateQueries({ queryKey: ['overtime-summary'] });
      Alert.alert('✅ Beregnet!', `${data.entries?.length || 0} overtidsdager funnet`);
    },
    onError: () => {
      Alert.alert('❌ Feil', 'Kunne ikke beregne overtid');
    },
  });

  // Approve mutation
  const approveMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const { data } = await overtimeApi.approve(id, status);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['overtime-entries'] });
      Alert.alert('✅ Oppdatert!', 'Status endret');
    },
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return { text: 'Godkjent', color: '#22c55e' };
      case 'rejected':
        return { text: 'Avvist', color: '#ef4444' };
      default:
        return { text: 'Venter', color: '#f59e0b' };
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
        <View>
          <Text style={styles.title}>Overtid</Text>
          <Text style={styles.subtitle}>Automatisk beregning av overtidstimer</Text>
        </View>
        <TouchableOpacity
          style={styles.calculateButton}
          onPress={() => calculateMutation.mutate()}
          disabled={calculateMutation.isPending}
        >
          <Text style={styles.calculateButtonText}>
            {calculateMutation.isPending ? '⏳' : '🔄 Beregn'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Summary Card */}
      {summary && (
        <View style={styles.summarySection}>
          <Text style={styles.sectionTitle}>
            Månedssammendrag - {format(new Date(selectedMonth + '-01'), 'MMMM yyyy', { locale: nb })}
          </Text>
          <View style={styles.summaryCard}>
            <View style={styles.summaryGrid}>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>Ordinære timer</Text>
                <Text style={styles.summaryValue}>{summary.totalRegularHours || 0}t</Text>
              </View>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>Overtidstimer</Text>
                <Text style={[styles.summaryValue, { color: '#f59e0b' }]}>
                  {summary.totalOvertimeHours || 0}t
                </Text>
              </View>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>50% tillegg</Text>
                <Text style={styles.summaryValue}>{summary.total150Hours || 0}t</Text>
              </View>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>100% tillegg</Text>
                <Text style={styles.summaryValue}>{summary.total200Hours || 0}t</Text>
              </View>
            </View>
            <View style={styles.summaryTotal}>
              <Text style={styles.summaryTotalLabel}>Total kompensasjon</Text>
              <Text style={styles.summaryTotalValue}>
                {summary.totalCompensation || 0} timer
              </Text>
            </View>
          </View>
        </View>
      )}

      {/* Entries List */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Overtidsregistreringer</Text>
        {isLoading ? (
          <Text style={styles.emptyText}>Laster...</Text>
        ) : entries.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>Ingen overtidsregistreringer</Text>
            <Text style={styles.emptySubtext}>Klikk "Beregn" for å starte</Text>
          </View>
        ) : (
          entries.map((entry: any) => {
            const badge = getStatusBadge(entry.status);
            return (
              <View key={entry.id} style={styles.entryCard}>
                <View style={styles.entryHeader}>
                  <Text style={styles.entryDate}>
                    {format(new Date(entry.date), 'EEEE d. MMMM', { locale: nb })}
                  </Text>
                  <View style={[styles.badge, { backgroundColor: badge.color }]}>
                    <Text style={styles.badgeText}>{badge.text}</Text>
                  </View>
                </View>

                <View style={styles.entryStats}>
                  <View style={styles.entryStat}>
                    <Text style={styles.entryStatLabel}>Ordinær</Text>
                    <Text style={styles.entryStatValue}>{entry.regularHours}t</Text>
                  </View>
                  <View style={styles.entryStat}>
                    <Text style={styles.entryStatLabel}>Overtid</Text>
                    <Text style={[styles.entryStatValue, { color: '#f59e0b' }]}>
                      {entry.overtimeHours}t
                    </Text>
                  </View>
                  <View style={styles.entryStat}>
                    <Text style={styles.entryStatLabel}>50%</Text>
                    <Text style={styles.entryStatValue}>{entry.rate150Hours}t</Text>
                  </View>
                  <View style={styles.entryStat}>
                    <Text style={styles.entryStatLabel}>100%</Text>
                    <Text style={styles.entryStatValue}>{entry.rate200Hours}t</Text>
                  </View>
                </View>

                <View style={styles.entryCompensation}>
                  <Text style={styles.compensationLabel}>Kompensasjon:</Text>
                  <Text style={styles.compensationValue}>
                    {entry.totalCompensation} timer
                  </Text>
                </View>

                {entry.status === 'pending' && (
                  <View style={styles.actionButtons}>
                    <TouchableOpacity
                      style={[styles.actionButton, styles.approveButton]}
                      onPress={() =>
                        approveMutation.mutate({ id: entry.id, status: 'approved' })
                      }
                    >
                      <Text style={styles.actionButtonText}>✓ Godkjenn</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.actionButton, styles.rejectButton]}
                      onPress={() =>
                        approveMutation.mutate({ id: entry.id, status: 'rejected' })
                      }
                    >
                      <Text style={styles.actionButtonText}>✕ Avvis</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          })
        )}
      </View>

      {/* Info Card */}
      <View style={styles.infoSection}>
        <Text style={styles.infoTitle}>ℹ️ Hvordan det fungerer</Text>
        <Text style={styles.infoText}>
          • Overtid beregnes basert på daglige og ukentlige terskler
        </Text>
        <Text style={styles.infoText}>
          • Timer utover daglig terskel får 50% tillegg (1.5x)
        </Text>
        <Text style={styles.infoText}>
          • Timer utover ukentlig terskel får 100% tillegg (2.0x)
        </Text>
        <Text style={styles.infoText}>
          • Overtid må godkjennes av leder før utbetaling
        </Text>
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  backButton: {
    marginBottom: 8,
  },
  backText: {
    color: '#007AFF',
    fontSize: 16,
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
  calculateButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  calculateButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  summarySection: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  summaryCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 16,
  },
  summaryItem: {
    width: '50%',
    marginBottom: 16,
  },
  summaryLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  summaryValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#007AFF',
  },
  summaryTotal: {
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    paddingTop: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryTotalLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  summaryTotalValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#22c55e',
  },
  section: {
    padding: 16,
  },
  entryCard: {
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
  entryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  entryDate: {
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
  entryStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 12,
  },
  entryStat: {
    alignItems: 'center',
  },
  entryStatLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  entryStatValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  entryCompensation: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#f0fdf4',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  compensationLabel: {
    fontSize: 14,
    color: '#166534',
    fontWeight: '500',
  },
  compensationValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#16a34a',
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  approveButton: {
    backgroundColor: '#22c55e',
  },
  rejectButton: {
    backgroundColor: '#ef4444',
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  emptyState: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    textAlign: 'center',
    color: '#999',
    fontSize: 16,
    marginBottom: 8,
  },
  emptySubtext: {
    textAlign: 'center',
    color: '#ccc',
    fontSize: 14,
  },
  infoSection: {
    padding: 16,
    backgroundColor: '#fff',
    marginTop: 8,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  infoText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
});
