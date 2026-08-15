// ios/Tidum/Tidum/Features/Dashboard/DashboardView.swift
import SwiftUI

struct DashboardView: View {
    @State private var viewModel: DashboardViewModel

    init(apiClient: APIClient) {
        _viewModel = State(initialValue: DashboardViewModel(apiClient: apiClient))
    }

    var body: some View {
        NavigationStack {
            List {
                if let error = viewModel.errorMessage {
                    Text(error).foregroundStyle(.red)
                }
                if let stats = viewModel.stats {
                    LabeledContent("Timer denne perioden", value: String(format: "%.1f t", stats.totalHours))
                    LabeledContent("Aktive tiltak", value: "\(stats.casesThisWeek)")
                }
            }
            .navigationTitle("Dashboard")
            .task { await viewModel.load() }
            .refreshable { await viewModel.load() }
        }
    }
}
