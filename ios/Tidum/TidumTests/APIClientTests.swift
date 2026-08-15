// ios/Tidum/TidumTests/APIClientTests.swift
import Testing
import Foundation
@testable import Tidum

@Suite("APIClient")
struct APIClientTests {
    private func makeClient(store: KeychainStore) -> APIClient {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [MockURLProtocol.self]
        return APIClient(baseURL: URL(string: "https://tidum-backend.onrender.com")!, session: URLSession(configuration: config), keychain: store)
    }

    @Test func getDecodesAResponseAndSendsTheBearerToken() async throws {
        let store = KeychainStore(service: "no.tidum.tests.\(UUID().uuidString)")
        try store.save(accessToken: "token-abc", refreshToken: "refresh-abc")

        var capturedAuthHeader: String?
        MockURLProtocol.handler = { request in
            capturedAuthHeader = request.value(forHTTPHeaderField: "Authorization")
            let json = #"{"linked":true,"required":false}"#.data(using: .utf8)!
            let response = HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!
            return (response, json)
        }

        let client = makeClient(store: store)
        let status: EidStatus = try await client.get("/api/auth/eid/status")

        #expect(status.linked == true)
        #expect(capturedAuthHeader == "Bearer token-abc")
        store.clear()
    }

    @Test func refreshesOnceOn401ThenRetriesTheOriginalRequest() async throws {
        let store = KeychainStore(service: "no.tidum.tests.\(UUID().uuidString)")
        try store.save(accessToken: "expired-token", refreshToken: "refresh-abc")

        var callCount = 0
        MockURLProtocol.handler = { request in
            callCount += 1
            if request.url?.path == "/api/auth/mobile/refresh" {
                let json = #"{"accessToken":"new-token","expiresIn":3600}"#.data(using: .utf8)!
                return (HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!, json)
            }
            if callCount <= 2 {
                return (HTTPURLResponse(url: request.url!, statusCode: 401, httpVersion: nil, headerFields: nil)!, Data())
            }
            let json = #"{"linked":true,"required":false}"#.data(using: .utf8)!
            return (HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!, json)
        }

        let client = makeClient(store: store)
        let status: EidStatus = try await client.get("/api/auth/eid/status")

        #expect(status.linked == true)
        #expect(store.loadAccessToken() == "new-token")
        store.clear()
    }

    @Test func throwsUnauthorizedWhenRefreshAlsoFails() async throws {
        let store = KeychainStore(service: "no.tidum.tests.\(UUID().uuidString)")
        try store.save(accessToken: "expired-token", refreshToken: "dead-refresh")

        MockURLProtocol.handler = { request in
            (HTTPURLResponse(url: request.url!, statusCode: 401, httpVersion: nil, headerFields: nil)!, Data())
        }

        let client = makeClient(store: store)
        await #expect(throws: NetworkError.unauthorized) {
            let _: EidStatus = try await client.get("/api/auth/eid/status")
        }
        store.clear()
    }

    @Test func getRetriesOnTimeoutAndSucceedsOnThirdAttempt() async throws {
        let store = KeychainStore(service: "no.tidum.tests.\(UUID().uuidString)")
        try store.save(accessToken: "token", refreshToken: "refresh")

        var attempt = 0
        MockURLProtocol.handler = { request in
            attempt += 1
            if attempt < 3 {
                throw URLError(.timedOut)
            }
            let json = #"{"linked":true,"required":false}"#.data(using: .utf8)!
            return (HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!, json)
        }

        let client = makeClient(store: store)
        let status: EidStatus = try await client.get("/api/auth/eid/status")

        #expect(status.linked == true)
        #expect(attempt == 3)
        store.clear()
    }
}
