import Foundation
import Testing
@testable import Garaj

/// Reading a Romanian talon from recognised text (TalonParser).
struct TalonTests {
    @Test func readsCodedFields() {
        let lines = [
            "ROMANIA", "CERTIFICAT DE ÎNMATRICULARE",
            "A. B 123 ABC", "B. 12.03.2015",
            "C.2.1 POPESCU", "C.2.2 ION", "C.2.3 STR. MECANICILOR NR. 12, BUCURESTI",
            "D.1 VOLKSWAGEN", "D.2 1K", "D.3 GOLF",
            "E. WVWZZZ1KZ6W123456",
            "P.1 1598", "P.3 MOTORINA", "R ALB",
        ]
        let t = TalonParser.parse(lines)
        #expect(t.plate == "B 123 ABC")
        #expect(t.vin == "WVWZZZ1KZ6W123456")
        #expect(t.make == "Volkswagen")
        #expect(t.model == "Golf")
        #expect(t.year == 2015)
        #expect(t.engine == "1598 cm³")
        #expect(t.fuel == "diesel")
        #expect(t.owner == "Popescu Ion")
        #expect(t.address.hasPrefix("Str. Mecanicilor Nr. 12"))
        #expect(t.color == "Alb")
    }

    @Test func valuesOnTheNextLineAndGarbledCodes() {
        let lines = ["D.1", "DACIA", "D. 3", "LOGAN", "C.1.1", "SC TRANSPORT SRL", "CJ12XYZ", "VIN UU1LSDAEH5O123456", "B 01.06.2019"]
        let t = TalonParser.parse(lines)
        #expect(t.make == "Dacia")
        #expect(t.model == "Logan")
        #expect(t.owner == "SC Transport SRL")
        #expect(t.plate == "CJ 12 XYZ")
        #expect(t.vin == "UU1LSDAEH50123456") // O read for 0 is put back
        #expect(t.year == 2019)
    }

    @Test func cyrillicLookalikesReadAsLatin() {
        #expect(TalonParser.parse(["В. 12.03.2015", "А. В 123 АВС"]).year == 2015)
        #expect(TalonParser.parse(["А. В 123 АВС"]).plate == "B 123 ABC")
    }

    @Test func wordsAreNotCodes() {
        let t = TalonParser.parse(["AUDI", "BENZINA", "E-MAIL"])
        #expect(t.isEmpty)
    }

    @Test func shortMakesStayInCapitals() {
        #expect(TalonParser.parse(["D.1 BMW", "D.3 320D"]).make == "BMW")
        #expect(TalonParser.parse(["D.1 MERCEDES-BENZ"]).make == "Mercedes-Benz")
    }

    @Test func platesByShape() {
        #expect(TalonParser.plate(in: "nr B 07 XYZ") == "B 07 XYZ")
        #expect(TalonParser.plate(in: "B999ABC") == "B 999 ABC")
        #expect(TalonParser.plate(in: "XX 12 ABC") == nil)
    }
}
