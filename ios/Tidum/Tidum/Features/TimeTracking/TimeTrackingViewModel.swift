// ios/Tidum/Tidum/Features/TimeTracking/TimeTrackingViewModel.swift
import Foundation

@MainActor
@Observable
final class TimeTrackingViewModel {
    var entries: [TimeEntry] = []
    var workTypes: [WorkType] = []
    var errorMessage: String?
    var isLoading = false
    /// Non-nil while the start/stop clock is running. A `TimelineView` in the
    /// view layer re-renders the elapsed display every second by reading this
    /// — no separate ticking `Timer` object needed.
    var timerStartedAt: Date?

    private let apiClient: APIClient

    init(apiClient: APIClient) {
        self.apiClient = apiClient
    }

    func startTimer() {
        timerStartedAt = Date()
    }

    func stopTimer(description: String) async {
        guard let startedAt = timerStartedAt else { return }
        timerStartedAt = nil
        let hours = max(Date().timeIntervalSince(startedAt), 60) / 3600
        await createEntry(description: description, hours: hours, date: startedAt)
    }

    func load() async {
        isLoading = true
        errorMessage = nil
        do {
            async let entriesTask: [TimeEntry] = apiClient.get("/api/time-entries")
            async let workTypesTask: WorkTypesResponse = apiClient.get("/api/time-tracking/work-types")
            entries = try await entriesTask
            workTypes = try await workTypesTask.workTypes
        } catch NetworkError.offline {
            errorMessage = "Ingen nettforbindelse"
        } catch {
            errorMessage = "Kunne ikke laste timeføring"
        }
        isLoading = false
    }

    func createEntry(description: String, hours: Double, date: Date) async {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withFullDate]
        let body = NewTimeEntry(caseNumber: nil, description: description, hours: hours, date: formatter.string(from: date), sakId: nil)
        do {
            let created: TimeEntry = try await apiClient.post("/api/time-entries", body: body)
            entries.insert(created, at: 0)
        } catch {
            errorMessage = "Kunne ikke lagre registrering"
        }
    }
}
