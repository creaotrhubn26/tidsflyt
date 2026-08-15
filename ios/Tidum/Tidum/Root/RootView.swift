// ios/Tidum/Tidum/Root/RootView.swift
import SwiftUI

struct RootView: View {
    @State private var appState = AppState()

    var body: some View {
        Group {
            switch appState.phase {
            case .loggedOut:
                LoginView(appState: appState)
            case .locked:
                LockView(appState: appState)
            case .unlocked:
                MainTabView(appState: appState)
            }
        }
        .onOpenURL { url in
            try? appState.handleCallback(url: url)
        }
    }
}

#Preview {
    RootView()
}
