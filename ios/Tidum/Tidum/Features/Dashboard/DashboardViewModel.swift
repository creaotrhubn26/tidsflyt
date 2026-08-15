// ios/Tidum/Tidum/Features/Dashboard/DashboardViewModel.swift
import Foundation

@MainActor
@Observable
final class DashboardViewModel {
    var stats: DashboardStats?
    var errorMessage: String?
    var isLoading = false

    private let apiClient: APIClient

    init(apiClient: APIClient) {
        self.apiClient = apiClient
    }

    func load() async {
        isLoading = true
        errorMessage = nil
        do {
            stats = try await apiClient.get("/api/stats")
        } catch NetworkError.offline {
            errorMessage = "Ingen nettforbindelse"
        } catch {
            errorMessage = "Kunne ikke laste dashboard"
        }
        isLoading = false
    }
}
