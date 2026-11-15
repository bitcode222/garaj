import SwiftUI

/// Programări → Calendar: one day, a column per mechanic, like the iOS Calendar's day view.
/// A week strip on top (swipe for other weeks), the hours down the side, now as a red line.
/// Tap a free slot to book it; long-press a booking to lift it and drag it to another time or
/// mechanic; after lifting, a handle at its bottom stretches it. Moves snap to 15 minutes, can be
/// undone, and a confirmed booking moved in time asks whether the customer knows.
struct CalendarDayView: View {
    @Environment(AppStore.self) private var store
    @Environment(UndoCenter.self) private var undo
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Binding var day: String
    let open: (String) -> Void          // a booking's id
    let book: (String, String?) -> Void // start instant, mechanic

    @State private var selected: String?
    @State private var drag: DragState?
    @State private var pendingConfirm: PendingMove?
    @State private var snapTick = 0
    @State private var error: String?

    static let hourHeight: CGFloat = 64
    static let gutter: CGFloat = 44

    struct Column: Identifiable, Hashable { let id: String; let staffId: String?; let name: String; let color: Color }

    struct DragState: Equatable {
        let id: String
        var translation: CGSize = .zero
        var resizing = false
    }

    struct PendingMove: Identifiable { let id: String; let start: String; let end: String; let staffId: String? }

    var body: some View {
        let bookings = store.all(Appointment.self).filter { $0.status != "cancelled" && Dates.dayOfInstant($0.start) == day }
        let columns = columns(for: bookings)
        let shop = store.shop
        let bounds = CalendarGeometry.timeBounds(open: shop.hoursOpen, close: shop.hoursClose, events: bookings.map { ($0.start, $0.end) })
        VStack(spacing: 0) {
            WeekStrip(day: $day)
            Divider()
            ColumnHeaders(columns: columns)
            ScrollViewReader { proxy in
                ScrollView(.vertical) {
                    GeometryReader { geo in
                        let width = (geo.size.width - Self.gutter) / CGFloat(max(columns.count, 1))
                        ZStack(alignment: .topLeading) {
                            HourGrid(bounds: bounds)
                            ForEach(Array(columns.enumerated()), id: \.element.id) { index, column in
                                // Free slots: a tap books there.
                                Color.clear
                                    .contentShape(.rect)
                                    .frame(width: width, height: CGFloat(bounds.end - bounds.start) / 60 * Self.hourHeight)
                                    .offset(x: Self.gutter + CGFloat(index) * width)
                                    .onTapGesture { location in
                                        if selected != nil { selected = nil; return }
                                        let minute = bounds.start + CalendarGeometry.snap(Double(location.y / Self.hourHeight * 60), step: 30)
                                        book(CalendarGeometry.atMinute(day, minute), column.staffId)
                                    }
                                    .accessibilityHidden(true)
                                let mine = bookings.filter { $0.staffId == column.staffId }
                                let placed = Dictionary(uniqueKeysWithValues: CalendarGeometry.layout(mine.map { ($0.id, $0.start, $0.end) }).map { ($0.id, $0) })
                                ForEach(mine) { a in
                                    if let p = placed[a.id] {
                                        block(a, place: p, column: index, width: width, bounds: bounds, columns: columns)
                                    }
                                }
                            }
                            NowLine(day: day, bounds: bounds)
                        }
                        .padding(.top, 10) // room for the first hour's label
                    }
                    .frame(height: CGFloat(bounds.end - bounds.start) / 60 * Self.hourHeight + 24)
                    .coordinateSpace(.named("timeline"))
                }
                .onAppear { scrollToStart(proxy, bounds: bounds) }
                .onChange(of: day) { scrollToStart(proxy, bounds: bounds) }
            }
        }
        .sensoryFeedback(.selection, trigger: snapTick)
        .sensoryFeedback(.impact(weight: .medium), trigger: selected)
        .confirmationDialog("Clientul știe de noua oră?", isPresented: Binding(get: { pendingConfirm != nil }, set: { if !$0 { pendingConfirm = nil } }),
                            titleVisibility: .visible, presenting: pendingConfirm) { move in
            Button("Da, rămâne confirmată") { commit(move, customerKnows: true) }
            Button("Nu, redevine neconfirmată") { commit(move, customerKnows: false) }
            Button("Renunță", role: .cancel) {}
        }
        .alert("Nu se poate", isPresented: Binding(get: { error != nil }, set: { if !$0 { error = nil } })) {
            Button("OK", role: .cancel) {}
        } message: { Text(error ?? "") }
    }

