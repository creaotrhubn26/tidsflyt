// ios/Tidum/Tidum/Networking/APIClient.swift
import Foundation

// KeychainStore (Task 7) holds only `let` properties and wraps synchronous,
// thread-safe Security framework calls — it has no mutable state a data race
// could touch. It predates Swift 6 strict concurrency checking, so the
// compiler can't infer that; this retroactive conformance asserts it.
extension KeychainStore: @unchecked Sendable {}

actor APIClient {
    private let baseURL: URL
    private let session: URLSession
    private let keychain: KeychainStore
    private let decoder: JSONDecoder = JSONDecoder()
    private let encoder: JSONEncoder = JSONEncoder()

    init(baseURL: URL, session: URLSession = .shared, keychain: KeychainStore) {
        self.baseURL = baseURL
        self.session = session
        self.keychain = keychain
    }

    func get<T: Decodable>(_ path: String) async throws -> T {
        var lastError: Error = NetworkError.offline
        for attempt in 0..<3 {
            do {
                return try await send(path: path, method: "GET", body: Optional<String>.none)
            } catch let error as NetworkError where error == .offline || error == .timeout {
                lastError = error
                if attempt < 2 {
                    try? await Task.sleep(nanoseconds: UInt64(pow(2.0, Double(attempt)) * 500_000_000))
                }
            }
        }
        throw lastError
    }

    func post<T: Decodable>(_ path: String, body: some Encodable) async throws -> T {
        try await send(path: path, method: "POST", body: body)
    }

    func patch<T: Decodable>(_ path: String, body: some Encodable) async throws -> T {
        try await send(path: path, method: "PATCH", body: body)
    }

    func delete(_ path: String) async throws {
        let _: EmptyResponse = try await send(path: path, method: "DELETE", body: Optional<String>.none)
    }

    private func send<Body: Encodable, T: Decodable>(
        path: String,
        method: String,
        body: Body?,
        isRetry: Bool = false
    ) async throws -> T {
        var request = URLRequest(url: baseURL.appendingPathComponent(path))
        request.httpMethod = method
        if let token = keychain.loadAccessToken() {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        if let body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try encoder.encode(body)
        }

        let (data, response): (Data, URLResponse)
        do {
            (data, response) = try await session.data(for: request)
        } catch let error as URLError where error.code == .notConnectedToInternet {
            throw NetworkError.offline
        } catch let error as URLError where error.code == .timedOut {
            throw NetworkError.timeout
        }

        guard let httpResponse = response as? HTTPURLResponse else {
            throw NetworkError.decoding
        }

        if httpResponse.statusCode == 401 {
            if isRetry { throw NetworkError.unauthorized }
            let refreshed = await attemptRefresh()
            guard refreshed else { throw NetworkError.unauthorized }
            return try await send(path: path, method: method, body: body, isRetry: true)
        }

        guard (200..<300).contains(httpResponse.statusCode) else {
            throw NetworkError.serverError(httpResponse.statusCode)
        }

        if data.isEmpty, let empty = EmptyResponse() as? T {
            return empty
        }
        do {
            return try decoder.decode(T.self, from: data)
        } catch {
            throw NetworkError.decoding
        }
    }

    private func attemptRefresh() async -> Bool {
        guard let refreshToken = keychain.loadRefreshToken() else { return false }
        var request = URLRequest(url: baseURL.appendingPathComponent("/api/auth/mobile/refresh"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try? encoder.encode(["refreshToken": refreshToken])

        guard
            let (data, response) = try? await session.data(for: request),
            let httpResponse = response as? HTTPURLResponse,
            httpResponse.statusCode == 200,
            let refreshed = try? decoder.decode(RefreshResponse.self, from: data)
        else {
            return false
        }
        try? keychain.updateAccessToken(refreshed.accessToken)
        return true
    }
}

private struct RefreshResponse: Decodable {
    let accessToken: String
    let expiresIn: Int
}

struct EmptyResponse: Decodable {}
