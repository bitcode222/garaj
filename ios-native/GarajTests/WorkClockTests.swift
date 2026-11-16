import Foundation
import Testing
@testable import Garaj

/// The running job (src/domain/work-clock.js) against the JS answers.
struct WorkClockTests {
    struct Fixtures: Decodable {
        struct Worked: Decodable { let id: String; let ms: Int }
        struct Step: Decodable { let id: String; let total: Int; let done: Int; let current: String? }
        struct Stopped: Decodable { let id: String; let timeLog: JSONValue }
        struct Start: Decodable { let id: String; let staffId: String?; let status: String?; let timeLog: JSONValue?; let stopped: [Stopped]?; let error: String? }
        let now: String
        let jobs: [JSONValue]
        let worked: [Worked]
        let steps: [Step]
        let starts: [Start]
        let running: [String]
    }

    let f: Fixtures
    let jobs: [WorkOrder]
    init() throws {
        f = try loadFixture("work-clock")
        jobs = try f.jobs.map { try $0.merged(over: WorkOrder.defaults).decode(WorkOrder.self) }
    }

    @Test func timeWorked() {
        for (o, want) in zip(jobs, f.worked) { #expect(WorkClock.workedMs(o, now: f.now) == want.ms, "\(want.id)") }
    }

    @Test func steps() {
        for (o, want) in zip(jobs, f.steps) {
            let s = WorkClock.steps(o)
            #expect(s.total == want.total && s.done == want.done && s.current?.id == want.current, "\(want.id)")
        }
    }

    @Test func startingWork() throws {
        for want in f.starts {
            var order = jobs.first { $0.id == want.id }
            if want.id == "closed" { order = jobs[0]; order?.status = "delivered" }
            guard let o = order else { Issue.record("no job \(want.id)"); continue }
            do {
                let r = try WorkClock.start(o, staffId: want.staffId, now: f.now, orders: jobs, id: "new")
                #expect(want.error == nil)
                #expect(r.order.status == want.status, "\(want.id) \(String(describing: want.staffId))")
                #expect(JSONValue.array(r.order.timeLog) == want.timeLog, "\(want.id) \(String(describing: want.staffId))")
                #expect(r.stopped.map(\.id) == (want.stopped ?? []).map(\.id))
                for (got, w) in zip(r.stopped, want.stopped ?? []) { #expect(JSONValue.array(got.timeLog) == w.timeLog) }
            } catch let e as DomainError {
                #expect(e.code == want.error, "\(want.id)")
            }
        }
    }

    @Test func runningJobs() {
        #expect(WorkClock.runningJobs(jobs).map(\.id) == f.running)
    }
}
