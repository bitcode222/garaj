import Foundation

/// A rule said no (src/domain/errors.js); the message is shown to the user as is.
struct DomainError: LocalizedError, Equatable {
    let code: String
    let message: String
    var errorDescription: String? { message }
}
