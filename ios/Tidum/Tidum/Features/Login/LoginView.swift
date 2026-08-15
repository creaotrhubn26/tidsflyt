// ios/Tidum/Tidum/Features/Login/LoginView.swift
import SwiftUI

struct LoginView: View {
    var appState: AppState

    var body: some View {
        VStack(spacing: 16) {
            Text("Tidum").font(.largeTitle.bold())
            if let error = appState.loginError {
                Text(error).foregroundStyle(.red).font(.footnote)
            }
            Button("Logg inn med BankID") {
                Task { await appState.login(with: .bankID) }
            }
            .buttonStyle(.borderedProminent)

            Button("Logg inn med Google") {
                Task { await appState.login(with: .google) }
            }
            .buttonStyle(.bordered)
        }
        .padding()
    }
}
