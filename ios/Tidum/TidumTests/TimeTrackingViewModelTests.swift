// ios/Tidum/TidumTests/TimeTrackingViewModelTests.swift
import Testing
import Foundation
@testable import Tidum

@Suite("TimeTrackingViewModel")
struct TimeTrackingViewModelTests {
    @Test @MainActor func loadPopulatesEntriesAndWorkTypes() async throws {
        let store = KeychainStore(service: "no.tidum.tests.\(UUID().uuidString)")
        try store.save(accessToken: "token", refreshToken: "refresh")

        MockURLProtocol.handler = { request in
            let path = request.url!.path
            if path == "/api/time-entries" {
                let json = #"[{"id":"e1","userId":"u1","caseNumber":null,"description":"Oppfølging","hours":2,"expenseCoverage":0,"date":"2026-08-14","status":"pending","createdAt":"2026-08-14T10:00:00.000Z","sakId":null,"sakLocationId":null}]"#.data(using: .utf8)!
                return (HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!, json)
            }
            let json = #"{"role":"member","timeTrackingEnabled":true,"workTypes":[{"id":"miljoarbeid","name":"Miljøarbeid","color":"bg-primary","entryMode":"timer_or_manual"}]}"#.data(using: .utf8)!
            return (HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!, json)
        }

        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [MockURLProtocol.self]
        let client = APIClient(baseURL: URL(string: "https://tidum-backend.onrender.com")!, session: URLSession(configuration: config), keychain: store)

        let viewModel = TimeTrackingViewModel(apiClient: client)
        await viewModel.load()

        #expect(viewModel.entries.count == 1)
        #expect(viewModel.workTypes.first?.name == "Miljøarbeid")
        store.clear()
    }

    @Test @MainActor func stopTimerCreatesAnEntryAndClearsTimerStartedAt() async throws {
        let store = KeychainStore(service: "no.tidum.tests.\(UUID().uuidString)")
        try store.save(accessToken: "token", refreshToken: "refresh")

        MockURLProtocol.handler = { request in
            let json = #"{"id":"e2","userId":"u1","caseNumber":null,"description":"Timeregistrering","hours":0.5,"expenseCoverage":0,"date":"2026-08-14","status":"pending","createdAt":"2026-08-14T10:00:00.000Z","sakId":null,"sakLocationId":null}"#.data(using: .utf8)!
            return (HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!, json)
        }

        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [MockURLProtocol.self]
        let client = APIClient(baseURL: URL(string: "https://tidum-backend.onrender.com")!, session: URLSession(configuration: config), keychain: store)

        let viewModel = TimeTrackingViewModel(apiClient: client)
        viewModel.startTimer()
        #expect(viewModel.timerStartedAt != nil)

        await viewModel.stopTimer(description: "Timeregistrering")

        #expect(viewModel.timerStartedAt == nil)
        #expect(viewModel.entries.first?.description == "Timeregistrering")
        store.clear()
    }
}
