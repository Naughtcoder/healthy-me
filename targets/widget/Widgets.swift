import AppIntents
import SwiftUI
import WidgetKit

// ---- the + water button on the widget ------------------------------------------

struct AddWaterIntent: AppIntent {
  static var title: LocalizedStringResource = "Add water"
  @Parameter(title: "Millilitres", default: 250) var ml: Int
  init() {}
  init(ml: Int) { self.ml = ml }
  func perform() async throws -> some IntentResult {
    Shared.addWater(ml)
    return .result()
  }
}

// ---- timeline: a new entry at each thing due, and at the carb and window edges --

struct Entry: TimelineEntry {
  let date: Date
  let today: Shared.Today?
}

struct Provider: TimelineProvider {
  func placeholder(in context: Context) -> Entry { Entry(date: .now, today: nil) }
  func getSnapshot(in context: Context, completion: @escaping (Entry) -> Void) { completion(Entry(date: .now, today: Shared.today())) }
  func getTimeline(in context: Context, completion: @escaping (Timeline<Entry>) -> Void) {
    let t = Shared.today()
    let now = Date().timeIntervalSince1970
    var times = [now]
    if let t {
      times += ([t.open, t.cutoff, t.close] + t.events.map(\.t) + t.events.map { $0.t + 30 * 60 }).filter { $0 > now }
    }
    let entries = Array(Set(times)).sorted().prefix(30).map { Entry(date: Date(timeIntervalSince1970: $0), today: t) }
    completion(Timeline(entries: entries, policy: .after(Date().addingTimeInterval(60 * 60))))
  }
}

// ---- what to show --------------------------------------------------------------

/// The next thing due at a moment: anything up to 30 minutes late still counts.
func nextEvent(_ t: Shared.Today, at date: Date) -> Shared.Event? {
  t.events.first { $0.t + 30 * 60 > date.timeIntervalSince1970 }
}

/// One line on the eating window: opens, carbs left, carbs over, closed.
struct WindowLine: View {
  let t: Shared.Today; let date: Date
  var body: some View {
    let n = date.timeIntervalSince1970
    if n < t.open {
      Text("Window opens \(Shared.clock(t.open))")
    } else if n < t.cutoff {
      Text("Carbs end ") + Text(Date(timeIntervalSince1970: t.cutoff), style: .relative).monospacedDigit() + Text(" from now")
    } else if n < t.close {
      Text("No carbs. Closes \(Shared.clock(t.close))")
    } else {
      Text("Closed. Opens \(Shared.clock(t.openTomorrow))")
    }
  }
}

struct WaterBar: View {
  let t: Shared.Today
  var body: some View {
    VStack(alignment: .leading, spacing: 3) {
      Text(String(format: "Water %.1f of %.0f L", Double(t.water) / 1000, Double(t.waterTarget) / 1000)).font(.caption).foregroundStyle(.secondary)
      ProgressView(value: min(1, Double(t.water) / Double(max(1, t.waterTarget)))).tint(Color("water"))
    }
  }
}

struct DayView: View {
  @Environment(\.widgetFamily) var family
  let entry: Entry
  var body: some View {
    if let t = entry.today {
      switch family {
      case .accessoryInline:
        if let e = nextEvent(t, at: entry.date) { Text("\(Shared.clock(e.t)) \(e.title)") } else { WindowLine(t: t, date: entry.date) }
      case .accessoryCircular:
        Gauge(value: min(1, Double(t.water) / Double(max(1, t.waterTarget)))) {
          Image(systemName: "drop.fill")
        } currentValueLabel: { Text(String(format: "%.1f", Double(t.water) / 1000)) }
        .gaugeStyle(.accessoryCircularCapacity)
      case .accessoryRectangular:
        VStack(alignment: .leading, spacing: 1) {
          if let e = nextEvent(t, at: entry.date) {
            Text("\(Shared.clock(e.t)) · \(e.title)").font(.headline).lineLimit(1)
            if !e.detail.isEmpty { Text(e.detail).font(.caption).lineLimit(1) }
          }
          WindowLine(t: t, date: entry.date).font(.caption).lineLimit(1)
        }
      case .systemMedium:
        HStack(alignment: .top, spacing: 14) {
          VStack(alignment: .leading, spacing: 6) {
            Text("Next").font(.caption).foregroundStyle(.secondary)
            ForEach(Array(t.events.filter { $0.t + 30 * 60 > entry.date.timeIntervalSince1970 }.prefix(3).enumerated()), id: \.offset) { _, e in
              VStack(alignment: .leading, spacing: 0) {
                Text("\(Shared.clock(e.t)) · \(e.title)").font(.subheadline.weight(.semibold)).lineLimit(1)
                if !e.detail.isEmpty { Text(e.detail).font(.caption).foregroundStyle(.secondary).lineLimit(1) }
              }
            }
            Spacer(minLength: 0)
            WindowLine(t: t, date: entry.date).font(.caption).foregroundStyle(Color("$accent"))
          }
          VStack(alignment: .leading, spacing: 8) {
            WaterBar(t: t)
            Button(intent: AddWaterIntent(ml: 250)) { Label("250 ml", systemImage: "plus") }.font(.caption.weight(.semibold)).tint(Color("$accent"))
            Text("Meals \(t.meals) of 3").font(.caption)
            Text("Protein \(t.protein) of \(t.proteinTarget) g").font(.caption)
          }.frame(width: 120)
        }
      default:
        VStack(alignment: .leading, spacing: 4) {
          if let e = nextEvent(t, at: entry.date) {
            Text(Shared.clock(e.t)).font(.caption).foregroundStyle(.secondary)
            Text(e.title).font(.headline).lineLimit(2)
            if !e.detail.isEmpty { Text(e.detail).font(.caption).foregroundStyle(.secondary).lineLimit(2) }
          } else {
            Text("All done for today").font(.headline)
          }
          Spacer(minLength: 0)
          WindowLine(t: t, date: entry.date).font(.caption2).foregroundStyle(Color("$accent")).lineLimit(2)
          Button(intent: AddWaterIntent(ml: 250)) { Label(String(format: "%.1f L", Double(t.water) / 1000), systemImage: "drop.fill") }
            .font(.caption.weight(.semibold)).tint(Color("water"))
        }
      }
    } else {
      Text("Open Healthy Me once to fill this in.").font(.caption)
    }
  }
}

struct HealthDayWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "HealthDay", provider: Provider()) { entry in
      DayView(entry: entry).containerBackground(Color("$widgetBackground"), for: .widget)
    }
    .configurationDisplayName("Today")
    .description("What is due next, the eating window, and water.")
    .supportedFamilies([.systemSmall, .systemMedium, .accessoryRectangular, .accessoryInline, .accessoryCircular])
  }
}

@main
struct HealthWidgets: WidgetBundle {
  var body: some Widget { HealthDayWidget() }
}