    // MARK: Columns

    private func columns(for bookings: [Appointment]) -> [Column] {
        var out = store.all(Staff.self).filter(\.active).sorted { $0.order < $1.order }
            .map { Column(id: $0.id, staffId: $0.id, name: $0.name, color: Tone.color($0.color)) }
        // A booking whose mechanic left or was never chosen still shows.
        let known = Set(out.compactMap(\.staffId))
        if bookings.contains(where: { $0.staffId == nil || !known.contains($0.staffId!) }) {
            out.append(Column(id: "none", staffId: nil, name: "Fără mecanic", color: .gray))
        }
        return out.isEmpty ? [Column(id: "none", staffId: nil, name: "Programări", color: .gray)] : out
    }

    // MARK: A booking

    @ViewBuilder
    private func block(_ a: Appointment, place: CalendarGeometry.Placed, column: Int, width: CGFloat,
                       bounds: (start: Int, end: Int), columns: [Column]) -> some View {
        let startMin = CalendarGeometry.minuteOfDay(a.start)
        let length = max(15, Dates.minutesBetween(a.start, a.end))
        let laneWidth = (width - 4) / CGFloat(place.lanes)
        let x = Self.gutter + CGFloat(column) * width + 2 + CGFloat(place.lane) * laneWidth
        let y = CGFloat(startMin - bounds.start) / 60 * Self.hourHeight
        let state = drag?.id == a.id ? drag : nil
        let movable = AppStore.canMoveOnCalendar(a)
        let height = max(22, CGFloat(length) / 60 * Self.hourHeight + (state?.resizing == true ? state!.translation.height : 0)) - 2
        let offset = state?.resizing == false ? state!.translation : .zero
        let customer = store.get(Customer.self, a.customerId)
        let vehicle = store.get(Vehicle.self, a.vehicleId)

        EventBlock(appointment: a, customer: customer, vehicle: vehicle, height: height,
                   selected: selected == a.id, lifted: state != nil && state?.resizing == false)
            .frame(width: laneWidth - 2, height: height)
            .overlay(alignment: .bottom) {
                if selected == a.id && movable {
                    Capsule().fill(.white).frame(width: 36, height: 5)
                        .padding(.vertical, 8).padding(.horizontal, 20)
                        .contentShape(.rect)
                        .gesture(
                            DragGesture(minimumDistance: 1, coordinateSpace: .named("timeline"))
                                .onChanged { v in
                                    let snapped = CGFloat(CalendarGeometry.snap(Double(v.translation.height / Self.hourHeight * 60))) / 60 * Self.hourHeight
                                    if drag?.translation.height != snapped { snapTick += 1 }
                                    drag = DragState(id: a.id, translation: CGSize(width: 0, height: snapped), resizing: true)
                                }
                                .onEnded { v in
                                    let delta = CalendarGeometry.snap(Double(v.translation.height / Self.hourHeight * 60))
                                    let newLength = max(15, length + delta)
                                    drag = nil
                                    guard newLength != length else { return }
                                    propose(a, start: a.start, end: Dates.instant(Dates.parseInstant(a.start)!.addingTimeInterval(Double(newLength) * 60)), staffId: a.staffId)
                                }
                        )
                        .accessibilityLabel("Trage ca să schimbi durata")
                }
            }
            .offset(x: x + offset.width, y: y + offset.height)
            .zIndex(state != nil || selected == a.id ? 10 : 1)
            .animation(reduceMotion ? nil : .spring(duration: 0.3, bounce: 0), value: selected)
            .onTapGesture {
                if selected == a.id { selected = nil } else if selected != nil { selected = nil } else { open(a.id) }
            }
            .gesture(movable ? moveGesture(a, startMin: startMin, length: length, column: column, width: width, columns: columns) : nil)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("\(Dates.timeOfInstant(a.start))–\(Dates.timeOfInstant(a.end)), \(vehicle.map { People.formatPlate($0.plate) } ?? ""), \(customer?.name ?? ""), \(AppointmentRules.style(a.status).label)")
            .accessibilityAddTraits(.isButton)
            .accessibilityHint(movable ? "Ține apăsat și trage ca s-o muți" : "")
            .accessibilityAction(named: "Deschide") { open(a.id) }
    }

