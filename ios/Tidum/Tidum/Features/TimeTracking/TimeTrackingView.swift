// ios/Tidum/Tidum/Features/TimeTracking/TimeTrackingView.swift
import SwiftUI

struct TimeTrackingView: View {
    @State private var viewModel: TimeTrackingViewModel
    @State private var showingNewEntry = false
    @State private var newDescription = ""
    @State private var newHours = ""

    init(apiClient: APIClient) {
        _viewModel = State(initialValue: TimeTrackingViewModel(apiClient: apiClient))
    }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    TimerRow(viewModel: viewModel)
                }
                if let error = viewModel.errorMessage {
                    Text(error).foregroundStyle(.red)
                }
                ForEach(viewModel.entries) { entry in
                    VStack(alignment: .leading) {
                        Text(entry.description)
                        Text("\(entry.hours, specifier: "%.1f") t · \(entry.date)")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
            }
            .navigationTitle("Timeføring")
            .toolbar {
                Button("Ny registrering") { showingNewEntry = true }
            }
            .task { await viewModel.load() }
            .refreshable { await viewModel.load() }
            .sheet(isPresented: $showingNewEntry) {
                NavigationStack {
                    Form {
                        TextField("Beskrivelse", text: $newDescription)
                        TextField("Timer", text: $newHours)
                            .keyboardType(.decimalPad)
                    }
                    .navigationTitle("Ny registrering")
                    .toolbar {
                        Button("Lagre") {
                            if let hours = Double(newHours.replacingOccurrences(of: ",", with: ".")) {
                                Task {
                                    await viewModel.createEntry(description: newDescription, hours: hours, date: Date())
                                    showingNewEntry = false
                                    newDescription = ""
                                    newHours = ""
                                }
                            }
                        }
                        .disabled(newDescription.isEmpty || Double(newHours.replacingOccurrences(of: ",", with: ".")) == nil)
                    }
                }
            }
        }
    }
}

/// Speiler web sin "0 t 00 min" klokke: Start nå / Ferdig. TimelineView
/// re-renderer hvert sekund uten en egen Timer-instans i view-modellen.
private struct TimerRow: View {
    var viewModel: TimeTrackingViewModel
    @State private var description = ""

    var body: some View {
        if let startedAt = viewModel.timerStartedAt {
            TimelineView(.periodic(from: startedAt, by: 1)) { context in
                let elapsed = Int(context.date.timeIntervalSince(startedAt))
                VStack(alignment: .leading, spacing: 8) {
                    Text(String(format: "%02d:%02d:%02d", elapsed / 3600, (elapsed % 3600) / 60, elapsed % 60))
                        .font(.title.monospacedDigit())
                    TextField("Hva jobber du med?", text: $description)
                    Button("Ferdig") {
                        Task { await viewModel.stopTimer(description: description.isEmpty ? "Timeregistrering" : description) }
                    }
                    .buttonStyle(.borderedProminent)
                }
            }
        } else {
            Button("Start nå") { viewModel.startTimer() }
                .buttonStyle(.borderedProminent)
        }
    }
}
