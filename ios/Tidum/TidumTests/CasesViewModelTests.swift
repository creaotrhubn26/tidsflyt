// ios/Tidum/TidumTests/CasesViewModelTests.swift
import Testing
import Foundation
@testable import Tidum

@Suite("CasesViewModel")
struct CasesViewModelTests {
    @Test @MainActor func loadPopulatesCases() async throws {
        let store = KeychainStore(service: "no.tidum.tests.\(UUID().uuidString)")
        try store.save(accessToken: "token", refreshToken: "refresh")

        MockURLProtocol.handler = { request in
            let json = #"[{"id":"c1","saksnummer":"2026-001","tittel":"Oppfølging Ola","klientRef":"K-1","oppdragsgiver":null,"tiltakstype":"miljoarbeid","status":"aktiv","beskrivelse":null}]"#.data(using: .utf8)!
            return (HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!, json)
        }

        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [MockURLProtocol.self]
        let client = APIClient(baseURL: URL(string: "https://tidum-backend.onrender.com")!, session: URLSession(configuration: config), keychain: store)

        let viewModel = CasesViewModel(apiClient: client)
        await viewModel.load()

        #expect(viewModel.cases.count == 1)
        #expect(viewModel.cases.first?.tittel == "Oppfølging Ola")
        store.clear()
    }
}