    private func moveGesture(_ a: Appointment, startMin: Int, length: Int, column: Int, width: CGFloat, columns: [Column]) -> some Gesture {
        LongPressGesture(minimumDuration: 0.3)
            .sequenced(before: DragGesture(minimumDistance: 0, coordinateSpace: .named("timeline")))
            .onChanged { value in
                guard case .second(true, let d) = value else { return }
                if selected != a.id { selected = a.id }
                let t = d?.translation ?? .zero
                let snappedY = CGFloat(CalendarGeometry.snap(Double(t.height / Self.hourHeight * 60))) / 60 * Self.hourHeight
                let shift = max(-column, min(columns.count - 1 - column, Int((t.width / width).rounded())))
                let next = CGSize(width: CGFloat(shift) * width, height: snappedY)
                if drag?.translation != next { snapTick += 1 }
                drag = DragState(id: a.id, translation: next)
            }
            .onEnded { value in
                Log.store.debug("calendar drag ended: \(String(describing: value), privacy: .public)")
                guard case .second(true, let d) = value, let t = d?.translation else { drag = nil; return }
                let delta = CalendarGeometry.snap(Double(t.height / Self.hourHeight * 60))
                let shift = max(-column, min(columns.count - 1 - column, Int((t.width / width).rounded())))
                drag = nil
                guard delta != 0 || shift != 0 else { return } // a long press without moving only selects
                let newStart = CalendarGeometry.atMinute(day, startMin + delta)
                let newEnd = Dates.instant(Dates.parseInstant(newStart)!.addingTimeInterval(Double(length) * 60))
                selected = nil
                propose(a, start: newStart, end: newEnd, staffId: columns[column + shift].staffId)
            }
    }

    // MARK: Writes

    private func propose(_ a: Appointment, start: String, end: String, staffId: String?) {
        let move = PendingMove(id: a.id, start: start, end: end, staffId: staffId)
        if a.status == "confirmed" && (a.start != start || a.end != end) { pendingConfirm = move } else { commit(move, customerKnows: false) }
    }

    private func commit(_ move: PendingMove, customerKnows: Bool) {
        do {
            let before = try store.moveOnCalendar(move.id, start: move.start, end: move.end, staffId: move.staffId, customerKnows: customerKnows)
            let staff = store.get(Staff.self, move.staffId)?.name
            undo.show("\(Dates.timeOfInstant(move.start))–\(Dates.timeOfInstant(move.end))\(before.staffId != move.staffId ? " · \(staff ?? "fără mecanic")" : "")") {
                store.restore(before)
            }
        } catch { self.error = error.localizedDescription }
    }

    private func scrollToStart(_ proxy: ScrollViewProxy, bounds: (start: Int, end: Int)) {
        // Today: an hour before now; another day: the opening hour.
        let target = day == Dates.today() ? max(bounds.start, CalendarGeometry.minuteOfDay(Dates.instant()) - 60) : bounds.start
        proxy.scrollTo("hour-\(target / 60)", anchor: .top)
    }
}

