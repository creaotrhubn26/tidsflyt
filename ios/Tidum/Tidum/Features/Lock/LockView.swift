// ios/Tidum/Tidum/Features/Lock/LockView.swift
import SwiftUI

struct LockView: View {
    var appState: AppState

    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: "faceid").font(.system(size: 48))
            Text("Lås opp Tidum")
            Button("Lås opp") {
                Task { await appState.unlock() }
            }
            .buttonStyle(.borderedProminent)
            // Escape-luke: biometri utestengt/avregistrert, eller Keychain-token
            // invalidert av .biometryCurrentSet. Uten denne står brukeren fast.
            Button("Logg inn på nytt") {
                appState.logOut()
            }
        }
        .task { await appState.unlock() }
    }
}
