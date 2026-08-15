// ios/Tidum/TidumTests/ProfileViewModelTests.swift
import Testing
import Foundation
@testable import Tidum

@Suite("ProfileViewModel")
struct ProfileViewModelTests {
    @Test @MainActor func loadPopulatesEidStatus() async throws {
        let store = KeychainStore(service: "no.tidum.tests.\(UUID().uuidString)")
        try store.save(accessToken: "token", refreshToken: "refresh")

        MockURLProtocol.handler = { request in
            let json = #"{"linked":true,"required":false}"#.data(using: .utf8)!
            return (HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!, json)
        }

        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [MockURLProtocol.self]
        let client = APIClient(baseURL: URL(string: "https://tidum-backend.onrender.com")!, session: URLSession(configuration: config), keychain: store)

        let viewModel = ProfileViewModel(apiClient: client)
        await viewModel.load()

        #expect(viewModel.eidStatus?.linked == true)
        store.clear()
    }
}
