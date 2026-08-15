// ios/Tidum/TidumTests/ReportViewModelTests.swift
import Testing
import Foundation
@testable import Tidum

@Suite("ReportViewModel")
struct ReportViewModelTests {
    @Test @MainActor func submitSendsSakIdAndTextFields() async throws {
        let store = KeychainStore(service: "no.tidum.tests.\(UUID().uuidString)")
        try store.save(accessToken: "token", refreshToken: "refresh")

        var capturedBody: Data?
        MockURLProtocol.handler = { request in
            capturedBody = request.httpBodyStreamData() ?? request.httpBody
            let json = #"{"id":"r1","sakId":"c1","status":"utkast","innledning":"Startet godt","avslutning":"Avsluttet greit","periodeFrom":null,"periodeTo":null,"createdAt":"2026-08-14T10:00:00.000Z"}"#.data(using: .utf8)!
            return (HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!, json)
        }

        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [MockURLProtocol.self]
        let client = APIClient(baseURL: URL(string: "https://tidum-backend.onrender.com")!, session: URLSession(configuration: config), keychain: store)

        let viewModel = ReportViewModel(apiClient: client)
        let saved = await viewModel.submit(sakId: "c1", innledning: "Startet godt", avslutning: "Avsluttet greit")

        #expect(saved == true)
        #expect(viewModel.errorMessage == nil)
        store.clear()
    }
}

private extension URLRequest {
    func httpBodyStreamData() -> Data? {
        guard let stream = httpBodyStream else { return nil }
        stream.open()
        defer { stream.close() }
        var data = Data()
        let bufferSize = 1024
        var buffer = [UInt8](repeating: 0, count: bufferSize)
        while stream.hasBytesAvailable {
            let read = stream.read(&buffer, maxLength: bufferSize)
            if read <= 0 { break }
            data.append(buffer, count: read)
        }
        return data
    }
}
