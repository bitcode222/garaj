/** A business rule was violated. `message` is user-facing (Romanian). */
export class DomainError extends Error {
	constructor(code, message) {
		super(message);
		this.name = "DomainError";
		this.code = code;
	}
}
