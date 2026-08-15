// ios/Tidum/Tidum/Networking/Models.swift
import Foundation

struct AuthUser: Codable, Identifiable {
    let id: String
    let email: String
    let name: String
    let profileImageUrl: String?
    let provider: String
    let role: String
    let vendorId: Int?
}

struct DashboardStats: Codable {
    let totalHours: Double
    let activeUsers: Int
    let pendingApprovals: Int
    let casesThisWeek: Int
    let hoursTrend: Double
    let usersTrend: Double
    let approvalsTrend: Double
    let casesTrend: Double
}

struct TimeEntry: Codable, Identifiable {
    let id: String
    let userId: String
    let caseNumber: String?
    let description: String
    let hours: Double
    let expenseCoverage: Double?
    let date: String
    let status: String
    let createdAt: String
    let sakId: String?
    let sakLocationId: String?
}

struct NewTimeEntry: Encodable {
    let caseNumber: String?
    let description: String
    let hours: Double
    let date: String
    let sakId: String?
}

struct WorkType: Codable, Identifiable {
    let id: String
    let name: String
    let color: String
    let entryMode: String
}

struct WorkTypesResponse: Codable {
    let role: String
    let timeTrackingEnabled: Bool
    let workTypes: [WorkType]
}

struct Sak: Codable, Identifiable {
    let id: String
    let saksnummer: String
    let tittel: String
    let klientRef: String?
    let oppdragsgiver: String?
    let tiltakstype: String?
    let status: String?
    let beskrivelse: String?
}

struct Rapport: Codable, Identifiable {
    let id: String
    let sakId: String?
    let status: String?
    let innledning: String?
    let avslutning: String?
    let periodeFrom: String?
    let periodeTo: String?
    let createdAt: String?
}

struct NewRapport: Encodable {
    let sakId: String
    let innledning: String
    let avslutning: String
}

struct EidStatus: Codable {
    let linked: Bool
    let required: Bool
}

struct MobileAuthTokens: Codable {
    let accessToken: String
    let refreshToken: String
    let expiresIn: Int
}
