import { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, TextInput, Alert, Switch } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { recurringApi } from '../lib/api';
import { format } from 'date-fns';
import { nb } from 'date-fns/locale';

const WEEKDAYS = [
  { value: 'monday', label: 'Man' },
  { value: 'tuesday', label: 'Tir' },
  { value: 'wednesday', label: 'Ons' },
  { value: 'thursday', label: 'Tor' },
  { value: 'friday', label: 'Fre' },
  { value: 'saturday', label: 'Lør' },
  { value: 'sunday', label: 'Søn' },
];

export default function RecurringScreen({ onBack }: { onBack?: () => void }) {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);

  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [activity, setActivity] = useState('');
  const [hours, setHours] = useState('1');
  const [recurrenceType, setRecurrenceType] = useState<'daily' | 'weekly' | 'monthly'>('weekly');
  const [selectedDays, setSelectedDays] = useState<string[]>(['monday', 'wednesday', 'friday']);

  // Fetch entries
  const { data: entries = [], isLoading } = useQuery({
    queryKey: ['recurring-entries'],
    queryFn: async () => {
      const { data } = await recurringApi.getAll();
      return data;
    },
  });

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const { data: result } = await recurringApi.create(data);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recurring-entries'] });
      Alert.alert('✅ Opprettet!', 'Gjentakende oppføring opprettet');
      resetForm();
      setShowForm(false);
    },
    onError: () => {
      Alert.alert('❌ Feil', 'Kunne ikke opprette oppføring');
    },
  });

  // Toggle active mutation
  const toggleMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: number; isActive: boolean }) => {
      const { data } = await recurringApi.update(id, { isActive });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recurring-entries'] });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await recurringApi.delete(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recurring-entries'] });
      Alert.alert('✅ Slettet!', 'Oppføring fjernet');
    },
  });

  // Generate mutation
  const generateMutation = useMutation({
    mutationFn: async () => {
      const { data } = await recurringApi.generate();
      return data;
    },
    onSuccess: (data) => {
      Alert.alert('✅ Generert!', `${data.generated || 0} nye tidsposter opprettet`);
    },
  });

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setActivity('');
    setHours('1');
    setRecurrenceType('weekly');
    setSelectedDays(['monday', 'wednesday', 'friday']);
  };

  const handleSubmit = () => {
    if (!title || !activity) {
      Alert.alert('Feil', 'Vennligst fyll ut tittel og aktivitet');
      return;
    }

    createMutation.mutate({
      title,
      description: description || null,
      activity,
      hours: parseFloat(hours),
      recurrenceType,
      recurrenceDays: recurrenceType === 'weekly' ? selectedDays : null,
      startDate: format(new Date(), 'yyyy-MM-dd'),
    });
  };

  const handleDelete = (id: number, title: string) => {
    Alert.alert(
      'Slett oppføring',
      `Er du sikker på at du vil slette "${title}"?`,
      [
        { text: 'Avbryt', style: 'cancel' },
        { text: 'Slett', style: 'destructive', onPress: () => deleteMutation.mutate(id) },
      ]
    );
  };

  const toggleDay = (day: string) => {
    if (selectedDays.includes(day)) {
      setSelectedDays(selectedDays.filter((d) => d !== day));
    } else {
      setSelectedDays([...selectedDays, day]);
    }
  };

  return (
    <ScrollView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          {onBack && (
            <TouchableOpacity onPress={onBack} style={styles.backButton}>
              <Text style={styles.backText}>← Tilbake</Text>
            </TouchableOpacity>
          )}
          <Text style={styles.title}>Gjentakende</Text>
          <Text style={styles.subtitle}>Automatiske tidsposter</Text>
        </View>
        <View style={styles.headerButtons}>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={() => generateMutation.mutate()}
            disabled={generateMutation.isPending}
          >
            <Text style={styles.headerButtonText}>▶ Generer</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.headerButton, styles.primaryButton]}
            onPress={() => setShowForm(!showForm)}
          >
            <Text style={styles.primaryButtonText}>{showForm ? '✕' : '+ Ny'}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* New Entry Form */}
      {showForm && (
        <View style={styles.formSection}>
          <View style={styles.form}>
            <Text style={styles.formTitle}>Ny gjentakende oppføring</Text>

            <Text style={styles.label}>Tittel</Text>
            <TextInput
              style={styles.input}
              value={title}
              onChangeText={setTitle}
              placeholder="F.eks. Daglig standup"
            />

            <Text style={styles.label}>Aktivitet</Text>
            <TextInput
              style={styles.input}
              value={activity}
              onChangeText={setActivity}
              placeholder="F.eks. Møte"
            />

            <Text style={styles.label}>Timer</Text>
            <TextInput
              style={styles.input}
              value={hours}
              onChangeText={setHours}
              keyboardType="decimal-pad"
              placeholder="1"
            />

            <Text style={styles.label}>Mønster</Text>
            <View style={styles.patternButtons}>
              <TouchableOpacity
                style={[
                  styles.patternButton,
                  recurrenceType === 'daily' && styles.patternButtonActive,
                ]}
                onPress={() => setRecurrenceType('daily')}
              >
                <Text
                  style={[
                    styles.patternButtonText,
                    recurrenceType === 'daily' && styles.patternButtonTextActive,
                  ]}
                >
                  Daglig
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.patternButton,
                  recurrenceType === 'weekly' && styles.patternButtonActive,
                ]}
                onPress={() => setRecurrenceType('weekly')}
              >
                <Text
                  style={[
                    styles.patternButtonText,
                    recurrenceType === 'weekly' && styles.patternButtonTextActive,
                  ]}
                >
                  Ukentlig
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.patternButton,
                  recurrenceType === 'monthly' && styles.patternButtonActive,
                ]}
                onPress={() => setRecurrenceType('monthly')}
              >
                <Text
                  style={[
                    styles.patternButtonText,
                    recurrenceType === 'monthly' && styles.patternButtonTextActive,
                  ]}
                >
                  Månedlig
                </Text>
              </TouchableOpacity>
            </View>

            {recurrenceType === 'weekly' && (
              <>
                <Text style={styles.label}>Velg dager</Text>
                <View style={styles.weekdaysGrid}>
                  {WEEKDAYS.map((day) => (
                    <TouchableOpacity
                      key={day.value}
                      style={[
                        styles.weekdayButton,
                        selectedDays.includes(day.value) && styles.weekdayButtonActive,
                      ]}
                      onPress={() => toggleDay(day.value)}
                    >
                      <Text
                        style={[
                          styles.weekdayButtonText,
                          selectedDays.includes(day.value) && styles.weekdayButtonTextActive,
                        ]}
                      >
                        {day.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}

            <Text style={styles.label}>Beskrivelse (valgfri)</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={description}
              onChangeText={setDescription}
              placeholder="Ekstra informasjon..."
              multiline
              numberOfLines={2}
            />

            <TouchableOpacity
              style={[styles.submitButton, createMutation.isPending && styles.buttonDisabled]}
              onPress={handleSubmit}
              disabled={createMutation.isPending}
            >
              <Text style={styles.submitButtonText}>
                {createMutation.isPending ? 'Oppretter...' : 'Opprett'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Entries List */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Mine oppføringer</Text>
        {isLoading ? (
          <Text style={styles.emptyText}>Laster...</Text>
        ) : entries.length === 0 ? (
          <Text style={styles.emptyText}>Ingen gjentakende oppføringer ennå</Text>
        ) : (
          entries.map((entry: any) => (
            <View key={entry.id} style={styles.entryCard}>
              <View style={styles.entryHeader}>
                <Text style={styles.entryTitle}>{entry.title}</Text>
                <Switch
                  value={entry.isActive}
                  onValueChange={(value) =>
                    toggleMutation.mutate({ id: entry.id, isActive: value })
                  }
                />
              </View>

              {entry.description && (
                <Text style={styles.entryDescription}>{entry.description}</Text>
              )}

              <View style={styles.entryDetails}>
                <Text style={styles.entryDetail}>📋 {entry.activity}</Text>
                <Text style={styles.entryDetail}>⏰ {entry.hours}t</Text>
                <Text style={styles.entryDetail}>
                  🔁{' '}
                  {entry.recurrenceType === 'daily' && 'Daglig'}
                  {entry.recurrenceType === 'weekly' &&
                    `Hver ${entry.recurrenceDays?.join(', ')}`}
                  {entry.recurrenceType === 'monthly' && `Den ${entry.recurrenceDay}. hver måned`}
                </Text>
              </View>

              <TouchableOpacity
                style={styles.deleteButton}
                onPress={() => handleDelete(entry.id, entry.title)}
              >
                <Text style={styles.deleteButtonText}>🗑️ Slett</Text>
              </TouchableOpacity>
            </View>
          ))
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
  headerButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  headerButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#007AFF',
  },
  headerButtonText: {
    color: '#007AFF',
    fontSize: 14,
    fontWeight: '600',
  },
  primaryButton: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  formSection: {
    padding: 16,
  },
  form: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
  },
  formTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
    marginTop: 12,
    marginBottom: 6,
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
    height: 60,
    textAlignVertical: 'top',
  },
  patternButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  patternButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    alignItems: 'center',
  },
  patternButtonActive: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  patternButtonText: {
    color: '#666',
    fontSize: 14,
  },
  patternButtonTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  weekdaysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  weekdayButton: {
    width: 45,
    height: 45,
    borderRadius: 22.5,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekdayButtonActive: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  weekdayButtonText: {
    color: '#666',
    fontSize: 12,
  },
  weekdayButtonTextActive: {
    color: '#fff',
    fontWeight: '600',
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
  section: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
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
    marginBottom: 8,
  },
  entryTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    flex: 1,
  },
  entryDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  entryDetails: {
    gap: 4,
    marginBottom: 12,
  },
  entryDetail: {
    fontSize: 14,
    color: '#666',
  },
  deleteButton: {
    padding: 8,
    alignItems: 'center',
  },
  deleteButtonText: {
    color: '#ef4444',
    fontSize: 14,
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
