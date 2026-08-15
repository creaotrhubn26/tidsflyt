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

            CasesListView(apiClient: appState.apiClient)
                .tabItem { Label("Klientsaker", systemImage: "folder") }

            Text("Profil") // Task 13 replaces this
                .tabItem { Label("Profil", systemImage: "person") }
        }
    }
}