// MARK: - Pieces

/// Seven days, Monday first; a dot where there are bookings; swipe or arrows for another week.
private struct WeekStrip: View {
    @Environment(AppStore.self) private var store
    @Binding var day: String
    @State private var dragX: CGFloat = 0

    var body: some View {
        let days = CalendarGeometry.weekDays(day)
        let counts = Dictionary(grouping: store.all(Appointment.self).filter { $0.status != "cancelled" }, by: { Dates.dayOfInstant($0.start) ?? "" }).mapValues(\.count)
        let today = Dates.today()
        let ro = Locale(identifier: "ro_RO")
        VStack(spacing: 6) {
            HStack {
                Text(Dates.parseDate(day)!.formatted(.dateTime.month(.wide).year().locale(ro)).capitalized).font(.headline)
                Spacer()
                Button { day = Dates.addDays(day, -7) } label: { Image(systemName: "chevron.left").frame(width: 44, height: 32) }
                    .accessibilityLabel("Săptămâna dinainte")
                Button { day = Dates.addDays(day, 7) } label: { Image(systemName: "chevron.right").frame(width: 44, height: 32) }
                    .accessibilityLabel("Săptămâna următoare")
            }
            .padding(.horizontal, 16)
            HStack(spacing: 0) {
                ForEach(days, id: \.self) { d in
                    let date = Dates.parseDate(d)!
                    let isSelected = d == day, isToday = d == today
                    Button { day = d } label: {
                        VStack(spacing: 4) {
                            Text(date.formatted(.dateTime.weekday(.narrow).locale(ro)).uppercased()).font(.caption2.weight(.medium)).foregroundStyle(.secondary)
                            Text(date.formatted(.dateTime.day())).font(.body.weight(isSelected || isToday ? .semibold : .regular))
                                .frame(width: 36, height: 36)
                                .foregroundStyle(isSelected ? .white : isToday ? Color.accentColor : .primary)
                                .background(isSelected ? (isToday ? Color.accentColor : Color.primary) : .clear, in: .circle)
                            Circle().fill(counts[d, default: 0] > 0 ? Color.secondary : .clear).frame(width: 5, height: 5)
                        }
                        .frame(maxWidth: .infinity, minHeight: 44)
                        .contentShape(.rect)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("\(date.formatted(.dateTime.weekday(.wide).day().month(.wide).locale(ro))), \(counts[d, default: 0]) programări")
                    .accessibilityAddTraits(isSelected ? .isSelected : [])
                }
            }
            .padding(.horizontal, 8)
            .offset(x: dragX)
            .gesture(
                DragGesture(minimumDistance: 20)
                    .onChanged { dragX = $0.translation.width * 0.4 }
                    .onEnded { v in
                        let projected = v.predictedEndTranslation.width
                        withAnimation(.spring(duration: 0.3, bounce: 0)) { dragX = 0 }
                        if projected < -120 { day = Dates.addDays(day, 7) } else if projected > 120 { day = Dates.addDays(day, -7) }
                    }
            )
        }
        .padding(.vertical, 8)
        .sensoryFeedback(.selection, trigger: day)
    }
}

private struct ColumnHeaders: View {
    let columns: [CalendarDayView.Column]

    var body: some View {
        HStack(spacing: 0) {
            Color.clear.frame(width: CalendarDayView.gutter, height: 1)
            ForEach(columns) { c in
                HStack(spacing: 6) {
                    Text(String(c.name.prefix(1))).font(.caption.weight(.bold)).foregroundStyle(.white)
                        .frame(width: 22, height: 22).background(c.color, in: .circle)
                    Text(c.name.split(separator: " ").first.map(String.init) ?? c.name).font(.caption.weight(.medium)).lineLimit(1)
                }
                .frame(maxWidth: .infinity)
            }
        }
        .padding(.vertical, 6)
        .fixedSize(horizontal: false, vertical: true)
        .background(.bar)
    }
}

private struct HourGrid: View {
    let bounds: (start: Int, end: Int)

