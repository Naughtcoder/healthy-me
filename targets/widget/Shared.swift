import Foundation
import WidgetKit

/// The App Group the app writes `today` into, and where Siri and widget
/// buttons leave a `queue` for the app to apply when it next opens.
/// This file is the same in the widget and Siri targets.
enum Shared {
  static let group = "group.in.morgan.diet"
  static var defaults: UserDefaults? { UserDefaults(suiteName: group) }

  struct Event: Codable { let t: Double; let title: String; let detail: String }
  struct Today: Codable {
    let date: String; let phase: String
    let open: Double; let close: Double; let cutoff: Double; let openTomorrow: Double
    var water: Int; let waterTarget: Int
    let meals: Int; let doses: Int; let dosesDue: Int
    let protein: Int; let proteinTarget: Int
    let events: [Event]
  }

  static func today() -> Today? {
    guard let s = defaults?.string(forKey: "today"), let data = s.data(using: .utf8) else { return nil }
    return try? JSONDecoder().decode(Today.self, from: data)
  }

  /// Adds an action for the app to apply on next open. Each carries its own id
  /// and the day and time it happened, so it lands on the right day and only once.
  static func enqueue(_ action: [String: Any]) {
    var item = action
    let f = DateFormatter(); f.locale = Locale(identifier: "en_US_POSIX")
    f.dateFormat = "yyyy-MM-dd"; item["day"] = f.string(from: Date())
    f.dateFormat = "HH:mm"; item["at"] = f.string(from: Date())
    item["id"] = UUID().uuidString
    var list: [[String: Any]] = []
    if let s = defaults?.string(forKey: "queue"), let data = s.data(using: .utf8),
       let a = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] { list = a }
    list.append(item)
    if let data = try? JSONSerialization.data(withJSONObject: list), let s = String(data: data, encoding: .utf8) {
      defaults?.set(s, forKey: "queue")
    }
  }

  /// Water added away from the app shows on the widget at once.
  static func addWater(_ ml: Int) {
    enqueue(["kind": "water", "ml": ml])
    if var t = today() {
      t.water += ml
      if let data = try? JSONEncoder().encode(t), let s = String(data: data, encoding: .utf8) { defaults?.set(s, forKey: "today") }
    }
    WidgetCenter.shared.reloadAllTimelines()
  }

  static func clock(_ t: Double) -> String {
    let f = DateFormatter(); f.dateFormat = "h:mm a"; f.amSymbol = "am"; f.pmSymbol = "pm"
    return f.string(from: Date(timeIntervalSince1970: t))
  }
}
