// The iPhone "Your next table" widget (owner card S4). Never a title, the host or the QR:
// "Jurrgun table", the start time and a live countdown, and the place only when the member
// turned it on. The lock-screen version shows the time only. It blanks once the table ends.
import SwiftUI
import WidgetKit

private let group = "group.app.jurrgun"

struct NextTable {
  let startsAt: Date
  let endsAt: Date
  let cancelled: Bool
  let place: String
  let pass: String
  let th: Bool

  static func load() -> NextTable? {
    guard let d = UserDefaults(suiteName: group)?.dictionary(forKey: "next") else { return nil }
    guard let s = (d["startsAt"] as? NSNumber)?.doubleValue, let e = (d["endsAt"] as? NSNumber)?.doubleValue else { return nil }
    return NextTable(
      startsAt: Date(timeIntervalSince1970: s / 1000),
      endsAt: Date(timeIntervalSince1970: e / 1000),
      cancelled: ((d["cancelled"] as? NSNumber)?.intValue ?? 0) == 1,
      place: d["place"] as? String ?? "",
      pass: d["pass"] as? String ?? "/me/events",
      th: (d["lang"] as? String ?? "th") != "en"
    )
  }
}

struct Entry: TimelineEntry {
  let date: Date
  let table: NextTable?
  let th: Bool
}

struct Provider: TimelineProvider {
  func placeholder(in context: Context) -> Entry { Entry(date: .now, table: nil, th: true) }
  func getSnapshot(in context: Context, completion: @escaping (Entry) -> Void) { completion(entry(at: .now)) }
  func getTimeline(in context: Context, completion: @escaping (Timeline<Entry>) -> Void) {
    let now = Date.now
    let t = NextTable.load()
    var entries = [entry(at: now)]
    // Switch to "started" at the start, and blank at the end.
    if let t, t.startsAt > now { entries.append(entry(at: t.startsAt)) }
    if let t, t.endsAt > now { entries.append(Entry(date: t.endsAt, table: nil, th: t.th)) }
    completion(Timeline(entries: entries, policy: .after(now.addingTimeInterval(6 * 3600))))
  }
  private func entry(at date: Date) -> Entry {
    let t = NextTable.load()
    let th = t?.th ?? (Locale.preferredLanguages.first?.hasPrefix("th") ?? true)
    return Entry(date: date, table: (t != nil && t!.endsAt > date) ? t : nil, th: th)
  }
}

private func w(_ th: Bool, _ thai: String, _ en: String) -> String { th ? thai : en }

private func timeText(_ d: Date) -> String {
  let f = DateFormatter()
  f.timeZone = TimeZone(identifier: "Asia/Bangkok")
  f.locale = Locale(identifier: "en_GB")
  f.dateFormat = "HH:mm"
  return f.string(from: d)
}

private func dayText(_ d: Date, now: Date, th: Bool) -> String {
  var cal = Calendar(identifier: .gregorian)
  cal.timeZone = TimeZone(identifier: "Asia/Bangkok")!
  if cal.isDate(d, inSameDayAs: now) { return w(th, "วันนี้", "Today") }
  if let tmr = cal.date(byAdding: .day, value: 1, to: now), cal.isDate(d, inSameDayAs: tmr) { return w(th, "พรุ่งนี้", "Tomorrow") }
  let f = DateFormatter()
  f.timeZone = cal.timeZone
  f.locale = Locale(identifier: th ? "th_TH" : "en_GB")
  f.setLocalizedDateFormatFromTemplate("EEE d MMM")
  return f.string(from: d)
}

struct NextTableView: View {
  @Environment(\.widgetFamily) var family
  let entry: Entry

  var body: some View {
    let th = entry.th
    switch family {
    case .accessoryInline, .accessoryCircular, .accessoryRectangular:
      // Lock screen: the time only.
      if let t = entry.table, !t.cancelled { Text(timeText(t.startsAt)) } else { Text("Jurrgun") }
    default:
      VStack(alignment: .leading, spacing: 6) {
        Text(w(th, "โต๊ะถัดไป", "Your next table")).font(.caption).bold().foregroundStyle(Color("$accent"))
        Spacer(minLength: 0)
        if let t = entry.table {
          if t.cancelled {
            Text(w(th, "โต๊ะนี้ยกเลิกแล้ว", "This table is cancelled")).font(.headline)
          } else {
            if t.startsAt > entry.date {
              (Text(w(th, "เริ่มอีก ", "Starts in ")) + Text(t.startsAt, style: .relative)).font(.headline).minimumScaleFactor(0.7).lineLimit(2)
            } else {
              Text(w(th, "เริ่มแล้ว", "Started")).font(.headline)
            }
            Text("\(dayText(t.startsAt, now: entry.date, th: th)) · \(timeText(t.startsAt))").font(.caption).foregroundStyle(.secondary)
            Text(t.place.isEmpty ? w(th, "โต๊ะ Jurrgun", "Jurrgun table") : t.place).font(.caption).foregroundStyle(.secondary).lineLimit(1)
          }
        } else {
          Text(w(th, "ยังไม่มีโต๊ะที่จองไว้", "No table booked yet")).font(.subheadline).foregroundStyle(.secondary)
        }
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    }
  }
}

struct JurrgunNextTable: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "JurrgunNextTable", provider: Provider()) { entry in
      NextTableView(entry: entry)
        .containerBackground(Color("$widgetBackground"), for: .widget)
        .widgetURL(URL(string: "jurrgun://" + String((entry.table?.pass ?? "/me/events").dropFirst())))
    }
    .configurationDisplayName("Jurrgun")
    .description("โต๊ะถัดไป · Your next table")
    .supportedFamilies([.systemSmall, .systemMedium, .accessoryInline, .accessoryRectangular])
  }
}

@main
struct JurrgunWidgets: WidgetBundle {
  var body: some Widget { JurrgunNextTable() }
}
