// ios/Tidum/Tidum/Features/CaseReports/ReportViewModel.swift
import Foundation

// The brief's verbatim code omits @MainActor, but every other ViewModel in
// this codebase (CasesViewModel, DashboardViewModel, TimeTrackingViewModel)
// is @MainActor @Observable, and NewReportView drives this from a Task {}
// launched on the MainActor. Swift 6 strict concurrency requires it here too
// — same recurring pattern as Tasks 8-12.
@MainActor
@Observable
final class ReportViewModel {
    var errorMessage: String?
    var isSubmitting = false

    private let apiClient: APIClient

    init(apiClient: APIClient) {
        self.apiClient = apiClient
    }

    @discardableResult
    func submit(sakId: String, innledning: String, avslutning: String) async -> Bool {
        isSubmitting = true
        errorMessage = nil
        defer { isSubmitting = false }
        do {
            let body = NewRapport(sakId: sakId, innledning: innledning, avslutning: avslutning)
            let _: Rapport = try await apiClient.post("/api/rapporter", body: body)
            return true
        } catch NetworkError.offline {
            errorMessage = "Ingen nettforbindelse"
            return false
        } catch {
            errorMessage = "Kunne ikke sende inn rapport"
            return false
        }
    }
}
