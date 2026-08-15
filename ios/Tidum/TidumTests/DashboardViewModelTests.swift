// ios/Tidum/TidumTests/DashboardViewModelTests.swift
import Testing
import Foundation
@testable import Tidum

@Suite("DashboardViewModel")
struct DashboardViewModelTests {
    @Test @MainActor func loadPopulatesStatsOnSuccess() async throws {
        let store = KeychainStore(service: "no.tidum.tests.\(UUID().uuidString)")
        try store.save(accessToken: "token", refreshToken: "refresh")

        MockURLProtocol.handler = { request in
            let json = #"{"totalHours":12.5,"activeUsers":3,"pendingApprovals":0,"casesThisWeek":2,"hoursTrend":0,"usersTrend":0,"approvalsTrend":0,"casesTrend":0}"#.data(using: .utf8)!
            return (HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!, json)
        }

        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [MockURLProtocol.self]
        let client = APIClient(baseURL: URL(string: "https://tidum-backend.onrender.com")!, session: URLSession(configuration: config), keychain: store)

        let viewModel = DashboardViewModel(apiClient: client)
        await viewModel.load()

        #expect(viewModel.stats?.totalHours == 12.5)
        #expect(viewModel.errorMessage == nil)
        store.clear()
    }
}
