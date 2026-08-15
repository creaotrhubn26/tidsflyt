// ios/Tidum/Tidum/Features/CaseReports/NewReportView.swift
import SwiftUI

struct NewReportView: View {
    let sak: Sak
    let apiClient: APIClient
    @Environment(\.dismiss) private var dismiss
    @State private var viewModel: ReportViewModel
    @State private var innledning = ""
    @State private var avslutning = ""

    init(sak: Sak, apiClient: APIClient) {
        self.sak = sak
        self.apiClient = apiClient
        _viewModel = State(initialValue: ReportViewModel(apiClient: apiClient))
    }

    var body: some View {
        NavigationStack {
            Form {
                Section(sak.tittel) {
                    TextField("Innledning", text: $innledning, axis: .vertical)
                        .lineLimit(3...8)
                    TextField("Avslutning", text: $avslutning, axis: .vertical)
                        .lineLimit(3...8)
                }
                if let error = viewModel.errorMessage {
                    Text(error).foregroundStyle(.red)
                }
            }
            .navigationTitle("Ny rapport")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Avbryt") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Send inn") {
                        Task {
                            let saved = await viewModel.submit(sakId: sak.id, innledning: innledning, avslutning: avslutning)
                            if saved { dismiss() }
                        }
                    }
                    .disabled(innledning.isEmpty || viewModel.isSubmitting)
                }
            }
        }
    }
}
