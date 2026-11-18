import SwiftUI

/// De contactat: who to call or message today (ITP, RCA, revizie, restanțe, cars to pick up, tomorrow's
/// bookings), each with its message ready. Sending or marking it contacted hides it for a week;
/// "Amână" hides it for as long as chosen. Undo puts it back.
struct RemindersView: View {
    @Environment(AppStore.self) private var store
    @Environment(UndoCenter.self) private var undo

    var body: some View {
        let reminders = store.reminders()
        let customers = Dictionary(store.all(Customer.self).map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
        let vehicles = Dictionary(store.all(Vehicle.self).map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
        let invoices = Dictionary(store.all(Invoice.self).map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
        let grouped = Dictionary(grouping: reminders, by: \.type)
        List {
            ForEach(Reminders.types, id: \.key) { type in
                if let items = grouped[type.key], !items.isEmpty {
                    Section {
                        ForEach(items) { r in
                            let customer = customers[r.customerId ?? ""]
                            let vehicle = vehicles[r.vehicleId ?? ""]
                            ReminderRow(reminder: r, customer: customer, vehicle: vehicle, currency: store.currency,
                                        message: Reminders.message(r, customer: customer, vehicle: vehicle, invoice: invoices[r.invoiceId ?? ""], settings: store.settings),
                                        handled: { channel in handled(r, channel: channel, days: 7) })
                                .swipeActions(edge: .leading) {
                                    Button { handled(r, channel: "manual", days: 7) } label: { Label("Contactat", systemImage: "checkmark") }.tint(.green)
                                }
                                .swipeActions(edge: .trailing) {
                                    ForEach([30, 7, 1], id: \.self) { days in
                                        Button { handled(r, channel: "snooze", days: days) } label: { Label(days == 1 ? "O zi" : "\(days) zile", systemImage: "moon.zzz") }
                                            .tint(days == 1 ? .indigo : days == 7 ? .purple : .gray)
                                    }
                                }
                        }
                    } header: {
                        CapsHeader("\(type.label) · \(items.count)")
                    }
                }
            }
        }
        .groupedBackground()
        .listStyle(.insetGrouped)
        .overlay {
            if reminders.isEmpty {
                ContentUnavailableView("Nimeni de contactat azi", systemImage: "checkmark.circle", description: Text("ITP-uri, RCA-uri, revizii, restanțe și mașini de ridicat apar aici când e momentul."))
            }
        }
        .navigationTitle("De contactat")
    }

    private func handled(_ r: Reminder, channel: String, days: Int) {
        store.logContact(r.key, channel: channel, days: days)
        undo.show(channel == "snooze" ? "Amânat \(days == 1 ? "o zi" : "\(days) zile")" : "Marcat ca contactat") { store.clearContact(r.key) }
    }
}

private struct ReminderRow: View {
    let reminder: Reminder
    let customer: Customer?
    let vehicle: Vehicle?
    let currency: String
    let message: String
    let handled: (String) -> Void

    var body: some View {
        let style = Reminders.style(reminder.type)
        let urgent = reminder.urgency == "expired" || reminder.urgency == "overdue"
        let noConsent = Reminders.needsConsent.contains(reminder.type) && customer?.marketingConsent == false
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline) {
                Text(customer?.name ?? "Client necunoscut").font(.headline)
                Spacer()
                if let v = vehicle { Text(People.formatPlate(v.plate)).font(.subheadline.weight(.medium)).foregroundStyle(.secondary) }
            }
            Label(Reminders.detail(reminder, currency: currency), systemImage: urgent ? "exclamationmark.circle.fill" : style.symbol)
                .labelStyle(StatusLabelStyle())
                .font(.subheadline)
                .foregroundStyle(urgent ? .red : .secondary)
            if noConsent {
                Label("Fără acord de marketing: doar dacă ți-a cerut", systemImage: "hand.raised").font(.caption).foregroundStyle(.orange)
            }
            if let phone = customer?.phone, !phone.isEmpty {
                HStack(spacing: 8) {
                    if let url = People.whatsappURL(phone, text: message) {
                        Link(destination: url) { Label("WhatsApp", systemImage: "text.bubble.fill") }
                            .buttonStyle(.primarySmall)
                            .simultaneousGesture(TapGesture().onEnded { handled("whatsapp") })
                    }
                    if let url = People.smsURL(phone, body: message) {
                        Link(destination: url) { Label("SMS", systemImage: "message.fill") }
                            .buttonStyle(.secondarySmall)
                            .simultaneousGesture(TapGesture().onEnded { handled("sms") })
                    }
                    if let url = People.telURL(phone) {
                        Link(destination: url) { Label("Sună", systemImage: "phone.fill").labelStyle(.iconOnly) }
                            .buttonStyle(FillButtonStyle(kind: .secondary, small: true, fill: false))
                            .simultaneousGesture(TapGesture().onEnded { handled("call") })
                            .accessibilityLabel("Sună")
                    }
                }
            } else {
                Text("Clientul nu are telefon.").font(.caption).foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 4)
    }
}

extension AppStore {
    /// Today's reminders (computeReminders) from the current data.
    func reminders(today: String = Dates.today()) -> [Reminder] {
        Reminders.compute(today: today, vehicles: all(Vehicle.self),
                          customers: Dictionary(all(Customer.self).map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a }),
                          invoices: all(Invoice.self), paymentsByInvoice: Dictionary(grouping: all(Payment.self), by: \.invoiceId),
                          orders: all(WorkOrder.self), appointments: all(Appointment.self),
                          contacts: Dictionary(all(Contact.self).map { ($0.key, $0) }, uniquingKeysWith: { a, _ in a }))
    }
}
