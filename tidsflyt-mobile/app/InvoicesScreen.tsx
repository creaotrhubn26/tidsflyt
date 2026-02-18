import { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { invoicesApi } from '../lib/api';
import { format } from 'date-fns';
import { nb } from 'date-fns/locale';

export default function InvoicesScreen({ onBack }: { onBack?: () => void }) {
  const queryClient = useQueryClient();

  // Fetch invoices
  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ['invoices'],
    queryFn: async () => {
      const { data } = await invoicesApi.getAll();
      return data;
    },
  });

  // Update status mutation
  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const { data } = await invoicesApi.updateStatus(id, status);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      Alert.alert('✅ Oppdatert!', 'Fakturastatus endret');
    },
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'paid':
        return { text: 'Betalt', color: '#22c55e', icon: '✓' };
      case 'sent':
        return { text: 'Sendt', color: '#3b82f6', icon: '📤' };
      case 'overdue':
        return { text: 'Forfalt', color: '#ef4444', icon: '⚠️' };
      case 'cancelled':
        return { text: 'Kansellert', color: '#9ca3af', icon: '✕' };
      default:
        return { text: 'Utkast', color: '#f59e0b', icon: '📝' };
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('nb-NO', {
      style: 'currency',
      currency: 'NOK',
    }).format(amount);
  };

  // Calculate stats
  const stats = {
    total: invoices.length,
    unpaid: invoices.filter((i: any) => i.status === 'sent' || i.status === 'overdue').length,
    paid: invoices.filter((i: any) => i.status === 'paid').length,
    totalValue: invoices.reduce((sum: number, i: any) => sum + i.total, 0),
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
        <Text style={styles.title}>Fakturaer</Text>
        <Text style={styles.subtitle}>Oversikt over alle fakturaer</Text>
      </View>

      {/* Stats Cards */}
      <View style={styles.statsSection}>
        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Totalt antall</Text>
            <Text style={styles.statValue}>{stats.total}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Ubetalte</Text>
            <Text style={[styles.statValue, { color: '#f59e0b' }]}>{stats.unpaid}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Betalte</Text>
            <Text style={[styles.statValue, { color: '#22c55e' }]}>{stats.paid}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Total verdi</Text>
            <Text style={[styles.statValue, { fontSize: 16 }]}>
              {formatCurrency(stats.totalValue)}
            </Text>
          </View>
        </View>
      </View>

      {/* Invoices List */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Alle fakturaer</Text>
        {isLoading ? (
          <Text style={styles.emptyText}>Laster...</Text>
        ) : invoices.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>Ingen fakturaer ennå</Text>
            <Text style={styles.emptySubtext}>Opprett din første faktura på web</Text>
          </View>
        ) : (
          invoices.map((invoice: any) => {
            const badge = getStatusBadge(invoice.status);
            return (
              <View key={invoice.id} style={styles.invoiceCard}>
                <View style={styles.invoiceHeader}>
                  <View>
                    <Text style={styles.invoiceNumber}>{invoice.invoiceNumber}</Text>
                    <Text style={styles.invoiceClient}>{invoice.clientName}</Text>
                  </View>
                  <View style={[styles.badge, { backgroundColor: badge.color }]}>
                    <Text style={styles.badgeText}>
                      {badge.icon} {badge.text}
                    </Text>
                  </View>
                </View>

                <View style={styles.invoiceDetails}>
                  <View style={styles.invoiceDetail}>
                    <Text style={styles.invoiceDetailLabel}>Fakturadato</Text>
                    <Text style={styles.invoiceDetailValue}>
                      {format(new Date(invoice.invoiceDate), 'dd.MM.yyyy', { locale: nb })}
                    </Text>
                  </View>
                  <View style={styles.invoiceDetail}>
                    <Text style={styles.invoiceDetailLabel}>Forfallsdato</Text>
                    <Text style={styles.invoiceDetailValue}>
                      {format(new Date(invoice.dueDate), 'dd.MM.yyyy', { locale: nb })}
                    </Text>
                  </View>
                </View>

                <View style={styles.invoiceAmount}>
                  <Text style={styles.invoiceAmountLabel}>Totalbeløp</Text>
                  <Text style={styles.invoiceAmountValue}>
                    {formatCurrency(invoice.total)}
                  </Text>
                </View>

                {/* Action Buttons */}
                <View style={styles.actionButtons}>
                  {invoice.status === 'draft' && (
                    <TouchableOpacity
                      style={[styles.actionButton, styles.sendButton]}
                      onPress={() =>
                        updateStatusMutation.mutate({ id: invoice.id, status: 'sent' })
                      }
                    >
                      <Text style={styles.actionButtonText}>📤 Send</Text>
                    </TouchableOpacity>
                  )}
                  {invoice.status === 'sent' && (
                    <TouchableOpacity
                      style={[styles.actionButton, styles.paidButton]}
                      onPress={() =>
                        updateStatusMutation.mutate({ id: invoice.id, status: 'paid' })
                      }
                    >
                      <Text style={styles.actionButtonText}>✓ Marker betalt</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    style={[styles.actionButton, styles.viewButton]}
                    onPress={() =>
                      Alert.alert('Faktura', `Se faktura ${invoice.invoiceNumber} på web for PDF`)
                    }
                  >
                    <Text style={styles.actionButtonText}>👁️ Detaljer</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}
      </View>

      {/* Info Card */}
      <View style={styles.infoSection}>
        <Text style={styles.infoTitle}>ℹ️ Om fakturaer</Text>
        <Text style={styles.infoText}>
          • Fakturaer genereres automatisk fra timelister
        </Text>
        <Text style={styles.infoText}>• MVA (25%) beregnes automatisk på totalsummen</Text>
        <Text style={styles.infoText}>
          • Last ned PDF-faktura fra web-versjonen
        </Text>
        <Text style={styles.infoText}>
          • Forfallsdato settes til 14 dager fra fakturadato
        </Text>
        <Text style={styles.infoText}>
          • Opprett nye fakturaer på web-portalen
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
  statsSection: {
    padding: 16,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  statCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 8,
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#007AFF',
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
  invoiceCard: {
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
  invoiceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  invoiceNumber: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  invoiceClient: {
    fontSize: 14,
    color: '#666',
  },
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  badgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  invoiceDetails: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 12,
  },
  invoiceDetail: {
    flex: 1,
  },
  invoiceDetailLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  invoiceDetailValue: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
  },
  invoiceAmount: {
    backgroundColor: '#f0f9ff',
    padding: 12,
    borderRadius: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  invoiceAmountLabel: {
    fontSize: 14,
    color: '#0369a1',
    fontWeight: '500',
  },
  invoiceAmountValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#0284c7',
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
  sendButton: {
    backgroundColor: '#3b82f6',
  },
  paidButton: {
    backgroundColor: '#22c55e',
  },
  viewButton: {
    backgroundColor: '#6b7280',
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
    marginBottom: 32,
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
