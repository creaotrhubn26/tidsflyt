// ios/Tidum/Tidum/Root/MainTabView.swift
import SwiftUI

struct MainTabView: View {
    var appState: AppState

    var body: some View {
        TabView {
            DashboardView(apiClient: appState.apiClient)
                .tabItem { Label("Dashboard", systemImage: "house") }

            TimeTrackingView(apiClient: appState.apiClient)
                .tabItem { Label("Timeføring", systemImage: "clock") }

            Text("Klientsaker") // Task 12 replaces this
                .tabItem { Label("Klientsaker", systemImage: "folder") }

            Text("Profil") // Task 13 replaces this
                .tabItem { Label("Profil", systemImage: "person") }
        }
    }
}
