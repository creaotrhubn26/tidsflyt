// ios/Tidum/Tidum/Networking/NetworkError.swift
enum NetworkError: Error, Equatable {
    case offline
    case timeout
    case unauthorized
    case serverError(Int)
    case decoding
}
