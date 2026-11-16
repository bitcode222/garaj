import Foundation

/// The running job (src/domain/work-clock.js): a time log of who worked on a job and when, and
/// lines ticked off as done. A mechanic works on one job at a time.
enum WorkClock {
    struct Entry: Hashable {
        var id: String
        var staffId: String?
        var start: String
        var end: String?

        init(id: String, staffId: String?, start: String, end: String?) {
            self.id = id; self.staffId = staffId; self.start = start; self.end = end
        }

        init(_ v: JSONValue) {
            id = v["id"]?.string ?? ""
            staffId = v["staffId"]?.string
            start = v["start"]?.string ?? ""
            end = v["end"]?.string
        }

        var json: JSONValue {
            .object(["id": .string(id), "staffId": staffId.map(JSONValue.string) ?? .null, "start": .string(start), "end": end.map(JSONValue.string) ?? .null])
        }
    }

    static func entries(_ o: WorkOrder) -> [Entry] { o.timeLog.map(Entry.init) }

    /// The open entry of a job's time log.
    static func running(_ o: WorkOrder) -> Entry? { entries(o).first { ($0.end ?? "").isEmpty } }

    static func isRunning(_ o: WorkOrder) -> Bool { running(o) != nil }

    /// Milliseconds worked; a running entry counts up to `now`.
    static func workedMs(_ o: WorkOrder, now: String) -> Int {
        entries(o).reduce(0) { sum, e in
            guard let a = Dates.parseInstant(e.start), let b = Dates.parseInstant(e.end ?? now) else { return sum }
            return sum + max(0, Int((b.timeIntervalSince(a) * 1000).rounded()))
        }
    }

    /// Stops the clock at `now`; a job that is not running comes back unchanged.
    static func stop(_ o: WorkOrder, now: String) -> WorkOrder {
        guard isRunning(o) else { return o }
        var next = o
        next.timeLog = entries(o).map { e in var e = e; if (e.end ?? "").isEmpty { e.end = now }; return e.json }
        next.updatedAt = now
        return next
    }

    /// Starts work: to "in progress" when it is elsewhere, a new entry for the mechanic, and that
    /// mechanic's other running job stopped (returned as it is after stopping).
    static func start(_ o: WorkOrder, staffId: String?, now: String, orders: [WorkOrder], id: String) throws -> (order: WorkOrder, stopped: [WorkOrder]) {
        guard WorkOrderRules.isOpen(o.status) else {
            throw DomainError(code: "job_closed", message: "Lucrarea e închisă. Redeschide-o ca să lucrezi la ea.")
        }
        if isRunning(o) { return (o, []) }
        var next = o
        if o.status != "in_progress" {
            guard WorkOrderRules.canTransition(o.status, "in_progress") else {
                throw DomainError(code: "invalid_transition", message: "Lucrarea nu poate trece în lucru.")
            }
            var entry: JSONObject = ["at": .string(now), "type": .string("status"), "from": .string(o.status), "to": .string("in_progress")]
            let skipped = WorkOrderRules.skipped(o.status, "in_progress")
            if !skipped.isEmpty { entry["skipped"] = .array(skipped.map(JSONValue.string)) }
            next.status = "in_progress"
            next.dates["in_progress"] = .string(now)
            next.activity.append(.object(entry))
        }
        next.timeLog.append(Entry(id: id, staffId: staffId, start: now, end: nil).json)
        next.updatedAt = now
        let stopped = orders
            .filter { $0.id != o.id && running($0).map { $0.staffId == staffId } == true }
            .map { stop($0, now: now) }
        return (next, stopped)
    }

    /// The steps of a job: its labor lines (all lines when it has none), refused ones left out.
    static func steps(_ o: WorkOrder) -> (total: Int, done: Int, current: Line?) {
        let lines = o.lines.filter { !$0.refused }
        let labor = lines.filter { $0.kind == "labor" }
        let list = labor.isEmpty ? lines : labor
        return (list.count, list.filter(\.done).count, list.first { !$0.done })
    }

    /// The jobs whose clock runs, the most recently started first.
    static func runningJobs(_ orders: [WorkOrder]) -> [WorkOrder] {
        orders.filter { WorkOrderRules.isOpen($0.status) && isRunning($0) }
            .sorted { (running($0)?.start ?? "") > (running($1)?.start ?? "") }
    }
}
