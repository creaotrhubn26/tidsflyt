// ios/Tidum/Tidum/Features/Cases/CasesListView.swift
import SwiftUI

struct CasesListView: View {
    @State private var viewModel: CasesViewModel

    init(apiClient: APIClient) {
        _viewModel = State(initialValue: CasesViewModel(apiClient: apiClient))
    }

    var body: some View {
        NavigationStack {
            List {
                if let error = viewModel.errorMessage {
                    Text(error).foregroundStyle(.red)
                }
                ForEach(viewModel.cases) { sak in
                    NavigationLink(value: sak) {
                        VStack(alignment: .leading) {
                            Text(sak.tittel)
                            Text(sak.saksnummer).font(.caption).foregroundStyle(.secondary)
                        }
                    }
                }
            }
            .navigationTitle("Klientsaker")
            .task { await viewModel.load() }
            .refreshable { await viewModel.load() }
            .navigationDestination(for: Sak.self) { sak in
                CaseDetailView(sak: sak, apiClient: viewModel.apiClient)
            }
        }
    }
}

extension Sak: Hashable {
    static func == (lhs: Sak, rhs: Sak) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }
}
