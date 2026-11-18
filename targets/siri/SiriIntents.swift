import AppIntents
import WidgetKit

// Siri and Shortcuts. Each action is queued in the App Group and applied the
// next time Healthy Me opens, so water and weight still land in the app's log.

enum WaterAmount: String, AppEnum {
  case glass, bottle, litre
  static var typeDisplayRepresentation: TypeDisplayRepresentation = "Amount"
  static var caseDisplayRepresentations: [WaterAmount: DisplayRepresentation] = [
    .glass: "a glass", .bottle: "a bottle", .litre: "a litre",
  ]
  var ml: Int { switch self { case .glass: 250; case .bottle: 500; case .litre: 1000 } }
}

struct LogWaterIntent: AppIntent {
  static var title: LocalizedStringResource = "Add water"
  static var description = IntentDescription("Adds water to today's total.")
  @Parameter(title: "Amount", default: .glass) var amount: WaterAmount
  func perform() async throws -> some IntentResult & ProvidesDialog {
    Shared.addWater(amount.ml)
    let total = Shared.today().map { String(format: "%.1f", Double($0.water) / 1000) } ?? ""
    return .result(dialog: total.isEmpty ? "Added \(amount.ml) ml." : "Added \(amount.ml) ml. That's \(total) litres today.")
  }
}

struct LogWeightIntent: AppIntent {
  static var title: LocalizedStringResource = "Log weight"
  static var description = IntentDescription("Logs this morning's empty-stomach weight in kilograms.")
  @Parameter(title: "Weight in kg", inclusiveRange: (30, 250)) var kg: Double
  func perform() async throws -> some IntentResult & ProvidesDialog {
    let v = (kg * 10).rounded() / 10
    Shared.enqueue(["kind": "weight", "kg": v])
    return .result(dialog: "Logged \(String(format: "%.1f", v)) kilograms. It shows when you next open Healthy Me.")
  }
}

enum MealSlot: String, AppEnum {
  case breakfast, snack1, lunch, snack5, snack2, snack3, snack6, dinner, snack4
  static var typeDisplayRepresentation: TypeDisplayRepresentation = "Meal"
  static var caseDisplayRepresentations: [MealSlot: DisplayRepresentation] = [
    .breakfast: "morning coffee", .snack1: "10 am eggs", .lunch: "12 pm meal", .snack5: "2 pm meal", .snack2: "2 pm whey",
    .snack3: "4 pm meal", .snack6: "6 pm meal", .dinner: "6 pm whey", .snack4: "8 pm fibre drink",
  ]
}

extension MealSlot {
  var spoken: String {
    switch self {
    case .breakfast: "morning coffee"; case .snack1: "10 am eggs"; case .lunch: "12 pm meal"; case .snack5: "2 pm meal"; case .snack2: "2 pm whey"
    case .snack3: "4 pm meal"; case .snack6: "6 pm meal"; case .dinner: "6 pm whey"; case .snack4: "8 pm fibre drink"
    }
  }
}

/// "I ate my 12 pm meal": the planned meal is marked eaten at this time when the app next opens.
struct AteMealIntent: AppIntent {
  static var title: LocalizedStringResource = "I ate a meal"
  static var description = IntentDescription("Marks a planned meal as eaten now.")
  @Parameter(title: "Meal", requestValueDialog: "Which meal did you eat?") var slot: MealSlot
  func perform() async throws -> some IntentResult & ProvidesDialog {
    Shared.enqueue(["kind": "ate", "slot": slot.rawValue])
    return .result(dialog: "Marked your \(slot.spoken) as eaten. It shows when you open Healthy Me.")
  }
}

/// "I took my medicines": every dose due by now is marked taken when the app next opens.
struct TookMedicinesIntent: AppIntent {
  static var title: LocalizedStringResource = "I took my medicines"
  static var description = IntentDescription("Marks every medicine due so far today as taken.")
  func perform() async throws -> some IntentResult & ProvidesDialog {
    Shared.enqueue(["kind": "meds"])
    return .result(dialog: "Marked the medicines due so far as taken. It shows when you open Healthy Me.")
  }
}

