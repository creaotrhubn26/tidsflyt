// ios/Tidum/Tidum/Auth/AuthSession.swift
import AuthenticationServices
import UIKit

@Observable
final class AuthSession: NSObject {
    enum Provider {
        case bankID, google

        var loginPath: String {
            switch self {
            case .bankID: "/api/auth/idura/login-mobile"
            case .google: "/api/auth/google-mobile"
            }
        }
    }

    private var currentSession: ASWebAuthenticationSession?

    func start(_ provider: Provider, baseURL: URL) async throws -> URL {
        let authURL = baseURL.appendingPathComponent(provider.loginPath)
        return try await withCheckedThrowingContinuation { continuation in
            let session = ASWebAuthenticationSession(
                url: authURL,
                callbackURLScheme: "tidum"
            ) { callbackURL, error in
                if let error {
                    continuation.resume(throwing: error)
                    return
                }
                guard let callbackURL else {
                    continuation.resume(throwing: URLError(.badServerResponse))
                    return
                }
                continuation.resume(returning: callbackURL)
            }
            session.presentationContextProvider = self
            session.prefersEphemeralWebBrowserSession = true
            self.currentSession = session
            session.start()
        }
    }
}

extension AuthSession: ASWebAuthenticationPresentationContextProviding {
    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .first?.windows.first { $0.isKeyWindow } ?? ASPresentationAnchor()
    }
}
