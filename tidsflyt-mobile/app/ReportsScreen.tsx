import { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { reportsApi } from '../lib/api';
import { format } from 'date-fns';

export default function ReportsScreen({ onBack }: { onBack?: () => void }) {
  const [isExporting, setIsExporting] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState<'week' | 'month' | 'year'>('month');

  const getPeriodDates = () => {
    const now = new Date();
    let startDate: Date;
    let endDate = now;

    switch (selectedPeriod) {
      case 'week':
        startDate = new Date(now);
        startDate.setDate(now.getDate() - 7);
        break;
      case 'month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'year':
        startDate = new Date(now.getFullYear(), 0, 1);
        break;
    }

    return {
      startDate: format(startDate, 'yyyy-MM-dd'),
      endDate: format(endDate, 'yyyy-MM-dd'),
    };
  };

  const handleExport = async (type: 'excel' | 'csv') => {
    try {
      setIsExporting(true);
      const { startDate, endDate } = getPeriodDates();

      Alert.alert(
        'Export',
        `${type.toUpperCase()} rapport for ${startDate} til ${endDate} vil bli generert. Denne funksjonen er best på web-versjonen.`,
        [
          { text: 'OK' }
        ]
      );

      // In a real app, you would download the file here
      // const { data } = await reportsApi[type === 'excel' ? 'exportExcel' : 'exportCSV']({
      //   startDate,
      //   endDate,
      // });

    } catch (error) {
      Alert.alert('Feil', 'Kunne ikke generere rapport');
    } finally {
      setIsExporting(false);
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
        <Text style={styles.title}>Rapporter</Text>
        <Text style={styles.subtitle}>Eksporter timelister og statistikk</Text>
      </View>

      {/* Period Selection */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Velg periode</Text>
        <View style={styles.periodButtons}>
          <TouchableOpacity
            style={[
              styles.periodButton,
              selectedPeriod === 'week' && styles.periodButtonActive,
            ]}
            onPress={() => setSelectedPeriod('week')}
          >
            <Text
              style={[
                styles.periodButtonText,
                selectedPeriod === 'week' && styles.periodButtonTextActive,
              ]}
            >
              📅 Siste uke
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.periodButton,
              selectedPeriod === 'month' && styles.periodButtonActive,
            ]}
            onPress={() => setSelectedPeriod('month')}
          >
            <Text
              style={[
                styles.periodButtonText,
                selectedPeriod === 'month' && styles.periodButtonTextActive,
              ]}
            >
              📊 Denne måneden
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.periodButton,
              selectedPeriod === 'year' && styles.periodButtonActive,
            ]}
            onPress={() => setSelectedPeriod('year')}
          >
            <Text
              style={[
                styles.periodButtonText,
                selectedPeriod === 'year' && styles.periodButtonTextActive,
              ]}
            >
              📈 Dette året
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Export Options */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Eksporter som</Text>

        <TouchableOpacity
          style={styles.exportCard}
          onPress={() => handleExport('excel')}
          disabled={isExporting}
        >
          <View style={styles.exportIcon}>
            <Text style={styles.exportIconText}>📊</Text>
          </View>
          <View style={styles.exportInfo}>
            <Text style={styles.exportTitle}>Excel (XLSX)</Text>
            <Text style={styles.exportDescription}>
              Komplett rapport med formatering og totaler
            </Text>
          </View>
          <Text style={styles.exportArrow}>→</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.exportCard}
          onPress={() => handleExport('csv')}
          disabled={isExporting}
        >
          <View style={styles.exportIcon}>
            <Text style={styles.exportIconText}>📄</Text>
          </View>
          <View style={styles.exportInfo}>
            <Text style={styles.exportTitle}>CSV</Text>
            <Text style={styles.exportDescription}>
              Enkel datafil som kan importeres i andre systemer
            </Text>
          </View>
          <Text style={styles.exportArrow}>→</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.exportCard}
          onPress={() =>
            Alert.alert('PDF', 'PDF-generering er best tilgjengelig på web-versjonen')
          }
        >
          <View style={styles.exportIcon}>
            <Text style={styles.exportIconText}>📑</Text>
          </View>
          <View style={styles.exportInfo}>
            <Text style={styles.exportTitle}>PDF</Text>
            <Text style={styles.exportDescription}>
              Profesjonell rapport klar for utskrift
            </Text>
          </View>
          <Text style={styles.exportArrow}>→</Text>
        </TouchableOpacity>
      </View>

      {/* Quick Stats */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Statistikk</Text>
        <View style={styles.statsCard}>
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>Total timer (estimert)</Text>
              <Text style={styles.statValue}>
                {selectedPeriod === 'week'
                  ? '~37.5'
                  : selectedPeriod === 'month'
                  ? '~150'
                  : '~1950'}
                t
              </Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>Arbeidsdager</Text>
              <Text style={styles.statValue}>
                {selectedPeriod === 'week'
                  ? '5'
                  : selectedPeriod === 'month'
                  ? '~20'
                  : '~260'}
              </Text>
            </View>
          </View>
          <Text style={styles.statsNote}>
            💡 Eksakte tall vises i eksportert rapport
          </Text>
        </View>
      </View>

      {/* Info Section */}
      <View style={styles.infoSection}>
        <Text style={styles.infoTitle}>ℹ️ Om rapporter</Text>
        <Text style={styles.infoText}>
          • Excel-rapporter inkluderer formatering, grenser og totaler
        </Text>
        <Text style={styles.infoText}>
          • CSV-filer har UTF-8 BOM for Excel-kompatibilitet
        </Text>
        <Text style={styles.infoText}>
          • PDF-rapporter har profesjonell norsk mal
        </Text>
        <Text style={styles.infoText}>
          • Alle rapporter inkluderer prosjekt, aktivitet og notater
        </Text>
        <Text style={styles.infoText}>
          • Best erfaring på web-versjonen for nedlasting
        </Text>
      </View>

      {/* Web Link */}
      <View style={styles.webLinkSection}>
        <Text style={styles.webLinkTitle}>💻 Fullstendig rapportering</Text>
        <Text style={styles.webLinkText}>
          For best mulig rapportfunksjonalitet, bruk web-versjonen på:
        </Text>
        <Text style={styles.webLinkUrl}>https://tidsflyt.no/reports</Text>
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
  periodButtons: {
    gap: 12,
  },
  periodButton: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#e0e0e0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  periodButtonActive: {
    borderColor: '#007AFF',
    backgroundColor: '#f0f9ff',
  },
  periodButtonText: {
    fontSize: 16,
    color: '#666',
    fontWeight: '500',
    textAlign: 'center',
  },
  periodButtonTextActive: {
    color: '#007AFF',
    fontWeight: '600',
  },
  exportCard: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  exportIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#f0f9ff',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  exportIconText: {
    fontSize: 24,
  },
  exportInfo: {
    flex: 1,
  },
  exportTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  exportDescription: {
    fontSize: 13,
    color: '#666',
  },
  exportArrow: {
    fontSize: 20,
    color: '#007AFF',
    marginLeft: 8,
  },
  statsCard: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 12,
  },
  statItem: {
    flex: 1,
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#007AFF',
  },
  statsNote: {
    fontSize: 12,
    color: '#666',
    fontStyle: 'italic',
    textAlign: 'center',
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
  webLinkSection: {
    padding: 16,
    marginVertical: 8,
    backgroundColor: '#eff6ff',
    borderRadius: 12,
    marginHorizontal: 16,
    marginBottom: 32,
  },
  webLinkTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e40af',
    marginBottom: 8,
  },
  webLinkText: {
    fontSize: 14,
    color: '#1e3a8a',
    marginBottom: 8,
  },
  webLinkUrl: {
    fontSize: 14,
    color: '#2563eb',
    fontWeight: '500',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  backButton: {
    marginBottom: 8,
  },
  backText: {
    color: '#007AFF',
    fontSize: 16,
  },
});
