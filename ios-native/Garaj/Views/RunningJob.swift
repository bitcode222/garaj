import SwiftUI

// The running job (look 3 part 4, docs/IOS-NATIVE.md §9): what is being worked on sits above the
// tab bar on every tab, the way a podcast app keeps the episode playing there.

/// The main button of a job: the clock for a job in progress (Pauză / Continuă), else the next
/// step; starting work ("Începe lucrul", "Reia lucrul") also starts the clock.
enum JobAction {
    typealias Action = (label: String, symbol: String, run: () -> Void)

    @MainActor
    static func primary(_ order: WorkOrder, store: AppStore, move: @escaping (String) -> Void, failed: @escaping (String) -> Void) -> Action? {
        let start = { do { try store.startWork(order.id) } catch { failed(error.localizedDescription) } }
        if order.status == "in_progress" {
            return WorkClock.isRunning(order)
                ? ("Pauză", "pause.fill", { do { try store.stopWork(order.id) } catch { failed(error.localizedDescription) } })
                : ("Continuă", "play.fill", start)
        }
        guard let next = WorkOrderRules.next[order.status] else { return nil }
        if next == "in_progress" { return (Labels.workOrderAction(from: order.status, to: next), "play.fill", start) }
        return (Labels.workOrderAction(from: order.status, to: next), Labels.workOrder(next).symbol, { move(next) })
    }
}

/// "1:12:40": hours, minutes, seconds worked.
func clockText(_ ms: Int) -> String {
    let s = ms / 1000
    return String(format: "%d:%02d:%02d", s / 3600, s / 60 % 60, s % 60)
}

/// The bar above the tabs: the car, the current step, the time running; pause, tick the step,
/// tap to open the job.
struct RunningJobBar: View {
    @Environment(AppStore.self) private var store
    @Environment(\.tabViewBottomAccessoryPlacement) private var placement
    let order: WorkOrder
    let open: () -> Void
    @State private var error: String?

    var body: some View {
        let vehicle = store.get(Vehicle.self, order.vehicleId)
        let steps = WorkClock.steps(order)
        HStack(spacing: 10) {
            Button(action: open) {
                HStack(spacing: 10) {
                    MakeLogo(make: vehicle?.make ?? "", size: 32)
                    VStack(alignment: .leading, spacing: 0) {
                        Text(steps.current?.description.nonEmpty ?? JobText.headline(order)).font(.subheadline.weight(.semibold)).lineLimit(1)
                        TimelineView(.periodic(from: .now, by: 1)) { ctx in
                            Text([vehicle.map { People.formatPlate($0.plate) }, steps.total > 0 ? "pas \(min(steps.done + 1, steps.total)) din \(steps.total)" : nil,
                                  clockText(WorkClock.workedMs(order, now: Dates.instant(ctx.date)))].compactMap { $0 }.joined(separator: " · "))
                                .font(.caption).monospacedDigit().foregroundStyle(.secondary).lineLimit(1)
                        }
                    }
                    Spacer(minLength: 0)
                }
                .contentShape(.rect)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Lucrarea pornită: \(JobText.headline(order))")
            .accessibilityHint("Deschide lucrarea")
            Button {
                do { try store.stopWork(order.id) } catch { self.error = error.localizedDescription }
            } label: {
                Image(systemName: "pause.fill").font(.title3).frame(width: 36, height: 36)
            }
            .accessibilityLabel("Pauză")
            if placement != .inline, let current = steps.current {
                Button {
                    do { try store.setLineDone(order.id, lineId: current.id, done: true) } catch { self.error = error.localizedDescription }
                } label: {
                    Image(systemName: "checkmark").font(.title3.weight(.semibold)).frame(width: 36, height: 36)
                }
                .accessibilityLabel("Gata: \(current.description)")
            }
        }
        .tint(.primary)
        .padding(.horizontal, 12)
        .sensoryFeedback(.success, trigger: steps.done)
        .alert("Nu se poate", isPresented: Binding(get: { error != nil }, set: { if !$0 { error = nil } })) {
            Button("OK", role: .cancel) {}
        } message: { Text(error ?? "") }
    }
}

/// Puts the running job above the tab bar while a job's clock runs (iOS 26.1 hides it otherwise).
struct RunningJobAccessory: ViewModifier {
    @Environment(AppStore.self) private var store
    @State private var opened: String?

    func body(content: Content) -> some View {
        let running = WorkClock.runningJobs(store.all(WorkOrder.self)).first
        Group {
            if #available(iOS 26.1, *) {
                content.tabViewBottomAccessory(isEnabled: running != nil) { bar(running) }
            } else if running != nil {
                content.tabViewBottomAccessory { bar(running) }
            } else {
                content
            }
        }
        #if DEBUG
        // Screenshots: `-GarajStartWork <number>` starts the clock on that job.
        .task {
            if let n = UserDefaults.standard.string(forKey: "GarajStartWork"), let o = store.all(WorkOrder.self).first(where: { "\($0.number)" == n }) {
                try? store.startWork(o.id)
            }
        }
        #endif
        .sheet(item: Binding(get: { opened.map(Opened.init) }, set: { opened = $0?.id })) { o in
            NavigationStack {
                WorkOrderDetailView(id: o.id)
                    .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Închide", systemImage: "chevron.down") { opened = nil } } }
            }
        }
    }

    @ViewBuilder private func bar(_ running: WorkOrder?) -> some View {
        if let running { RunningJobBar(order: running) { opened = running.id } }
    }

    private struct Opened: Identifiable { let id: String }
}
