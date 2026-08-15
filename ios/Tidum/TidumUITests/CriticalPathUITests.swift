// ios/Tidum/TidumUITests/CriticalPathUITests.swift
import XCTest

final class CriticalPathUITests: XCTestCase {
    func testLoginScreenShowsBothProviders() {
        let app = XCUIApplication()
        app.launch()

        XCTAssertTrue(app.buttons["Logg inn med BankID"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["Logg inn med Google"].exists)
    }
}
