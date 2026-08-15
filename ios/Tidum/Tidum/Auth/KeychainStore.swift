// ios/Tidum/Tidum/Auth/KeychainStore.swift
import Foundation
import Security

enum KeychainError: Error {
    case unhandled(OSStatus)
}

/// Wraps Keychain access for the two mobile auth tokens. The refresh token is
/// stored with a biometry access control (Face ID/Touch ID gate); the access
/// token is not — it's short-lived (1 hour) and read on every API call, so
/// gating it behind Face ID on every request would be unusable. The app-level
/// lock screen (see BiometricLock + AppState) is what actually enforces "you
/// must Face ID to use the app" — this class only enforces it at the storage
/// layer for the longer-lived refresh token.
final class KeychainStore {
    private let service: String
    private let accessTokenAccount = "accessToken"
    private let refreshTokenAccount = "refreshToken"

    init(service: String = "no.tidum.app") {
        self.service = service
    }

    func save(accessToken: String, refreshToken: String) throws {
        try setPlain(accessToken, account: accessTokenAccount)
        try setBiometryGated(refreshToken, account: refreshTokenAccount)
    }

    func updateAccessToken(_ token: String) throws {
        try setPlain(token, account: accessTokenAccount)
    }

    func loadAccessToken() -> String? {
        loadPlain(account: accessTokenAccount)
    }

    func loadRefreshToken() -> String? {
        loadBiometryGated(account: refreshTokenAccount)
    }

    func clear() {
        for account in [accessTokenAccount, refreshTokenAccount] {
            let query: [String: Any] = [
                kSecClass as String: kSecClassGenericPassword,
                kSecAttrService as String: service,
                kSecAttrAccount as String: account,
            ]
            SecItemDelete(query as CFDictionary)
        }
    }

    private func setPlain(_ value: String, account: String) throws {
        let data = Data(value.utf8)
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        SecItemDelete(query as CFDictionary)
        var attributes = query
        attributes[kSecValueData as String] = data
        let status = SecItemAdd(attributes as CFDictionary, nil)
        guard status == errSecSuccess else { throw KeychainError.unhandled(status) }
    }

    private func loadPlain(account: String) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        guard status == errSecSuccess, let data = result as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    private func setBiometryGated(_ value: String, account: String) throws {
        let data = Data(value.utf8)
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        SecItemDelete(query as CFDictionary)

        guard
            let access = SecAccessControlCreateWithFlags(
                nil,
                kSecAttrAccessibleWhenPasscodeSetThisDeviceOnly,
                .biometryCurrentSet,
                nil
            )
        else {
            throw KeychainError.unhandled(errSecParam)
        }

        var attributes = query
        attributes[kSecValueData as String] = data
        attributes[kSecAttrAccessControl as String] = access
        let status = SecItemAdd(attributes as CFDictionary, nil)
        guard status == errSecSuccess else { throw KeychainError.unhandled(status) }
    }

    private func loadBiometryGated(account: String) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
            kSecUseOperationPrompt as String: "Lås opp Tidum",
        ]
        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        guard status == errSecSuccess, let data = result as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }
}
