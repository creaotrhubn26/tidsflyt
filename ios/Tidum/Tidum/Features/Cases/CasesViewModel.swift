// ios/Tidum/Tidum/Features/Cases/CasesViewModel.swift
import Foundation

@MainActor
@Observable
final class CasesViewModel {
    var cases: [Sak] = []
    var errorMessage: String?
    var isLoading = false

    let apiClient: APIClient

    init(apiClient: APIClient) {
        self.apiClient = apiClient
    }

    func load() async {
        isLoading = true
        errorMessage = nil
        do {
            cases = try await apiClient.get("/api/saker")
        } catch NetworkError.offline {
            errorMessage = "Ingen nettforbindelse"
        } catch {
            errorMessage = "Kunne ikke laste klientsaker"
        }
        isLoading = false
    }
}
