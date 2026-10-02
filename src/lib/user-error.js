export class UserError extends Error {
  constructor(message) {
    super(message);
    this.userMessage = message;
  }
}
