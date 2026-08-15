// ios/Tidum/Tidum/Features/Profile/ProfileView.swift
import SwiftUI

struct ProfileView: View {
    var appState: AppState
    @State private var viewModel: ProfileViewModel

    init(appState: AppState) {
        self.appState = appState
        _viewModel = State(initialValue: ProfileViewModel(apiClient: appState.apiClient))
    }

    var body: some View {
        NavigationStack {
            List {
                if let user = appState.currentUser {
                    Section("Konto") {
                        LabeledContent("Navn", value: user.name)
                        LabeledContent("E-post", value: user.email)
                    }
                }
                Section("BankID") {
                    if let status = viewModel.eidStatus {
                        LabeledContent("Koblet", value: status.linked ? "Ja" : "Nei")
                    } else if let error = viewModel.errorMessage {
                        Text(error).foregroundStyle(.red)
                    }
                }
                Section {
                    Button("Logg ut", role: .destructive) {
                        appState.logOut()
                    }
                }
            }
            .navigationTitle("Profil")
            .task { await viewModel.load() }
        }
    }
}
