import Foundation

/// Port of src/domain/ids.js: time-sortable ids (base-36 time + 8 random characters).
enum Ids {
    private static let alphabet = Array("0123456789abcdefghijklmnopqrstuvwxyz")

    static func uid(now: Date = .now) -> String {
        let ms = Int(now.timeIntervalSince1970 * 1000)
        let time = String(ms, radix: 36)
        let padded = String(repeating: "0", count: max(0, 9 - time.count)) + time
        let random = (0..<8).map { _ in alphabet[Int(UInt8.random(in: 0...255)) % 36] }
        return padded + String(random)
    }
}
