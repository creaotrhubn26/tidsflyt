// ios/Tidum/Tidum/Auth/BiometricLock.swift
import LocalAuthentication

@MainActor
@Observable
final class BiometricLock {
    func authenticate() async -> Bool {
        let context = LAContext()
        var error: NSError?
        guard context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error) else {
            return false
        }
        do {
            return try await context.evaluatePolicy(
                .deviceOwnerAuthenticationWithBiometrics,
                localizedReason: "Lås opp Tidum"
            )
        } catch {
            return false
        }
    }
}
