import XCTest

/// Drives the calendar like a finger: long-press a booking, drag it an hour down, check it moved,
/// then undo. Run on demand: `xcodebuild test -only-testing:GarajUITests` (not part of npm run ios:test).
final class CalendarDragUITests: XCTestCase {
    func testLongPressAndDragMovesABookingAnHourLater() throws {
        let app = XCUIApplication()
        app.launchArguments = ["-GarajTab", "programari", "-appointments.mode", "calendar"]
        app.launch()

        let timed = NSPredicate(format: "label MATCHES %@", "^\\d\\d:\\d\\d–\\d\\d:\\d\\d, .*")
        let block = app.descendants(matching: .any).matching(timed).firstMatch
        XCTAssertTrue(block.waitForExistence(timeout: 10), "no booking on the calendar")
        let label = block.label
        let times = label.prefix(11) // "10:00–12:00"
        let h1 = Int(times.prefix(2))!, h2 = Int(times.dropFirst(6).prefix(2))!
        let rest = label.dropFirst(11)
        let expected = String(format: "%02d:%@–%02d:%@", h1 + 1, String(times.dropFirst(3).prefix(2)), h2 + 1, String(times.dropFirst(9).prefix(2))) + rest

        let from = block.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.2))
        let to = from.withOffset(CGVector(dx: 0, dy: 64)) // one hour
        from.press(forDuration: 0.6, thenDragTo: to)

        // A confirmed booking asks whether the customer knows.
        let keep = app.buttons["Da, rămâne confirmată"]
        if keep.waitForExistence(timeout: 1) { keep.tap() }

        let moved = app.descendants(matching: .any).matching(NSPredicate(format: "label == %@", expected)).firstMatch
        XCTAssertTrue(moved.waitForExistence(timeout: 5), "expected “\(expected)” after the drag, from “\(label)”")

        app.buttons["Anulează"].firstMatch.tap() // undo
        XCTAssertTrue(app.descendants(matching: .any).matching(NSPredicate(format: "label == %@", label)).firstMatch.waitForExistence(timeout: 5), "undo did not put it back")
    }
}