    var body: some View {
        VStack(spacing: 0) {
            ForEach(Array(stride(from: bounds.start / 60, through: bounds.end / 60, by: 1)), id: \.self) { h in
                HStack(alignment: .top, spacing: 6) {
                    Text(String(format: "%02d:00", h))
                        .font(.caption2.monospacedDigit())
                        .foregroundStyle(.secondary)
                        .frame(width: CalendarDayView.gutter - 8, alignment: .trailing)
                        .offset(y: -7)
                    Rectangle().fill(Color(.separator)).frame(height: 0.5)
                }
                .frame(height: CalendarDayView.hourHeight, alignment: .top)
                .id("hour-\(h)")
            }
        }
        .accessibilityHidden(true)
    }
}

private struct NowLine: View {
    let day: String
    let bounds: (start: Int, end: Int)

    var body: some View {
        TimelineView(.everyMinute) { context in
            let now = Dates.instant(context.date)
            let minute = CalendarGeometry.minuteOfDay(now)
            if Dates.dayOfInstant(now) == day && minute >= bounds.start && minute <= bounds.end {
                HStack(spacing: 0) {
                    Circle().fill(.red).frame(width: 8, height: 8)
                    Rectangle().fill(.red).frame(height: 1.5)
                }
                .offset(x: CalendarDayView.gutter - 4, y: CGFloat(minute - bounds.start) / 60 * CalendarDayView.hourHeight - 4)
                .allowsHitTesting(false)
                .accessibilityHidden(true)
            }
        }
    }
}

private struct EventBlock: View {
    let appointment: Appointment
    let customer: Customer?
    let vehicle: Vehicle?
    let height: CGFloat
    let selected: Bool
    let lifted: Bool

    var body: some View {
        let style = AppointmentRules.style(appointment.status)
        let faded = appointment.status == "no_show" || appointment.status == "done"
        VStack(alignment: .leading, spacing: 1) {
            Text(vehicle.map { People.formatPlate($0.plate) } ?? Dates.timeOfInstant(appointment.start))
                .font(.caption2.weight(.semibold))
                .lineLimit(1)
                .minimumScaleFactor(0.75)
            if height > 34 { Text(customer?.name ?? "").font(.caption2).lineLimit(1) }
            if height > 50 { Text(Dates.timeOfInstant(appointment.start) + "–" + Dates.timeOfInstant(appointment.end)).font(.caption2.monospacedDigit()).foregroundStyle(.secondary) }
            if height > 66, !appointment.title.isEmpty { Text(appointment.title).font(.caption2).foregroundStyle(.secondary).lineLimit(2) }
        }
        .padding(.leading, 6)
        .padding(.vertical, 3)
        .padding(.trailing, 2)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(style.color.opacity(faded ? 0.08 : 0.22), in: .rect(cornerRadius: 6))
        .overlay(alignment: .leading) { UnevenRoundedRectangle(topLeadingRadius: 6, bottomLeadingRadius: 6).fill(style.color).frame(width: 3) }
        .overlay {
            if appointment.status == "scheduled" {
                RoundedRectangle(cornerRadius: 6).strokeBorder(style.color.opacity(0.8), style: StrokeStyle(lineWidth: 1, dash: [3, 2]))
            }
            if selected { RoundedRectangle(cornerRadius: 6).strokeBorder(Color.accentColor, lineWidth: 2) }
        }
        .opacity(faded ? 0.6 : 1)
        .clipShape(.rect(cornerRadius: 6))
        .shadow(color: .black.opacity(lifted ? 0.35 : 0), radius: lifted ? 10 : 0, y: lifted ? 6 : 0)
        .scaleEffect(lifted ? 1.03 : 1)
    }
}
