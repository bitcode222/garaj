import Foundation
import Testing
@testable import Garaj

/// The Swift port of src/domain/money.js must give the JS answers (fixtures from `npm run ios:fixtures`).
struct MoneyTests {
    struct Fixtures: Decodable {
        struct Parse: Decodable { let input: String; let output: Int? }
        struct Percent: Decodable { let amount: Int; let rate: Double; let output: Int }
        struct Div: Decodable { let num: Int; let den: Int; let output: Int }
        struct Format: Decodable { let minor: Int; let output: String; let signed: String; let input: String }
        struct Quantity: Decodable { let input: String; let output: Double? }
        struct FormatQuantity: Decodable { let qty: Double; let output: String }
        let parse: [Parse]
        let percentOf: [Percent]
        let divRound: [Div]
        let format: [Format]
        let parseQuantity: [Quantity]
        let formatQuantity: [FormatQuantity]
    }

    let f: Fixtures = try! loadFixture("money")

    @Test func parse() {
        for c in f.parse { #expect(Money.parse(c.input) == c.output, "parse(\(c.input.debugDescription))") }
    }

    @Test func percentOf() {
        for c in f.percentOf { #expect(Money.percentOf(c.amount, c.rate) == c.output, "\(c.amount) × \(c.rate)%") }
    }

    @Test func divRound() {
        for c in f.divRound { #expect(Money.divRound(c.num, c.den) == c.output, "\(c.num)/\(c.den)") }
    }

    @Test func format() {
        for c in f.format {
            #expect(Money.format(c.minor) == normalize(c.output))
            #expect(Money.format(c.minor, sign: true) == normalize(c.signed))
            #expect(Money.toInput(c.minor) == c.input)
        }
    }

    @Test func quantities() {
        for c in f.parseQuantity { #expect(Money.parseQuantity(c.input) == c.output, "parseQuantity(\(c.input.debugDescription))") }
        for c in f.formatQuantity { #expect(Money.formatQuantity(c.qty) == normalize(c.output), "formatQuantity(\(c.qty))") }
    }

    /// Node's ICU and Apple's may differ only in the minus sign character; anything else is a real difference.
    private func normalize(_ s: String) -> String { s }
}

func loadFixture<T: Decodable>(_ name: String) throws -> T {
    let url = Bundle(for: FixtureBundle.self).url(forResource: name, withExtension: "json")!
    return try JSONDecoder().decode(T.self, from: Data(contentsOf: url))
}

final class FixtureBundle {}
