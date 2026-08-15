// ios/Tidum/TidumTests/KeychainStoreTests.swift
import Foundation
import Testing
@testable import Tidum

@Suite("KeychainStore")
struct KeychainStoreTests {
    @Test func savesAndLoadsAccessToken() throws {
        let store = KeychainStore(service: "no.tidum.tests.\(UUID().uuidString)")
        try store.save(accessToken: "access-123", refreshToken: "refresh-456")
        #expect(store.loadAccessToken() == "access-123")
        store.clear()
        #expect(store.loadAccessToken() == nil)
    }

    @Test func updatesAccessTokenInPlace() throws {
        let store = KeychainStore(service: "no.tidum.tests.\(UUID().uuidString)")
        try store.save(accessToken: "old", refreshToken: "refresh")
        try store.updateAccessToken("new")
        #expect(store.loadAccessToken() == "new")
        store.clear()
    }
}
