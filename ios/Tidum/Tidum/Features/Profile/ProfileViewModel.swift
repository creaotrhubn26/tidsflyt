// ios/Tidum/Tidum/Features/Profile/ProfileViewModel.swift
import Foundation

// The brief's verbatim code omits @MainActor, but every other ViewModel in
// this codebase is @MainActor @Observable, and ProfileView drives this from
// a `.task` on the MainActor. Swift 6 strict concurrency requires it here
// too (recurring pattern across Tasks 8-13).
@MainActor
@Observable
final class ProfileViewModel {
    var eidStatus: EidStatus?
    var errorMessage: String?

    private let apiClient: APIClient

    init(apiClient: APIClient) {
        self.apiClient = apiClient
    }

    func load() async {
        errorMessage = nil
        do {
            eidStatus = try await apiClient.get("/api/auth/eid/status")
        } catch {
            errorMessage = "Kunne ikke laste BankID-status"
        }
    }
}
