// ios/Tidum/Tidum/Features/Cases/CaseDetailView.swift
import SwiftUI

struct CaseDetailView: View {
    let sak: Sak
    let apiClient: APIClient
    @State private var showingNewReport = false

    var body: some View {
        List {
            Section("Sak") {
                LabeledContent("Saksnummer", value: sak.saksnummer)
                if let klientRef = sak.klientRef {
                    LabeledContent("Klientreferanse", value: klientRef)
                }
                if let beskrivelse = sak.beskrivelse {
                    Text(beskrivelse)
                }
            }
        }
        .navigationTitle(sak.tittel)
        .toolbar {
            Button("Ny rapport") { showingNewReport = true }
        }
        .sheet(isPresented: $showingNewReport) {
            NewReportView(sak: sak, apiClient: apiClient)
        }
    }
}
