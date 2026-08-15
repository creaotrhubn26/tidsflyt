// ios/Tidum/Tidum/App/AppState.swift
import Foundation

enum AuthPhase {
    case loggedOut
    case locked
    case unlocked
}

@MainActor
@Observable
final class AppState {
    static let baseURL = URL(string: "https://tidum-backend.onrender.com")!

    var phase: AuthPhase
    var currentUser: AuthUser?
    var loginError: String?

    let keychain = KeychainStore()
    let biometricLock = BiometricLock()
    let authSession = AuthSession()
    let apiClient: APIClient

    init() {
        self.apiClient = APIClient(baseURL: Self.baseURL, keychain: keychain)
        self.phase = keychain.loadAccessToken() != nil ? .locked : .loggedOut
    }

    func login(with provider: AuthSession.Provider) async {
        loginError = nil
        do {
            let callbackURL = try await authSession.start(provider, baseURL: Self.baseURL)
            try handleCallback(url: callbackURL)
        } catch {
            loginError = "Innlogging feilet. Prøv igjen."
        }
    }

    func handleCallback(url: URL) throws {
        guard let components = URLComponents(url: url, resolvingAgainstBaseURL: false) else {
            throw NetworkError.decoding
        }
        let query = Dictionary(uniqueKeysWithValues: (components.queryItems ?? []).map { ($0.name, $0.value ?? "") })

        if let errorCode = query["error"] {
            loginError = errorMessage(for: errorCode)
            return
        }

        guard
            let accessToken = query["access_token"],
            let refreshToken = query["refresh_token"]
        else {
            loginError = "Innlogging feilet. Prøv igjen."
            return
        }

        try keychain.save(accessToken: accessToken, refreshToken: refreshToken)
        phase = .unlocked
        Task { await loadCurrentUser() }
    }

    func unlock() async {
        guard await biometricLock.authenticate() else { return }
        phase = .unlocked
        await loadCurrentUser()
    }

    func logOut() {
        keychain.clear()
        currentUser = nil
        phase = .loggedOut
    }

    private func loadCurrentUser() async {
        currentUser = try? await apiClient.get("/api/auth/user")
    }

    private func errorMessage(for code: String) -> String {
        switch code {
        case "eid_not_linked": "Denne BankID-en er ikke koblet til en Tidum-konto."
        case "eid_missing_ssn": "Fikk ikke fødselsnummer fra BankID."
        case "access_request_required": "Kontoen din er ikke registrert. Send en tilgangsforespørsel."
        default: "Innlogging feilet. Prøv igjen."
        }
    }
}