/// "Log what I ate": Siri asks, you say foods and amounts in one go ("150 g carrot sabji and 3 egg whites").
struct LogFoodIntent: AppIntent {
  static var title: LocalizedStringResource = "Log what I ate"
  static var description = IntentDescription("Say what you ate with amounts. It is logged as eaten in the nearest meal.")
  @Parameter(title: "What did you eat?", requestValueDialog: "What did you eat? Say the foods and amounts.") var what: String
  func perform() async throws -> some IntentResult & ProvidesDialog {
    let t = what.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !t.isEmpty else { return .result(dialog: "I did not catch that.") }
    Shared.enqueue(["kind": "food", "text": t])
    return .result(dialog: "Logged: \(t). It shows when you open Healthy Me.")
  }
}

/// Opens Healthy Me on the meal screen with the mic already listening.
struct LogMealByVoiceIntent: AppIntent {
  static var title: LocalizedStringResource = "Log a meal by voice"
  static var description = IntentDescription("Opens Healthy Me and listens for what you ate.")
  static var openAppWhenRun: Bool = true
  func perform() async throws -> some IntentResult {
    Shared.enqueue(["kind": "voice", "ts": Date().timeIntervalSince1970])
    return .result()
  }
}

/// The app's day as plain text (meals, water, weight, medicines, the last week),
/// as of the last time the app was open. For a Shortcut to save to a file.
struct TodaySummaryIntent: AppIntent {
  static var title: LocalizedStringResource = "Today's summary"
  static var description = IntentDescription("Today's meals, water, weight and medicines as text, as of the last time Healthy Me was open.")
  func perform() async throws -> some IntentResult & ReturnsValue<String> {
    let text = Shared.defaults?.string(forKey: "summary") ?? "No summary yet. Open Healthy Me once, then run this again."
    return .result(value: text)
  }
}

struct HealthShortcuts: AppShortcutsProvider {
  static var appShortcuts: [AppShortcut] {
    AppShortcut(intent: LogWaterIntent(), phrases: [
      "Add \(\.$amount) of water in \(.applicationName)",
      "Log \(\.$amount) of water in \(.applicationName)",
      "Add water in \(.applicationName)",
    ], shortTitle: "Add water", systemImageName: "drop.fill")
    AppShortcut(intent: LogWeightIntent(), phrases: [
      "Log my weight in \(.applicationName)",
      "Log weight in \(.applicationName)",
    ], shortTitle: "Log weight", systemImageName: "scalemass")
    AppShortcut(intent: LogFoodIntent(), phrases: [
      "Log what I ate in \(.applicationName)",
      "Log this in \(.applicationName)",
      "Log my food in \(.applicationName)",
    ], shortTitle: "Log what I ate", systemImageName: "fork.knife")
    AppShortcut(intent: AteMealIntent(), phrases: [
      "I ate my \(\.$slot) in \(.applicationName)",
      "Mark my \(\.$slot) eaten in \(.applicationName)",
      "I ate in \(.applicationName)",
    ], shortTitle: "I ate a meal", systemImageName: "checkmark.circle")
    AppShortcut(intent: TookMedicinesIntent(), phrases: [
      "I took my medicines in \(.applicationName)",
      "I took my pills in \(.applicationName)",
      "Log my medicines in \(.applicationName)",
    ], shortTitle: "I took my medicines", systemImageName: "pills.fill")
    AppShortcut(intent: LogMealByVoiceIntent(), phrases: [
      "Log a meal in \(.applicationName)",
      "Log my meal in \(.applicationName)",
      "I ate something in \(.applicationName)",
      "Tell \(.applicationName) what I ate",
    ], shortTitle: "Log a meal", systemImageName: "mic.fill")
  }
}

@main
struct HealthSiriExtension: AppIntentsExtension {}
