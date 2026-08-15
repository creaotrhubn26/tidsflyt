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
        }
        .task { await appState.unlock() }
    }
}
